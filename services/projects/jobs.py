"""Durable voice and timing job leases; no executor and no publication before attempt fencing."""
import copy
import hashlib
import json
import re
import uuid

from psycopg.types.json import Jsonb

from services.projects.store import StoreError, identifier, revision, unicode_valid


ERRORS = {'configuration': 'Provider credentials unavailable; configure and restart worker before retry', 'timeout': 'Workflow time budget exceeded', 'worker_lost': 'Worker heartbeat expired; retry may incur charges',
          'transport_error': 'Provider transport failed', 'provider_error': 'Provider rejected request',
          'validation': 'Teaching scene or media validation failed', 'timing_cache': 'Saved audio or word cache unavailable; no provider was called', 'storage_error': 'Private object storage unavailable; retry after recovery'}
class Jobs:
    def __init__(self, store, model='deepseek-chat'):
        if not isinstance(model, str) or not re.fullmatch(r'[A-Za-z0-9_.:-]{1,100}', model):
            raise StoreError('validation', 'Invalid public model identifier')
        self.store, self.model = store, model

    @staticmethod
    def _read(conn, job_id, lock=False):
        row = conn.execute("SELECT * FROM jobs WHERE id=%s AND kind IN ('voice','timing')" + (' FOR UPDATE' if lock else ''),
                           [identifier(job_id)]).fetchone()
        if not row: raise StoreError('not_found', 'Job not found')
        return Jobs._job(row)

    @staticmethod
    def _job(row):
        for key in ['id', 'project_id', 'scene_id', 'attempt_id']:
            if row[key] is not None: row[key] = str(row[key])
        return row

    def list_project(self, project_id):
        with self.store.connection() as conn:
            project = self.store._read(conn, project_id)
            profile = self.store.profile_for(project)
            rows = conn.execute('''SELECT * FROM jobs WHERE id IN (
                SELECT id FROM jobs WHERE project_id=%s AND kind IN ('voice','timing') ORDER BY created_at DESC, id DESC LIMIT 50
            ) OR id IN (
                SELECT DISTINCT ON (j.scene_id) j.id FROM jobs j JOIN scenes s ON s.id=j.scene_id
                WHERE j.project_id=%s AND j.kind='voice' AND j.base_revision=s.revision AND s.deleted_at IS NULL
                    AND (%s=false OR j.input->'profile'=%s)
                ORDER BY j.scene_id, j.created_at DESC, j.id DESC
            ) ORDER BY created_at DESC, id DESC''', [project_id, project_id, project['voice_configured'], Jsonb(profile)]).fetchall()
            for row in rows:
                if row['kind'] == 'voice': row['voice_current'] = not project['voice_configured'] or row['input'].get('profile') == profile
            return [self._job(row) for row in rows]

    def get(self, job_id):
        with self.store.connection() as conn: return self._read(conn, job_id)

    def record_usage(self, job_id, attempt_id, event):
        from services.projects.usage import apply_event, safe_event
        if safe_event(event) is None: return False
        with self.store.connection() as conn:
            self._read(conn, job_id, lock=True)
            row = conn.execute('SELECT usage FROM job_attempts WHERE id=%s AND job_id=%s FOR UPDATE',
                               [identifier(attempt_id),job_id]).fetchone()
            if row is None: raise StoreError('conflict', 'Usage attempt does not belong to job')
            current = row['usage']; updated = apply_event(current,event)
            if updated == current: return False
            conn.execute('UPDATE job_attempts SET usage=%s WHERE id=%s AND job_id=%s', [Jsonb(updated),attempt_id,job_id])
            return True

    @staticmethod
    def input_hash(payload):
        unicode_valid(payload)
        return hashlib.sha256(json.dumps(payload, sort_keys=True, ensure_ascii=False,
                              separators=(',', ':')).encode('utf-8')).hexdigest()

    def _submit(self, conn, project_id, scene_id, base_revision, payload):
        digest = self.input_hash(payload)
        row = conn.execute('''INSERT INTO jobs (id,project_id,scene_id,kind,base_revision,input_hash,input,stage)
            VALUES (%s,%s,%s,%s,%s,%s,%s,%s) ON CONFLICT (input_hash) DO NOTHING RETURNING id''',
            [str(uuid.uuid4()), project_id, scene_id, payload['kind'], base_revision, digest, Jsonb(payload),
             'timing' if payload['kind'] == 'timing' else 'tts']).fetchone()
        if not row: row = conn.execute('SELECT id FROM jobs WHERE input_hash=%s', [digest]).fetchone()
        return self._read(conn, str(row['id']))

    @staticmethod
    def _draft_scene(scene):
        # shortcut: image transformations await batch 2; never silently discard a binding.
        if scene.get('images'): raise StoreError('validation', 'Teaching images currently support preview/export, not voice or timing changes')
        result = {k: copy.deepcopy(v) for k, v in scene.items() if k in ['id', 'type', 'elements', 'edges', 'code', 'structure', 'timeline', 'chart', 'motif', 'visual_actions', 'dialogue', 'process', 'funnel', 'camera', 'vector', 'section']}
        for action in result.get('visual_actions', []):
            action.pop('start_frame', None); action.pop('duration_frames', None)
        result['narration'] = {'text': scene['narration']['text']}
        return result

    def submit_voice(self, scene_id, base_revision):
        revision(base_revision)
        scene_id = identifier(scene_id)
        with self.store.connection() as conn:
            owner = conn.execute('SELECT project_id FROM scenes WHERE id=%s', [scene_id]).fetchone()
            if not owner: raise StoreError('not_found', 'Scene not found')
            project = self.store._read(conn, str(owner['project_id']), lock=True)
            row = self.store._scene(project, scene_id)
            if row['revision'] != base_revision: raise StoreError('conflict', 'Scene revision changed')
            return self._voice(conn, project, row)

    def _voice(self, conn, project, row):
        payload = {'kind': 'voice', 'scene_id': row['id'], 'base_revision': row['revision'],
                   'scene': self._draft_scene(row['scene']), 'profile': self.store.profile_for(project),
                   'protocol_version': 'native-voice:1'}
        return self._submit(conn, project['id'], row['id'], row['revision'], payload)

    def _timing_payload(self, project, row):
        from services.workflow.local_timing import cache_snapshot
        from services.workflow.providers import ProviderError
        audio_id = row['scene']['narration'].get('audio_asset_id')
        asset = next((a for a in project['config']['assets'] if a['id'] == audio_id), None)
        if asset is None: raise StoreError('timing_cache', 'Saved audio unavailable')
        try: checksum = cache_snapshot(self.store.public, asset)
        except ProviderError: raise StoreError('timing_cache', ERRORS['timing_cache']) from None
        return {'kind': 'timing', 'scene_id': row['id'], 'base_revision': row['revision'],
                'scene': self._draft_scene(row['scene']), 'asset': copy.deepcopy(asset), 'words_checksum': checksum,
                'config': {k: copy.deepcopy(v) for k, v in project['config'].items() if k not in ['assets','visual_style','teaching_style','manuscript','image_plans']},
                'profile': self.store.profile_for(project), 'protocol_version': 'local-timing:1'}

    def submit_timing(self, scene_id, base_revision):
        revision(base_revision)
        scene_id = identifier(scene_id)
        with self.store.connection() as conn:
            owner = conn.execute('SELECT project_id FROM scenes WHERE id=%s', [scene_id]).fetchone()
            if not owner: raise StoreError('not_found', 'Scene not found')
            project = self.store._read(conn, str(owner['project_id']), lock=True)
            row = self.store._scene(project, scene_id)
            if row['revision'] != base_revision: raise StoreError('conflict', 'Scene revision changed')
            if row['state'] not in ['ready', 'needs_timing']:
                raise StoreError('not_ready', 'Changed narration requires explicit voice generation')
            payload = self._timing_payload(project, row)
            return self._submit(conn, project['id'], scene_id, base_revision, payload)

    @staticmethod
    def _terminal(conn, job, state, error=None):
        conn.execute('UPDATE jobs SET state=%s,error=%s,ended_at=now() WHERE id=%s',
                     [state, Jsonb(error) if error else None, job['id']])
        if job['attempt_id']:
            conn.execute("UPDATE job_attempts SET state=%s,error=%s,ended_at=now() WHERE id=%s AND state='running'", 
                         [state, Jsonb(error) if error else None, job['attempt_id']])

    @staticmethod
    def _error(job, code):
        error = {'code': code, 'stage': job['stage'], 'scene_id': str(job['scene_id']) if job['scene_id'] else None,
                 'message': ERRORS[code], 'retryable': code not in ['validation', 'timing_cache'] and job['attempts'] < 3}
        if job.get('kind') == 'timing' and code == 'worker_lost':
            error['message'] = 'Local timing worker heartbeat expired; explicit retry does not call a provider'
        return error

    def _recover(self, conn):
        rows = conn.execute('''SELECT *, started_at <= now()-interval '900 seconds' AS timed_out FROM jobs
            WHERE (state='running' AND heartbeat_at <= now()-interval '60 seconds')
                OR (state IN ('running','queued') AND started_at <= now()-interval '900 seconds') ORDER BY id FOR UPDATE''').fetchall()
        for job in rows:
            if job['cancel_requested']: self._terminal(conn, job, 'cancelled')
            else:
                code = 'timeout' if job['timed_out'] else 'worker_lost'
                error = self._error(job, code)
                if job['timed_out']: error['retryable'] = False
                self._terminal(conn, job, 'failed', error)
        return len(rows)

    def recover(self):
        with self.store.connection() as conn: return self._recover(conn)

    def claim(self, lane=None):
        if lane not in [None, 'workflow', 'render']: raise StoreError('validation', 'Invalid execution lane')
        # Voice and timing run on the workflow lane; template-flow kinds left in the table are never claimed.
        if lane == 'render': return None
        clause = " AND kind IN ('voice','timing')"
        with self.store.connection() as conn:
            # Serialize claims; each production lane has its own single running slot.
            conn.execute("SELECT pg_advisory_xact_lock(hashtext('aicreater.workflow'))")
            self._recover(conn)
            if conn.execute("SELECT id FROM jobs WHERE state='running'" + clause + ' LIMIT 1').fetchone(): return None
            row = conn.execute("SELECT * FROM jobs WHERE state='queued' AND available_at<=now()" + clause +
                               ' ORDER BY created_at,id LIMIT 1 FOR UPDATE').fetchone()
            if not row: return None
            attempt_id = str(uuid.uuid4())
            from services.projects.usage import initial_usage
            conn.execute('''INSERT INTO job_attempts (id,job_id,number,state,usage) VALUES (%s,%s,%s,'running',%s)''',
                         [attempt_id, row['id'], row['attempts'] + 1, Jsonb(initial_usage(row['input']))])
            conn.execute('''UPDATE jobs SET state='running',attempts=attempts+1,attempt_id=%s,
                started_at=COALESCE(started_at,now()),heartbeat_at=now(),stage=CASE WHEN kind='timing' THEN 'timing' ELSE 'tts' END,
                progress=0,error=NULL,ended_at=NULL WHERE id=%s''',
                         [attempt_id, row['id']])
            return self._read(conn, str(row['id']))

    def _active(self, conn, job_id, attempt_id):
        job = self._read(conn, job_id, lock=True)
        lease = conn.execute("""SELECT heartbeat_at > now()-interval '60 seconds'
            AND started_at > now()-interval '900 seconds' AS valid FROM jobs WHERE id=%s""", [job['id']]).fetchone()
        if job['state'] != 'running' or job['attempt_id'] != identifier(attempt_id) or not lease['valid']:
            raise StoreError('conflict', 'Attempt is terminal, expired or superseded')
        return job

    def heartbeat(self, job_id, attempt_id, stage='tts', progress=0):
        if stage not in ['tts', 'timing', 'validation'] or type(progress) is not int or not 0 <= progress < 100:
            raise StoreError('validation', 'Invalid workflow stage or progress')
        with self.store.connection() as conn:
            job = self._active(conn, job_id, attempt_id)
            conn.execute('UPDATE jobs SET heartbeat_at=now(),stage=%s,progress=GREATEST(progress,%s) WHERE id=%s',
                         [stage, progress, job['id']])
            return self._read(conn, job['id'])

    def fail(self, job_id, attempt_id, code):
        if code not in ERRORS: raise StoreError('validation', 'Unsupported error code; raw messages are not stored')
        with self.store.connection() as conn:
            job = self._active(conn, job_id, attempt_id)
            if job['cancel_requested']: self._terminal(conn, job, 'cancelled')
            else: self._terminal(conn, job, 'failed', self._error(job, code))
            return self._read(conn, job['id'])

    def publish_voice(self, job_id, attempt_id, document, callback=None):
        from services.projects.store import final_valid, draft_valid
        initial = self.get(job_id)
        if initial['kind'] not in ['voice', 'timing']: raise StoreError('validation', 'Expected scene media job')
        if initial['kind'] == 'timing' and document.get('assets') != [initial['input']['asset']]:
            raise StoreError('validation', 'Local timing must preserve the frozen audio asset')
        final_valid(document)
        draft_valid(document)
        if len(document['scenes']) != 1 or self._draft_scene(document['scenes'][0]) != initial['input']['scene']:
            raise StoreError('validation', 'Voice must preserve the frozen teaching scene')
        self.store._assets(document, callback, local_only=initial['kind'] == 'timing')
        with self.store.connection() as conn:
            project = self.store._read(conn, initial['project_id'], lock=True)
            job = self._active(conn, job_id, attempt_id)
            if job['cancel_requested']:
                self._terminal(conn, job, 'cancelled')
                return self._read(conn, job_id)
            row = self.store._scene(project, job['scene_id'])
            attached = row['revision'] == job['base_revision'] and self.store.profile_for(project) == job['input']['profile']
            if attached:
                assets = {a['id']: a for a in project['config']['assets']}
                for asset in document['assets']:
                    if asset['id'] in assets and assets[asset['id']] != asset:
                        raise StoreError('validation', 'Asset identity cannot be overwritten')
                    assets[asset['id']] = asset
                config = {**project['config'], 'assets': list(assets.values())}
                conn.execute("UPDATE scenes SET scene=%s,state='ready' WHERE id=%s", [Jsonb(document['scenes'][0]), row['id']])
                conn.execute('UPDATE projects SET config=%s,revision=revision+1 WHERE id=%s', [Jsonb(config), project['id']])
            self._terminal(conn, job, 'succeeded')
            conn.execute('UPDATE jobs SET progress=100,result=%s WHERE id=%s',
                         [Jsonb({'attached': attached, 'document': document}), job['id']])
            return self._read(conn, job_id)

    def cancel(self, job_id):
        with self.store.connection() as conn:
            job = self._read(conn, job_id, lock=True)
            if job['state'] == 'queued': self._terminal(conn, job, 'cancelled')
            elif job['state'] == 'running':
                conn.execute('UPDATE jobs SET cancel_requested=true WHERE id=%s', [job['id']])
            return self._read(conn, job['id'])

    def ack_cancel(self, job_id, attempt_id):
        with self.store.connection() as conn:
            job = self._active(conn, job_id, attempt_id)
            if not job['cancel_requested']: raise StoreError('conflict', 'Cancellation was not requested')
            self._terminal(conn, job, 'cancelled')
            return self._read(conn, job['id'])

    def retry(self, job_id):
        with self.store.connection() as conn:
            initial = self._read(conn, job_id)
            project = self.store._read(conn, initial['project_id'], lock=True)
            job = self._read(conn, job_id, lock=True)
            if job['scene_id']: self.store._scene(project, job['scene_id'])
            within = conn.execute("SELECT started_at > now()-interval '900 seconds' AS valid FROM jobs WHERE id=%s",
                                  [job['id']]).fetchone()['valid']
            if job['state'] != 'failed' or not job['error']['retryable'] or job['attempts'] >= 3 or not within:
                raise StoreError('conflict', 'Job cannot be retried')
            delay = 2 ** job['attempts']
            conn.execute("UPDATE jobs SET state='queued',available_at=now()+(%s * interval '1 second') WHERE id=%s",
                         [delay, job['id']])
            return self._read(conn, job['id'])
