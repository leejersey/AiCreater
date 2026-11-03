"""Durable, project-scoped Scene Agent and course export jobs. No file access or provider execution."""
import copy
import re
import uuid

from psycopg.types.json import Jsonb

from services.projects.store import StoreError, identifier, revision, unicode_valid
from services.visual.contract import measured_input, partition_narration


# Older job kinds (template-flow generate/repair/preview/transfer…) may remain in the table; they are never
# listed, claimed or exported.
KINDS = ('agent', 'export')
RESULT_FIELDS = frozenset({'sha256', 'requests_dispatched', 'frames', 'video', 'srt', 'durationInFrames',
    'status', 'reason', 'turns', 'usage', 'model', 'finish_by'})
FILE_NAME = re.compile(r'(?:source\.txt|video\.mp4|video\.srt|stills/frame-\d+\.png)')
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
    'agent_provider_request': '模型服务拒绝了请求格式（例如上下文过长）；运行记录已保留，未自动重试。',
    'agent_provider_response': '模型服务返回了无法读取的响应；运行记录已保留，未自动重试。',
    'agent_internal': 'Agent 运行出错；运行记录已保留，未自动重试。',
}
AGENT_MODEL = 'deepseek-flash-thinking'
# Lease length per job kind. Both the lease check and expiry recovery read this, so a new kind cannot get
# one limit in one place and the 240 s default in the other.
LEASE_SECONDS = {'export': 1800, 'agent': 1800}
DEFAULT_LEASE_SECONDS = 240
LEASE_SQL = ('CASE kind ' + ' '.join(f"WHEN '{kind}' THEN interval '{seconds} seconds'" for kind, seconds in LEASE_SECONDS.items()) +
             f" ELSE interval '{DEFAULT_LEASE_SECONDS} seconds' END")
AGENT_MAX_TURNS = 25
STALE = 'stale: 章节版本或冻结素材已改变，请重新生成并确认当前版本。'


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
        if row['kind'] == 'agent': result['accepted'] = accepted
        data = row.get('input') or {}
        summary = {k: data[k] for k in ('fingerprint',) if k in data}
        if row['kind'] == 'export': summary['chapter_count'] = len(data.get('chapters', []))
        if row['kind'] == 'agent': summary.update(model=data.get('model'), max_turns=data.get('max_turns'))
        created = row.get('created_at')
        public_error=row.get('error')
        return {'id': str(row['id']), 'project_id': str(row['project_id']),
                'scene_id': str(row['scene_id']) if row.get('scene_id') else None,
                'kind': row['kind'], 'state': row['state'], 'stage': row['stage'],
                'error': public_error[:1000] if isinstance(public_error,str) else None,
                'created_at': created.isoformat() if hasattr(created, 'isoformat') else created,
                'result': result, 'input_summary': summary, 'accepted': accepted, 'current': current}

    @staticmethod
    def _read(conn, project_id, job_id, lock=False):
        row = conn.execute('SELECT * FROM visual_jobs WHERE project_id=%s AND id=%s AND kind=ANY(%s)' +
                           (' FOR UPDATE' if lock else ''), [identifier(project_id), identifier(job_id), list(KINDS)]).fetchone()
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
            rows = conn.execute('SELECT * FROM visual_jobs WHERE project_id=%s AND kind=ANY(%s) ORDER BY created_at DESC,id DESC',
                                [project['id'], list(KINDS)]).fetchall()
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
                    AND kind='agent' AND state='succeeded' AND result->'accepted'='true'::jsonb
                    ORDER BY created_at DESC,id DESC""", [project['id'], scene['id']]).fetchall()
                accepted = next((self._raw(r) for r in rows if self._acceptable(r) and self._current(conn, project, self._raw(r))), None)
                if accepted is None: raise StoreError('not_ready', 'Every current chapter needs an accepted Agent video')
                data = {k: copy.deepcopy(accepted['input'][k]) for k in ('scene', 'asset', 'fingerprint', 'brief', 'cues')}
                chapters.append({**data, 'agent_id': str(accepted['id']), 'sha256': accepted['result']['sha256'], 'scene_id': scene['id']})
            return self._submit(conn, project, None, 'export', {'chapters': chapters, 'project_revision': expected_revision})

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
            return row['kind'] == 'agent' and self._snapshot_current(project, row['scene_id'], data)
        except (StoreError, KeyError, TypeError, ValueError):
            return False

    def _agent_matches(self, conn, project, data):
        agent = self._read(conn, project['id'], data['agent_id'])
        result = agent.get('result') or {}
        return (agent['kind'] == 'agent' and agent['scene_id'] == data['scene_id'] and self._acceptable(agent) and
                result.get('accepted') is True and result.get('sha256') == data['sha256'] and
                all(agent['input'][k] == data[k] for k in ('fingerprint', 'scene', 'asset', 'brief', 'cues')))

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
            (heartbeat_at <= now()-interval '60 seconds' OR started_at <= now() - """ + LEASE_SQL + ')')

    def claim(self, lane):
        if lane not in ('workflow', 'render'): raise StoreError('validation', 'Expected workflow or render lane')
        kinds = ['agent'] if lane == 'workflow' else ['export']
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
            AND started_at > now() - """ + LEASE_SQL + """ AS lease_valid
            FROM visual_jobs WHERE id=%s FOR UPDATE""", [identifier(job_id)]).fetchone()
        if row is None or row['state'] != 'running' or str(row['attempt_id']) != identifier(token) or not row['lease_valid']:
            return None
        return VisualJobs._raw(row)

    def heartbeat(self, job_id, token, stage=None):
        # An optional progress line for the UI; bounded, and never a way to change the job's state.
        if stage is not None and (not isinstance(stage, str) or not 0 < len(stage) <= 120): raise StoreError('validation', 'Invalid stage')
        with self.store.connection() as conn:
            self._recover(conn)
            if self._active(conn, job_id, token) is None: return False
            if stage is None: conn.execute('UPDATE visual_jobs SET heartbeat_at=now() WHERE id=%s', [job_id])
            else: conn.execute('UPDATE visual_jobs SET heartbeat_at=now(),stage=%s WHERE id=%s', [stage, job_id])
            return True

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
                    set(files)=={'source.txt','video.mp4','video.srt',*result['frames']})
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
            failure = STALE if not current else (AGENT_ERRORS.get(error, AGENT_STOPPED) if isinstance(error,str) and error.startswith('agent_') else FAILURE) if error is not None else None
            if failure is None and not self._valid_result(row, result):
                failure = 'validation: 视觉结果未通过校验，未自动重试。'
            result = copy.deepcopy(result)
            result.pop('accepted', None)
            state = 'failed' if failure else 'succeeded'
            conn.execute('''UPDATE visual_jobs SET state=%s,stage=%s,result=%s,error=%s,ended_at=now()
                WHERE id=%s''', [state, 'stale' if not current else state, Jsonb(result), failure, job_id])
            return self._public(self._read(conn, project['id'], job_id), current)
