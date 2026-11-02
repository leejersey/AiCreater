"""Durable, project-scoped visual jobs. No file access or provider execution."""
import copy
import json
import re
import uuid

from psycopg.types.json import Jsonb

from services.projects.store import StoreError, identifier, revision, unicode_valid
from services.visual.contract import measured_input, draft_input, partition_narration, require_budget
from services.visual.quality import quality_feedback


RESULT_FIELDS = frozenset({'sha256', 'design_sha256', 'source', 'rationale', 'design',
    'requests_dispatched', 'geometry', 'frames', 'frame_hashes', 'video', 'srt', 'durationInFrames',
    'generation_mode','assembly_sha256','intent_sha256','binding_sha256','execution','technical','visual','production_adopted','diagnostic','preset','origin_sha256','recovery_sha256',
    'original_design_sha256','layout_sha256','moves','unresolved','layout_preflight',
    'status','reason','turns','usage','model','finish_by'})
FILE_NAME = re.compile(r'(?:source\.txt|design\.json|video\.mp4|video\.srt|stills/frame-\d+\.png)')
HASH = re.compile(r'[a-f0-9]{64}')
FAILURE = '视频生成未完成，程序已保存诊断和已有产物；未自动重试。'
AGENT_STOPPED = 'Agent 未在轮数上限内完成通过检查的画面；运行记录已保留，未自动重试。'
# Why a scene-agent run stopped, as the job error the user sees; unknown reasons fall back to AGENT_STOPPED.
AGENT_ERRORS = {
    'agent_provider_auth': '模型服务拒绝请求（API Key 无效、无权限或余额不足）；未生成画面，未自动重试。',
    'agent_provider_unavailable': '模型服务暂时不可用（限流或服务端错误，单轮已重试 2 次）；未自动重试任务。',
    'agent_refusal': '模型拒绝了本次请求；未生成画面，未自动重试。',
    'agent_stalled': 'Agent 连续多轮没有修改画面，已停止；运行记录已保留，未自动重试。',
    'agent_no_finish': 'Agent 多次回复未调用工具，已停止；运行记录已保留，未自动重试。',
    'agent_max_tokens': 'Agent 连续两轮输出被截断，已停止；运行记录已保留，未自动重试。',
    'agent_budget_tokens': 'Agent 用完输出 token 上限仍未通过检查；运行记录已保留，未自动重试。',
    'agent_budget_turns': AGENT_STOPPED,
}
AGENT_MODEL = 'deepseek-flash-thinking'
AGENT_MAX_TURNS = 25
SOURCE_FAILURE = '动画代码未通过编译检查，程序已保存源码和诊断，尚未开始渲染。未追加模型调用。'
LAYOUT_FAILURE = '设计布局检查未通过，程序已保存诊断，本次尚未生成视频。'
STALE = 'stale: 章节版本或冻结素材已改变，请重新生成并确认当前预览。'


