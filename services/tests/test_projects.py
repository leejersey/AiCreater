import copy
import json
import os
import shutil
import tempfile
import unittest
import uuid
from pathlib import Path

from psycopg.types.json import Jsonb

from services.workflow.storyboard import ROOT


PROFILE = {'theme_version': 'tech_explainer:1', 'template_version': 'teaching:1',
           'font_hash': '0' * 64, 'voice': {'resource_id': 'seed-tts-2.0', 'speaker': 'test_voice'}}


def import_project(store, title, document, owner_id=None):
    """Test fixture: a ready project from a voiced DSL document (the app no longer imports DSL)."""
    from services.projects.store import draft_valid, final_valid
    final_valid(document); draft_valid(document); store._assets(document)
    project_id = str(uuid.uuid4())
    with store.connection() as conn:
        config = {k: copy.deepcopy(v) for k, v in document.items() if k != 'scenes'}
        conn.execute('INSERT INTO projects (id,title,config,owner_id) VALUES (%s,%s,%s,%s)',
                     [project_id, title, Jsonb(config), owner_id])
        for position, scene in enumerate(document['scenes']):
            conn.execute('INSERT INTO scenes (id,project_id,scene_key,position,state,scene) VALUES (%s,%s,%s,%s,%s,%s)',
                         [str(uuid.uuid4()), project_id, scene['id'], position, 'ready', Jsonb(scene)])
        return store._read(conn, project_id)


class ProjectFixture:
    def setUp(self):
        from services.projects.store import Store
        self.folder = tempfile.TemporaryDirectory()
        self.addCleanup(self.folder.cleanup)
        self.public = Path(self.folder.name)
        self.dsl = json.loads((ROOT / 'examples/demo.json').read_text())
        for asset in self.dsl['assets']:
            dest = self.public / asset['storage_key']
            dest.parent.mkdir(parents=True, exist_ok=True)
            shutil.copyfile(ROOT / 'apps/renderer/public' / asset['storage_key'], dest)
        self.store = Store(os.environ['TEST_DATABASE_URL'], self.public, PROFILE)
        self.store.initialize()
        self.project = import_project(self.store, '教学测试', self.dsl)

    def import_concept(self):
        # Keep the real narration/audio pair; these roles only exercise persistence, not teaching accuracy.
        dsl=copy.deepcopy(self.dsl);scene=next(s for s in dsl['scenes'] if s['type']=='flow_diagram')
        dsl['scenes']=[scene];scene['type']='concept';scene.pop('edges',None)
        scene['elements']=[{'id':e['id'],'content':scene['narration']['text'][e['cue']['text_start']:e['cue']['text_end']][:40],
                            'cue':e['cue'],'concept_role':'definition' if i==0 else 'feature'} for i,e in enumerate(scene['elements'])]
        return import_project(self.store,'概念存储测试',dsl)

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
