"""Durable, project-scoped Scene Agent and course export jobs. No file access or provider execution."""
import copy
import hashlib
import re
import uuid

from psycopg.types.json import Jsonb

from services import chapters, themes
from services.accounts.model_settings import resolve_llm
from services.projects import leases
from services.projects.store import StoreError, identifier, revision, unicode_valid
from services.visual.contract import measured_input, partition_narration


# Older job kinds (template-flow generate/repair/preview/transfer…) may remain in the table; they are never
# listed, claimed or exported.
KINDS = ('agent', 'export', 'restyle')
RESULT_FIELDS = frozenset({'sha256', 'requests_dispatched', 'frames', 'video', 'srt', 'durationInFrames',
    'status', 'reason', 'turns', 'usage', 'model', 'finish_by'})
FILE_NAME = re.compile(r'(?:source\.txt|kit\.txt|video\.mp4|video\.srt|stills/frame-\d+\.png)')
HASH = re.compile(r'[a-f0-9]{64}')
FAILURE = '视频生成未完成，程序已保存诊断和已有产物；未自动重试。'
AGENT_STOPPED = 'Agent 未在轮数上限内完成通过检查的画面；运行记录已保留，未自动重试。'
# Why a scene-agent run stopped, as the job error the user sees; unknown reasons fall back to AGENT_STOPPED.
AGENT_ERRORS = {
    'agent_provider_auth': '模型服务拒绝请求（API Key 无效、无权限或余额不足）；未生成画面，未自动重试。',
    'agent_provider_unavailable': '模型服务暂时不可用（限流或服务端繁忙，单轮已重试 4 次）；未自动重试任务。',
    'agent_refusal': '模型拒绝了本次请求；未生成画面，未自动重试。',
    'agent_stalled': 'Agent 连续多轮没有修改画面，已停止；运行记录已保留，未自动重试。',
    'agent_no_finish': 'Agent 多次回复未调用工具，已停止；运行记录已保留，未自动重试。',
    'agent_max_tokens': 'Agent 连续两轮输出被截断，已停止；运行记录已保留，未自动重试。',
    'agent_budget_tokens': 'Agent 用完输出 token 上限仍未通过检查；运行记录已保留，未自动重试。',
    'agent_budget_turns': AGENT_STOPPED,
    'agent_provider_request': '模型服务拒绝了请求格式（例如上下文过长）；运行记录已保留，未自动重试。',
    'agent_provider_response': '模型服务返回了无法读取的响应；运行记录已保留，未自动重试。',
    'agent_internal': 'Agent 运行出错；运行记录已保留，未自动重试。',
    'agent_llm_changed': '模型配置在提交后变更，未启动 Agent、未计费；请重新提交。',
    'agent_provider_destination': '模型地址解析到非公网地址，已拒绝连接、未发出请求；请在个人中心检查 Base URL。',
}
AGENT_MODEL = 'deepseek-flash-thinking'
AGENT_MAX_TURNS = 25
MAX_FEEDBACK = 2000
STALE = 'stale: 章节版本或冻结素材已改变，请重新生成并确认当前版本。'


MAX_CHAPTER_TEXT = 800
MAX_CHAPTERS = 20


def chapter_text(text):
    if not isinstance(text, str) or not text.strip() or len(text) > MAX_CHAPTER_TEXT:
        raise StoreError('validation', f'每章口播须为 1–{MAX_CHAPTER_TEXT} 字')
    unicode_valid(text)
    return text


