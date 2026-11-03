import copy
import os
import tempfile
import unittest
import uuid
from pathlib import Path

from psycopg.types.json import Jsonb

from services.projects.store import Store, StoreError
from services.tests.test_projects import PROFILE


class VisualStoreOfflineTests(unittest.TestCase):
    def test_public_result_is_allowlisted(self):
        from services.visual.store import VisualJobs
        row = {'id': uuid.uuid4(), 'project_id': uuid.uuid4(), 'scene_id': None,
               'kind': 'agent', 'state': 'succeeded', 'stage': 'complete',
               'created_at': None, 'error': None, 'input': {'secret': '/private', 'model': 'm', 'max_turns': 25},
               'result': {'status': 'passed', 'turns': 3, '_files': {'source.txt': 'a' * 64}, 'provider_response': 'secret',
                          'directory': '/private', 'source': 'export {}'}}
        public = VisualJobs._public(row)
        self.assertNotIn('input', public)
        self.assertEqual(public['result'], {'status': 'passed', 'turns': 3, 'accepted': False})
        self.assertEqual(public['input_summary'], {'model': 'm', 'max_turns': 25})
        self.assertFalse(public['accepted'])

    def test_turn_limit_is_checked_before_database_access(self):
        from unittest.mock import MagicMock
        from services.visual.store import VisualJobs
        store = MagicMock(); jobs = VisualJobs(store)
        for confirmed, turns in ((False, 25), (True, 0), (True, 26), (True, True), (True, '25')):
            with self.assertRaises(StoreError): jobs.agent('p', 's', 1, confirmed, turns)
        store.connection.assert_not_called()


