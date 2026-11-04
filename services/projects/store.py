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

from services import chapters

ROOT = Path(__file__).resolve().parents[2]


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


def migrate_chapters(conn):
    """Rewrites chapters stored as template scenes (type, elements, animations…) to the chapter shape, together with
    the chapter snapshots inside Agent and export jobs, so confirmations stay valid. Idempotent; returns the counts."""
    counts = {'scenes': 0, 'agent_jobs': 0, 'export_jobs': 0}
    for row in conn.execute('SELECT id,scene FROM scenes').fetchall():
        normalized = chapters.normalize(row['scene'])
        if normalized != row['scene']:
            conn.execute('UPDATE scenes SET scene=%s WHERE id=%s', [Jsonb(normalized), row['id']]); counts['scenes'] += 1
    for row in conn.execute("SELECT id,kind,input FROM jobs WHERE kind IN ('agent','export')").fetchall():
        data = copy.deepcopy(row['input'])
        if row['kind'] == 'agent' and isinstance(data.get('scene'), dict):
            data['scene'] = chapters.normalize(data['scene'])
        for chapter in data.get('chapters', []) if row['kind'] == 'export' else []:
            if isinstance(chapter, dict) and isinstance(chapter.get('scene'), dict): chapter['scene'] = chapters.normalize(chapter['scene'])
        if data != row['input']:
            conn.execute('UPDATE jobs SET input=%s WHERE id=%s', [Jsonb(data), row['id']]); counts[row['kind'] + '_jobs'] += 1
    return counts


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
            migrate_chapters(conn)

    def _asset_path(self, key):
        file = self.public / key
        if not file.resolve().is_relative_to(self.public) or file.resolve() != file.absolute():
            raise StoreError('assets', 'Media cache path must remain inside public root')
        return file

    def _assets(self, document, callback=None, local_only=False):
        if self.objects and not local_only:
            for asset in document['assets']:
                self.objects.ensure(self._asset_path(asset['storage_key']), asset['checksum'], (10 if asset['type'] == 'image' else 50) * 1024**2, callback)
        try:
            subprocess.run([str(ROOT / 'node_modules/.bin/tsx'), str(ROOT / 'scripts/verify-assets.ts'), str(self.public)],
                input=json.dumps({'assets': document['assets']}, ensure_ascii=False), text=True, capture_output=True, check=True, timeout=120,
                env={k: v for k, v in os.environ.items() if k not in ['DATABASE_URL', 'POSTGRES_PASSWORD',
                     'PGPASSWORD', 'DEEPSEEK_API_KEY', 'OPENAI_API_KEY', 'ACCOUNT_CREDENTIALS_KEY', 'VOLCENGINE_API_KEY', 'VOLCENGINE_ACCESS_KEY'] and not k.startswith(('MINIO_', 'RUSTFS_', 'TOS_'))})
        except (subprocess.SubprocessError, OSError):
            raise StoreError('assets', 'Local media verification failed') from None
        if self.objects and not local_only:
            for asset in document['assets']:
                self.objects.put(self._asset_path(asset['storage_key']), asset['checksum'], (10 if asset['type'] == 'image' else 50) * 1024**2, callback)

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
                'teaching_style': effective_teaching_style(row['config']),
                'source_text': ''.join(s['scene']['narration']['text'] for s in scenes) if scenes else row['source_text']}

    def profile_for(self, project):
        return {**copy.deepcopy(self.profile), 'voice': copy.deepcopy(project.get('voice') or self.profile['voice'])}

    def list_projects(self, owner_id=None):
        with self.connection() as conn:
            # shortcut: local first page only; add pagination when users exceed 100 projects.
            rows = conn.execute('''SELECT p.id,p.title,p.revision,p.updated_at,
                (SELECT count(*) FROM scenes WHERE project_id=p.id AND deleted_at IS NULL) AS scene_count,
                (SELECT count(*) FROM scenes WHERE project_id=p.id AND deleted_at IS NULL AND state='needs_voice') AS needs_voice,
                (SELECT count(*) FROM scenes WHERE project_id=p.id AND deleted_at IS NULL AND state='needs_timing') AS needs_timing,
                (SELECT count(*) FROM scenes s WHERE s.project_id=p.id AND s.deleted_at IS NULL AND EXISTS(
                    SELECT 1 FROM jobs v WHERE v.scene_id=s.id AND v.kind='agent' AND v.state='succeeded'
                    AND v.result->'accepted'='true'::jsonb AND v.input->'scene'=s.scene)) AS confirmed_count,
                a.kind AS active_job_kind, a.state AS active_job_state, a.kind IS NOT NULL AS active_jobs
                FROM projects p LEFT JOIN LATERAL (
                    SELECT kind,state FROM jobs WHERE project_id=p.id AND state IN ('queued','running')
                    ORDER BY created_at DESC NULLS LAST, id DESC LIMIT 1) a ON true''' + (' WHERE p.owner_id=%s' if owner_id else '') +
                ' ORDER BY p.updated_at DESC NULLS LAST,p.id DESC LIMIT 100', [identifier(owner_id)] if owner_id else []).fetchall()
            return [{**row, 'id': str(row['id']),'updated_at':row['updated_at'].isoformat() if row['updated_at'] else None} for row in rows]

    def asset_file(self, project_id, asset_id):
        project = self.get_project(project_id)
        asset = next((a for a in project['config']['assets'] if a['id'] == asset_id), None)
        if asset is None: raise StoreError('not_found', 'Media asset not found')
        file = self._asset_path(asset['storage_key'])
        limit = (10 if asset['type'] == 'image' else 50) * 1024**2
        if self.objects: self.objects.ensure(file, asset['checksum'], limit)
        if (not file.resolve().is_relative_to(self.public) or file.resolve() != file.absolute() or not file.is_file() or not 0 < file.stat().st_size <= limit
                or hashlib.sha256(file.read_bytes()).hexdigest() != asset['checksum']):
            raise StoreError('assets', 'Media asset verification failed')
        return file

    def create_project(self, title, source_text, owner_id=None, teaching_style=None, manuscript_format='plain'):
        document = None
        if manuscript_format == 'markdown':
            from services.workflow.manuscript_document import parse_document, narration_text
            from services.workflow.providers import ProviderError
            try:
                document = {'markdown': source_text, **parse_document(source_text)}
                source_text = narration_text(document)
            except ProviderError as exc:
                raise StoreError('validation', str(exc)) from None
        elif manuscript_format != 'plain':
            raise StoreError('validation', 'Unsupported manuscript format')
        if (not isinstance(title, str) or not 1 <= len(title.strip()) <= 80 or any(ord(c) < 32 for c in title) or
                not isinstance(source_text, str) or not source_text.strip() or len(source_text) > 4000):
            raise StoreError('validation', 'Expected title and 1–4000 code points of script')
        unicode_valid([title, source_text])
        style = normalize_teaching_style(teaching_style)
        project_id = str(uuid.uuid4())
        config = {'assets': [], 'teaching_style': style}
        if document is not None:
            config['manuscript'] = document
        with self.connection() as conn:
            conn.execute('INSERT INTO projects (id,title,source_text,config,owner_id) VALUES (%s,%s,%s,%s,%s)',
                         [project_id, title.strip(), source_text, Jsonb(config), identifier(owner_id) if owner_id else None])
            return self._read(conn, project_id)

    def get_project(self, project_id):
        with self.connection() as conn:
            return self._read(conn, project_id, lock=True)

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
        return project

    def _insert_scene(self, conn, project, scene, position, state):
        scene = copy.deepcopy(scene)
        scene_id = str(uuid.uuid4()); scene['id'] = 'scene_' + scene_id.replace('-', '')
        try: chapters.validate(scene, project['config'].get('assets', []))
        except chapters.ChapterError as error: raise StoreError('validation', str(error)) from None
        conn.execute('UPDATE scenes SET position=position+1 WHERE project_id=%s AND deleted_at IS NULL AND position>=%s', [project['id'], position])
        conn.execute('''INSERT INTO scenes (id,project_id,scene_key,position,state,scene,generated_revision,user_revision)
            VALUES (%s,%s,%s,%s,%s,%s,0,1)''', [scene_id, project['id'], scene['id'], position, state, Jsonb(scene)])
        conn.execute('UPDATE projects SET revision=revision+1 WHERE id=%s', [project['id']])
        return self._read(conn, project['id'])

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
            conn.execute('''DELETE FROM job_attempts WHERE job_id IN
                (SELECT id FROM jobs WHERE project_id=%s)''', [pid])
            conn.execute('DELETE FROM jobs WHERE project_id=%s', [pid])
            conn.execute('DELETE FROM scenes WHERE project_id=%s', [pid])
            conn.execute('DELETE FROM projects WHERE id=%s', [pid])
