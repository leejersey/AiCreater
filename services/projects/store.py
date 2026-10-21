"""Transactional local teaching projects. No paid calls and no arbitrary code execution."""
import copy
import hashlib
import json
import os
import re
import subprocess
import uuid
from contextlib import contextmanager
from pathlib import Path

import psycopg
from psycopg.rows import dict_row
from psycopg.types.json import Jsonb

from services.projects.visual_styles import snapshot as style_snapshot
from services.workflow.providers import ProviderError
from services.workflow.storyboard import ROOT, validate_storyboard, validator


class StoreError(ValueError):
    def __init__(self, code, message, validation_errors=None):
        self.code = code
        self.validation_errors = validation_errors or []
        super().__init__(f'{code}: {message}')


TEACHING_STYLES = frozenset({'popular', 'technical'})


def normalize_teaching_style(value, *, required=False):
    if value is None or value == '':
        if required:
            raise StoreError('validation', 'Expected teaching_style popular|technical')
        return 'popular'
    if not isinstance(value, str) or value not in TEACHING_STYLES:
        raise StoreError('validation', 'Expected teaching_style popular|technical')
    return value


def effective_teaching_style(config):
    raw = (config or {}).get('teaching_style')
    return raw if raw in TEACHING_STYLES else 'popular'


def identifier(value):
    try: return str(uuid.UUID(value))
    except (ValueError, AttributeError, TypeError):
        raise StoreError('invalid_id', 'Expected UUID') from None


def revision(value):
    if type(value) is not int or value < 1:
        raise StoreError('invalid_revision', 'Expected a positive integer revision')


def unicode_valid(value):
    try: json.dumps(value, ensure_ascii=False, allow_nan=False).encode('utf-8')
    except (UnicodeError, TypeError, ValueError):
        raise StoreError('validation', 'Expected valid Unicode JSON',
                         [{'path': '/', 'code': 'unicode_json', 'message': 'Invalid Unicode JSON'}]) from None


def final_valid(document):
    unicode_valid(document)
    errors = validator.validate_project(document)
    if errors:
        raise StoreError('validation', 'Invalid final DSL', errors)


def draft_valid(document):
    unicode_valid(document)
    scenes = []
    for scene in document['scenes']:
        draft = {k: copy.deepcopy(v) for k, v in scene.items() if k in ['id', 'type', 'elements', 'edges', 'code', 'structure', 'timeline', 'chart', 'motif', 'visual_actions', 'dialogue', 'process', 'funnel']}
        for action in draft.get('visual_actions', []):
            action.pop('start_frame', None); action.pop('duration_frames', None)
        draft['narration'] = {'text': scene['narration']['text']}
        scenes.append(draft)
    try: validate_storyboard({'scenes': scenes}, ''.join(s['narration']['text'] for s in scenes))
    except ProviderError:
        raise StoreError('validation', 'Invalid teaching draft') from None


