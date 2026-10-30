"""Project-scoped at-most-once model admission. No provider SDK or implicit retry."""
import hashlib
import json
import re
import uuid
from pathlib import Path

from psycopg.types.json import Json

from services.projects.store import StoreError, identifier, revision, unicode_valid
from services.visual.contract import require_budget


def frozen_json(value, maximum=128 * 1024):
    if not isinstance(value, dict): raise StoreError('validation', 'Expected a JSON object')
    pending, visited = [(value, 0)], 0
    while pending:
        item, depth = pending.pop()
        visited += 1
        if depth > 32 or visited > 100000: raise StoreError('validation', 'Teaching JSON exceeds its structural limit')
        if type(item) is dict:
            if any(type(k) is not str for k in item): raise StoreError('validation', 'JSON keys must be strings')
            pending.extend((child, depth + 1) for child in item.values())
        elif type(item) is list: pending.extend((child, depth + 1) for child in item)
        elif item is not None and type(item) not in (str, int, float, bool): raise StoreError('validation', 'Expected JSON data only')
    unicode_valid(value)
    raw = json.dumps(value, sort_keys=True, ensure_ascii=False, allow_nan=False, separators=(',', ':')).encode()
    if len(raw) > maximum: raise StoreError('validation', 'Teaching snapshot exceeds its size limit')
    return json.loads(raw), hashlib.sha256(raw).hexdigest()


def fingerprint(value, maximum=128 * 1024):
    return frozen_json(value, maximum)[1]


def checksum(value):
    if not isinstance(value, str) or not re.fullmatch('[a-f0-9]{64}', value):
        raise StoreError('validation', 'Expected SHA-256 binding')
    return value