@unittest.skipUnless(os.environ.get('TEST_DATABASE_URL'), 'Requires disposable TEST_DATABASE_URL')
class VisualStoreTests(unittest.TestCase):
    def setUp(self):
        from services.visual.store import VisualJobs
        self.temp = tempfile.TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)
        self.store = Store(os.environ['TEST_DATABASE_URL'], self.temp.name, PROFILE)
        self.store.initialize()
        with self.store.connection() as conn:
            conn.execute(Path(__file__).parents[1].joinpath('visual/schema.sql').read_text())
            # Each run owns a disposable database, never operate on a shared stack.
            conn.execute('DELETE FROM visual_jobs')
        self.jobs = VisualJobs(self.store)
        self.project = self.store.create_project('Visual', 'Read then change.')
        self.pid = self.project['id']
        self.sid = str(uuid.uuid4())
        self.asset = {'id': 'voice', 'type': 'audio', 'checksum': 'a' * 64,
                      'storage_key': 'generated/voice.wav', 'duration_ms': 2000}
        self.scene = {'id': 'visual-test', 'type': 'card_sequence',
                      'narration': {'text': 'Read then change.', 'audio_asset_id': 'voice', 'audio_start_frame': 0},
                      'duration_frames': 60, 'captions': [{'text': 'Read then change.', 'start_frame': 0, 'end_frame': 60}],
                      'elements': [{'id': 'point', 'content': 'Read', 'cue': {'text_start': 0, 'text_end': 16}}]}
        with self.store.connection() as conn:
            config = copy.deepcopy(self.project['config']); config['assets'] = [self.asset]
            conn.execute('UPDATE projects SET config=%s WHERE id=%s', [Jsonb(config), self.pid])
            conn.execute('''INSERT INTO scenes(id,project_id,scene_key,position,state,scene)
                VALUES (%s,%s,'visual-test',0,'ready',%s)''', [self.sid, self.pid, Jsonb(self.scene)])

    def agent(self, revision=1):
        return self.jobs.agent(self.pid, self.sid, revision, True, 25)

    def test_project_scope_and_private_snapshot(self):
        job = self.agent()
        other = self.store.create_project('Other', 'Unrelated.')
        self.assertEqual(self.jobs.list(other['id']), [])
        for method in (self.jobs.get, self.jobs.get_raw, self.jobs.cancel):
            with self.assertRaisesRegex(StoreError, 'not_found'):
                method(other['id'], job['id'])
        raw = self.jobs.get_raw(self.pid, job['id'])
        self.assertEqual(set(raw['input']), {'brief', 'cues', 'scene', 'asset', 'fingerprint', 'model', 'max_turns'})
        self.assertNotIn('input', self.jobs.get(self.pid, job['id']))
        self.assertEqual(self.jobs.get(self.pid, job['id'])['input_summary']['max_turns'], 25)

    def test_claim_is_fenced_and_never_retries(self):
        job = self.agent(); claim = self.jobs.claim('workflow')
        self.assertEqual(claim['id'], job['id'])
        self.assertIsNone(self.jobs.claim('workflow'))
        self.assertIsNone(self.jobs.claim('render'))
        self.assertFalse(self.jobs.heartbeat(job['id'], str(uuid.uuid4())))
        self.assertTrue(self.jobs.heartbeat(job['id'], claim['attempt_id']))
        with self.store.connection() as conn:
            conn.execute("UPDATE visual_jobs SET heartbeat_at=now()-interval '61 seconds' WHERE id=%s", [job['id']])
        with self.assertRaisesRegex(StoreError, 'conflict'):
            self.jobs.finish(job['id'], claim['attempt_id'], {})
        self.assertIsNone(self.jobs.claim('workflow'))
        self.assertEqual(self.jobs.get(self.pid, job['id'])['state'], 'failed')

    def test_cancel_fences_late_finish(self):
        job = self.agent(); claim = self.jobs.claim('workflow')
        self.assertEqual(self.jobs.cancel(self.pid, job['id'])['state'], 'cancelled')
        with self.assertRaisesRegex(StoreError, 'conflict'):
            self.jobs.finish(job['id'], claim['attempt_id'], {})

    def test_duplicate_active_submission_reuses_one_paid_job(self):
        job = self.agent()
        self.assertEqual(self.agent()['id'], job['id'])
        claim = self.jobs.claim('workflow')
        self.assertEqual(self.agent()['id'], claim['id'])
        self.jobs.cancel(self.pid, job['id'])
        self.assertNotEqual(self.agent()['id'], job['id'])

    def test_snapshot_changes_before_finish_are_not_published(self):
        job = self.agent(); claim = self.jobs.claim('workflow')
        with self.store.connection() as conn:
            conn.execute('UPDATE scenes SET revision=revision+1 WHERE id=%s', [self.sid])
        done = self.jobs.finish(job['id'], claim['attempt_id'], {'requests_dispatched': 1}, error='agent_budget_turns')
        self.assertEqual(done['state'], 'failed'); self.assertIn('stale', done['error'])

    def test_revision_and_not_ready_fail_closed(self):
        with self.assertRaisesRegex(StoreError, 'conflict'):
            self.agent(2)
        with self.store.connection() as conn:
            conn.execute("UPDATE scenes SET state='needs_voice' WHERE id=%s", [self.sid])
        with self.assertRaisesRegex(StoreError, 'not_ready'):
            self.agent()

    def test_template_flow_jobs_left_in_the_table_are_never_listed_read_or_claimed(self):
        old = str(uuid.uuid4())
        with self.store.connection() as conn:
            for kind, lane_kind in (('generate', 'workflow'), ('preview', 'render')):
                conn.execute('''INSERT INTO visual_jobs(id,project_id,scene_id,kind,input)
                    VALUES (%s,%s,%s,%s,'{}')''', [old if kind == 'generate' else str(uuid.uuid4()), self.pid, self.sid, kind])
        self.assertEqual(self.jobs.list(self.pid), [])
        with self.assertRaisesRegex(StoreError, 'not_found'):
            self.jobs.get_raw(self.pid, old)
        self.assertIsNone(self.jobs.claim('workflow'))
        self.assertIsNone(self.jobs.claim('render'))
        with self.assertRaisesRegex(StoreError, 'not_ready'):
            self.jobs.export(self.pid, 1, True)

    def test_prepare_only_empty_and_preserves_all_narration(self):
        text = ('A sentence. ' * 150)
        project = self.store.create_project('Prepare', text)
        prepared = self.jobs.prepare(project['id'], 1)
        self.assertEqual(''.join(s['scene']['narration']['text'] for s in prepared['scenes']), text)
        self.assertTrue(all(len(s['scene']['narration']['text']) <= 800 for s in prepared['scenes']))
        self.assertTrue(all(s['state'] == 'needs_voice' for s in prepared['scenes']))
        self.assertEqual(self.jobs.prepare(project['id'], prepared['revision']), prepared)

    def test_delete_blocks_active_then_deletes_terminal_visual_history(self):
        project = self.store.create_project('Delete', 'A chapter.')
        prepared = self.jobs.prepare(project['id'], 1)
        scene = prepared['scenes'][0]
        with self.store.connection() as conn:
            conn.execute('''INSERT INTO visual_jobs(id,project_id,scene_id,kind,input)
                VALUES (%s,%s,%s,'agent','{}')''', [str(uuid.uuid4()), project['id'], scene['id']])
        with self.assertRaisesRegex(StoreError, 'not_ready'):
            self.store.delete_project(project['id'], prepared['revision'], True)
        job = self.jobs.list(project['id'])[0]
        self.jobs.cancel(project['id'], job['id'])
        self.store.delete_project(project['id'], prepared['revision'], True)
        with self.assertRaisesRegex(StoreError, 'not_found'):
            self.jobs.list(project['id'])


if __name__ == '__main__':
    unittest.main()
