import copy
import os
import tempfile
import unittest
import uuid

from services.projects.store import Store, StoreError
from services.tests.test_projects import PROFILE
from services.visual.teaching_tasks import TeachingTasks, fingerprint
from services.visual.teaching_pipeline import TeachingPipeline, host_command
from unittest.mock import patch
from types import SimpleNamespace


class TeachingHostOfflineTests(unittest.TestCase):
    def test_validation_child_cannot_inherit_provider_or_database_credentials(self):
        with patch.dict(os.environ, {'DEEPSEEK_API_KEY': 'forbidden', 'DATABASE_URL': 'forbidden'}), \
                patch('services.visual.teaching_pipeline.subprocess.run', return_value=SimpleNamespace(returncode=0, stdout='{}')) as launch:
            host_command('request', {})
        self.assertNotIn('DEEPSEEK_API_KEY', launch.call_args.kwargs['env'])
        self.assertNotIn('DATABASE_URL', launch.call_args.kwargs['env'])


@unittest.skipUnless(os.environ.get('TEST_DATABASE_URL'), 'Requires disposable PostgreSQL')
class TeachingPipelineTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory(); self.addCleanup(self.temp.cleanup)
        self.store = Store(os.environ['TEST_DATABASE_URL'], self.temp.name, PROFILE)
        self.store.initialize(); self.tasks = TeachingTasks(self.store); self.tasks.initialize()
        project = self.store.create_project('Pipeline test', 'First.Second.')
        self.project = self.store.add_scene(project['id'], 1, 'First.Second.', 'Example')
        self.pid = self.project['id']
        self.snapshot = {'generation_mode': 'teaching-plan', 'brief': {
            'schemaVersion': 'custom-scene-brief:1', 'id': 'pipeline-test', 'title': '组合',
            'narration': 'First.Second.', 'visualGoal': 'Explain a mechanism', 'facts': ['Example only'],
            'materials': [], 'width': 1920, 'height': 1080, 'fps': 30, 'durationInFrames': 120},
            'cues': [{'id': 'first', 'text': 'First.', 'startFrame': 6, 'endFrame': 54},
                     {'id': 'second', 'text': 'Second.', 'startFrame': 60, 'endFrame': 114}]}
        self.root = self.tasks.create(self.pid, self.project['scenes'][0]['id'], self.project['revision'],
                                      str(uuid.uuid4()), self.snapshot, True, 2)

    def plan(self, request, capacity_error=False):
        def obj(id, component='document', state='waiting'):
            return {'id': id, 'component': component, 'meaning': id, 'label': id, 'ownerId': None, 'initialState': state}
        return {'schemaVersion': 'teaching-scene-plan:1', 'inputSha256': request['inputSha256'], 'structure': 'composition',
                'objects': [obj('paper'), obj('other'), obj('bag', 'classifier' if capacity_error else 'wallet', 'idle' if capacity_error else 'empty')],
                'relations': [], 'beats': [{'cueId': 'first', 'actions': [{'kind': 'combine', 'objectIds': ['paper', 'other'], 'targetId': 'bag'}]},
                                           {'cueId': 'second', 'actions': [{'kind': 'hold', 'objectId': 'bag'}]}]}

    def test_real_node_validation_and_pg_ledger_compile_and_resume_without_redispatch(self):
        calls = []
        def provider(request):
            calls.append(request['stage']); return self.plan(request)
        result = TeachingPipeline(self.tasks).run(self.pid, self.root['id'], provider)
        self.assertEqual(result['status'], 'artifact-ready'); self.assertFalse(result['accepted'])
        self.assertEqual(calls, ['plan']); self.assertEqual(result['requests_used'], 1)
        resumed = TeachingPipeline(TeachingTasks(self.store)).run(self.pid, self.root['id'], provider)
        self.assertEqual(resumed['artifact_sha256'], result['artifact_sha256'])
        self.assertEqual(calls, ['plan']); self.assertEqual(resumed['execution'], 'not-run')

    def test_capacity_failure_uses_one_bound_revision_and_no_code_request(self):
        calls = []
        def provider(request):
            calls.append(request['stage']); return self.plan(request, request['stage'] == 'plan')
        result = TeachingPipeline(self.tasks).run(self.pid, self.root['id'], provider)
        self.assertEqual(result['status'], 'artifact-ready'); self.assertEqual(calls, ['plan', 'revision'])
        self.assertEqual(result['requests_used'], 2)
        TeachingPipeline(self.tasks).run(self.pid, self.root['id'], provider)
        self.assertEqual(calls, ['plan', 'revision'])

    def test_invalid_repair_stops_at_two_calls_without_deleting_original_response(self):
        calls = []
        def provider(request):
            calls.append(request['stage']); plan = self.plan(request, True)
            if request['stage'] == 'revision': plan['objects'][0]['label'] = 'deleted original wording'
            return plan
        result = TeachingPipeline(self.tasks).run(self.pid, self.root['id'], provider)
        self.assertEqual(result['status'], 'blocked'); self.assertEqual(result['requests_used'], 2)
        self.assertEqual(calls, ['plan', 'revision'])
        TeachingPipeline(self.tasks).run(self.pid, self.root['id'], provider)
        self.assertEqual(calls, ['plan', 'revision'])
        self.assertIn('response-plan', [c['kind'] for c in self.tasks.checkpoint(self.pid, self.root['id'])['cache']])

    def test_timeout_and_cancel_do_not_trigger_additional_requests(self):
        calls = []
        def provider(request):
            calls.append(request['stage']); raise TimeoutError('not exposed')
        result = TeachingPipeline(self.tasks).run(self.pid, self.root['id'], provider)
        self.assertEqual(result['status'], 'blocked')
        TeachingPipeline(self.tasks).run(self.pid, self.root['id'], provider)
        self.assertEqual(calls, ['plan'])
        self.tasks.cancel(self.pid, self.root['id'])
        self.assertEqual(TeachingPipeline(self.tasks).run(self.pid, self.root['id'], provider)['status'], 'cancelled')

    def test_valid_foreign_artifact_cannot_replace_the_root_input_binding(self):
        foreign = copy.deepcopy(self.snapshot); foreign['brief']['title'] = 'Different chapter'
        context = {k: foreign[k] for k in ('brief', 'cues')}
        request = host_command('request', context)
        artifact = host_command('check', {**context, 'plan': self.plan(request)})['artifact']
        key = fingerprint({'pipeline': 'teaching-plan-host:1', 'snapshot': self.root['snapshot_sha256'], 'stage': 'plan'})
        self.tasks.save_cache(self.pid, self.root['id'], 'artifact', key, artifact)
        calls = []
        result = TeachingPipeline(self.tasks).run(self.pid, self.root['id'], lambda r: calls.append(r))
        self.assertEqual(result['status'], 'blocked'); self.assertEqual(calls, [])

    def test_unvalidated_source_fields_are_data_only_and_never_trigger_a_code_branch(self):
        calls = []
        def provider(request):
            calls.append(request['stage']); return {'source': 'throw Error("must never execute")'}
        result = TeachingPipeline(self.tasks).run(self.pid, self.root['id'], provider)
        self.assertEqual(result['status'], 'blocked'); self.assertEqual(calls, ['plan'])
        self.assertEqual(result['requests_used'], 1); self.assertFalse(result['accepted'])

    def test_invalid_host_context_stops_before_model_admission(self):
        invalid = copy.deepcopy(self.snapshot); invalid['brief']['width'] = 42
        root = self.tasks.create(self.pid, self.project['scenes'][0]['id'], self.project['revision'], str(uuid.uuid4()), invalid, True, 2)
        calls = []
        result = TeachingPipeline(self.tasks).run(self.pid, root['id'], lambda r: calls.append(r))
        self.assertEqual(result['status'], 'blocked'); self.assertEqual(result['requests_used'], 0); self.assertEqual(calls, [])

    def test_explicit_invalid_revision_binding_is_not_silently_ignored(self):
        context = {k: self.snapshot[k] for k in ('brief', 'cues')}
        request = host_command('request', context)
        with self.assertRaises(StoreError): host_command('check', {**context, 'plan': self.plan(request), 'revision': None})
