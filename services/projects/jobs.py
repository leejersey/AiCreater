"""Durable workflow leases; no executor and no publication before attempt fencing."""
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
# Only fixed codes cross the child boundary; no provider messages or response bodies.
ERRORS.update({'storyboard_' + code: 'Storyboard validation: ' + message for code, message in {
    'schema_error': 'fields do not match the teaching schema',
    'source_mismatch': 'narration did not preserve the original script',
    'source_reference': 'source parts are omitted, repeated, unknown or reordered',
    'incomplete_response': 'provider generation did not finish normally',
    'output_limit': 'generation reached token or context budget',
    'response_filtered': 'provider filtered the generation',
    'invalid_response': 'expected a complete JSON storyboard',
    'response_limit': 'provider response exceeds the size budget',
    'input_limit': 'script exceeds the allowed length',
    'duplicate_id': 'scene or element IDs are repeated',
    'blank_text': 'narration or a label is blank',
    'invalid_cue': 'cue does not reference a valid narration interval',
    'step_order': 'steps do not follow spoken order',
    'code_layout': 'code exceeds display limits or contains invisible controls',
    'invalid_line': 'highlight references a missing code line',
    'invalid_variables': 'variable names are blank or repeated',
    'state_text': 'state text contains invalid characters',
    'state_keys': 'state keys or indexes are invalid',
    'state_reference': 'highlight references a missing state item',
    'timeline_text': 'lane text contains invalid characters',
    'timeline_reference': 'event references a missing lane',
    'timeline_range': 'event is outside the illustrative axis',
    'timeline_overlap': 'events overlap in one task lane',
    'timeline_empty_lane': 'lane has no event',
    'duplicate_edge': 'flow edges are repeated',
    'invalid_edge': 'flow edge references invalid elements',
    'cycle': 'flow graph contains a cycle',
    'topic_count': 'a scene has more than one topic title',
    'concept_roles': 'concept scenes need exactly one definition and at most one summary',
    'concept_excerpt': 'concept card text is not a literal excerpt of its cue',
    'invalid_highlight': 'highlight range does not fit the label',
    'invalid_source_label': 'source label is not literal narration text',
    'topic_conclusion': 'a conclusion panel cannot be marked as topic',
    'chart_binding': 'chart rows do not bind every element once',
    'chart_text': 'chart labels are blank, invisible or repeated',
    'chart_values': 'chart values must be finite numbers',
    'chart_dimensions': 'matrix rows do not match columns',
    'chart_total': 'proportion total must be positive',
    'code_state_text': 'code snapshot text is blank or invisible',
    'code_state_items': 'code array items are invalid',
    'code_state_pointer': 'code pointers do not reference current items',
    'code_state_loop': 'code loop round exceeds total',
}.items()})