class VisualJobs:
    def __init__(self, store):
        self.store = store

    @staticmethod
    def _raw(row):
        row = dict(row)
        for key in ('id', 'project_id', 'scene_id', 'attempt_id'):
            if row.get(key) is not None: row[key] = str(row[key])
        return row

    @staticmethod
    def _public(row, current=True):
        result = {k: copy.deepcopy(v) for k, v in (row.get('result') or {}).items() if k in RESULT_FIELDS}
        accepted = bool(current and row['state'] == 'succeeded' and (row.get('result') or {}).get('accepted') is True)
        if row['kind'] == 'preview': result['accepted'] = accepted
        data = row.get('input') or {}
        summary = {k: data[k] for k in ('fingerprint', 'generation_id', 'sha256', 'design_revision_of','preset','recovery_id','recovery_sha256','layout_id','layout_sha256','design_sha256','repair_preview_id','auto_render','isolated_render') if k in data}
        if row['kind'] in ('generate', 'repair'): summary['max_requests'] = 2 if row['kind'] == 'generate' else 1
        if row['kind'] in ('generate', 'repair'): summary['generation_mode'] = data.get('generation_mode','source')
        if row['kind'] in ('recover-source','propose-layout'):summary.update(max_requests=0,generation_mode='source')
        if row['kind'] == 'export': summary['chapter_count'] = len(data.get('chapters', []))
        if row['kind'] == 'agent': summary.update(model=data.get('model'), max_turns=data.get('max_turns'))
        if data.get('timing_mode')=='draft':summary['timing_mode']='draft'
        if data.get('operation')=='retime':summary.update(operation='retime',max_requests=0)
        if data.get('operation')=='quality-repair':summary.update(operation='quality-repair',max_requests=1)
        created = row.get('created_at')
        public_error=row.get('error')
        if isinstance(public_error,str) and public_error.startswith('设计布局未通过预检'):public_error=LAYOUT_FAILURE
        if public_error=='执行失败，未自动重试；请检查本地运行记录后再明确提交。':public_error=FAILURE
        return {'id': str(row['id']), 'project_id': str(row['project_id']),
                'scene_id': str(row['scene_id']) if row.get('scene_id') else None,
                'kind': row['kind'], 'state': row['state'], 'stage': row['stage'],
                'error': public_error[:1000] if isinstance(public_error,str) else None,
                'created_at': created.isoformat() if hasattr(created, 'isoformat') else created,
                'result': result, 'input_summary': summary, 'accepted': accepted, 'current': current}

    @staticmethod
    def _read(conn, project_id, job_id, lock=False):
        row = conn.execute('SELECT * FROM visual_jobs WHERE project_id=%s AND id=%s' +
                           (' FOR UPDATE' if lock else ''), [identifier(project_id), identifier(job_id)]).fetchone()
        if row is None: raise StoreError('not_found', 'Visual job not found in this project')
        return VisualJobs._raw(row)

    def get_raw(self, project_id, job_id):
        with self.store.connection() as conn:
            self.store._read(conn, project_id)
            return self._read(conn, project_id, job_id)

    def get(self, project_id, job_id):
        with self.store.connection() as conn:
            project = self.store._read(conn, project_id)
            row = self._read(conn, project_id, job_id)
            return self._public(row, self._current(conn, project, row))

    def list(self, project_id):
        with self.store.connection() as conn:
            conn.execute('SET TRANSACTION ISOLATION LEVEL REPEATABLE READ, READ ONLY')
            project = self.store._read(conn, project_id)
            rows = conn.execute('SELECT * FROM visual_jobs WHERE project_id=%s ORDER BY created_at DESC,id DESC',
                                [project['id']]).fetchall()
            return [self._public(r, self._current(conn, project, self._raw(r))) for r in rows]

    def _submit(self, conn, project, scene_id, kind, data):
        unicode_valid(data)
        existing=conn.execute("""SELECT * FROM visual_jobs WHERE project_id=%s
            AND scene_id IS NOT DISTINCT FROM %s AND kind=%s AND input=%s
            AND state IN ('queued','running') ORDER BY created_at LIMIT 1""",
            [project['id'],scene_id,kind,Jsonb(data)]).fetchone()
        if existing:return self._public(existing)
        job_id = str(uuid.uuid4())
        conn.execute('''INSERT INTO visual_jobs(id,project_id,scene_id,kind,input)
            VALUES (%s,%s,%s,%s,%s)''', [job_id, project['id'], scene_id, kind, Jsonb(data)])
        return self._public(self._read(conn, project['id'], job_id))

    def prepare(self, project_id, expected_revision):
        revision(expected_revision)
        with self.store.connection() as conn:
            project = self.store._structure_project(conn, project_id, expected_revision)
            if project['scenes']: return project
            sections = project['config'].get('manuscript', {}).get('sections', [])
            texts = [s['narration'] for s in sections] if sections else [project['source_text']]
            parts = [part for text in texts for part in partition_narration(text)]
            if len(parts) > 20: raise StoreError('validation', 'At most 20 narration chapters are supported')
            for part in parts:
                # Placeholder is only for the existing voice/alignment pipeline, never visual output.
                scene = {'type': 'card_sequence', 'narration': {'text': part},
                         'elements': [{'id': 'narration', 'content': part[:40].strip() or 'Narration',
                                       'cue': {'text_start': 0, 'text_end': len(part)}}]}
                project = self.store._insert_scene(conn, project, scene, len(project['scenes']), 'needs_voice')
            return project

    def generate(self, project_id, scene_id, expected_revision, confirmed, max_requests, generation_mode='source', timing_mode='measured',auto_render=False,auto_repair_requests=0):
        require_budget(confirmed, max_requests, 2)
        if type(auto_render) is not bool or type(auto_repair_requests) is not int or auto_repair_requests not in (0,1) or (auto_repair_requests and not auto_render):raise StoreError('validation','Invalid automatic video budget')
        if generation_mode not in ('source','host-motion','host-intent','host-components'):
            raise StoreError('validation','Invalid visual generation mode')
        revision(expected_revision)
        if timing_mode not in ('draft','measured') or (timing_mode=='draft' and generation_mode!='source'):
            raise StoreError('validation','视觉估时草稿仅支持自由画面源码')
        with self.store.connection() as conn:
            project = self.store._read(conn, project_id, lock=True)
            scene = self.store._scene(project, scene_id)
            if project['revision'] != expected_revision: raise StoreError('conflict', 'Project revision changed')
            data=(draft_input if timing_mode=='draft' else measured_input)(project, scene)
            if generation_mode!='source':data['generation_mode']=generation_mode
            if auto_render:data.update(auto_render=True,auto_repair_requests=auto_repair_requests)
            return self._submit(conn, project, scene['id'], 'generate', data)

    def agent(self, project_id, scene_id, expected_revision, confirmed, max_turns):
        # One job: the scene-agent loop (paid model turns, capped) and, if it passes, the voiced chapter video.
        if confirmed is not True or type(max_turns) is not int or not 1 <= max_turns <= AGENT_MAX_TURNS:
            raise StoreError('validation', f'必须明确确认本次 Agent 轮数上限（1–{AGENT_MAX_TURNS}）；失败不自动重试')
        revision(expected_revision)
        with self.store.connection() as conn:
            project = self.store._read(conn, project_id, lock=True)
            scene = self.store._scene(project, scene_id)
            if project['revision'] != expected_revision: raise StoreError('conflict', 'Project revision changed')
            data = measured_input(project, scene)
            data.update(model=AGENT_MODEL, max_turns=max_turns)
            return self._submit(conn, project, scene['id'], 'agent', data)

    def align_draft(self,project_id,job_id,confirmed,sha256):
        self._approval(confirmed,sha256)
        with self.store.connection() as conn:
            project=self.store._read(conn,project_id,lock=True)
            parent=self._generation(conn,project,job_id)
            if parent['input'].get('timing_mode')!='draft' or parent['input'].get('generation_mode','source')!='source' or parent['result'].get('sha256')!=sha256:
                raise StoreError('validation','Expected exact source-mode visual draft')
            data=measured_input(project,self.store._scene(project,parent['scene_id']))
            data.update(operation='retime',draft_generation_id=parent['id'],draft_sha256=sha256)
            return self._submit(conn,project,parent['scene_id'],'repair',data)

    def prepare_transfer(self, project_id, scene_id, expected_revision, confirmed, design, roles):
        if confirmed is not True or not isinstance(design,dict) or not isinstance(roles,dict):
            raise StoreError('validation','Explicit offline candidate preparation requires design and roles')
        revision(expected_revision);unicode_valid({'design':design,'roles':roles})
        try:size=len(json.dumps({'design':design,'roles':roles},ensure_ascii=False,allow_nan=False,separators=(',',':')).encode())
        except (ValueError,TypeError):raise StoreError('validation','Invalid transfer JSON') from None
        if size>128*1024:raise StoreError('validation','Transfer input exceeds 128 KiB')
        with self.store.connection() as conn:
            project=self.store._read(conn,project_id,lock=True)
            if project['revision']!=expected_revision:raise StoreError('conflict','Project revision changed')
            scene=self.store._scene(project,scene_id);data=measured_input(project,scene)
            if design.get('brief')!=data['brief'] or design.get('cues')!=data['cues']:
                raise StoreError('conflict','Transfer design must match the measured chapter exactly')
            return self._submit(conn,project,scene['id'],'prepare-transfer',{**data,'design':copy.deepcopy(design),'roles':copy.deepcopy(roles)})

    def automatic_transfer(self, project_id, scene_id, expected_revision, confirmed, preset):
        if confirmed is not True or preset!='rag-augmentation:1':raise StoreError('validation','Explicit supported free recipe required')
        revision(expected_revision)
        with self.store.connection() as conn:
            project=self.store._read(conn,project_id,lock=True)
            if project['revision']!=expected_revision:raise StoreError('conflict','Project revision changed')
            scene=self.store._scene(project,scene_id)
            return self._submit(conn,project,scene['id'],'prepare-transfer',{**measured_input(project,scene),'preset':preset})

    def _generation(self, conn, project, job_id, allow_failed=False):
        job = self._read(conn, project['id'], job_id)
        allowed = ('succeeded', 'failed') if allow_failed else ('succeeded',)
        if job['kind'] not in ('generate', 'repair') or job['state'] not in allowed:
            raise StoreError('not_ready', 'Expected a completed visual generation')
        if not self._current(conn, project, job): raise StoreError('conflict', STALE)
        if job['state'] == 'failed':
            count = (job.get('result') or {}).get('requests_dispatched')
            maximum = 2 if job['kind'] == 'generate' else 1
            if type(count) is not int or not 1 <= count <= maximum:
                raise StoreError('not_ready', 'Failed generation has no dispatched request record')
        return job

    def repair(self, project_id, job_id, confirmed, max_requests, feedback):
        require_budget(confirmed, max_requests, 1)
        if not isinstance(feedback, str) or not feedback.strip() or len(feedback) > 8000:
            raise StoreError('validation', 'Expected 1-8000 characters of repair feedback')
        unicode_valid(feedback)
        with self.store.connection() as conn:
            project = self.store._read(conn, project_id, lock=True)
            parent = self._generation(conn, project, job_id, allow_failed=True)
            data = {k: copy.deepcopy(parent['input'][k]) for k in ('brief', 'cues', 'scene', 'asset', 'fingerprint')}
            data.update(generation_id=parent['id'], feedback=feedback)
            if parent['input'].get('timing_mode')=='draft':data['timing_mode']='draft'
            if 'generation_mode' in parent['input']:data['generation_mode']=parent['input']['generation_mode']
            return self._submit(conn, project, parent['scene_id'], 'repair', data)

    def recover_source(self,project_id,job_id,confirmed):
        if confirmed is not True:raise StoreError('validation','Explicit offline inspection confirmation required')
        with self.store.connection() as conn:
            project=self.store._read(conn,project_id,lock=True)
            parent=self._generation(conn,project,job_id,allow_failed=True)
            expected=2 if parent['kind']=='generate' else 1
            if parent['state']!='failed' or parent['input'].get('generation_mode','source')!='source' or (parent.get('result') or {}).get('requests_dispatched')!=expected:
                raise StoreError('not_ready','Expected a failed source-stage response')
            data={k:copy.deepcopy(parent['input'][k]) for k in ('brief','cues','scene','asset','fingerprint')}
            data.update(generation_id=parent['id'],generation_mode='source')
            if parent['input'].get('timing_mode')=='draft':data['timing_mode']='draft'
            return self._submit(conn,project,parent['scene_id'],'recover-source',data)

    def propose_layout(self,project_id,job_id,confirmed):
        if confirmed is not True:raise StoreError('validation','Explicit free layout proposal confirmation required')
        with self.store.connection() as conn:
            project=self.store._read(conn,project_id,lock=True);parent=self._generation(conn,project,job_id,allow_failed=True)
            if parent['kind']!='generate' or parent['state']!='failed' or parent['input'].get('generation_mode','source')!='source' or (parent.get('result') or {}).get('requests_dispatched')!=1:
                raise StoreError('not_ready','Expected failed source design stage')
            data={k:copy.deepcopy(parent['input'][k]) for k in ('brief','cues','scene','asset','fingerprint')}
            data.update(generation_id=parent['id'],generation_mode='source')
            if parent['input'].get('timing_mode')=='draft':data['timing_mode']='draft'
            return self._submit(conn,project,parent['scene_id'],'propose-layout',data)

    def apply_layout(self,project_id,job_id,confirmed,max_requests,design_sha256,layout_sha256):
        require_budget(confirmed,max_requests,1);self._approval(confirmed,design_sha256);self._approval(confirmed,layout_sha256)
        with self.store.connection() as conn:
            project=self.store._read(conn,project_id,lock=True);parent=self._read(conn,project_id,job_id);result=parent.get('result') or {}
            if parent['kind']!='propose-layout' or parent['state']!='succeeded' or not self._current(conn,project,parent):raise StoreError('conflict',STALE)
            if (not self._valid_result(parent,result) or result.get('layout_preflight')!='passed' or not result.get('moves') or result.get('unresolved') or
                result.get('design_sha256')!=design_sha256 or result.get('layout_sha256')!=layout_sha256):raise StoreError('conflict','Layout approval mismatch or unresolved conflicts')
            data={k:copy.deepcopy(parent['input'][k]) for k in ('brief','cues','scene','asset','fingerprint')}
            data.update(layout_id=parent['id'],design_sha256=design_sha256,layout_sha256=layout_sha256,generation_mode='source')
            if parent['input'].get('timing_mode')=='draft':data['timing_mode']='draft'
            return self._submit(conn,project,parent['scene_id'],'repair',data)

    def repair_source(self,project_id,job_id,confirmed,max_requests,feedback,sha256,recovery_sha256):
        require_budget(confirmed,max_requests,1);self._approval(confirmed,sha256);self._approval(confirmed,recovery_sha256)
        if not isinstance(feedback,str) or not feedback.strip() or len(feedback)>8000:raise StoreError('validation','Expected 1-8000 characters of repair feedback')
        unicode_valid(feedback)
        with self.store.connection() as conn:
            project=self.store._read(conn,project_id,lock=True);parent=self._read(conn,project_id,job_id)
            if parent['kind']!='recover-source' or parent['state']!='succeeded' or not self._current(conn,project,parent):raise StoreError('conflict',STALE)
            result=parent.get('result') or {}
            if result.get('sha256')!=sha256 or result.get('recovery_sha256')!=recovery_sha256 or not self._valid_result(parent,result):raise StoreError('conflict','Recovery approval mismatch')
            data={k:copy.deepcopy(parent['input'][k]) for k in ('brief','cues','scene','asset','fingerprint')}
            data.update(recovery_id=parent['id'],sha256=sha256,recovery_sha256=recovery_sha256,feedback=feedback,generation_mode='source')
            if parent['input'].get('timing_mode')=='draft':data['timing_mode']='draft'
            return self._submit(conn,project,parent['scene_id'],'repair',data)

    def revise_design(self, project_id, job_id, confirmed, max_requests, feedback):
        require_budget(confirmed, max_requests, 2)
        if not isinstance(feedback,str) or not feedback.strip() or len(feedback)>8000:
            raise StoreError('validation','Expected 1-8000 characters of design feedback')
        unicode_valid(feedback)
        with self.store.connection() as conn:
            project=self.store._read(conn,project_id,lock=True)
            parent=self._generation(conn,project,job_id,allow_failed=True)
            if parent['kind']!='generate' or parent['state']!='failed' or (parent.get('result') or {}).get('requests_dispatched')!=1:
                raise StoreError('not_ready','Expected a failed design-stage generation with one dispatched request')
            data={k:copy.deepcopy(parent['input'][k]) for k in ('brief','cues','scene','asset','fingerprint')}
            data.update(design_revision_of=parent['id'],feedback=feedback)
            if parent['input'].get('timing_mode')=='draft':data['timing_mode']='draft'
            if 'generation_mode' in parent['input']:data['generation_mode']=parent['input']['generation_mode']
            return self._submit(conn,project,parent['scene_id'],'generate',data)

    def _repair_design_video(self,conn,project,parent):
        if (parent['kind']!='generate' or parent['state']!='failed' or
                (parent.get('result') or {}).get('requests_dispatched')!=1 or not self._current(conn,project,parent)):
            raise StoreError('not_ready','Expected a current failed design stage')
        existing=conn.execute("""SELECT * FROM visual_jobs WHERE project_id=%s AND kind='generate'
            AND input->>'design_revision_of'=%s AND input->>'auto_render'='true' ORDER BY created_at DESC,id DESC""",[project['id'],parent['id']]).fetchall()
        for prior in existing:
            prior=self._raw(prior)
            if self._current(conn,project,prior):return self._public(prior,True)
        data={k:copy.deepcopy(parent['input'][k]) for k in ('brief','cues','scene','asset','fingerprint')}
        data.update(design_revision_of=parent['id'],auto_render=True,auto_repair_requests=0,
            feedback='PROGRAMMATIC_DESIGN_REPAIR: 复用原设计，修复所附原始预检诊断，不重写选题或口播。核对对象的真实语义：独立文字才是label；机器内的固定图案或图标剪影应属于拥有者的实体部件或外观细节，不能为绕过检查将真正文字改成solid。真实文字应放入安全区域；不得删减内容、忽略碰撞、乱加遮挡声明或放宽阈值。修订后必须通过原有完整校验，失败立即停止。')
        for key in ('timing_mode','generation_mode'):
            if key in parent['input']:data[key]=parent['input'][key]
        return self._submit(conn,project,parent['scene_id'],'generate',data)

    def repair_design_video(self,project_id,job_id,confirmed,max_requests):
        require_budget(confirmed,max_requests,2)
        with self.store.connection() as conn:
            project=self.store._read(conn,project_id,lock=True)
            return self._repair_design_video(conn,project,self._read(conn,project_id,job_id))

    def _repair_compilation(self,conn,project,parent):
        existing=conn.execute("""SELECT * FROM visual_jobs WHERE project_id=%s AND kind='repair'
            AND input->>'generation_id'=%s AND input->>'automatic_code_repair'='true' ORDER BY created_at DESC,id DESC""",[project['id'],parent['id']]).fetchall()
        for prior in existing:
            prior=self._raw(prior)
            if self._current(conn,project,prior):return self._public(prior,True)
        data={k:copy.deepcopy(parent['input'][k]) for k in ('brief','cues','scene','asset','fingerprint')}
        data.update(generation_id=parent['id'],automatic_code_repair=True,auto_render=True,auto_repair_requests=0,
            feedback='PROGRAMMATIC_COMPILATION_REPAIR: 复用冻结设计及原始源码，依据编译器诊断修复未定义符号或类型错误，同时修复附带的静态运动诊断。不得重新设计或改变口播、时间；不得关闭类型检查、使用any或删除画面内容规避检查。通过完整检查后才继续渲染，失败即停止。')
        for key in ('timing_mode','generation_mode'):
            if key in parent['input']:data[key]=parent['input'][key]
        return self._submit(conn,project,parent['scene_id'],'repair',data)

    @staticmethod
    def _approval(confirmed, sha256):
        if confirmed is not True or not isinstance(sha256, str) or not HASH.fullmatch(sha256):
            raise StoreError('validation', 'Explicit approval of the exact source hash is required')

    def _repair_preview(self,conn,project,preview,auto_render=False):
        result=preview.get('result') or {}
        if (preview['kind']!='preview' or preview['state']!='succeeded' or result.get('geometry',{}).get('status')!='failed' or result.get('video') or
                not self._current(conn,project,preview) or not self._parent_matches(conn,project,preview['input'],result)):
            raise StoreError('not_ready','Expected current failed picture check')
        parent=self._generation(conn,project,preview['input']['generation_id'])
        data={k:copy.deepcopy(parent['input'][k]) for k in ('brief','cues','scene','asset','fingerprint')}
        data.update(generation_id=parent['id'],operation='quality-repair',repair_preview_id=preview['id'],feedback=quality_feedback(preview))
        if auto_render or preview['input'].get('isolated_render') is True:data.update(auto_render=True,auto_repair_requests=0)
        for key in ('generation_mode','timing_mode'):
            if key in parent['input']:data[key]=parent['input'][key]
        existing=conn.execute("""SELECT * FROM visual_jobs WHERE project_id=%s AND kind='repair'
            AND input->>'repair_preview_id'=%s ORDER BY created_at DESC,id DESC""",[project['id'],preview['id']]).fetchall()
        for prior in existing:
            prior=self._raw(prior)
            if self._current(conn,project,prior):return self._public(prior,True)
        return self._submit(conn,project,parent['scene_id'],'repair',data)

    def repair_preview(self,project_id,preview_id,confirmed,max_requests,auto_render=False):
        require_budget(confirmed,max_requests,1)
        with self.store.connection() as conn:
            project=self.store._read(conn,project_id,lock=True)
            return self._repair_preview(conn,project,self._read(conn,project_id,preview_id),auto_render)

    def render_video(self,project_id,job_id,confirmed,auto_repair_requests=0):
        parent=self.get_raw(project_id,job_id)
        return self.preview(project_id,job_id,confirmed,(parent.get('result') or {}).get('sha256'),auto_repair_requests,isolated_render=True)

    def preview(self, project_id, job_id, confirmed, sha256, auto_repair_requests=0,isolated_render=False):
        self._approval(confirmed, sha256)
        if type(auto_repair_requests) is not int or auto_repair_requests not in (0,1):raise StoreError('validation','Expected zero or one explicitly approved automatic repair')
        with self.store.connection() as conn:
            project = self.store._read(conn, project_id, lock=True)
            parent = self._generation(conn, project, job_id)
            if (parent.get('result') or {}).get('sha256') != sha256:
                raise StoreError('conflict', 'Approved source hash does not match')
            data = {k: copy.deepcopy(parent['input'][k]) for k in ('scene', 'asset', 'fingerprint')}
            data.update(generation_id=parent['id'], sha256=sha256)
            if isolated_render:data['isolated_render']=True
            if parent['input'].get('timing_mode')=='draft':data['timing_mode']='draft'
            cached=conn.execute("""SELECT * FROM visual_jobs WHERE project_id=%s AND scene_id=%s AND kind='preview' AND state='succeeded'
                AND input->>'generation_id'=%s AND input->>'sha256'=%s ORDER BY created_at DESC,id DESC""",[project['id'],parent['scene_id'],parent['id'],sha256]).fetchall()
            for prior in cached:
                prior=self._raw(prior)
                if isolated_render and prior['input'].get('isolated_render') is not True:continue
                if self._current(conn,project,prior):
                    if auto_repair_requests==1 and prior['result'].get('geometry',{}).get('status')=='failed':return self._repair_preview(conn,project,prior)
                    return self._public(prior,True)
            if auto_repair_requests:data['auto_repair_requests']=1
            return self._submit(conn, project, parent['scene_id'], 'preview', data)

    def preview_transfer(self, project_id, job_id, confirmed, sha256):
        self._approval(confirmed,sha256)
        with self.store.connection() as conn:
            project=self.store._read(conn,project_id,lock=True);parent=self._read(conn,project_id,job_id)
            if parent['kind']!='prepare-transfer' or parent['state']!='succeeded':raise StoreError('not_ready','Expected a prepared transfer candidate')
            if not self._current(conn,project,parent):raise StoreError('conflict',STALE)
            result=parent.get('result') or {}
            if result.get('sha256')!=sha256:raise StoreError('conflict','Approved source hash does not match')
            hashes=('sha256','design_sha256','assembly_sha256','binding_sha256')
            if any(not isinstance(result.get(k),str) or not HASH.fullmatch(result[k]) for k in hashes):raise StoreError('not_ready','Candidate hashes missing')
            data={k:copy.deepcopy(parent['input'][k]) for k in ('scene','asset','fingerprint')}
            data.update({k:result[k] for k in hashes});data.update(generation_id=parent['id'],transfer_candidate=True)
            if 'preset' in result:data.update(preset=result['preset'],origin_sha256=result.get('origin_sha256'))
            return self._submit(conn,project,parent['scene_id'],'preview-transfer',data)

    @staticmethod
    def _acceptable(row):
        result = row.get('result') or {}; files = result.get('_files') or {}
        frames = result.get('frames') or []
        return (row['kind'] == 'preview' and row.get('input',{}).get('timing_mode')!='draft' and row['state'] == 'succeeded' and
                result.get('geometry', {}).get('status') == 'passed' and
                result.get('video') == 'video.mp4' and result.get('srt') == 'video.srt' and
                bool(frames) and all(name in files and files[name] == result.get('frame_hashes', {}).get(name) for name in frames) and
                all(name in files for name in ('video.mp4', 'video.srt')))

    def accept(self, project_id, job_id, confirmed, sha256):
        self._approval(confirmed, sha256)
        with self.store.connection() as conn:
            project = self.store._read(conn, project_id, lock=True)
            row = self._read(conn, project_id, job_id, lock=True)
            if not self._current(conn, project, row): raise StoreError('conflict', STALE)
            if not self._acceptable(row): raise StoreError('not_ready', 'A geometry-passed rendered preview is required')
            if row['input']['sha256'] != sha256 or row['result'].get('sha256') != sha256:
                raise StoreError('conflict', 'Approved source hash does not match')
            result = {**row['result'], 'accepted': True}
            conn.execute('UPDATE visual_jobs SET result=%s WHERE id=%s', [Jsonb(result), row['id']])
            return self._public({**row, 'result': result})

    def export(self, project_id, expected_revision, confirmed):
        if confirmed is not True: raise StoreError('validation', 'Explicit export confirmation required')
        revision(expected_revision)
        with self.store.connection() as conn:
            project = self.store._read(conn, project_id, lock=True)
            if project['revision'] != expected_revision: raise StoreError('conflict', 'Project revision changed')
            if not project['scenes']: raise StoreError('not_ready', 'No narration chapters')
            chapters = []
            for scene in project['scenes']:
                rows = conn.execute("""SELECT * FROM visual_jobs WHERE project_id=%s AND scene_id=%s
                    AND kind='preview' AND state='succeeded' AND result->'accepted'='true'::jsonb
                    ORDER BY created_at DESC,id DESC""", [project['id'], scene['id']]).fetchall()
                accepted = next((self._raw(r) for r in rows if self._acceptable(r) and self._current(conn, project, self._raw(r))), None)
                if accepted is None: raise StoreError('not_ready', 'Every current chapter needs an accepted preview')
                chapters.append({**copy.deepcopy(accepted['input']), 'scene_id': scene['id']})
            return self._submit(conn, project, None, 'export', {'chapters': chapters, 'project_revision': expected_revision})

    def _snapshot_current(self, project, scene_id, data):
        row = self.store._scene(project, scene_id)
        measured = (draft_input if data.get('timing_mode')=='draft' else measured_input)(project, row)
        if any(measured[k] != data.get(k) for k in ('fingerprint', 'scene', 'asset')): return False
        return all(k not in data or measured[k] == data[k] for k in ('brief', 'cues'))

    def _current(self, conn, project, row):
        try:
            data = row['input']
            if row['kind'] == 'export':
                chapters = data['chapters']
                return (data['project_revision'] == project['revision'] and
                        [c['scene_id'] for c in chapters] == [s['id'] for s in project['scenes']] and
                        all(self._snapshot_current(project, c['scene_id'], c) and self._parent_matches(conn, project, c) for c in chapters))
            if not self._snapshot_current(project, row['scene_id'], data): return False
            if data.get('operation')=='retime':
                parent=self._read(conn,project['id'],data['draft_generation_id'])
                if (row['kind']!='repair' or parent['state']!='succeeded' or parent['kind'] not in ('generate','repair') or parent['scene_id']!=row['scene_id'] or
                    parent['input'].get('timing_mode')!='draft' or (parent.get('result') or {}).get('sha256')!=data['draft_sha256'] or not self._snapshot_current(project,parent['scene_id'],parent['input'])):return False
            if data.get('operation')=='quality-repair':
                checked=self._read(conn,project['id'],data['repair_preview_id'])
                if (row['kind']!='repair' or checked['scene_id']!=row['scene_id'] or checked['input']['generation_id']!=data['generation_id'] or checked['state']!='succeeded' or
                    not self._parent_matches(conn,project,checked['input'],checked.get('result')) or quality_feedback(checked)!=data['feedback']):return False
            if row['kind']=='propose-layout':
                parent=self._read(conn,project['id'],data['generation_id'])
                if (parent['kind']!='generate' or parent['state']!='failed' or parent['input'].get('generation_mode','source')!='source' or (parent.get('result') or {}).get('requests_dispatched')!=1 or
                    not self._snapshot_current(project,parent['scene_id'],parent['input']) or any(parent['input'][k]!=data[k] for k in ('brief','cues','scene','asset','fingerprint'))):return False
            if 'layout_id' in data:
                parent=self._read(conn,project['id'],data['layout_id']);result=parent.get('result') or {}
                if (row['kind']!='repair' or parent['kind']!='propose-layout' or parent['state']!='succeeded' or result.get('design_sha256')!=data['design_sha256'] or
                    result.get('layout_sha256')!=data['layout_sha256'] or any(parent['input'][k]!=data[k] for k in ('brief','cues','scene','asset','fingerprint')) or not self._current(conn,project,parent)):return False
            if row['kind']=='recover-source':
                parent=self._read(conn,project['id'],data['generation_id'])
                maximum=2 if parent['kind']=='generate' else 1
                if (parent['kind'] not in ('generate','repair') or parent['state']!='failed' or parent['input'].get('generation_mode','source')!='source' or
                    (parent.get('result') or {}).get('requests_dispatched')!=maximum or not self._snapshot_current(project,parent['scene_id'],parent['input']) or
                    any(parent['input'][k]!=data[k] for k in ('brief','cues','scene','asset','fingerprint'))):return False
            if 'recovery_id' in data:
                parent=self._read(conn,project['id'],data['recovery_id']);result=parent.get('result') or {}
                if (row['kind']!='repair' or parent['kind']!='recover-source' or parent['state']!='succeeded' or
                    result.get('sha256')!=data['sha256'] or result.get('recovery_sha256')!=data['recovery_sha256'] or
                    any(parent['input'][k]!=data[k] for k in ('brief','cues','scene','asset','fingerprint')) or not self._current(conn,project,parent)):return False
            if 'design_revision_of' in data:
                parent=self._read(conn,project['id'],data['design_revision_of'])
                if (parent['kind']!='generate' or parent['state']!='failed' or
                    (parent.get('result') or {}).get('requests_dispatched')!=1 or
                    not self._snapshot_current(project,parent['scene_id'],parent['input']) or
                    any(parent['input'][k]!=data[k] for k in ('brief','cues','scene','asset','fingerprint'))):return False
            if (row['kind']=='preview-transfer')!=(data.get('transfer_candidate') is True):return False
            return row['kind'] not in ('preview','preview-transfer') or self._parent_matches(conn, project, data, row.get('result'))
        except (StoreError, KeyError, TypeError, ValueError):
            return False

    def _parent_matches(self, conn, project, data, result=None):
        parent = self._read(conn, project['id'], data['generation_id'])
        generated = parent.get('result') or {}
        transfer=data.get('transfer_candidate') is True
        if data.get('timing_mode')!=parent['input'].get('timing_mode'):return False
        if transfer and any(data.get(k)!=generated.get(k) for k in ('design_sha256','assembly_sha256','binding_sha256')):return False
        if transfer and any(data.get(k)!=generated.get(k) for k in ('preset','origin_sha256')):return False
        if (parent['kind'] not in (('prepare-transfer',) if transfer else ('generate','repair')) or parent['state'] != 'succeeded' or
                generated.get('sha256') != data['sha256'] or
                not self._snapshot_current(project, parent['scene_id'], parent['input']) or
                any(parent['input'][k] != data[k] for k in ('fingerprint', 'scene', 'asset'))): return False
        return not result or (result.get('sha256') == generated.get('sha256') and
                              result.get('design_sha256') == generated.get('design_sha256') and
                              (not transfer or all(result.get(k)==generated.get(k) for k in ('assembly_sha256','binding_sha256','preset','origin_sha256'))))

    def cancel(self, project_id, job_id):
        with self.store.connection() as conn:
            project = self.store._read(conn, project_id, lock=True)
            row = self._read(conn, project_id, job_id, lock=True)
            if row['state'] in ('queued', 'running'):
                conn.execute("UPDATE visual_jobs SET state='cancelled',stage='cancelled',ended_at=now() WHERE id=%s", [row['id']])
                row = self._read(conn, project_id, job_id)
            return self._public(row, self._current(conn, project, row))

    @staticmethod
    def _recover(conn):
        conn.execute("""UPDATE visual_jobs SET state='failed',stage='failed',ended_at=now(),
            error='工作进程租约或执行时限已过期，未自动重试。' WHERE state='running' AND
            (heartbeat_at <= now()-interval '60 seconds' OR started_at <= now() -
             CASE kind WHEN 'export' THEN interval '1800 seconds' WHEN 'agent' THEN interval '1800 seconds' WHEN 'preview' THEN interval '900 seconds' WHEN 'preview-transfer' THEN interval '900 seconds'
             ELSE interval '240 seconds' END)""")

    def claim(self, lane):
        if lane not in ('workflow', 'render'): raise StoreError('validation', 'Expected workflow or render lane')
        kinds = ['generate', 'repair', 'prepare-transfer','recover-source','propose-layout','agent'] if lane == 'workflow' else ['preview', 'preview-transfer', 'export']
        with self.store.connection() as conn:
            conn.execute("SELECT pg_advisory_xact_lock(hashtext('aicreater.visual.' || %s))", [lane])
            self._recover(conn)
            if conn.execute("SELECT id FROM visual_jobs WHERE state='running' AND kind=ANY(%s) LIMIT 1", [kinds]).fetchone(): return None
            row = conn.execute("""SELECT * FROM visual_jobs WHERE state='queued' AND kind=ANY(%s)
                ORDER BY created_at,id LIMIT 1 FOR UPDATE SKIP LOCKED""", [kinds]).fetchone()
            if row is None: return None
            token = str(uuid.uuid4())
            conn.execute("""UPDATE visual_jobs SET state='running',stage=kind,attempt_id=%s,
                started_at=now(),heartbeat_at=now() WHERE id=%s""", [token, row['id']])
            return self._read(conn, str(row['project_id']), str(row['id']))

    @staticmethod
    def _active(conn, job_id, token):
        row = conn.execute("""SELECT *, heartbeat_at > now()-interval '60 seconds'
            AND started_at > now() - CASE kind WHEN 'export' THEN interval '1800 seconds'
            WHEN 'preview' THEN interval '900 seconds' WHEN 'preview-transfer' THEN interval '900 seconds' ELSE interval '240 seconds' END AS lease_valid
            FROM visual_jobs WHERE id=%s FOR UPDATE""", [identifier(job_id)]).fetchone()
        if row is None or row['state'] != 'running' or str(row['attempt_id']) != identifier(token) or not row['lease_valid']:
            return None
        return VisualJobs._raw(row)

    def heartbeat(self, job_id, token):
        with self.store.connection() as conn:
            self._recover(conn)
            if self._active(conn, job_id, token) is None: return False
            conn.execute('UPDATE visual_jobs SET heartbeat_at=now() WHERE id=%s', [job_id])
            return True

    @staticmethod
    def _valid_result(row, result):
        files = result.get('_files', {})
        if not isinstance(files, dict) or any(not isinstance(k, str) or not FILE_NAME.fullmatch(k) or
                not isinstance(v, str) or not HASH.fullmatch(v) for k, v in files.items()): return False
        kind = row['kind']
        if kind=='propose-layout':
            return (result.get('generation_mode')=='source' and type(result.get('requests_dispatched')) is int and result['requests_dispatched']==0 and
                    result.get('execution')=='not_run' and result.get('technical')=='passed' and result.get('visual')=='pending' and result.get('production_adopted') is False and result.get('diagnostic') is True and result.get('accepted') is not True and
                    all(k not in result for k in ('source','sha256','video','srt','frames','geometry','assembly_sha256','intent_sha256')) and
                    all(isinstance(result.get(k),str) and HASH.fullmatch(result[k]) for k in ('design_sha256','original_design_sha256','layout_sha256')) and
                    isinstance(result.get('design'),dict) and isinstance(result.get('moves'),list) and len(result['moves'])<=20 and isinstance(result.get('unresolved'),list) and len(result['unresolved'])<=400 and
                    result.get('layout_preflight') in ('passed','failed') and (result['layout_preflight']!='passed' or not result['unresolved']) and set(files)=={'design.json'})
        if kind=='agent':
            # Only a gated, rendered scene is published as a success; stopped runs fail with AGENT_STOPPED.
            usage=result.get('usage')
            return (result.get('status')=='passed' and result.get('finish_by') in ('model','harness') and
                    isinstance(result.get('sha256'),str) and HASH.fullmatch(result['sha256']) is not None and
                    type(result.get('turns')) is int and 1<=result['turns']<=row['input']['max_turns'] and result.get('requests_dispatched')==result['turns'] and
                    isinstance(usage,dict) and all(type(usage.get(k)) is int and usage[k]>=0 for k in ('inputTokens','outputTokens','cachedInputTokens')) and
                    result.get('model')==row['input']['model'] and result.get('video')=='video.mp4' and result.get('srt')=='video.srt' and
                    isinstance(result.get('frames'),list) and 0<len(result['frames'])<=50 and
                    set(files)=={'source.txt','video.mp4','video.srt',*result['frames']})
        if kind=='recover-source':
            return (result.get('generation_mode')=='source' and type(result.get('requests_dispatched')) is int and result['requests_dispatched']==0 and
                    result.get('execution')=='not_run' and result.get('technical')=='passed' and result.get('visual')=='pending' and
                    result.get('production_adopted') is False and result.get('diagnostic') is True and result.get('accepted') is not True and
                    all(key not in result for key in ('video','srt','frames','geometry','assembly_sha256','intent_sha256')) and
                    all(isinstance(result.get(k),str) and HASH.fullmatch(result[k]) for k in ('sha256','design_sha256','recovery_sha256')) and
                    isinstance(result.get('source'),str) and bool(result['source']) and isinstance(result.get('design'),dict) and set(files)=={'source.txt','design.json'})
        if kind in ('prepare-transfer','preview-transfer'):
            preset=row.get('input',{}).get('preset')
            if preset is not None:
                if preset!='rag-augmentation:1' or result.get('preset')!=preset or not isinstance(result.get('origin_sha256'),str) or not HASH.fullmatch(result['origin_sha256']):return False
                if kind=='preview-transfer' and result['origin_sha256']!=row['input'].get('origin_sha256'):return False
            elif any(k in result for k in ('preset','origin_sha256')):return False
        if kind=='preview-transfer':
            frames=result.get('frames');data=row['input']
            return (data.get('transfer_candidate') is True and result.get('diagnostic') is True and result.get('production_adopted') is False and
                    type(result.get('requests_dispatched')) is int and result['requests_dispatched']==0 and
                    all(isinstance(result.get(k),str) and HASH.fullmatch(result[k]) and result[k]==data.get(k) for k in ('sha256','design_sha256','assembly_sha256','binding_sha256')) and
                    isinstance(result.get('geometry'),dict) and isinstance(result.get('frame_hashes'),dict) and isinstance(frames,list) and 0<len(frames)<=500 and
                    all(isinstance(f,str) and re.fullmatch(r'stills/frame-\d+\.png',f) and f in files and files[f]==result.get('frame_hashes',{}).get(f) for f in frames) and
                    (result['geometry'].get('status')!='passed' or (result.get('video')=='video.mp4' and result.get('srt')=='video.srt' and 'video.mp4' in files and 'video.srt' in files)))
        if kind=='prepare-transfer':
            return (type(result.get('requests_dispatched')) is int and result['requests_dispatched']==0 and
                    result.get('execution')=='not_run' and result.get('technical')=='passed' and result.get('visual')=='pending' and
                    result.get('production_adopted') is False and
                    all(key not in result for key in ('video','srt','frames','geometry','generation_mode')) and
                    all(isinstance(result.get(k),str) and HASH.fullmatch(result[k]) for k in ('sha256','design_sha256','assembly_sha256','binding_sha256')) and
                    isinstance(result.get('source'),str) and bool(result['source']) and isinstance(result.get('design'),dict) and
                    set(files)=={'source.txt','design.json'})
        if kind in ('generate', 'repair'):
            count = result.get('requests_dispatched'); maximum = 2 if kind == 'generate' else 1
            if any(key in result and (not isinstance(result[key],str) or not HASH.fullmatch(result[key])) for key in ('sha256','design_sha256','assembly_sha256','intent_sha256')):return False
            mode=row.get('input',{}).get('generation_mode','source')
            if mode not in ('source','host-motion','host-intent','host-components') or result.get('generation_mode','source')!=mode:return False
            hashes=['assembly_sha256'] if mode!='source' else []
            if mode in ('host-intent','host-components'):hashes.append('intent_sha256')
            if any(not isinstance(result.get(key),str) or not HASH.fullmatch(result[key]) for key in hashes):return False
            minimum=0 if kind=='repair' and row.get('input',{}).get('operation')=='retime' else 1
            if minimum==0:maximum=0
            return (type(count) is int and minimum <= count <= maximum and
                    all(isinstance(result.get(k), str) and HASH.fullmatch(result[k]) for k in ('sha256', 'design_sha256')) and
                    isinstance(result.get('source'), str) and bool(result['source']) and isinstance(result.get('design'), dict))
        if kind == 'preview':
            frames = result.get('frames')
            return (result.get('sha256') == row['input']['sha256'] and
                    isinstance(result.get('geometry'), dict) and isinstance(frames, list) and
                    all(isinstance(f, str) and re.fullmatch(r'stills/frame-\d+\.png', f) for f in frames) and
                    (result['geometry'].get('status') != 'passed' or
                     (result.get('video') == 'video.mp4' and result.get('srt') == 'video.srt')))
        return result.get('video') == 'video.mp4' and result.get('srt') == 'video.srt'

    def finish(self, job_id, token, result, error=None):
        if not isinstance(result, dict): raise StoreError('validation', 'Expected a JSON result object')
        unicode_valid(result)
        with self.store.connection() as conn:
            initial = conn.execute('SELECT project_id FROM visual_jobs WHERE id=%s', [identifier(job_id)]).fetchone()
            if initial is None: raise StoreError('not_found', 'Visual job not found')
            project = self.store._read(conn, str(initial['project_id']), lock=True)
            row = self._active(conn, job_id, token)
            if row is None: raise StoreError('conflict', 'Visual attempt is terminal or expired')
            current = self._current(conn, project, row)
            failure = STALE if not current else (LAYOUT_FAILURE if error=='layout_preflight' else SOURCE_FAILURE if error=='source_typecheck' else AGENT_ERRORS.get(error, AGENT_STOPPED) if isinstance(error,str) and error.startswith('agent_') else FAILURE) if error is not None else None
            if failure is None and (not self._valid_result(row, result) or
                    (row['kind'] in ('preview','preview-transfer') and not self._parent_matches(conn, project, row['input'], result))):
                failure = 'validation: 视觉结果未通过校验，未自动重试。'
            result = copy.deepcopy(result)
            result.pop('accepted', None)
            state = 'failed' if failure else 'succeeded'
            conn.execute('''UPDATE visual_jobs SET state=%s,stage=%s,result=%s,error=%s,ended_at=now()
                WHERE id=%s''', [state, 'stale' if not current else state, Jsonb(result), failure, job_id])
            # A failed first design used one of the two base calls. Revision + source
            # use two more calls, sharing the single extra repair allowance (total <= 3).
            if (state=='failed' and current and error=='layout_preflight' and row['kind']=='generate' and
                    result.get('requests_dispatched')==1 and row['input'].get('auto_render') is True and row['input'].get('auto_repair_requests')==1):
                self._repair_design_video(conn,project,self._read(conn,project['id'],job_id))
            if (state=='failed' and current and error=='source_typecheck' and row['kind']=='generate' and
                    result.get('requests_dispatched')==2 and row['input'].get('auto_render') is True and row['input'].get('auto_repair_requests')==1):
                self._repair_compilation(conn,project,self._read(conn,project['id'],job_id))
            if state=='succeeded' and row['kind'] in ('generate','repair') and row['input'].get('auto_render') is True:
                data={k:copy.deepcopy(row['input'][k]) for k in ('scene','asset','fingerprint')}
                data.update(generation_id=row['id'],sha256=result['sha256'],isolated_render=True)
                if row['input'].get('timing_mode')=='draft':data['timing_mode']='draft'
                if row['input'].get('auto_repair_requests')==1:data['auto_repair_requests']=1
                self._submit(conn,project,row['scene_id'],'preview',data)
            if state=='succeeded' and row['kind']=='preview' and row['input'].get('auto_repair_requests')==1 and result.get('geometry',{}).get('status')=='failed':
                self._repair_preview(conn,project,self._read(conn,project['id'],job_id))
            return self._public(self._read(conn, project['id'], job_id), current)