class VisualJobs:
    def __init__(self, store):
        self.store = store

    _raw = staticmethod(leases.row)

    @staticmethod
    def _public(row, current=True):
        result = {k: copy.deepcopy(v) for k, v in (row.get('result') or {}).items() if k in RESULT_FIELDS}
        # Published from the local copy only: the object-storage upload failed and the runner retries it.
        if (row.get('result') or {}).get('_stored') is False: result['backup'] = 'pending'
        accepted = bool(current and row['state'] == 'succeeded' and (row.get('result') or {}).get('accepted') is True)
        if row['kind'] == 'agent': result['accepted'] = accepted
        data = row.get('input') or {}
        summary = {k: data[k] for k in ('fingerprint',) if k in data}
        if row['kind'] == 'export': summary['chapter_count'] = len(data.get('chapters', []))
        # Jobs from before themes rendered in the default theme.
        summary['theme_id'] = (data.get('theme') or {}).get('id', themes.DEFAULT_THEME)
        # The accent the job rendered with when it differs from its theme's own (a course color).
        frozen = data.get('theme') or {}
        if frozen.get('id') in themes._themes() and frozen['colors']['accent'] != themes.snapshot(frozen['id'])['colors']['accent']:
            summary['theme_accent'] = frozen['colors']['accent']
        if row['kind'] == 'agent': summary.update(model=data.get('model'), max_turns=data.get('max_turns'))
        # Which model actually runs it; jobs from before account settings used the server's DeepSeek.
        if row['kind'] == 'agent': summary['llm'] = {k: (data.get('llm') or {'source': 'env', 'model': 'deepseek-flash'}).get(k) for k in ('source', 'model')}
        if row['kind'] == 'restyle': summary['agent_id'] = data.get('agent_id')
        if row['kind'] == 'agent' and isinstance(data.get('revision'), dict):
            summary.update(revision_of=data['revision'].get('job_id'), feedback=data['revision'].get('feedback'))
        created = row.get('created_at')
        public_error=row.get('error');error_code=None
        if isinstance(public_error, dict): error_code, public_error = public_error.get('reason') or public_error.get('code'), public_error.get('message')
        return {'id': str(row['id']), 'project_id': str(row['project_id']),
                'scene_id': str(row['scene_id']) if row.get('scene_id') else None,
                'kind': row['kind'], 'state': row['state'], 'stage': row['stage'],
                'error': public_error[:1000] if isinstance(public_error,str) else None,
                **({'error_code': error_code} if isinstance(error_code, str) and re.fullmatch(r'[a-z_]{1,40}', error_code) else {}),
                'created_at': created.isoformat() if hasattr(created, 'isoformat') else created,
                'result': result, 'input_summary': summary, 'accepted': accepted, 'current': current}

    @staticmethod
    def _read(conn, project_id, job_id, lock=False):
        row = conn.execute('SELECT * FROM jobs WHERE project_id=%s AND id=%s AND kind=ANY(%s)' +
                           (' FOR UPDATE' if lock else ''), [identifier(project_id), identifier(job_id), list(KINDS)]).fetchone()
        if row is None: raise StoreError('not_found', 'Visual job not found in this project')
        return VisualJobs._raw(row)

    def get_raw(self, project_id, job_id):
        with self.store.connection() as conn:
            self.store._read(conn, project_id)
            return self._read(conn, project_id, job_id)

    def _with_timing(self, project, row, public):
        """Adds, for a retimable Agent version, whether its own video was rendered on the current recording."""
        if row['kind'] == 'agent' and self._retimable(row):
            public['input_summary']['retimable'] = True
            if public['current']:
                try: public['input_summary']['timing_current'] = self._timing_current(project, row['scene_id'], row['input'])
                except (StoreError, KeyError, TypeError): pass
        return public

    def get(self, project_id, job_id):
        with self.store.connection() as conn:
            project = self.store._read(conn, project_id)
            row = self._read(conn, project_id, job_id)
            return self._with_timing(project, row, self._public(row, self._current(conn, project, row)))

    def list(self, project_id):
        with self.store.connection() as conn:
            conn.execute('SET TRANSACTION ISOLATION LEVEL REPEATABLE READ, READ ONLY')
            project = self.store._read(conn, project_id)
            rows = conn.execute('SELECT * FROM jobs WHERE project_id=%s AND kind=ANY(%s) ORDER BY created_at DESC,id DESC',
                                [project['id'], list(KINDS)]).fetchall()
            return [self._with_timing(project, self._raw(r), self._public(r, self._current(conn, project, self._raw(r)))) for r in rows]

    def _submit(self, conn, project, scene_id, kind, data, base_revision):
        unicode_valid(data)
        # An identical request that is still queued or running is the same paid job; a finished one may be repeated.
        existing=conn.execute("""SELECT * FROM jobs WHERE project_id=%s
            AND scene_id IS NOT DISTINCT FROM %s AND kind=%s AND input=%s
            AND state IN ('queued','running') ORDER BY created_at LIMIT 1""",
            [project['id'],scene_id,kind,Jsonb(data)]).fetchone()
        if existing:return self._public(self._raw(existing))
        job_id = str(uuid.uuid4())
        conn.execute('''INSERT INTO jobs(id,project_id,scene_id,kind,base_revision,input_hash,input,stage)
            VALUES (%s,%s,%s,%s,%s,%s,%s,'queued')''',
            [job_id, project['id'], scene_id, kind, base_revision, hashlib.sha256(job_id.encode()).hexdigest(), Jsonb(data)])
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
                project = self.store._insert_scene(conn, project, chapters.chapter(part, None), len(project['scenes']), 'needs_voice')
            return project

    # Chapter editing. Any change to the narration drops the chapter's audio, captions and videos: it goes back to
    # needs_voice, and older Agent videos stop matching it, so they can no longer be confirmed or exported.
    def _editable(self, conn, project_id, expected_revision, scene_id):
        project = self.store._structure_project(conn, project_id, expected_revision)
        row = self.store._scene(project, scene_id)
        busy = conn.execute("SELECT 1 FROM jobs WHERE project_id=%s AND state IN ('queued','running') LIMIT 1", [project['id']]).fetchone()
        if busy: raise StoreError('not_ready', '项目内有任务进行中，结束后再修改章节')
        return project, row

    def _rewrite(self, conn, row, text):
        scene = chapters.chapter(text, row['scene']['id'])
        chapters.validate(scene)
        conn.execute("""UPDATE scenes SET scene=%s,state='needs_voice',revision=revision+1,user_revision=user_revision+1
            WHERE id=%s""", [Jsonb(scene), row['id']])

    def _remove(self, conn, project, row):
        # Soft delete keeps job history; positions >= 20 are reserved for removed rows.
        conn.execute("""UPDATE scenes SET deleted_at=now(),position=(SELECT GREATEST(20,COALESCE(MAX(position),19)+1)
            FROM scenes WHERE project_id=%s) WHERE id=%s""", [project['id'], row['id']])
        conn.execute('UPDATE scenes SET position=position-1 WHERE project_id=%s AND deleted_at IS NULL AND position>%s',
                     [project['id'], row['position']])

    def edit_chapter(self, project_id, expected_revision, scene_id, text):
        text = chapter_text(text)
        with self.store.connection() as conn:
            project, row = self._editable(conn, project_id, expected_revision, scene_id)
            if text == row['scene']['narration']['text']: return project
            self._rewrite(conn, row, text)
            conn.execute('UPDATE projects SET revision=revision+1 WHERE id=%s', [project['id']])
            return self.store._read(conn, project['id'])

    def split_chapter(self, project_id, expected_revision, scene_id, at):
        with self.store.connection() as conn:
            project, row = self._editable(conn, project_id, expected_revision, scene_id)
            text = row['scene']['narration']['text']
            if type(at) is not int or not 0 < at < len(text) or not text[:at].strip() or not text[at:].strip():
                raise StoreError('validation', '拆分位置须在口播中间，两边都要有文字')
            if len(project['scenes']) >= MAX_CHAPTERS: raise StoreError('validation', f'最多 {MAX_CHAPTERS} 章')
            self._rewrite(conn, row, text[:at])
            project = self.store._read(conn, project['id'])
            return self.store._insert_scene(conn, project, chapters.chapter(text[at:], None), row['position'] + 1, 'needs_voice')

    def merge_next_chapter(self, project_id, expected_revision, scene_id):
        with self.store.connection() as conn:
            project, row = self._editable(conn, project_id, expected_revision, scene_id)
            following = next((s for s in project['scenes'] if s['position'] == row['position'] + 1), None)
            if following is None: raise StoreError('validation', '这是最后一章，没有下一章可合并')
            text = chapter_text(row['scene']['narration']['text'] + following['scene']['narration']['text'])
            self._rewrite(conn, row, text)
            self._remove(conn, project, following)
            conn.execute('UPDATE projects SET revision=revision+1 WHERE id=%s', [project['id']])
            return self.store._read(conn, project['id'])

    def delete_chapter(self, project_id, expected_revision, scene_id, confirmed):
        if confirmed is not True: raise StoreError('validation', '删除章节须明确确认')
        with self.store.connection() as conn:
            project, row = self._editable(conn, project_id, expected_revision, scene_id)
            if len(project['scenes']) <= 1: raise StoreError('validation', '至少保留一章')
            self._remove(conn, project, row)
            conn.execute('UPDATE projects SET revision=revision+1 WHERE id=%s', [project['id']])
            return self.store._read(conn, project['id'])

    UNDO_SECONDS = 600

    def retime_stale(self):
        """After a chapter is re-voiced: re-render its retimable Agent version on the new recording (free, local).
        One job per call, for a project with nothing running; called by the runner between jobs."""
        with self.store.connection() as conn:
            ids = [str(r['project_id']) for r in conn.execute("""SELECT DISTINCT project_id FROM jobs WHERE kind='agent' AND state='succeeded'
                AND result->'retimable'='true'::jsonb""").fetchall()]
        for project_id in ids:
            with self.store.connection() as conn:
                project = self.store._read(conn, project_id)
                if conn.execute("SELECT 1 FROM jobs WHERE project_id=%s AND state IN ('queued','running') LIMIT 1", [project_id]).fetchone(): continue
                for scene in project['scenes']:
                    rows = [self._raw(r) for r in conn.execute("""SELECT * FROM jobs WHERE project_id=%s AND scene_id=%s AND kind='agent'
                        AND state='succeeded' ORDER BY created_at DESC""", [project_id, scene['id']]).fetchall()]
                    versions = [r for r in rows if self._retimable(r) and self._acceptable(r) and self._current(conn, project, r)]
                    if not versions: continue
                    shown = next((r for r in versions if (r.get('result') or {}).get('accepted') is True), versions[0])
                    try:
                        if self._timing_current(project, scene['id'], shown['input']): continue
                        measured = measured_input(project, scene)
                    except StoreError: continue
                    done = conn.execute("""SELECT 1 FROM jobs WHERE project_id=%s AND kind='restyle' AND input->>'agent_id'=%s
                        AND input->>'fingerprint'=%s AND state IN ('queued','running','succeeded') LIMIT 1""",
                        [project_id, shown['id'], measured['fingerprint']]).fetchone()
                    if done: continue
                    revision_now = project['revision']
                    break
                else: continue
            return self.restyle(project_id, shown['id'], revision_now)
        return None

    def restore_chapter(self, project_id, expected_revision, scene_id, at):
        """Undoes a chapter deletion made in the last 10 minutes: the chapter comes back at index `at` with its voice,
        captions and videos as they were."""
        if type(at) is not int or at < 0: raise StoreError('validation', 'Expected the chapter position to restore')
        with self.store.connection() as conn:
            project = self.store._structure_project(conn, project_id, expected_revision)
            if conn.execute("SELECT 1 FROM jobs WHERE project_id=%s AND state IN ('queued','running') LIMIT 1", [project['id']]).fetchone():
                raise StoreError('not_ready', '项目内有任务进行中，结束后再修改章节')
            row = conn.execute(f"""SELECT id FROM scenes WHERE id=%s AND project_id=%s AND deleted_at IS NOT NULL
                AND deleted_at > now() - interval '{self.UNDO_SECONDS} seconds'""", [identifier(scene_id), project['id']]).fetchone()
            if row is None: raise StoreError('conflict', '只能撤销 10 分钟内删除的章节')
            if len(project['scenes']) >= 20: raise StoreError('validation', 'At most 20 narration chapters are supported')
            at = min(at, len(project['scenes']))
            conn.execute('UPDATE scenes SET position=position+1 WHERE project_id=%s AND deleted_at IS NULL AND position>=%s', [project['id'], at])
            conn.execute('UPDATE scenes SET deleted_at=NULL,position=%s WHERE id=%s', [at, row['id']])
            conn.execute('UPDATE projects SET revision=revision+1 WHERE id=%s', [project['id']])
            return self.store._read(conn, project['id'])

    def agent(self, project_id, scene_id, expected_revision, confirmed, max_turns, revise=None, feedback=None):
        # One job: the scene-agent loop (paid model turns, capped) and, if it passes, the voiced chapter video.
        # With `revise`, the loop starts from that passed Agent version of this chapter plus the person's feedback.
        if confirmed is not True or type(max_turns) is not int or not 1 <= max_turns <= AGENT_MAX_TURNS:
            raise StoreError('validation', f'必须明确确认本次 Agent 轮数上限（1–{AGENT_MAX_TURNS}）；失败不自动重试')
        if (revise is None) != (feedback is None) or (feedback is not None and (not isinstance(feedback, str) or not feedback.strip() or len(feedback) > MAX_FEEDBACK)):
            raise StoreError('validation', f'按意见修改须同时给出要修改的版本和 1–{MAX_FEEDBACK} 字的修改意见')
        revision(expected_revision)
        with self.store.connection() as conn:
            project = self.store._read(conn, project_id, lock=True)
            scene = self.store._scene(project, scene_id)
            if project['revision'] != expected_revision: raise StoreError('conflict', 'Project revision changed')
            data = measured_input(project, scene)
            # The model is fixed when the person confirms; a later change to their settings makes this job stale, never
            # silently switches who runs or pays for it.
            data.update(model=AGENT_MODEL, max_turns=max_turns, theme=themes.course_snapshot(project),
                        llm=resolve_llm(self.store, self.owner(conn, project['id'])).public())
            if revise is not None:
                base = self._read(conn, project['id'], revise)
                result = base.get('result') or {}
                if (base['kind'] != 'agent' or base['scene_id'] != scene['id'] or base['state'] != 'succeeded' or
                        result.get('status') != 'passed' or 'source.txt' not in (result.get('_files') or {}) or not self._current(conn, project, base)):
                    raise StoreError('conflict', '只能在本章当前有效、已通过检查的 Agent 版本上修改')
                data['revision'] = {'job_id': base['id'], 'sha256': result['sha256'], 'feedback': feedback.strip()}
            return self._submit(conn, project, scene['id'], 'agent', data, scene['revision'])

    @staticmethod
    def owner(conn, project_id):
        row = conn.execute('SELECT owner_id FROM projects WHERE id=%s', [project_id]).fetchone()
        return str(row['owner_id']) if row and row['owner_id'] else None

    @staticmethod
    def _acceptable(row):
        result = row.get('result') or {}; files = result.get('_files') or {}
        frames = result.get('frames') or []
        # A gated Agent scene with its rendered chapter video.
        return (row['kind'] == 'agent' and row['state'] == 'succeeded' and result.get('status') == 'passed' and isinstance(result.get('sha256'),str) and
                result.get('video') == 'video.mp4' and result.get('srt') == 'video.srt' and bool(frames) and
                all(name in files for name in ('source.txt','video.mp4','video.srt',*frames)))

    def accept(self, project_id, job_id, confirmed, sha256):
        if confirmed is not True or not isinstance(sha256, str) or not HASH.fullmatch(sha256):
            raise StoreError('validation', 'Explicit confirmation of the exact video hash is required')
        with self.store.connection() as conn:
            project = self.store._read(conn, project_id, lock=True)
            row = self._read(conn, project_id, job_id, lock=True)
            if not self._current(conn, project, row): raise StoreError('conflict', STALE)
            if not self._acceptable(row): raise StoreError('not_ready', 'A passed Agent video is required')
            if row['result'].get('sha256') != sha256:
                raise StoreError('conflict', 'Approved source hash does not match')
            result = {**row['result'], 'accepted': True}
            conn.execute('UPDATE jobs SET result=%s WHERE id=%s', [Jsonb(result), row['id']])
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
                rows = conn.execute("""SELECT * FROM jobs WHERE project_id=%s AND scene_id=%s
                    AND kind='agent' AND state='succeeded' AND result->'accepted'='true'::jsonb
                    ORDER BY created_at DESC,id DESC""", [project['id'], scene['id']]).fetchall()
                accepted = next((self._raw(r) for r in rows if self._acceptable(r) and self._current(conn, project, self._raw(r))), None)
                if accepted is None: raise StoreError('not_ready', 'Every current chapter needs an accepted Agent video')
                base = measured_input(project, scene) if self._retimable(accepted) else accepted['input']
                data = {k: copy.deepcopy(base[k]) for k in ('scene', 'asset', 'fingerprint', 'brief', 'cues')}
                chapters.append({**data, 'agent_id': str(accepted['id']), 'sha256': accepted['result']['sha256'], 'scene_id': scene['id']})
            return self._submit(conn, project, None, 'export', {'chapters': chapters, 'project_revision': expected_revision,
                                'theme': themes.course_snapshot(project)}, expected_revision)

    def restyle(self, project_id, job_id, expected_revision):
        """Re-renders a passed Agent version of a chapter in the course's current theme: its own source, audio and captions,
        no model call. Its confirmation is unaffected; this only refreshes the preview."""
        revision(expected_revision)
        with self.store.connection() as conn:
            project = self.store._read(conn, project_id, lock=True)
            if project['revision'] != expected_revision: raise StoreError('conflict', 'Project revision changed')
            agent = self._read(conn, project['id'], job_id)
            if not self._acceptable(agent) or not self._current(conn, project, agent):
                raise StoreError('conflict', '只能为本章当前有效、已通过检查的 Agent 版本重渲染')
            retimable = self._retimable(agent)
            base = measured_input(project, self.store._scene(project, agent['scene_id'])) if retimable else agent['input']
            same_look = (agent['input'].get('theme') or themes.snapshot(themes.DEFAULT_THEME)) == themes.course_snapshot(project)
            if same_look and base['fingerprint'] == agent['input']['fingerprint']:
                raise StoreError('validation', '这个版本已经是课程当前的主题和配音')
            data = {k: copy.deepcopy(base[k]) for k in ('scene', 'asset', 'fingerprint', 'brief', 'cues')}
            data.update(agent_id=str(agent['id']), sha256=agent['result']['sha256'], theme=themes.course_snapshot(project))
            scene = self.store._scene(project, agent['scene_id'])
            return self._submit(conn, project, scene['id'], 'restyle', data, scene['revision'])

    # A retimable Agent version (it reads timing.cues and passed on another voice-over timing) belongs to the chapter's
    # words and sentences, not to one recording: re-voicing keeps it, and renders follow the current voice-over.
    @staticmethod
    def _retimable(row):
        return (row.get('result') or {}).get('retimable') is True

    @staticmethod
    def _structure(data):
        brief = {k: v for k, v in (data.get('brief') or {}).items() if k != 'durationInFrames'}
        return brief, [c.get('text') for c in data.get('cues') or []]

    def _structure_current(self, project, scene_id, data):
        return self._structure(measured_input(project, self.store._scene(project, scene_id))) == self._structure(data)

    def _timing_current(self, project, scene_id, data):
        """Rendered on the chapter's current recording (same audio, captions and revision)."""
        return measured_input(project, self.store._scene(project, scene_id))['fingerprint'] == data.get('fingerprint')

    def _snapshot_current(self, project, scene_id, data):
        row = self.store._scene(project, scene_id)
        measured = measured_input(project, row)
        if any(measured[k] != data.get(k) for k in ('fingerprint', 'scene', 'asset')): return False
        return all(k not in data or measured[k] == data[k] for k in ('brief', 'cues'))

    def _current(self, conn, project, row):
        try:
            data = row['input']
            if row['kind'] == 'export':
                chapters = data['chapters']
                return (data['project_revision'] == project['revision'] and
                        [c['scene_id'] for c in chapters] == [s['id'] for s in project['scenes']] and
                        all('agent_id' in c and self._snapshot_current(project, c['scene_id'], c) and self._agent_matches(conn, project, c) for c in chapters))
            if row['kind'] == 'restyle':
                # Current while its Agent version is, in the course's theme, and (retimable) on the current recording.
                agent = self._read(conn, project['id'], data['agent_id'])
                return (data['theme'] == themes.course_snapshot(project) and agent['kind'] == 'agent' and
                        (agent.get('result') or {}).get('sha256') == data['sha256'] and self._snapshot_current(project, row['scene_id'], data))
            if row['kind'] == 'agent' and self._retimable(row):
                return self._structure_current(project, row['scene_id'], data)
            return row['kind'] == 'agent' and self._snapshot_current(project, row['scene_id'], data)
        except (StoreError, KeyError, TypeError, ValueError):
            return False

    def _agent_matches(self, conn, project, data):
        agent = self._read(conn, project['id'], data['agent_id'])
        result = agent.get('result') or {}
        same = (self._structure(agent['input']) == self._structure(data) if self._retimable(agent) else
                all(agent['input'][k] == data[k] for k in ('fingerprint', 'scene', 'asset', 'brief', 'cues')))
        return (agent['kind'] == 'agent' and agent['scene_id'] == data['scene_id'] and self._acceptable(agent) and
                result.get('accepted') is True and result.get('sha256') == data['sha256'] and same)

    def cancel(self, project_id, job_id):
        with self.store.connection() as conn:
            project = self.store._read(conn, project_id, lock=True)
            row = self._read(conn, project_id, job_id, lock=True)
            # A queued job ends now; a running one is stopped by its worker at the next heartbeat.
            if row['state'] == 'queued':
                leases.terminal(conn, row, 'cancelled'); row = self._read(conn, project_id, job_id)
            elif row['state'] == 'running':
                conn.execute('UPDATE jobs SET cancel_requested=true WHERE id=%s', [row['id']]); row = self._read(conn, project_id, job_id)
            return self._public(row, self._current(conn, project, row))

    def claim(self, lane):
        from services.projects.usage import initial_usage
        with self.store.connection() as conn:
            return leases.claim(conn, lane, KINDS, initial_usage)

    def heartbeat(self, job_id, token, stage=None):
        # An optional progress line for the UI; bounded, and never a way to change the job's state.
        # False tells the worker to stop: the lease is gone, or the user asked to cancel.
        if stage is not None and (not isinstance(stage, str) or not 0 < len(stage) <= 120): raise StoreError('validation', 'Invalid stage')
        with self.store.connection() as conn:
            leases.recover(conn)
            row = leases.active(conn, job_id, token)
            if row is None or row['kind'] not in KINDS: return False
            if stage is None: conn.execute('UPDATE jobs SET heartbeat_at=now() WHERE id=%s', [job_id])
            else: conn.execute('UPDATE jobs SET heartbeat_at=now(),stage=%s WHERE id=%s', [stage, job_id])
            return not row['cancel_requested']

    @staticmethod
    def _valid_result(row, result):
        files = result.get('_files', {})
        if not isinstance(files, dict) or any(not isinstance(k, str) or not FILE_NAME.fullmatch(k) or
                not isinstance(v, str) or not HASH.fullmatch(v) for k, v in files.items()): return False
        if row['kind']=='agent':
            # Only a gated, rendered scene is published as a success; stopped runs fail with AGENT_STOPPED.
            usage=result.get('usage')
            return (result.get('status')=='passed' and result.get('finish_by') in ('model','harness') and
                    isinstance(result.get('sha256'),str) and HASH.fullmatch(result['sha256']) is not None and
                    type(result.get('turns')) is int and 1<=result['turns']<=row['input']['max_turns'] and result.get('requests_dispatched')==result['turns'] and
                    isinstance(usage,dict) and all(type(usage.get(k)) is int and usage[k]>=0 for k in ('inputTokens','outputTokens','cachedInputTokens')) and
                    result.get('model')==row['input']['model'] and result.get('video')=='video.mp4' and result.get('srt')=='video.srt' and
                    isinstance(result.get('frames'),list) and 0<len(result['frames'])<=50 and
                    result.get('kit') in (None,'kit.txt') and
                    set(files)=={'source.txt','video.mp4','video.srt',*result['frames'],*(['kit.txt'] if result.get('kit') else [])})
        return result.get('video') == 'video.mp4' and result.get('srt') == 'video.srt'

    def finish(self, job_id, token, result, error=None):
        if not isinstance(result, dict): raise StoreError('validation', 'Expected a JSON result object')
        unicode_valid(result)
        with self.store.connection() as conn:
            initial = conn.execute('SELECT project_id FROM jobs WHERE id=%s AND kind=ANY(%s)', [identifier(job_id), list(KINDS)]).fetchone()
            if initial is None: raise StoreError('not_found', 'Visual job not found')
            project = self.store._read(conn, str(initial['project_id']), lock=True)
            row = leases.active(conn, job_id, token)
            if row is None: raise StoreError('conflict', 'Visual attempt is terminal or expired')
            if row['cancel_requested']:
                leases.terminal(conn, row, 'cancelled')
                return self._public(self._read(conn, project['id'], job_id), self._current(conn, project, row))
            current = self._current(conn, project, row)
            failure = STALE if not current else (AGENT_ERRORS.get(error, AGENT_STOPPED) if isinstance(error,str) and error.startswith('agent_') else FAILURE) if error is not None else None
            if failure is None and not self._valid_result(row, result):
                failure = 'validation: 视觉结果未通过校验，未自动重试。'
            result = copy.deepcopy(result)
            result.pop('accepted', None)
            state = 'failed' if failure else 'succeeded'
            # reason: the failure's code (agent_provider_auth, …) so the page can offer the matching action.
            reason = 'stale' if not current else (error if isinstance(error, str) and re.fullmatch(r'[a-z_]{1,40}', error) else 'invalid_result' if failure else None)
            error = {'code': 'stale' if not current else 'failed', 'stage': row['stage'], 'message': failure, 'retryable': False, 'reason': reason} if failure else None
            leases.terminal(conn, row, state, error)
            conn.execute('UPDATE jobs SET stage=%s,result=%s,progress=%s WHERE id=%s',
                         ['stale' if not current else state, Jsonb(result), 100 if state == 'succeeded' else 0, job_id])
            return self._public(self._read(conn, project['id'], job_id), current)