class Jobs:
    def __init__(self, store, model='deepseek-chat'):
        if not isinstance(model, str) or not re.fullmatch(r'[A-Za-z0-9_.:-]{1,100}', model):
            raise StoreError('validation', 'Invalid public model identifier')
        self.store, self.model = store, model

    @staticmethod
    def _read(conn, job_id, lock=False):
        row = conn.execute('SELECT * FROM jobs WHERE id=%s' + (' FOR UPDATE' if lock else ''),
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
                SELECT id FROM jobs WHERE project_id=%s ORDER BY created_at DESC, id DESC LIMIT 50
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

    def project_usage(self, project_id):
        from services.projects.usage import summarize
        with self.store.connection() as conn:
            conn.execute('SET TRANSACTION ISOLATION LEVEL REPEATABLE READ, READ ONLY')
            self.store._read(conn, project_id)
            # shortcut: full per-project history, paginate before thousands of attempts per project.
            rows = conn.execute('''SELECT j.id AS job_id,a.id AS attempt_id,a.number,j.kind,a.state,
                a.started_at,a.ended_at,a.usage FROM job_attempts a JOIN jobs j ON j.id=a.job_id
                WHERE j.project_id=%s ORDER BY a.started_at DESC,a.id DESC''',[project_id]).fetchall()
            for row in rows:
                row['job_id'], row['attempt_id'] = str(row['job_id']), str(row['attempt_id'])
            return summarize(rows)

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

    def submit_generate(self, project_id, base_revision):
        revision(base_revision)
        with self.store.connection() as conn:
            project = self.store._read(conn, project_id, lock=True)
            materials = copy.deepcopy(project['config'].get('manuscript', {}).get('sections', []))
            protocol = 'teaching-outline:9' if materials else 'teaching-outline:8'
            existing = conn.execute('''SELECT id FROM jobs WHERE project_id=%s AND kind='generate'
                AND base_revision=%s AND input->>'model'=%s AND input->'profile'=%s
                AND input->>'protocol_version'=%s
                ORDER BY created_at DESC LIMIT 1''', [project['id'], base_revision, self.model, Jsonb(self.store.profile), protocol]).fetchone()
            if existing:
                job = self._read(conn, str(existing['id']))
                if job['state'] in ('queued', 'running', 'succeeded'):
                    return job
                if job['state'] in ('cancelled', 'failed'):
                    if project['revision'] != base_revision: raise StoreError('conflict', 'Project revision changed')
                    if project['scenes']: raise StoreError('conflict', 'Use scene regeneration for an existing outline')
                    payload = {'kind': 'generate', 'project_id': project['id'], 'base_revision': base_revision,
                               'source_text': project['source_text'], 'profile': copy.deepcopy(self.store.profile),
                               'model': self.model, 'protocol_version': protocol,
                               'teaching_style': project['teaching_style'],
                               **({'materials': materials} if materials else {}),
                               **self.paper_style_field(project)}
                    digest = self.input_hash(payload)
                    # Reopen same row (input_hash unique); refresh source if the manuscript changed.
                    conn.execute('DELETE FROM job_attempts WHERE job_id=%s', [job['id']])
                    conn.execute('''UPDATE jobs SET state='queued', progress=0, attempts=0, cancel_requested=false,
                        available_at=now(), started_at=NULL, heartbeat_at=NULL, ended_at=NULL,
                        error=NULL, result=NULL, attempt_id=NULL, input=%s, input_hash=%s
                        WHERE id=%s AND state=%s ''',
                        [Jsonb(payload), digest, job['id'], job['state']])
                    return self._read(conn, job['id'])
                return job
            if project['revision'] != base_revision: raise StoreError('conflict', 'Project revision changed')
            if project['scenes']: raise StoreError('conflict', 'Use scene regeneration for an existing outline')
            payload = {'kind': 'generate', 'project_id': project['id'], 'base_revision': base_revision,
                       'source_text': project['source_text'], 'profile': copy.deepcopy(self.store.profile),
                       'model': self.model, 'protocol_version': protocol,
                       'teaching_style': project['teaching_style'],
                       **({'materials': materials} if materials else {}),
                       **self.paper_style_field(project)}
            return self._submit(conn, project['id'], None, base_revision, payload)

    @staticmethod
    def paper_style_field(project):
        style = project.get('visual_style') or {}
        if isinstance(style, dict) and style.get('id') == 'paper_slide':
            return {'visual_style': 'paper_slide'}
        return {}

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
             'timing' if payload['kind'] == 'timing' else 'tts' if payload['kind'] == 'voice' else 'render' if payload['kind'] == 'render' else 'storyboard']).fetchone()
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

    @staticmethod
    def model_original(scene):
        """Teaching fields for the model. Program-owned paper direction stays off the prompt."""
        original = Jobs._draft_scene(scene)
        for key in ('camera', 'vector', 'section'):
            original.pop(key, None)
        for element in original.get('elements', []):
            if isinstance(element, dict):
                element.pop('entrance', None)
        return original

    def submit_preview(self, scene_id, base_revision):
        from services.projects.store import final_valid
        revision(base_revision); scene_id = identifier(scene_id)
        with self.store.connection() as conn:
            owner = conn.execute('SELECT project_id FROM scenes WHERE id=%s', [scene_id]).fetchone()
            if not owner: raise StoreError('not_found', 'Scene not found')
            project = self.store._read(conn, str(owner['project_id']), lock=True)
            row = self.store._scene(project, scene_id)
            if row['revision'] != base_revision: raise StoreError('conflict', 'Scene revision changed')
            if row['state'] != 'ready': raise StoreError('not_ready', 'Scene requires voice or timing')
            document = self.store._dsl(project)
            document['scenes'] = [copy.deepcopy(row['scene'])]
            audio_id = row['scene']['narration'].get('audio_asset_id')
            used = {audio_id, *(b['asset_id'] for b in row['scene'].get('images', []))}
            document['assets'] = [a for a in document['assets'] if a['id'] in used]
            final_valid(document); self.store._assets(document)
            frozen = {'project_id': project['id'], 'revision': project['revision'], 'dsl': document,
                      'profile': {**self.store.render_profile_for(project), 'render': copy.deepcopy(document['video_config'])}}
            checksum = hashlib.sha256(json.dumps(frozen, sort_keys=True, ensure_ascii=False, separators=(',', ':')).encode()).hexdigest()
            frozen['id'] = str(uuid.uuid5(uuid.NAMESPACE_URL, checksum))
            return self._submit(conn, project['id'], None, base_revision,
                {'kind': 'render', 'version': frozen, 'scene_id': scene_id, 'scene_revision': base_revision,
                 'snapshot_checksum': checksum, 'protocol_version': 'scene-preview:2'})

    def submit_render(self, project_id, version_id):
        version = self.store.get_version(version_id)
        if version['project_id'] != identifier(project_id): raise StoreError('validation', 'Version belongs to another project')
        if any(version['profile'][k] != self.store.profile[k] for k in ['theme_version', 'template_version', 'font_hash']):
            raise StoreError('validation', 'Renderer profile changed; create a new compatible version')
        frozen = {k: copy.deepcopy(version[k]) for k in ['id', 'project_id', 'revision', 'dsl', 'profile']}
        with self.store.connection() as conn:
            self.store._read(conn, project_id, lock=True)
            return self._submit(conn, project_id, None, version['revision'],
                {'kind': 'render', 'version': frozen, 'protocol_version': 'snapshot-render:2' if 'visual_style' in frozen['profile'] else 'snapshot-render:1'})

    def render_directory(self, job):
        directory = self.store.public / 'renders' / identifier(job['id']) / identifier(job['attempt_id'])
        if directory.resolve() != directory.absolute(): raise StoreError('assets', 'Render directory cannot contain symlinks')
        return directory

    @staticmethod
    def _file_hash(file, limit):
        if file.is_symlink() or not file.is_file() or not 0 < file.stat().st_size <= limit:
            raise StoreError('assets', 'Invalid render artifact')
        digest = hashlib.sha256()
        with file.open('rb') as stream:
            while block := stream.read(65536): digest.update(block)
        return digest.hexdigest()

    def publish_render(self, job_id, attempt_id, callback=None):
        initial = self.get(job_id)
        if initial['kind'] != 'render' or initial['attempt_id'] != identifier(attempt_id) or initial['input'].get('protocol_version') not in ['snapshot-render:1', 'scene-preview:1','snapshot-render:2','scene-preview:2']:
            raise StoreError('conflict', 'Expected active render attempt')
        directory = self.render_directory(initial)
        checksums = {ext: self._file_hash(directory / ('video.' + ext), limit)
                     for ext, limit in [('mp4', 1024**3), ('srt', 5 * 1024**2)]}
        import subprocess
        from services.projects.store import ROOT
        try:
            subprocess.run(['node', str(ROOT / 'node_modules/tsx/dist/cli.mjs'), str(ROOT / 'scripts/verify-render.ts'), str(directory)],
                input=json.dumps(initial['input']['version']['dsl']), text=True, capture_output=True, cwd=ROOT, timeout=30, check=True)
        except (subprocess.SubprocessError, OSError): raise StoreError('assets', 'Render media or subtitles failed verification') from None
        if self.store.objects:
            for extension, limit in [('mp4', 1024**3), ('srt', 5 * 1024**2)]:
                self.store.objects.put(directory / ('video.' + extension), checksums[extension], limit, callback)
        with self.store.connection() as conn:
            job = self._active(conn, job_id, attempt_id)
            if job['cancel_requested']:
                self._terminal(conn, job, 'cancelled')
            else:
                self._terminal(conn, job, 'succeeded')
                source = job['input']
                result = {'scene_id': source['scene_id'], 'scene_revision': source['scene_revision'],
                          'snapshot_checksum': source['snapshot_checksum']} if source['protocol_version'] in ['scene-preview:1','scene-preview:2'] else {'version_id': source['version']['id']}
                conn.execute('UPDATE jobs SET progress=100,result=%s WHERE id=%s',
                    [Jsonb({**result, 'checksums': checksums}), job['id']])
            return self._read(conn, job_id)

    def render_file(self, job_id, extension):
        job = self.get(job_id)
        if job['kind'] != 'render' or job['state'] != 'succeeded' or extension not in ['mp4', 'srt']:
            raise StoreError('not_ready', 'Render artifact unavailable')
        file = self.render_directory(job) / ('video.' + extension)
        if self.store.objects:
            self.store.objects.ensure(file, job['result']['checksums'][extension], 1024**3 if extension == 'mp4' else 5 * 1024**2)
        if self._file_hash(file, 1024**3 if extension == 'mp4' else 5 * 1024**2) != job['result']['checksums'][extension]:
            raise StoreError('assets', 'Render artifact checksum changed')
        return file

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

    @staticmethod
    def batch_voice_id(conn, project, scene_id, base_revision, profile):
        # Legacy implicit defaults keep their no-revoice policy; pinned settings must match.
        return conn.execute('''SELECT id FROM jobs WHERE project_id=%s AND scene_id=%s
            AND kind='voice' AND base_revision=%s AND (%s=false OR input->'profile'=%s)
            ORDER BY created_at DESC, id DESC LIMIT 1''',
            [project['id'], scene_id, base_revision, bool(project.get('voice_configured')), Jsonb(profile)]).fetchone()

    def submit_batch_voice(self, project_id, base_revision, scenes, confirmed):
        revision(base_revision)
        if confirmed is not True or not isinstance(scenes, list) or not 1 <= len(scenes) <= 20:
            raise StoreError('validation', 'Explicit confirmation and 1–20 scenes required')
        selected = {}
        for item in scenes:
            if not isinstance(item, dict) or set(item) != {'scene_id', 'expected_revision'}:
                raise StoreError('validation', 'Expected scene ID and revision')
            scene_id = identifier(item['scene_id']); revision(item['expected_revision'])
            if scene_id in selected: raise StoreError('validation', 'Duplicate scene selection')
            selected[scene_id] = item['expected_revision']
        with self.store.connection() as conn:
            project = self.store._read(conn, project_id, lock=True)
            if project['revision'] != base_revision: raise StoreError('conflict', 'Project revision changed')
            rows = {s['id']: s for s in project['scenes']}
            for scene_id, expected in selected.items():
                row = rows.get(scene_id)
                if row is None: raise StoreError('validation', 'Scene does not belong to project')
                if row['revision'] != expected: raise StoreError('conflict', 'Scene revision changed')
                if row['state'] != 'needs_voice': raise StoreError('not_ready', 'Batch voice only accepts scenes needing voice')
            result = []
            for scene_id in selected:
                existing = self.batch_voice_id(conn, project, scene_id, selected[scene_id], self.store.profile_for(project))
                result.append(self._read(conn, str(existing['id'])) if existing else self._voice(conn, project, rows[scene_id]))
            return result

    def submit_batch_timing(self, project_id, base_revision, scenes, confirmed):
        revision(base_revision)
        if confirmed is not True or not isinstance(scenes, list) or not 1 <= len(scenes) <= 20:
            raise StoreError('validation', 'Explicit confirmation and 1–20 scenes required')
        selected = {}
        for item in scenes:
            if not isinstance(item, dict) or set(item) != {'scene_id', 'expected_revision'}:
                raise StoreError('validation', 'Expected scene ID and revision')
            scene_id = identifier(item['scene_id']); revision(item['expected_revision'])
            if scene_id in selected: raise StoreError('validation', 'Duplicate scene selection')
            selected[scene_id] = item['expected_revision']
        with self.store.connection() as conn:
            project = self.store._read(conn, project_id, lock=True)
            if project['revision'] != base_revision: raise StoreError('conflict', 'Project revision changed')
            rows = {s['id']: s for s in project['scenes']}
            payloads = []
            for scene_id, expected in selected.items():
                row = rows.get(scene_id)
                if row is None: raise StoreError('validation', 'Scene does not belong to project')
                if row['revision'] != expected: raise StoreError('conflict', 'Scene revision changed')
                if row['state'] != 'needs_timing': raise StoreError('not_ready', 'Batch timing only accepts scenes needing timing')
                payloads.append(self._timing_payload(project, row))
            return [self._submit(conn, project['id'], p['scene_id'], p['base_revision'], p) for p in payloads]

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

    def submit_regenerate(self, scene_id, base_revision):
        revision(base_revision)
        scene_id = identifier(scene_id)
        with self.store.connection() as conn:
            owner = conn.execute('SELECT project_id FROM scenes WHERE id=%s', [scene_id]).fetchone()
            if not owner: raise StoreError('not_found', 'Scene not found')
            project = self.store._read(conn, str(owner['project_id']), lock=True)
            scene = self.store._scene(project, scene_id)
            if scene['revision'] != base_revision: raise StoreError('conflict', 'Scene revision changed')
            if scene['scene'].get('images'): raise StoreError('validation', 'Image scene regeneration requires binding review; not yet supported')
            if scene['scene']['type'] == 'data_chart': raise StoreError('validation', 'Confirmed chart data cannot use model regeneration')
            from services.workflow.manuscript_document import scene_materials
            materials = scene_materials(project['config'].get('manuscript', {}), scene['scene']['narration']['text'])
            payload = {'kind': 'regenerate', 'scene_id': scene_id, 'base_revision': base_revision,
                       'scene': copy.deepcopy(scene['scene']), 'profile': copy.deepcopy(self.store.profile),
                       'model': self.model, 'protocol_version': 'scene-candidate:9' if materials else 'scene-candidate:8',
                       'teaching_style': project['teaching_style'],
                       **({'materials': materials} if materials else {}),
                       **self.paper_style_field(project)}
            return self._submit(conn, project['id'], scene_id, base_revision, payload)

    @staticmethod
    def _terminal(conn, job, state, error=None):
        conn.execute('UPDATE jobs SET state=%s,error=%s,ended_at=now() WHERE id=%s',
                     [state, Jsonb(error) if error else None, job['id']])
        if job['attempt_id']:
            conn.execute("UPDATE job_attempts SET state=%s,error=%s,ended_at=now() WHERE id=%s AND state='running'", 
                         [state, Jsonb(error) if error else None, job['attempt_id']])

    @staticmethod
    def _error(job, code, schema_errors=None, cue_error=None):
        from services.workflow.schema_diagnostics import safe_schema_errors, safe_cue_error
        error = {'code': code, 'stage': job['stage'], 'scene_id': str(job['scene_id']) if job['scene_id'] else None,
                 'message': ERRORS[code], 'retryable': code not in ['validation', 'timing_cache'] and not code.startswith('storyboard_') and job['attempts'] < 3}
        if job.get('kind') == 'timing' and code == 'worker_lost':
            error['message'] = 'Local timing worker heartbeat expired; explicit retry does not call a provider'
        details = safe_schema_errors(schema_errors) if code == 'storyboard_schema_error' else []
        if details:
            error['schema_errors'] = details
            for detail in details:
                label = re.fullmatch(r'/scenes/(\d+)/elements/(\d+)/content', detail['path'])
                if label and detail['rule'] == 'maxLength':
                    scene, element = (int(index) + 1 for index in label.groups())
                    error['message'] = f'第{scene}个场景、第{element}个元素的画面文字超过40字，请使用短标签；完整口播无需删减。'
                    break
        cue = safe_cue_error(cue_error) if code == 'storyboard_invalid_cue' else None
        if cue: error['cue_error'] = cue
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
        clause = " AND kind='render'" if lane == 'render' else " AND kind<>'render'" if lane == 'workflow' else ''
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
                started_at=COALESCE(started_at,now()),heartbeat_at=now(),stage=CASE WHEN kind='timing' THEN 'timing' WHEN kind='voice' THEN 'tts' WHEN kind='render' THEN 'render' ELSE 'storyboard' END,
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

    def heartbeat(self, job_id, attempt_id, stage='storyboard', progress=0):
        if stage not in ['storyboard', 'tts', 'timing', 'render', 'validation'] or type(progress) is not int or not 0 <= progress < 100:
            raise StoreError('validation', 'Invalid workflow stage or progress')
        with self.store.connection() as conn:
            job = self._active(conn, job_id, attempt_id)
            conn.execute('UPDATE jobs SET heartbeat_at=now(),stage=%s,progress=GREATEST(progress,%s) WHERE id=%s',
                         [stage, progress, job['id']])
            return self._read(conn, job['id'])

    def fail(self, job_id, attempt_id, code, schema_errors=None, cue_error=None):
        if code not in ERRORS: raise StoreError('validation', 'Unsupported error code; raw messages are not stored')
        with self.store.connection() as conn:
            job = self._active(conn, job_id, attempt_id)
            if job['cancel_requested']: self._terminal(conn, job, 'cancelled')
            else: self._terminal(conn, job, 'failed', self._error(job, code, schema_errors, cue_error))
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

    def publish_outline(self, job_id, attempt_id, draft):
        from services.workflow.storyboard import validate_storyboard
        from services.workflow.providers import ProviderError
        with self.store.connection() as conn:
            initial = self._read(conn, job_id)
            project = self.store._read(conn, initial['project_id'], lock=True)
            job = self._active(conn, job_id, attempt_id)
            if job['kind'] != 'generate': raise StoreError('validation', 'Expected initial outline job')
            if job['cancel_requested']:
                self._terminal(conn, job, 'cancelled')
                return self._read(conn, job_id)
            unicode_valid(draft)
            if isinstance(draft, dict) and any(s.get('type') == 'data_chart' or 'chart' in s for s in draft.get('scenes', []) if isinstance(s, dict)):
                raise StoreError('validation', 'Model outputs cannot create confirmed chart data')
            try: validate_storyboard(draft, job['input']['source_text'])
            except ProviderError: raise StoreError('validation', 'Invalid initial teaching outline') from None
            attached = not project['scenes'] and project['revision'] == job['base_revision']
            if attached:
                from services.workflow.image_plans import plan_entry
                config = copy.deepcopy(project['config'])
                for position, original in enumerate(draft['scenes']):
                    scene = copy.deepcopy(original)
                    plan = scene.pop('image_plan', None)
                    if plan is not None:
                        config.setdefault('image_plans', {})[scene['id']] = plan_entry(scene, plan)
                    conn.execute('''INSERT INTO scenes (id,project_id,scene_key,position,state,scene,generated_revision)
                        VALUES (%s,%s,%s,%s,'needs_voice',%s,1)''',
                        [str(uuid.uuid4()), project['id'], scene['id'], position, Jsonb(scene)])
                conn.execute('UPDATE projects SET config=%s,revision=revision+1 WHERE id=%s', [Jsonb(config), project['id']])
            self._terminal(conn, job, 'succeeded')
            conn.execute('UPDATE jobs SET progress=100,result=%s WHERE id=%s',
                         [Jsonb({'attached': attached, 'draft': draft, 'project_id': project['id']}), job['id']])
            return self._read(conn, job_id)

    def publish_candidate(self, job_id, attempt_id, draft):
        with self.store.connection() as conn:
            initial = self._read(conn, job_id)
            # Match edit/accept lock order: project before job.
            self.store._read(conn, initial['project_id'], lock=True)
            job = self._active(conn, job_id, attempt_id)
            if job['kind'] != 'regenerate': raise StoreError('validation', 'Expected scene regeneration job')
            if job['cancel_requested']:
                self._terminal(conn, job, 'cancelled')
                return self._read(conn, job_id)
            narration = draft.get('narration') if isinstance(draft, dict) else None
            if not isinstance(narration, dict) or narration.get('text') != job['input']['scene']['narration']['text']:
                raise StoreError('validation', 'Regeneration must preserve original narration')
            candidate = self.store._create_candidate(conn, job['scene_id'], job['base_revision'], draft,
                                                     job['id'], job['attempt_id'])
            self._terminal(conn, job, 'succeeded')
            conn.execute('UPDATE jobs SET progress=100,result=%s WHERE id=%s',
                         [Jsonb({'candidate_id': candidate['id']}), job['id']])
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
