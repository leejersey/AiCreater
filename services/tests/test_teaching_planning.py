import os
import unittest
from concurrent.futures import ThreadPoolExecutor
from unittest.mock import patch

from services.tests import test_teaching_renders


@unittest.skipUnless(os.environ.get('TEST_DATABASE_URL'),'Requires disposable PostgreSQL')
class TeachingPlanningTests(unittest.TestCase):
    def setUp(self):
        fixture=test_teaching_renders.TeachingRenderQueueTests('test_duplicate_enqueue_and_claim_have_one_owner_and_do_not_use_model_budget')
        fixture.setUp();self.addCleanup(fixture.doCleanups)
        self.fixture=fixture;self.store=fixture.store;self.pid=fixture.pid;self.root=fixture.root
        from services.visual.teaching_planning import TeachingPlanning
        self.jobs=TeachingPlanning(self.store)

    def test_api_admission_is_durable_unique_and_model_free(self):
        with patch('services.visual.teaching_pipeline.TeachingPipeline.run') as invoke:
            with ThreadPoolExecutor(4) as pool:rows=list(pool.map(lambda _:self.jobs.enqueue(self.pid,self.root['id']),range(4)))
        invoke.assert_not_called();self.assertEqual(len({row['id'] for row in rows}),1)
        self.assertEqual(rows[0]['state'],'queued')
        from services.visual.teaching_planning import TeachingPlanning
        claims=[]
        with ThreadPoolExecutor(4) as pool:claims=list(pool.map(lambda _:TeachingPlanning(self.store).claim(self.pid,self.root['id']),range(4)))
        self.assertEqual(sum(claim is not None for claim in claims),1)

    def test_worker_uses_cached_plan_and_enqueues_render_without_new_requests(self):
        self.jobs.enqueue(self.pid,self.root['id'])
        from services.visual.teaching_planning import run_once
        provider=lambda _:self.fail('Cached artifact must not invoke provider')
        result=run_once(self.jobs,provider)
        self.assertEqual(result['state'],'succeeded')
        self.assertIsNone(run_once(self.jobs,provider))
        self.assertEqual(self.fixture.queue.get(self.pid,self.root['id'])['state'],'queued')
        self.assertEqual(self.fixture.workbench.tasks.get(self.pid,self.root['id'])['requests_used'],1)

    def test_cancelled_queue_does_not_dispatch_and_allows_deletion(self):
        self.jobs.enqueue(self.pid,self.root['id']);self.fixture.workbench.cancel(self.pid,self.root['id'])
        from services.visual.teaching_planning import run_once
        with patch('services.visual.teaching_pipeline.TeachingPipeline.run') as invoke:run_once(self.jobs,lambda _:None)
        invoke.assert_not_called();self.assertEqual(self.jobs.get(self.pid,self.root['id'])['state'],'cancelled')
        self.store.delete_project(self.pid,self.fixture.project['revision'],True)

    def test_expired_claim_never_reexecutes_or_accepts_old_completion(self):
        self.jobs.enqueue(self.pid,self.root['id']);claim=self.jobs.claim(self.pid,self.root['id'])
        with self.store.connection() as conn:conn.execute("UPDATE teaching_planning_jobs SET deadline=clock_timestamp()-interval '1 second' WHERE root_id=%s",[self.root['id']])
        self.assertIsNone(self.jobs.claim(self.pid,self.root['id']))
        self.assertEqual(self.jobs.get(self.pid,self.root['id'])['state'],'interrupted')
        from services.projects.store import StoreError
        with self.assertRaises(StoreError):self.jobs.finish(self.pid,self.root['id'],claim['token'],{'status':'artifact-ready'})

    def test_successful_plan_missing_render_admission_recovers_without_provider(self):
        self.jobs.enqueue(self.pid,self.root['id']);claim=self.jobs.claim(self.pid,self.root['id'])
        self.jobs.finish(self.pid,self.root['id'],claim['token'],{'status':'artifact-ready'})
        from services.visual.teaching_planning import run_once
        with patch('services.visual.teaching_pipeline.TeachingPipeline.run') as invoke:result=run_once(self.jobs,lambda _:None)
        invoke.assert_not_called();self.assertEqual(result['state'],'succeeded')
        self.assertEqual(self.fixture.queue.get(self.pid,self.root['id'])['state'],'queued')

    def test_stale_completed_plan_does_not_block_other_queue_items_forever(self):
        self.jobs.enqueue(self.pid,self.root['id']);claim=self.jobs.claim(self.pid,self.root['id'])
        self.jobs.finish(self.pid,self.root['id'],claim['token'],{'status':'artifact-ready'})
        scene=self.fixture.project['scenes'][0]
        self.store.edit_scene(scene['id'],scene['revision'],{'narration_text':scene['scene']['narration']['text']+'新增说明。'})
        from services.visual.teaching_planning import run_once
        result=run_once(self.jobs,lambda _:self.fail('Do not dispatch'))
        self.assertEqual(result['state'],'failed')
        self.assertIsNone(run_once(self.jobs,lambda _:self.fail('Do not dispatch')))

    def test_expired_owner_cannot_reserve_revision_inside_admission_transaction(self):
        self.jobs.enqueue(self.pid,self.root['id']);claim=self.jobs.claim(self.pid,self.root['id'])
        with self.store.connection() as conn:conn.execute("UPDATE teaching_planning_jobs SET deadline=clock_timestamp()-interval '1 second' WHERE root_id=%s",[self.root['id']])
        from services.projects.store import StoreError
        with self.assertRaises(StoreError):self.jobs.tasks.reserve(self.pid,self.root['id'],'revision','d'*64,
            guard=lambda conn:self.jobs.guard_in_transaction(conn,self.pid,self.root['id'],claim['token']))
        self.assertEqual(self.jobs.tasks.get(self.pid,self.root['id'])['requests_used'],1)

    def test_cancel_running_without_external_call_can_be_deleted(self):
        self.jobs.enqueue(self.pid,self.root['id']);claim=self.jobs.claim(self.pid,self.root['id'])
        self.fixture.workbench.cancel(self.pid,self.root['id'])
        self.assertEqual(self.jobs.get(self.pid,self.root['id'])['state'],'cancelled')
        self.store.delete_project(self.pid,self.fixture.project['revision'],True)

    def test_unclaimed_planning_expires_without_ever_invoking_a_provider(self):
        self.jobs.enqueue(self.pid,self.root['id'])
        with self.store.connection() as conn:conn.execute("UPDATE teaching_planning_jobs SET created_at=clock_timestamp()-interval '3 minutes' WHERE root_id=%s",[self.root['id']])
        self.assertIsNone(self.jobs.claim(self.pid,self.root['id']))
        current=self.jobs.get(self.pid,self.root['id'])
        self.assertEqual(current['state'],'failed');self.assertEqual(current['result']['code'],'executor-unavailable')

    def test_healthy_but_busy_worker_does_not_expire_legitimate_queue_wait(self):
        from services.visual.teaching_health import WorkerHealth
        import uuid
        health=WorkerHealth(self.store);health.initialize()
        instances=[str(uuid.uuid4()) for _ in range(3)]
        for role,instance in zip(('teaching-plan','teaching-render','scheduler'),instances):health.beat(role,instance)
        def remove_health():
            with self.store.connection() as conn:conn.execute('DELETE FROM teaching_worker_health WHERE instance_id=ANY(%s::uuid[])',[instances])
        self.addCleanup(remove_health)
        self.jobs.enqueue(self.pid,self.root['id']);self.fixture.enqueue()
        with self.store.connection() as conn:
            conn.execute("UPDATE teaching_planning_jobs SET created_at=clock_timestamp()-interval '3 minutes' WHERE root_id=%s",[self.root['id']])
            conn.execute("UPDATE teaching_render_jobs SET created_at=clock_timestamp()-interval '3 minutes' WHERE root_id=%s",[self.root['id']])
        self.assertIsNotNone(self.jobs.claim(self.pid,self.root['id']))
        self.assertIsNotNone(self.fixture.queue.claim(self.pid,self.root['id']))