class TeachingTasks:
    def __init__(self, store): self.store = store

    def initialize(self):
        # Explicit migration only; not added to the existing workbench startup path.
        with self.store.connection() as conn:
            conn.execute(Path(__file__).with_suffix('.sql').read_text())

    @staticmethod
    def _root(conn, project_id, root_id):
        root = conn.execute('SELECT * FROM teaching_task_roots WHERE project_id=%s AND id=%s FOR UPDATE',
                            [identifier(project_id), identifier(root_id)]).fetchone()
        if root is None: raise StoreError('not_found', 'Teaching task not found in project')
        return root

    @staticmethod
    def _call(row):
        return {**{k: row[k] for k in ('stage', 'request_sha256', 'state', 'output_sha256')}, 'id': str(row['id'])}

    def _summary(self, conn, root):
        calls = conn.execute('SELECT * FROM teaching_model_calls WHERE root_id=%s ORDER BY created_at,id', [root['id']]).fetchall()
        return {'id': str(root['id']), 'project_id': str(root['project_id']), 'scene_id': str(root['scene_id']),
                'base_revision': root['base_revision'], 'created_at': root['created_at'].isoformat(),
                'snapshot_sha256': root['snapshot_sha256'], 'state': root['state'], 'max_requests': 2,
                'requests_used': len(calls), 'calls': [self._call(c) for c in calls]}

    def create(self, project_id, scene_id, expected_revision, idempotency_key, snapshot, confirmed, max_requests):
        require_budget(confirmed, max_requests, 2)
        project_id, scene_id, key = identifier(project_id), identifier(scene_id), identifier(idempotency_key)
        revision(expected_revision)
        snapshot, digest = frozen_json(snapshot)
        with self.store.connection() as conn:
            project = self.store._read(conn, project_id, lock=True)
            old = conn.execute('SELECT * FROM teaching_task_roots WHERE project_id=%s AND idempotency_key=%s FOR UPDATE', [project_id, key]).fetchone()
            if old:
                if str(old['scene_id']) != scene_id or old['base_revision'] != expected_revision or old['snapshot_sha256'] != digest:
                    raise StoreError('conflict', 'Idempotency key is already bound to different input')
                return self._summary(conn, old)
            self.store._scene(project, scene_id)
            if project['revision'] != expected_revision: raise StoreError('conflict', 'Project revision changed')
            root_id = str(uuid.uuid4())
            conn.execute('''INSERT INTO teaching_task_roots(id,project_id,scene_id,base_revision,idempotency_key,snapshot,snapshot_sha256,max_requests)
                VALUES (%s,%s,%s,%s,%s,%s,%s,2)''', [root_id, project_id, scene_id, expected_revision, key, Json(snapshot), digest])
            return self._summary(conn, self._root(conn, project_id, root_id))

    def get(self, project_id, root_id):
        with self.store.connection() as conn: return self._summary(conn, self._root(conn, project_id, root_id))

    def list_ids(self, project_id):
        with self.store.connection() as conn:
            self.store._read(conn, project_id)
            return [str(r['id']) for r in conn.execute('SELECT id FROM teaching_task_roots WHERE project_id=%s ORDER BY created_at DESC,id DESC LIMIT 50', [identifier(project_id)]).fetchall()]

    def checkpoint(self, project_id, root_id):
        with self.store.connection() as conn:
            root = self._root(conn, project_id, root_id)
            if fingerprint(root['snapshot']) != root['snapshot_sha256']:
                raise StoreError('conflict', 'Frozen input checksum mismatch')
            cache = conn.execute('SELECT kind,binding_sha256,payload_sha256 FROM teaching_task_cache WHERE root_id=%s ORDER BY kind,binding_sha256', [root['id']]).fetchall()
            return {'root': self._summary(conn, root), 'snapshot': root['snapshot'], 'cache': [dict(c) for c in cache]}

    def reserve(self, project_id, root_id, stage, request_sha256, *, guard=None):
        if stage not in ('plan', 'revision'): raise StoreError('validation', 'Only initial plan and one revision are supported')
        checksum(request_sha256)
        with self.store.connection() as conn:
            project = self.store._read(conn, project_id, lock=True)
            root = self._root(conn, project_id, root_id)
            old = conn.execute('SELECT * FROM teaching_model_calls WHERE root_id=%s AND stage=%s', [root['id'], stage]).fetchone()
            if old:
                if old['request_sha256'] != request_sha256: raise StoreError('conflict', 'Request stage is already frozen')
                return {**self._call(old), 'dispatch': False}
            if root['state'] != 'active': raise StoreError('cancelled', 'Task cancelled; no new request dispatched')
            if guard is not None:guard(conn)
            if 'media' in root['snapshot']:
                from services.visual.teaching_context import chapter_snapshot
                current = chapter_snapshot(project, self.store._scene(project, str(root['scene_id'])), root['snapshot']['media'].get('timing_mode'))
                if current != root['snapshot']: raise StoreError('conflict', 'Chapter input changed; no new request dispatched')
            calls = conn.execute('SELECT * FROM teaching_model_calls WHERE root_id=%s', [root['id']]).fetchall()
            if len(calls) >= 2: raise StoreError('budget', 'Root model budget exhausted')
            if stage == 'revision' and not any(c['stage'] == 'plan' and c['state'] == 'succeeded' for c in calls):
                raise StoreError('not_ready', 'A recorded initial response is required; unknown calls are not retried')
            call_id, token = str(uuid.uuid4()), str(uuid.uuid4())
            row = conn.execute('''INSERT INTO teaching_model_calls(id,root_id,stage,request_sha256,dispatch_token)
                VALUES (%s,%s,%s,%s,%s) RETURNING *''', [call_id, root['id'], stage, request_sha256, token]).fetchone()
            return {**self._call(row), 'dispatch': True, 'dispatch_token': token}

    @staticmethod
    def _cache(conn, root_id, kind, binding, payload):
        payload, digest = frozen_json(payload, 8 * 1024 * 1024 if kind == 'artifact' else 128 * 1024)
        old = conn.execute('SELECT * FROM teaching_task_cache WHERE root_id=%s AND kind=%s AND binding_sha256=%s', [root_id, kind, binding]).fetchone()
        if old:
            if old['payload_sha256'] != digest: raise StoreError('conflict', 'Frozen cache cannot be overwritten')
            return
        conn.execute('INSERT INTO teaching_task_cache(root_id,kind,binding_sha256,payload,payload_sha256) VALUES (%s,%s,%s,%s,%s)',
                     [root_id, kind, binding, Json(payload), digest])

    def finish(self, project_id, root_id, call_id, token, state, output=None):
        if state not in ('succeeded', 'failed', 'unknown', 'cancelled'): raise StoreError('validation', 'Invalid call outcome')
        call_id, token = identifier(call_id), identifier(token)
        if state == 'succeeded': output, digest = frozen_json(output)
        else: digest = None
        if state != 'succeeded' and output is not None: raise StoreError('validation', 'Unexpected output on incomplete call')
        with self.store.connection() as conn:
            root = self._root(conn, project_id, root_id)
            call = conn.execute('SELECT * FROM teaching_model_calls WHERE root_id=%s AND id=%s', [root['id'], call_id]).fetchone()
            if call is None or str(call['dispatch_token']) != token: raise StoreError('conflict', 'Call ownership mismatch')
            if call['state'] != 'dispatched' and not (call['state'] == 'unknown' and state == 'succeeded'):
                if call['state'] == state and call['output_sha256'] == digest: return self._call(call)
                raise StoreError('conflict', 'Call outcome already frozen')
            if state == 'succeeded': self._cache(conn, root['id'], 'response-' + call['stage'], call['request_sha256'], output)
            row = conn.execute('UPDATE teaching_model_calls SET state=%s,output_sha256=%s,ended_at=now() WHERE id=%s RETURNING *', [state, digest, call_id]).fetchone()
            return self._call(row)

    def save_cache(self, project_id, root_id, kind, binding_sha256, payload):
        if kind not in ('plan', 'diagnostic', 'audio', 'captions', 'artifact'): raise StoreError('validation', 'Invalid cache kind')
        checksum(binding_sha256)
        payload, _ = frozen_json(payload, 8 * 1024 * 1024 if kind == 'artifact' else 128 * 1024)
        with self.store.connection() as conn:
            root = self._root(conn, project_id, root_id)
            self._cache(conn, root['id'], kind, binding_sha256, payload)

    def get_cache(self, project_id, root_id, kind, binding_sha256):
        if kind not in ('plan', 'diagnostic', 'audio', 'captions', 'artifact', 'response-plan', 'response-revision'): raise StoreError('validation', 'Invalid cache kind')
        checksum(binding_sha256)
        with self.store.connection() as conn:
            root = self._root(conn, project_id, root_id)
            row = conn.execute('SELECT payload,payload_sha256 FROM teaching_task_cache WHERE root_id=%s AND kind=%s AND binding_sha256=%s', [root['id'], kind, binding_sha256]).fetchone()
            if row is None: raise StoreError('not_found', 'Bound cache entry not found')
            if fingerprint(row['payload'], 8 * 1024 * 1024 if kind == 'artifact' else 128 * 1024) != row['payload_sha256']:
                raise StoreError('conflict', 'Cache checksum mismatch')
            return dict(row)

    def cancel(self, project_id, root_id):
        with self.store.connection() as conn:
            root = self._root(conn, project_id, root_id)
            conn.execute("UPDATE teaching_task_roots SET state='cancelled' WHERE id=%s", [root['id']])
            if conn.execute("SELECT to_regclass('aicreater.teaching_media_jobs') AS name").fetchone()['name'] is not None:
                conn.execute("UPDATE teaching_media_jobs SET state='cancelled',error_code='cancelled',ended_at=clock_timestamp() WHERE root_id=%s AND state IN ('queued','running','interrupted')",[root['id']])
            if conn.execute("SELECT to_regclass('aicreater.teaching_planning_jobs') AS name").fetchone()['name'] is not None:
                conn.execute("UPDATE teaching_planning_jobs SET state='cancelled',ended_at=clock_timestamp() WHERE root_id=%s AND state IN ('queued','running','interrupted')",[root['id']])
            if conn.execute("SELECT to_regclass('aicreater.teaching_render_repairs') AS name").fetchone()['name'] is not None:
                conn.execute("UPDATE teaching_render_repairs SET state='cancelled',ended_at=clock_timestamp() WHERE root_id=%s AND state IN ('queued','running','interrupted')",[root['id']])
            if conn.execute("SELECT to_regclass('aicreater.teaching_render_jobs') AS name").fetchone()['name'] is not None:
                conn.execute("UPDATE teaching_render_jobs SET state='cancelled',error_code='cancelled',ended_at=clock_timestamp() WHERE root_id=%s AND state='queued'",[root['id']])
            return self._summary(conn, {**root, 'state': 'cancelled'})

    def reconcile(self, project_id, root_id):
        with self.store.connection() as conn:
            root = self._root(conn, project_id, root_id)
            rows = conn.execute("""UPDATE teaching_model_calls SET state='unknown',ended_at=now()
                WHERE root_id=%s AND state='dispatched' AND created_at < now()-interval '10 minutes' RETURNING id""", [root['id']]).fetchall()
            return len(rows)

    def dispatch_once(self, project_id, root_id, stage, request_sha256, invoke, *, guard=None, before_invoke=None):
        # Reservation commits before I/O. Only its original owner receives the dispatch token.
        call = self.reserve(project_id, root_id, stage, request_sha256,guard=guard)
        if not call['dispatch']: return call
        if self.get(project_id, root_id)['state'] == 'cancelled':
            result = self.finish(project_id, root_id, call['id'], call['dispatch_token'], 'cancelled')
            return {**result, 'dispatch': False}
        if before_invoke is not None:
            try:before_invoke()
            except Exception:
                self.finish(project_id,root_id,call['id'],call['dispatch_token'],'cancelled')
                raise StoreError('dispatch_cancelled','Execution ownership ended before provider invocation; slot retained') from None
        try: output = invoke()
        except Exception:
            self.finish(project_id, root_id, call['id'], call['dispatch_token'], 'unknown')
            raise StoreError('dispatch_unknown', 'Provider outcome unknown; slot retained, no automatic retry') from None
        try:output,_=frozen_json(output)
        except (StoreError,ValueError,TypeError,RecursionError):
            # A complete response was received; this is not an unknown external request.
            self.finish(project_id,root_id,call['id'],call['dispatch_token'],'failed')
            raise StoreError('response_invalid','Complete provider response failed local data limits; slot retained') from None
        result = self.finish(project_id, root_id, call['id'], call['dispatch_token'], 'succeeded', output)
        return {**result, 'dispatch': True}
