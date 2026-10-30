"""Celery wiring tests with no broker, database, dotenv reads or provider calls."""
import importlib
import os
import unittest
from types import SimpleNamespace
from unittest.mock import patch


class TeachingWorkerEntryTests(unittest.TestCase):
    def test_free_media_binding_is_consumed_without_constructing_a_paid_provider(self):
        with patch.dict(os.environ,{'DATABASE_URL':'unused-test-dsn','CELERY_BROKER_URL':'redis://127.0.0.1:16379/0','AICREATER_TEACHING_PLAN_WORKER':'1'},clear=True),patch('dotenv.load_dotenv'):
            queue=importlib.import_module('services.workflow.queue')
            with patch.object(queue,'Store'),patch.object(queue,'profile',return_value={}),patch.object(queue,'VisualJobs'),patch.object(queue,'Jobs'), \
                    patch('services.projects.storage.ObjectStore.from_env',return_value=None),patch.object(queue,'visual_run_once',return_value=None),patch.object(queue,'run_once',return_value=None), \
                    patch('services.visual.teaching_media.run_once',return_value={'id':'media-fixture','state':'succeeded'}) as media,patch('services.visual.teaching_provider.TeachingPlanProvider.from_env') as provider, \
                    patch('services.visual.teaching_planning.run_once',return_value=None),patch('services.visual.teaching_render_repairs.run_once',return_value=None):
                self.assertEqual(queue._poll('workflow'),{'job_id':'media-fixture','state':'succeeded'})
                media.assert_called_once();provider.assert_not_called()

    def test_worker_health_is_registered_outside_the_solo_task_loop(self):
        with patch.dict(os.environ,{'DATABASE_URL':'unused-test-dsn','CELERY_BROKER_URL':'redis://127.0.0.1:16379/0','AICREATER_TEACHING_PLAN_WORKER':'1','AICREATER_TEACHING_RENDER_WORKER':'1'},clear=True),patch('dotenv.load_dotenv'):
            queue=importlib.import_module('services.workflow.queue')
            with patch.object(queue,'_health_store'),patch('services.visual.teaching_health.WorkerHealth') as health,patch('services.visual.teaching_provider.TeachingPlanProvider.from_env'):
                queue._teaching_worker_ready(SimpleNamespace(task_consumer=SimpleNamespace(queues=[SimpleNamespace(name='workflow')])) )
                queue._teaching_worker_ready(SimpleNamespace(task_consumer=SimpleNamespace(queues=[SimpleNamespace(name='render')])) )
                queue._teaching_beat_ready()
                self.assertEqual([c.args[0] for c in health.return_value.lease.call_args_list],['teaching-plan','teaching-render','scheduler'])
                queue._teaching_worker_shutdown()
                self.assertEqual(health.return_value.lease.return_value.__exit__.call_count,3)

    def test_semantic_planning_is_only_consumed_with_explicit_workflow_opt_in(self):
        with patch.dict(os.environ,{'DATABASE_URL':'unused-test-dsn','CELERY_BROKER_URL':'redis://127.0.0.1:16379/0'},clear=True),patch('dotenv.load_dotenv'):
            queue=importlib.import_module('services.workflow.queue')
            with patch.object(queue,'Store'),patch.object(queue,'profile',return_value={}),patch.object(queue,'VisualJobs'),patch.object(queue,'Jobs'), \
                    patch('services.projects.storage.ObjectStore.from_env',return_value=None),patch.object(queue,'visual_run_once',return_value=None),patch.object(queue,'run_once',return_value=None), \
                    patch('services.visual.teaching_planning.run_once',return_value={'id':'plan-fixture','state':'succeeded'}) as plan,patch('services.visual.teaching_provider.TeachingPlanProvider.from_env') as configured,patch('services.visual.teaching_media.run_once',return_value=None):
                self.assertIsNone(queue._poll('workflow'));plan.assert_not_called();configured.assert_not_called()
                os.environ['AICREATER_TEACHING_PLAN_WORKER']='1'
                self.assertIsNone(queue._poll('render'));plan.assert_not_called()
                self.assertEqual(queue._poll('workflow'),{'job_id':'plan-fixture','state':'succeeded'})
                self.assertEqual(plan.call_count,1);configured.assert_called_once()

    def test_existing_render_poll_only_enables_teaching_when_explicitly_opted_in(self):
        with patch.dict(os.environ,{'DATABASE_URL':'unused-test-dsn','CELERY_BROKER_URL':'redis://127.0.0.1:16379/0'},clear=True),patch('dotenv.load_dotenv'):
            queue=importlib.import_module('services.workflow.queue')
            with patch.object(queue,'Store'),patch.object(queue,'profile',return_value={}),patch.object(queue,'VisualJobs'),patch.object(queue,'Jobs'), \
                    patch('services.projects.storage.ObjectStore.from_env',return_value=None),patch.object(queue,'visual_run_once',return_value=None), \
                    patch.object(queue,'run_once',return_value=None),patch('services.visual.teaching_worker.run_once',return_value={'id':'fixture-id','state':'succeeded'}) as teaching:
                self.assertIsNone(queue._poll('render')); self.assertEqual(teaching.call_count,0)
                os.environ['AICREATER_TEACHING_RENDER_WORKER']='1'
                self.assertIsNone(queue._poll('workflow')); self.assertEqual(teaching.call_count,0)
                self.assertEqual(queue._poll('render'),{'job_id':'fixture-id','state':'succeeded'})
                self.assertEqual(teaching.call_count,1)

    def test_teaching_poll_does_not_jump_ahead_of_existing_jobs(self):
        with patch.dict(os.environ,{'DATABASE_URL':'unused-test-dsn','CELERY_BROKER_URL':'redis://127.0.0.1:16379/0','AICREATER_TEACHING_RENDER_WORKER':'1'},clear=True),patch('dotenv.load_dotenv'):
            queue=importlib.import_module('services.workflow.queue')
            with patch.object(queue,'Store'),patch.object(queue,'profile',return_value={}),patch.object(queue,'VisualJobs'),patch.object(queue,'Jobs'), \
                    patch('services.projects.storage.ObjectStore.from_env',return_value=None),patch.object(queue,'visual_run_once',return_value={'id':'legacy','state':'succeeded'}), \
                    patch('services.visual.teaching_worker.run_once') as teaching:
                self.assertEqual(queue._poll('render')['job_id'],'legacy'); self.assertEqual(teaching.call_count,0)
