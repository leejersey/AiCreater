import copy
import json
import os
import tempfile
import unittest
import uuid
from pathlib import Path

from psycopg.types.json import Jsonb

from services import chapters
from services.tts.timing import align_words


PROFILE = {'theme_version': 'tech_explainer:1', 'template_version': 'teaching:1',
           'font_hash': '0' * 64, 'voice': {'resource_id': 'seed-tts-2.0', 'speaker': 'test_voice'}}
TEXTS = ['先读代码。', '再修改文件。', '最后运行测试。']


def voiced_document(public, texts=TEXTS):
    """Voiced chapters with real audio on disk: a short tone per chapter, a word cache, measured captions.
    Built here so the tests need no generated example files."""
    import hashlib, subprocess
    document = {'assets': [], 'scenes': []}
    run = uuid.uuid4().hex
    (public / 'generated' / run).mkdir(parents=True)
    for i, text in enumerate(texts):
        chapter_id = f'chapter-{i + 1}'
        wav = public / 'generated' / run / f'{chapter_id}.wav'
        subprocess.run(['ffmpeg', '-v', 'error', '-f', 'lavfi', '-i', 'sine=frequency=440:duration=1', '-ar', '24000', '-ac', '1', str(wav)], check=True)
        words = [{'word': c, 'startTime': k * 0.9 / len(text), 'endTime': (k + 1) * 0.9 / len(text)} for k, c in enumerate(text)]
        (wav.with_name(wav.stem + '-words.json')).write_text(json.dumps(words, ensure_ascii=False), encoding='utf-8')
        asset = {'id': f'audio_{chapter_id}', 'type': 'audio', 'storage_key': f'generated/{run}/{wav.name}',
                 'checksum': hashlib.sha256(wav.read_bytes()).hexdigest(), 'duration_ms': 1000}
        document['assets'].append(asset)
        document['scenes'].append(chapters.time_chapter(chapters.chapter(text, chapter_id), asset['id'], 1000, align_words(text, words, 1000)))
    return document


def import_project(store, title, document, owner_id=None):
    """Test fixture: a project whose chapters are already voiced (the app itself only voices one chapter at a time)."""
    for scene in document['scenes']: chapters.validate(scene, document['assets'])
    store._assets(document)
    project_id = str(uuid.uuid4())
    with store.connection() as conn:
        conn.execute('INSERT INTO projects (id,title,config,owner_id) VALUES (%s,%s,%s,%s)',
                     [project_id, title, Jsonb({'assets': copy.deepcopy(document['assets'])}), owner_id])
        for position, scene in enumerate(document['scenes']):
            conn.execute('INSERT INTO scenes (id,project_id,scene_key,position,state,scene) VALUES (%s,%s,%s,%s,%s,%s)',
                         [str(uuid.uuid4()), project_id, scene['id'], position, 'ready', Jsonb(scene)])
        return store._read(conn, project_id)


class ProjectFixture:
    def voice_document(self, index=0):
        """What a voice job publishes for chapter `index`: that chapter and its one audio asset."""
        scene = copy.deepcopy(self.dsl['scenes'][index])
        return {'assets': [copy.deepcopy(next(a for a in self.dsl['assets'] if a['id'] == scene['narration']['audio_asset_id']))], 'scenes': [scene]}

    def setUp(self):
        from services.projects.store import Store
        self.folder = tempfile.TemporaryDirectory()
        self.addCleanup(self.folder.cleanup)
        self.public = Path(self.folder.name)
        self.dsl = voiced_document(self.public)
        self.store = Store(os.environ['TEST_DATABASE_URL'], self.public, PROFILE)
        self.store.initialize()
        self.project = import_project(self.store, '教学测试', self.dsl)

@unittest.skipUnless(os.environ.get('TEST_DATABASE_URL'), 'Use run_project_tests.py for real PostgreSQL')
class ProjectTests(ProjectFixture, unittest.TestCase):
    def clean_scene_jobs(self, project_id):
        with self.store.connection() as conn:
            conn.execute("UPDATE jobs SET state='cancelled' WHERE project_id=%s AND state IN ('queued','running')", [project_id])
            conn.execute("UPDATE job_attempts SET state='cancelled' WHERE job_id IN (SELECT id FROM jobs WHERE project_id=%s) AND state='running'", [project_id])

    def test_persistence_and_restart_read(self):
        from services.projects.store import Store
        other = Store(os.environ['TEST_DATABASE_URL'], self.public, PROFILE)
        self.assertEqual(other.get_project(self.project['id']), self.project)

    def test_invalid_profile_cannot_persist_keys(self):
        from services.projects.store import Store, StoreError
        with self.assertRaises(StoreError):
            Store(os.environ['TEST_DATABASE_URL'], self.public, {**PROFILE, 'api_key': 'secret'})
        with self.assertRaises(StoreError):
            Store(os.environ['TEST_DATABASE_URL'], self.public,
                  {**PROFILE, 'voice': {**PROFILE['voice'], 'api_key': 'secret'}})
