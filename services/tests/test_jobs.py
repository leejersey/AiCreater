import copy
import json
import os
import unittest
from concurrent.futures import ThreadPoolExecutor

from services.tests.test_projects import ProjectFixture
from services.projects.store import StoreError


@unittest.skipUnless(os.environ.get('TEST_DATABASE_URL'), 'Use run_project_tests.py for real PostgreSQL')
class JobTests(ProjectFixture, unittest.TestCase):
    def setUp(self):
        super().setUp()
        from services.projects.jobs import Jobs
        self.jobs = Jobs(self.store)
        self.scene_id = self.project['scenes'][0]['id']
        self.addCleanup(self.clean_jobs)

    def clean_jobs(self):
        with self.store.connection() as conn:
            conn.execute("UPDATE jobs SET state='cancelled' WHERE project_id=%s AND state IN ('queued','running')", [self.project['id']])
            conn.execute("UPDATE job_attempts SET state='cancelled' WHERE job_id IN (SELECT id FROM jobs WHERE project_id=%s) AND state='running'", [self.project['id']])

    def submit(self): return self.jobs.submit_regenerate(self.scene_id, 1)

    def timing_cache(self):
        scene=self.project['scenes'][0]['scene'];asset=next(a for a in self.dsl['assets'] if a['id']==scene['narration']['audio_asset_id'])
        file=self.public/asset['storage_key'];words=file.with_name(file.stem+'-words.json')
        words.write_text(json.dumps([{'word':scene['narration']['text'],'startTime':0,'endTime':asset['duration_ms']/1000}]))
        return words

    def pending_voice(self, count=2):
        project = self.project
        for row in project['scenes'][:count]:
            project = self.store.edit_scene(row['id'], row['revision'],
                {'narration_text': row['scene']['narration']['text'] + '补充说明。'})
        return project, [{'scene_id': s['id'], 'expected_revision': s['revision']} for s in project['scenes'][:count]]

    def pending_timing(self):
        project=self.project
        for row in project['scenes'][:2]:
            asset=next(a for a in self.dsl['assets'] if a['id']==row['scene']['narration']['audio_asset_id'])
            audio=self.public/asset['storage_key']
            audio.with_name(audio.stem+'-words.json').write_text(json.dumps([{'word':row['scene']['narration']['text'],'startTime':0,'endTime':asset['duration_ms']/1000}]))
            elements=copy.deepcopy(row['scene']['elements']);elements[0]['cue']['text_start']+=1
            project=self.store.edit_scene(row['id'],row['revision'],{'elements':elements})
        return project,[{'scene_id':r['id'],'expected_revision':r['revision']} for r in project['scenes'][:2]]

    def test_project_voice_old_job_cannot_overwrite_and_new_voice_can_publish(self):
        old=self.jobs.submit_voice(self.scene_id,1);attempt=self.jobs.claim()
        changed=self.store.set_voice(self.project['id'],1,'voice_A')
        document={**copy.deepcopy(self.dsl),'scenes':[copy.deepcopy(self.dsl['scenes'][0])]}
        stale=self.jobs.publish_voice(old['id'],attempt['attempt_id'],document)
        self.assertFalse(stale['result']['attached']);self.assertEqual(self.store.get_project(self.project['id']),changed)
        new=self.jobs.submit_voice(self.scene_id,1);attempt=self.jobs.claim()
        self.assertEqual(new['input']['profile']['voice']['speaker'],'voice_A')
        done=self.jobs.publish_voice(new['id'],attempt['attempt_id'],document)
        self.assertTrue(done['result']['attached']);self.assertEqual(self.jobs.get(old['id'])['input'],old['input'])

    def test_local_timing_old_attempt_cannot_publish_after_explicit_retry(self):
        from services.workflow.local_timing import timing_document
        self.timing_cache();job=self.jobs.submit_timing(self.scene_id,1);old=self.jobs.claim()
        document=timing_document(job['input'],self.public)
        self.jobs.fail(job['id'],old['attempt_id'],'timeout');self.jobs.retry(job['id'])
        with self.store.connection() as conn:conn.execute('UPDATE jobs SET available_at=now() WHERE id=%s',[job['id']])
        new=self.jobs.claim();self.assertIsNotNone(new)
        with self.assertRaises(StoreError):self.jobs.publish_voice(job['id'],old['attempt_id'],document)
        self.assertTrue(self.jobs.publish_voice(job['id'],new['attempt_id'],document)['result']['attached'])

    def test_local_timing_cancel_never_attaches(self):
        from services.workflow.local_timing import timing_document
        self.timing_cache();job=self.jobs.submit_timing(self.scene_id,1);attempt=self.jobs.claim()
        self.jobs.cancel(job['id'])
        result=self.jobs.publish_voice(job['id'],attempt['attempt_id'],timing_document(job['input'],self.public))
        self.assertEqual(result['state'],'cancelled')

    def expire(self, job):
        with self.store.connection() as conn:
            conn.execute("UPDATE jobs SET heartbeat_at=now()-interval '61 seconds' WHERE id=%s", [job['id']])

    def test_voice_invalid_assets_cancel_and_wrong_scene_cannot_publish(self):
        job = self.jobs.submit_voice(self.scene_id, 1)
        attempt = self.jobs.claim()
        document = copy.deepcopy(self.dsl)
        document['scenes'] = document['scenes'][:1]
        wrong = copy.deepcopy(document)
        wrong['scenes'][0]['id'] = 'wrong_scene'
        with self.assertRaises(StoreError): self.jobs.publish_voice(job['id'], attempt['attempt_id'], wrong)
        broken = copy.deepcopy(document)
        broken['assets'][0]['checksum'] = '0' * 64
        with self.assertRaises(StoreError): self.jobs.publish_voice(job['id'], attempt['attempt_id'], broken)
        self.jobs.cancel(job['id'])
        self.assertEqual(self.jobs.publish_voice(job['id'], attempt['attempt_id'], document)['state'], 'cancelled')
        self.assertEqual(self.store.get_project(self.project['id']), self.project)

    def draft(self):
        scene = self.project['scenes'][0]['scene']
        draft = {k: copy.deepcopy(v) for k, v in scene.items() if k in ['id', 'type', 'elements', 'edges', 'code']}
        draft['narration'] = {'text': scene['narration']['text']}
        return draft
