import copy
import os
import tempfile
import unittest
import uuid

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
        self.assertEqual(public['input_summary'], {'model': 'm', 'max_turns': 25, 'theme_id': 'blueprint'})
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
            # Each run owns a disposable database, never operate on a shared stack. Workers claim the oldest
            # queued job of a lane, so start every test with an empty queue.
            conn.execute("UPDATE jobs SET state='cancelled' WHERE state IN ('queued','running')")
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
        self.assertEqual(set(raw['input']), {'brief', 'cues', 'scene', 'asset', 'fingerprint', 'model', 'max_turns', 'theme'})
        self.assertNotIn('input', self.jobs.get(self.pid, job['id']))
        self.assertEqual(self.jobs.get(self.pid, job['id'])['input_summary']['max_turns'], 25)

    def test_jobs_freeze_the_course_theme_and_a_new_theme_keeps_accepted_videos(self):
        job = self.agent()
        self.assertEqual(self.jobs.get_raw(self.pid, job['id'])['input']['theme']['id'], 'blueprint')
        self.assertEqual(self.jobs.get(self.pid, job['id'])['input_summary']['theme_id'], 'blueprint')
        project = self.store.set_theme(self.pid, 1, 'paper-press')
        self.assertEqual((project['theme_id'], project['revision']), ('paper-press', 2))
        self.assertEqual(self.store.set_theme(self.pid, 2, 'paper-press')['revision'], 2)  # no change, no new revision
        # The Agent job's scene snapshot is unchanged, so it stays current; only exports depend on the revision.
        self.assertTrue(self.jobs.get(self.pid, job['id'])['current'])
        self.jobs.cancel(self.pid, job['id'])
        self.assertEqual(self.jobs.get_raw(self.pid, self.agent(2)['id'])['input']['theme']['id'], 'paper-press')
        with self.assertRaisesRegex(StoreError, 'validation'): self.store.set_theme(self.pid, 2, 'no-such-theme')
        with self.assertRaisesRegex(StoreError, 'conflict'): self.store.set_theme(self.pid, 1, 'blueprint')

    def test_claim_is_fenced_and_never_retries(self):
        job = self.agent(); claim = self.jobs.claim('workflow')
        self.assertEqual(claim['id'], job['id'])
        self.assertIsNone(self.jobs.claim('workflow'))
        self.assertIsNone(self.jobs.claim('render'))
        self.assertFalse(self.jobs.heartbeat(job['id'], str(uuid.uuid4())))
        self.assertTrue(self.jobs.heartbeat(job['id'], claim['attempt_id']))
        with self.store.connection() as conn:
            conn.execute("UPDATE jobs SET heartbeat_at=now()-interval '61 seconds' WHERE id=%s", [job['id']])
        with self.assertRaisesRegex(StoreError, 'conflict'):
            self.jobs.finish(job['id'], claim['attempt_id'], {})
        self.assertIsNone(self.jobs.claim('workflow'))
        self.assertEqual(self.jobs.get(self.pid, job['id'])['state'], 'failed')

    def test_cancelling_a_queued_job_ends_it_and_a_running_one_stops_at_its_next_heartbeat(self):
        queued = self.agent()
        self.assertEqual(self.jobs.cancel(self.pid, queued['id'])['state'], 'cancelled')
        job = self.agent(); claim = self.jobs.claim('workflow')
        self.assertEqual(self.jobs.cancel(self.pid, job['id'])['state'], 'running')  # the worker still owns it
        self.assertFalse(self.jobs.heartbeat(job['id'], claim['attempt_id']))   # …and is told to stop
        done = self.jobs.finish(job['id'], claim['attempt_id'], {'requests_dispatched': 2}, error='agent_budget_turns')
        self.assertEqual(done['state'], 'cancelled')
        with self.assertRaisesRegex(StoreError, 'conflict'):
            self.jobs.finish(job['id'], claim['attempt_id'], {})

    def test_duplicate_active_submission_reuses_one_paid_job(self):
        job = self.agent()
        self.assertEqual(self.agent()['id'], job['id'])
        claim = self.jobs.claim('workflow')
        self.assertEqual(self.agent()['id'], claim['id'])
        self.jobs.cancel(self.pid, job['id'])
        self.assertEqual(self.agent()['id'], job['id'])  # still running until its worker stops
        self.jobs.finish(job['id'], claim['attempt_id'], {'requests_dispatched': 1}, error='agent_internal')
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

    def test_course_list_counts_confirmed_chapters_and_shows_running_agent_jobs(self):
        row = lambda: next(p for p in self.store.list_projects() if p['id'] == self.pid)
        self.assertEqual((row()['confirmed_count'], row()['active_jobs']), (0, False))
        job = self.agent()
        self.assertEqual((row()['active_job_kind'], row()['active_job_state']), ('agent', 'queued'))
        self.jobs.cancel(self.pid, job['id'])
        with self.store.connection() as conn:
            conn.execute("""UPDATE jobs SET state='succeeded',result='{"accepted":true}'::jsonb WHERE id=%s""", [job['id']])
        self.assertEqual((row()['confirmed_count'], row()['active_jobs']), (1, False))
        with self.store.connection() as conn:  # a changed chapter no longer counts its old confirmation
            conn.execute("UPDATE scenes SET scene=jsonb_set(scene,'{duration_frames}','61') WHERE id=%s", [self.sid])
        self.assertEqual(row()['confirmed_count'], 0)

    def test_voice_and_agent_jobs_share_the_workflow_slot_and_export_runs_on_render(self):
        from services.projects.jobs import Jobs
        voice = Jobs(self.store)
        with self.store.connection() as conn:  # make the chapter voiceable again
            conn.execute("UPDATE scenes SET state='needs_voice' WHERE id=%s", [self.sid])
        voiced = voice.submit_voice(self.sid, 1)
        with self.store.connection() as conn: conn.execute("UPDATE scenes SET state='ready' WHERE id=%s", [self.sid])
        agent = self.agent()
        first = voice.claim('workflow')
        self.assertEqual(first['id'], voiced['id'])
        self.assertIsNone(self.jobs.claim('workflow'))  # one running job per lane, whatever its kind
        voice.fail(first['id'], first['attempt_id'], 'validation')
        self.assertEqual(self.jobs.claim('workflow')['id'], agent['id'])
        self.assertIsNone(voice.claim('workflow'))
        with self.assertRaisesRegex(StoreError, 'not_found'):
            voice.get(agent['id'])  # each module reads only its own kinds
        with self.assertRaisesRegex(StoreError, 'not_found'):
            self.jobs.get(self.pid, voiced['id'])

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
            job_id = str(uuid.uuid4())
            conn.execute('''INSERT INTO jobs(id,project_id,scene_id,kind,base_revision,input_hash,input)
                VALUES (%s,%s,%s,'agent',1,%s,'{}')''', [job_id, project['id'], scene['id'], 'a' * 64])
        with self.assertRaisesRegex(StoreError, 'not_ready'):
            self.store.delete_project(project['id'], prepared['revision'], True)
        job = self.jobs.list(project['id'])[0]
        self.jobs.cancel(project['id'], job['id'])
        self.store.delete_project(project['id'], prepared['revision'], True)
        with self.assertRaisesRegex(StoreError, 'not_found'):
            self.jobs.list(project['id'])


if __name__ == '__main__':
    unittest.main()