class Store:
    def __init__(self, dsn, public, profile, objects=None):
        if (not isinstance(profile, dict) or set(profile) != {'theme_version', 'template_version', 'font_hash', 'voice'} or
                not re.fullmatch('[0-9a-f]{64}', str(profile.get('font_hash', ''))) or
                any(not isinstance(profile.get(k), str) or not 1 <= len(profile[k]) <= 80
                    for k in ['theme_version', 'template_version']) or
                not isinstance(profile.get('voice'), dict) or set(profile['voice']) != {'resource_id', 'speaker'} or
                any(not isinstance(v, str) or not 1 <= len(v) <= 200 for v in profile['voice'].values())):
            raise StoreError('invalid_profile', 'Expected only version, font hash and public voice settings')
        self._dsn, self.public, self.profile = dsn, Path(public).resolve(), copy.deepcopy(profile)
        self.objects = objects

    @contextmanager
    def connection(self):
        try:
            with psycopg.connect(self._dsn, row_factory=dict_row, connect_timeout=5,
                    options='-c statement_timeout=10000 -c lock_timeout=5000') as conn:
                conn.execute('SET search_path TO aicreater, public')
                yield conn
        except psycopg.Error:
            raise StoreError('database', 'Database operation failed; details withheld') from None

    def initialize(self):
        with self.connection() as conn:
            conn.execute('CREATE SCHEMA IF NOT EXISTS aicreater')
            conn.execute((Path(__file__).with_name('schema.sql')).read_text())
            conn.execute((Path(__file__).with_name('jobs.sql')).read_text())
            conn.execute((Path(__file__).parents[1] / 'accounts/schema.sql').read_text())

    def _asset_path(self, key):
        file = self.public / key
        if not file.resolve().is_relative_to(self.public) or file.resolve() != file.absolute():
            raise StoreError('assets', 'Audio cache path must remain inside public root')
        return file

    def _assets(self, document, callback=None, local_only=False):
        if self.objects and not local_only:
            for asset in document['assets']:
                self.objects.ensure(self._asset_path(asset['storage_key']), asset['checksum'], 50 * 1024**2, callback)
        try:
            subprocess.run([str(ROOT / 'node_modules/.bin/tsx'), str(ROOT / 'scripts/verify-project.ts'), str(self.public)],
                input=json.dumps(document, ensure_ascii=False), text=True, capture_output=True, check=True, timeout=120,
                env={k: v for k, v in os.environ.items() if k not in ['DATABASE_URL', 'POSTGRES_PASSWORD',
                     'PGPASSWORD', 'DEEPSEEK_API_KEY', 'VOLCENGINE_API_KEY', 'VOLCENGINE_ACCESS_KEY'] and not k.startswith(('MINIO_', 'RUSTFS_'))})
        except (subprocess.SubprocessError, OSError):
            raise StoreError('assets', 'Local audio verification failed') from None
        if self.objects and not local_only:
            for asset in document['assets']:
                self.objects.put(self._asset_path(asset['storage_key']), asset['checksum'], 50 * 1024**2, callback)

    def _read(self, conn, project_id, lock=False):
        row = conn.execute('SELECT * FROM projects WHERE id=%s' + (' FOR UPDATE' if lock else ''),
                           [identifier(project_id)]).fetchone()
        if not row: raise StoreError('not_found', 'Project not found')
        row.pop('owner_id',None)
        if row.get('updated_at') is not None:row['updated_at']=row['updated_at'].isoformat()
        scenes = conn.execute('SELECT * FROM scenes WHERE project_id=%s AND deleted_at IS NULL ORDER BY position', [row['id']]).fetchall()
        for scene in scenes:
            scene.pop('deleted_at', None)
            scene['id'], scene['project_id'] = str(scene['id']), str(scene['project_id'])
        return {**row, 'id': str(row['id']), 'scenes': scenes,
                'voice': copy.deepcopy(row['voice'] or self.profile['voice']), 'voice_configured': row['voice'] is not None,
                'visual_style': copy.deepcopy(row['config'].get('visual_style',style_snapshot())),
                'teaching_style': effective_teaching_style(row['config']),
                'source_text': ''.join(s['scene']['narration']['text'] for s in scenes) if scenes else row['source_text']}

    def profile_for(self, project):
        return {**copy.deepcopy(self.profile), 'voice': copy.deepcopy(project.get('voice') or self.profile['voice'])}

    def render_profile_for(self,project):
        return {**self.profile_for(project),'visual_style':copy.deepcopy(project['visual_style'])}

    @staticmethod
    def _dsl(project):
        config={k:copy.deepcopy(v) for k,v in project['config'].items() if k not in ('visual_style', 'teaching_style')}
        return {**config, 'scenes': [copy.deepcopy(s['scene']) for s in project['scenes']]}

    def list_projects(self, owner_id=None):
        with self.connection() as conn:
            # shortcut: local first page only; add pagination when users exceed 100 projects.
            rows = conn.execute('''SELECT p.id,p.title,p.revision,p.updated_at,
                (SELECT count(*) FROM scenes WHERE project_id=p.id AND deleted_at IS NULL) AS scene_count,
                (SELECT count(*) FROM scenes WHERE project_id=p.id AND deleted_at IS NULL AND state='needs_voice') AS needs_voice,
                (SELECT count(*) FROM scenes WHERE project_id=p.id AND deleted_at IS NULL AND state='needs_timing') AS needs_timing,
                EXISTS(SELECT 1 FROM jobs WHERE project_id=p.id AND state IN ('queued','running')) AS active_jobs,
                (SELECT kind FROM jobs WHERE project_id=p.id AND state IN ('queued','running')
                 ORDER BY created_at DESC NULLS LAST, id DESC LIMIT 1) AS active_job_kind,
                (SELECT state FROM jobs WHERE project_id=p.id AND state IN ('queued','running')
                 ORDER BY created_at DESC NULLS LAST, id DESC LIMIT 1) AS active_job_state
                FROM projects p''' + (' WHERE p.owner_id=%s' if owner_id else '') +
                ' ORDER BY p.updated_at DESC NULLS LAST,p.id DESC LIMIT 100', [identifier(owner_id)] if owner_id else []).fetchall()
            return [{**row, 'id': str(row['id']),'updated_at':row['updated_at'].isoformat() if row['updated_at'] else None} for row in rows]

    def asset_file(self, project_id, asset_id):
        project = self.get_project(project_id)
        asset = next((a for a in project['config']['assets'] if a['id'] == asset_id), None)
        if asset is None: raise StoreError('not_found', 'Audio asset not found')
        file = self._asset_path(asset['storage_key'])
        if self.objects: self.objects.ensure(file, asset['checksum'], 50 * 1024**2)
        if (not file.resolve().is_relative_to(self.public) or file.resolve() != file.absolute() or not file.is_file() or not 0 < file.stat().st_size <= 50 * 1024**2
                or hashlib.sha256(file.read_bytes()).hexdigest() != asset['checksum']):
            raise StoreError('assets', 'Audio asset verification failed')
        return file

    def create_project(self, title, source_text, owner_id=None, teaching_style=None):
        if (not isinstance(title, str) or not 1 <= len(title.strip()) <= 80 or any(ord(c) < 32 for c in title) or
                not isinstance(source_text, str) or not source_text.strip() or len(source_text) > 4000):
            raise StoreError('validation', 'Expected title and 1–4000 code points of script')
        unicode_valid([title, source_text])
        style = normalize_teaching_style(teaching_style)
        project_id = str(uuid.uuid4())
        config = {'schema_version': '1.0', 'theme': 'tech_explainer', 'assets': [],
                  'video_config': {'width': 1920, 'height': 1080, 'fps': 30, 'language': 'zh-CN'},
                  'teaching_style': style}
        with self.connection() as conn:
            conn.execute('INSERT INTO projects (id,title,source_text,config,owner_id) VALUES (%s,%s,%s,%s,%s)',
                         [project_id, title.strip(), source_text, Jsonb(config), identifier(owner_id) if owner_id else None])
            return self._read(conn, project_id)

    def import_project(self, title, document, owner_id=None):
        if not isinstance(title, str) or not 1 <= len(title.strip()) <= 80 or any(ord(c) < 32 for c in title):
            raise StoreError('invalid_title', 'Use a 1–80 character title')
        unicode_valid(title)
        final_valid(document)
        draft_valid(document)
        self._assets(document)
        project_id = str(uuid.uuid4())
        with self.connection() as conn:
            config = {k: copy.deepcopy(v) for k, v in document.items() if k != 'scenes'}
            conn.execute('INSERT INTO projects (id,title,config,owner_id) VALUES (%s,%s,%s,%s)',
                         [project_id, title.strip(), Jsonb(config), identifier(owner_id) if owner_id else None])
            for position, scene in enumerate(document['scenes']):
                conn.execute('INSERT INTO scenes (id,project_id,scene_key,position,state,scene) VALUES (%s,%s,%s,%s,%s,%s)',
                             [str(uuid.uuid4()), project_id, scene['id'], position, 'ready', Jsonb(scene)])
            return self._read(conn, project_id)

    def get_project(self, project_id):
        with self.connection() as conn:
            return self._read(conn, project_id, lock=True)

    def edit_scene(self, scene_id, expected_revision, patch):
        revision(expected_revision)
        if not isinstance(patch, dict) or not patch or set(patch) - {'elements', 'code', 'captions', 'narration_text', 'edges', 'graphics'}:
            raise StoreError('invalid_patch', 'Unsupported or empty scene patch')
        if 'narration_text' in patch and (not isinstance(patch['narration_text'], str) or
                not patch['narration_text'].strip() or len(patch['narration_text']) > 4000):
            raise StoreError('invalid_patch', 'Narration must contain 1–4000 code points')
        with self.connection() as conn:
            owner = conn.execute('SELECT project_id FROM scenes WHERE id=%s', [identifier(scene_id)]).fetchone()
            if not owner: raise StoreError('not_found', 'Scene not found')
            project = self._read(conn, str(owner['project_id']), lock=True)
            row = self._scene(project, scene_id)
            if row['revision'] != expected_revision: raise StoreError('conflict', 'Scene revision changed')
            scene = copy.deepcopy(row['scene'])
            if 'edges' in patch and scene['type'] != 'flow_diagram':
                raise StoreError('invalid_patch', 'Edges can only be edited on flow diagrams')
            if 'elements' in patch:
                elements = patch['elements']
                if (not isinstance(elements, list) or len(elements) != len(scene['elements']) or
                        any(not isinstance(e, dict) or e.get('id') != old['id'] or e.get('role') != old.get('role')
                            for e, old in zip(elements, scene['elements']))):
                    raise StoreError('invalid_patch', 'Element identity, order and topic markers are read-only')
                # Python bool/float equality must not bypass validation through the no-op path.
                for element in elements:
                    cue = element.get('cue')
                    if (not isinstance(cue, dict) or set(cue) != {'text_start', 'text_end'} or
                            any(type(cue[k]) is not int for k in cue)):
                        raise StoreError('validation', 'Expected integer cue range')
            for key in ['elements', 'code', 'captions', 'edges']:
                if key in patch: scene[key] = copy.deepcopy(patch[key])
            state = row['state']
            if (state != 'needs_voice' and
                    any(e['cue'] != old['cue'] for e, old in zip(scene['elements'], row['scene']['elements']))):
                state = 'needs_timing'
                scene.pop('animations', None)
            if 'narration_text' in patch and patch['narration_text'] != scene['narration']['text']:
                scene['narration'] = {'text': patch['narration_text']}
                for key in ['duration_frames', 'animations', 'captions']: scene.pop(key, None)
                state = 'needs_voice'
            if 'graphics' in patch:
                keys = ['motif', 'funnel', 'dialogue', 'process', 'visual_actions']
                graphics = patch['graphics']
                if not isinstance(graphics, dict) or set(graphics) - set(keys):
                    raise StoreError('invalid_patch', 'Unknown graphics field')
                actions = graphics.get('visual_actions', [])
                if not isinstance(actions, list) or any(not isinstance(a, dict) or set(a)-{'kind','target','to','source','cue'} for a in actions):
                    raise StoreError('invalid_patch', 'Graphics actions cannot supply derived timing')
                old_graphics = {k:copy.deepcopy(v) for k,v in row['scene'].items() if k in keys}
                for action in old_graphics.get('visual_actions', []):
                    action.pop('start_frame', None); action.pop('duration_frames', None)
                for key in keys: scene.pop(key, None)
                scene.update(copy.deepcopy(graphics))
                # Validate before equality: Python bool/number equality must not bypass the contract.
                draft_valid({'scenes':[scene]})
                if graphics == old_graphics:
                    for key in keys:
                        if key in row['scene']: scene[key] = copy.deepcopy(row['scene'][key])
                elif state != 'needs_voice':
                    state = 'needs_timing'; scene.pop('animations', None)
            if scene == row['scene']: return project
            row['scene'], row['state'] = scene, state
            document = self._dsl(project)
            draft_valid(document)
            if state == 'ready':
                # Validate the edited ready scene even if other scenes still need voice.
                partial = {**document, 'scenes': [scene]}
                final_valid(partial)
            elif 'captions' in patch:
                raise StoreError('invalid_patch', 'Regenerate voice before editing captions')
            conn.execute('UPDATE scenes SET scene=%s,state=%s,revision=revision+1,user_revision=user_revision+1 WHERE id=%s',
                         [Jsonb(scene), state, scene_id])
            conn.execute('UPDATE projects SET revision=revision+1 WHERE id=%s', [project['id']])
            return self._read(conn, project['id'])

    def set_chart(self, scene_id, expected_revision, chart, elements, confirmed):
        revision(expected_revision)
        unicode_valid([chart, elements])
        if confirmed is not True or not isinstance(chart, dict) or chart.get('confirmed') is not True or not isinstance(elements, list):
            raise StoreError('validation', 'Explicit user data confirmation required')
        with self.connection() as conn:
            owner = conn.execute('SELECT project_id FROM scenes WHERE id=%s', [identifier(scene_id)]).fetchone()
            if not owner: raise StoreError('not_found', 'Scene not found')
            project = self._read(conn, str(owner['project_id']), lock=True)
            row = self._scene(project, scene_id)
            if row['revision'] != expected_revision: raise StoreError('conflict', 'Scene revision changed')
            old = row['scene']; scene = copy.deepcopy(old)
            for key in ['code', 'structure', 'timeline', 'edges']: scene.pop(key, None)
            scene.update(type='data_chart', chart=copy.deepcopy(chart), elements=copy.deepcopy(elements))
            if scene == old: return project
            state = row['state']
            if state != 'needs_voice' and (old['type'] != 'data_chart' or old['elements'] != elements):
                state = 'needs_timing'; scene.pop('animations', None)
            row['scene'], row['state'] = scene, state
            draft_valid(self._dsl(project))
            if state == 'ready': final_valid({**self._dsl(project), 'scenes':[scene]})
            conn.execute('UPDATE scenes SET scene=%s,state=%s,revision=revision+1,user_revision=user_revision+1 WHERE id=%s', [Jsonb(scene),state,scene_id])
            conn.execute('UPDATE projects SET revision=revision+1 WHERE id=%s', [project['id']])
            return self._read(conn, project['id'])

    def set_theme(self, project_id, expected_revision, theme):
        revision(expected_revision)
        if not isinstance(theme, str) or theme not in validator.SCHEMA['properties']['theme']['enum']:
            raise StoreError('validation', 'Unknown built-in theme')
        with self.connection() as conn:
            project = self._read(conn, project_id, lock=True)
            if project['revision'] != expected_revision: raise StoreError('conflict', 'Project revision changed')
            if project['config']['theme'] == theme: return project
            config = {**project['config'], 'theme': theme}
            conn.execute('UPDATE projects SET config=%s,revision=revision+1 WHERE id=%s', [Jsonb(config), project_id])
            return self._read(conn, project_id)

    def set_visual_style(self,project_id,expected_revision,visual_style):
        revision(expected_revision)
        try: frozen=style_snapshot(visual_style)
        except ValueError: raise StoreError('validation','Unknown visual style') from None
        with self.connection() as conn:
            project=self._structure_project(conn,project_id,expected_revision)
            if project['visual_style']==frozen:return project
            config={**project['config'],'visual_style':frozen}
            conn.execute('UPDATE projects SET config=%s,revision=revision+1 WHERE id=%s',[Jsonb(config),project['id']])
            return self._read(conn,project['id'])

    def set_teaching_style(self, project_id, expected_revision, teaching_style):
        revision(expected_revision)
        style = normalize_teaching_style(teaching_style, required=True)
        with self.connection() as conn:
            project = self._structure_project(conn, project_id, expected_revision)
            if effective_teaching_style(project['config']) == style:
                return project
            config = {**project['config'], 'teaching_style': style}
            conn.execute('UPDATE projects SET config=%s,revision=revision+1 WHERE id=%s', [Jsonb(config), project['id']])
            return self._read(conn, project['id'])

    def set_voice(self, project_id, expected_revision, speaker):
        revision(expected_revision)
        if not isinstance(speaker, str) or not re.fullmatch(r'[A-Za-z0-9_-]{1,200}', speaker):
            raise StoreError('validation', 'Expected a public speaker ID: 1–200 letters, digits, underscores or hyphens')
        with self.connection() as conn:
            project = self._structure_project(conn, project_id, expected_revision)
            voice = {**project['voice'], 'speaker': speaker}
            if project['voice_configured'] and project['voice'] == voice: return project
            conn.execute('UPDATE projects SET voice=%s,revision=revision+1 WHERE id=%s', [Jsonb(voice), project['id']])
            return self._read(conn, project['id'])

    @staticmethod
    def _scene(project, scene_id):
        scene_id = identifier(scene_id)
        row = next((s for s in project['scenes'] if s['id'] == scene_id), None)
        if row is None: raise StoreError('not_found', 'Scene not found in current project')
        return row

    def _structure_project(self, conn, project_id, expected_revision):
        revision(expected_revision)
        project = self._read(conn, project_id, lock=True)
        if project['revision'] != expected_revision: raise StoreError('conflict', 'Project revision changed')
        if conn.execute("SELECT id FROM jobs WHERE project_id=%s AND kind='generate' AND state IN ('queued','running') LIMIT 1", [project['id']]).fetchone():
            raise StoreError('not_ready', 'Wait for initial storyboard generation or cancel it first')
        return project

    def _insert_scene(self, conn, project, scene, position, state):
        scene = copy.deepcopy(scene)
        scene_id = str(uuid.uuid4()); scene['id'] = 'scene_' + scene_id.replace('-', '')
        project['scenes'].insert(position, {'scene': scene, 'state': state})
        document = self._dsl(project)
        draft_valid(document)
        ready = [s['scene'] for s in project['scenes'] if s['state'] == 'ready']
        if ready: final_valid({**document, 'scenes': ready})
        conn.execute('UPDATE scenes SET position=position+1 WHERE project_id=%s AND deleted_at IS NULL AND position>=%s', [project['id'], position])
        conn.execute('''INSERT INTO scenes (id,project_id,scene_key,position,state,scene,generated_revision,user_revision)
            VALUES (%s,%s,%s,%s,%s,%s,0,1)''', [scene_id, project['id'], scene['id'], position, state, Jsonb(scene)])
        conn.execute('UPDATE projects SET revision=revision+1 WHERE id=%s', [project['id']])
        return self._read(conn, project['id'])

    def add_scene(self, project_id, expected_revision, narration_text, content):
        if (not isinstance(narration_text, str) or not narration_text.strip() or len(narration_text) > 4000 or
                not isinstance(content, str) or not content.strip()):
            raise StoreError('validation', 'Expected nonblank narration and teaching point')
        scene = {'type': 'card_sequence', 'narration': {'text': narration_text},
                 'elements': [{'id': 'point', 'content': content, 'cue': {'text_start': 0, 'text_end': len(narration_text)}}]}
        with self.connection() as conn:
            project = self._structure_project(conn, project_id, expected_revision)
            return self._insert_scene(conn, project, scene, len(project['scenes']), 'needs_voice')

    def add_concept_scene(self, project_id, expected_revision, narration_text, elements):
        if not isinstance(narration_text, str) or not narration_text.strip() or len(narration_text) > 4000:
            raise StoreError('validation', 'Expected nonblank narration of 1–4000 code points')
        scene = {'type': 'concept', 'narration': {'text': narration_text}, 'elements': elements}
        with self.connection() as conn:
            project = self._structure_project(conn, project_id, expected_revision)
            return self._insert_scene(conn, project, scene, len(project['scenes']), 'needs_voice')

    def duplicate_scene(self, project_id, expected_revision, scene_id, expected_scene_revision):
        revision(expected_scene_revision)
        with self.connection() as conn:
            project = self._structure_project(conn, project_id, expected_revision)
            row = self._scene(project, scene_id)
            if row['revision'] != expected_scene_revision: raise StoreError('conflict', 'Scene revision changed')
            return self._insert_scene(conn, project, row['scene'], row['position'] + 1, row['state'])

    def delete_scene(self, project_id, expected_revision, scene_id, expected_scene_revision, confirmed):
        revision(expected_scene_revision)
        if confirmed is not True: raise StoreError('validation', 'Explicit scene deletion confirmation required')
        with self.connection() as conn:
            project = self._structure_project(conn, project_id, expected_revision)
            row = self._scene(project, scene_id)
            if row['revision'] != expected_scene_revision: raise StoreError('conflict', 'Scene revision changed')
            if len(project['scenes']) <= 1: raise StoreError('not_ready', 'Keep at least one scene')
            if conn.execute("SELECT id FROM jobs WHERE scene_id=%s AND state IN ('queued','running') LIMIT 1", [row['id']]).fetchone():
                raise StoreError('not_ready', 'Wait for scene jobs to finish or cancellation to be acknowledged')
            # Keep history FKs and reserve positions >=20 exclusively for archived rows.
            conn.execute('''UPDATE scenes SET deleted_at=now(),position=(SELECT GREATEST(20,COALESCE(MAX(position),19)+1)
                FROM scenes WHERE project_id=%s) WHERE id=%s''', [project['id'], row['id']])
            conn.execute('UPDATE scenes SET position=position-1 WHERE project_id=%s AND deleted_at IS NULL AND position>%s', [project['id'], row['position']])
            conn.execute('UPDATE projects SET revision=revision+1 WHERE id=%s', [project['id']])
            return self._read(conn, project['id'])

    def reorder(self, project_id, expected_revision, scene_ids):
        revision(expected_revision)
        with self.connection() as conn:
            project = self._read(conn, project_id, lock=True)
            if project['revision'] != expected_revision: raise StoreError('conflict', 'Project revision changed')
            existing = [s['id'] for s in project['scenes']]
            if (not isinstance(scene_ids, list) or any(not isinstance(s, str) for s in scene_ids) or
                    len(scene_ids) != len(existing) or set(scene_ids) != set(existing)):
                raise StoreError('invalid_order', 'Expected every current scene ID exactly once')
            if scene_ids == existing: return project
            for position, scene_id in enumerate(scene_ids):
                conn.execute('UPDATE scenes SET position=%s WHERE id=%s AND project_id=%s', [position, scene_id, project_id])
            conn.execute('UPDATE projects SET revision=revision+1 WHERE id=%s', [project_id])
            return self._read(conn, project_id)

    def create_version(self, project_id, expected_revision):
        revision(expected_revision)
        with self.connection() as conn:
            project = self._read(conn, project_id, lock=True)
            if project['revision'] != expected_revision: raise StoreError('conflict', 'Project revision changed')
            if not project['scenes'] or any(s['state'] != 'ready' for s in project['scenes']):
                raise StoreError('not_ready', 'Scenes require generation, voice or timing')
            document = self._dsl(project)
            final_valid(document)
            self._assets(document)
            profile = {**self.render_profile_for(project), 'render': copy.deepcopy(document['video_config'])}
            conn.execute('INSERT INTO project_versions (id,project_id,revision,dsl,profile) VALUES (%s,%s,%s,%s,%s) '
                         'ON CONFLICT (project_id,revision) DO NOTHING',
                         [str(uuid.uuid4()), project_id, expected_revision, Jsonb(document), Jsonb(profile)])
            row = conn.execute('SELECT * FROM project_versions WHERE project_id=%s AND revision=%s',
                               [project_id, expected_revision]).fetchone()
            return {**row, 'id': str(row['id']), 'project_id': str(row['project_id'])}

    def delete_project(self, project_id, expected_revision, confirmed):
        revision(expected_revision)
        if confirmed is not True:
            raise StoreError('validation', 'Explicit project deletion confirmation required')
        with self.connection() as conn:
            project = self._read(conn, project_id, lock=True)
            if project['revision'] != expected_revision:
                raise StoreError('conflict', 'Project revision changed')
            if conn.execute(
                    "SELECT id FROM jobs WHERE project_id=%s AND state IN ('queued','running') LIMIT 1",
                    [project['id']]).fetchone():
                raise StoreError('not_ready', 'Wait for project jobs to finish or cancel them first')
            pid = project['id']
            conn.execute('''DELETE FROM scene_candidates WHERE scene_id IN
                (SELECT id FROM scenes WHERE project_id=%s)''', [pid])
            conn.execute('''DELETE FROM job_attempts WHERE job_id IN
                (SELECT id FROM jobs WHERE project_id=%s)''', [pid])
            conn.execute('DELETE FROM jobs WHERE project_id=%s', [pid])
            conn.execute('DELETE FROM scenes WHERE project_id=%s', [pid])
            conn.execute('DELETE FROM project_versions WHERE project_id=%s', [pid])
            conn.execute('DELETE FROM projects WHERE id=%s', [pid])

    @staticmethod
    def _candidate(row):
        return {**row, 'id': str(row['id']), 'scene_id': str(row['scene_id']),
                'source_job_id': str(row['source_job_id']) if row['source_job_id'] else None,
                'source_attempt_id': str(row['source_attempt_id']) if row.get('source_attempt_id') else None}

    def create_candidate(self, scene_id, base_revision, draft, source_job_id=None):
        with self.connection() as conn:
            return self._create_candidate(conn, scene_id, base_revision, draft, source_job_id)

    def _create_candidate(self, conn, scene_id, base_revision, draft, source_job_id=None, source_attempt_id=None):
        revision(base_revision)
        unicode_valid(draft)
        try:
            validate_storyboard({'scenes': [draft]}, draft.get('narration', {}).get('text', ''))
        except (ProviderError, AttributeError):
            raise StoreError('validation', 'Invalid candidate draft') from None
        if draft.get('type') == 'data_chart' or 'chart' in draft:
            raise StoreError('validation', 'Chart data must use the user confirmation endpoint')
        source_job_id = identifier(source_job_id) if source_job_id is not None else None
        source_attempt_id = identifier(source_attempt_id) if source_attempt_id is not None else None
        owner = conn.execute('SELECT project_id FROM scenes WHERE id=%s', [identifier(scene_id)]).fetchone()
        if not owner: raise StoreError('not_found', 'Scene not found')
        project = self._read(conn, str(owner['project_id']), lock=True)
        row = self._scene(project, scene_id)
        if row['scene']['type'] == 'data_chart': raise StoreError('validation', 'Model candidates cannot replace confirmed chart data')
        if base_revision > row['revision']: raise StoreError('invalid_revision', 'Candidate references a future revision')
        if draft['id'] != row['scene_key']: raise StoreError('validation', 'Candidate must retain target scene name')
        # Validate historical candidates independently; acceptance validates the current whole project.
        result = conn.execute('INSERT INTO scene_candidates (id,scene_id,base_revision,draft,source_job_id,source_attempt_id) '
                              'VALUES (%s,%s,%s,%s,%s,%s) RETURNING *',
                              [str(uuid.uuid4()), scene_id, base_revision, Jsonb(draft), source_job_id, source_attempt_id]).fetchone()
        return self._candidate(result)

    def get_candidates(self, scene_id):
        with self.connection() as conn:
            if not conn.execute('SELECT id FROM scenes WHERE id=%s AND deleted_at IS NULL', [identifier(scene_id)]).fetchone():
                raise StoreError('not_found', 'Scene not found')
            rows = conn.execute('SELECT * FROM scene_candidates WHERE scene_id=%s ORDER BY id', [scene_id]).fetchall()
            return [self._candidate(row) for row in rows]

    def accept_candidate(self, scene_id, candidate_id, expected_revision):
        revision(expected_revision)
        with self.connection() as conn:
            owner = conn.execute('SELECT project_id FROM scenes WHERE id=%s', [identifier(scene_id)]).fetchone()
            if not owner: raise StoreError('not_found', 'Scene not found')
            project = self._read(conn, str(owner['project_id']), lock=True)
            row = self._scene(project, scene_id)
            candidate = conn.execute('SELECT * FROM scene_candidates WHERE id=%s AND scene_id=%s',
                                     [identifier(candidate_id), scene_id]).fetchone()
            if not candidate: raise StoreError('not_found', 'Candidate not found for this scene')
            if (row['revision'] != expected_revision or candidate['base_revision'] != expected_revision or candidate['accepted']):
                raise StoreError('conflict', 'Scene or candidate revision changed')
            scene, old = copy.deepcopy(candidate['draft']), row['scene']
            state = 'needs_voice'
            if scene['narration']['text'] == old['narration']['text'] and row['state'] != 'needs_voice':
                scene['narration'] = copy.deepcopy(old['narration'])
                for key in ['duration_frames', 'captions']: scene[key] = copy.deepcopy(old[key])
                same_cues = [(e['id'], e['cue'], e.get('role')) for e in scene['elements']] == [(e['id'], e['cue'], e.get('role')) for e in old['elements']]
                state = 'needs_timing'
                if row['state'] == 'ready' and same_cues and not scene.get('visual_actions'):
                    scene['animations'] = copy.deepcopy(old['animations'])
                    state = 'ready'
            row['scene'], row['state'] = scene, state
            document = self._dsl(project)
            draft_valid(document)
            if state == 'ready': final_valid({**document, 'scenes': [scene]})
            conn.execute('UPDATE scenes SET scene=%s,state=%s,revision=revision+1,generated_revision=generated_revision+1 WHERE id=%s',
                         [Jsonb(scene), state, scene_id])
            conn.execute('UPDATE projects SET revision=revision+1 WHERE id=%s', [project['id']])
            conn.execute('UPDATE scene_candidates SET accepted=true WHERE id=%s', [candidate_id])
            return self._read(conn, project['id'])

    def list_versions(self, project_id, before_revision=None):
        project_id = identifier(project_id)
        if before_revision is not None:
            revision(before_revision)
            if before_revision > 2147483647:
                raise StoreError('invalid_revision', 'Revision exceeds database integer range')
        with self.connection() as conn:
            if not conn.execute('SELECT 1 FROM projects WHERE id=%s', [project_id]).fetchone():
                raise StoreError('not_found', 'Project not found')
            rows = conn.execute("SELECT id,project_id,revision,COALESCE(dsl->>'theme','tech_explainer') AS theme, "
                                "jsonb_array_length(dsl->'scenes') AS scene_count FROM project_versions WHERE project_id=%s" +
                                (' AND revision<%s' if before_revision is not None else '') + ' ORDER BY revision DESC LIMIT 51',
                                [project_id] + ([before_revision] if before_revision is not None else [])).fetchall()
            items = [{**r, 'id': str(r['id']), 'project_id': str(r['project_id'])} for r in rows[:50]]
            return {'items': items, 'next_before_revision': items[-1]['revision'] if len(rows) > 50 else None}

    def get_version(self, version_id):
        with self.connection() as conn:
            row = conn.execute('SELECT * FROM project_versions WHERE id=%s', [identifier(version_id)]).fetchone()
            if not row: raise StoreError('not_found', 'Version not found')
            return {**row, 'id': str(row['id']), 'project_id': str(row['project_id'])}
