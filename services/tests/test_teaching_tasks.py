import os
import subprocess
import sys
import tempfile
import threading
import unittest
import uuid
from concurrent.futures import ThreadPoolExecutor
from contextlib import contextmanager
from unittest.mock import patch

from services.projects.store import Store, StoreError
from services.tests.test_projects import PROFILE
from services.visual.teaching_tasks import TeachingTasks

H = 'a' * 64


class TeachingTaskOfflineTests(unittest.TestCase):
    def test_invalid_budget_stops_before_database(self):
        for confirmed, maximum in ((False, 2), (True, True), (True, 1), (True, 3)):
            with self.assertRaises(StoreError):
                TeachingTasks(None).create('bad', 'bad', 1, str(uuid.uuid4()), {}, confirmed, maximum)

    def test_non_json_keys_and_excessive_depth_are_rejected_before_database(self):
        deep = {}
        for _ in range(1100): deep = {'child': deep}
        for snapshot in ({1: 'numeric key'}, {'nested': {False: 'key'}}, deep):
            with self.subTest(case=type(snapshot).__name__), self.assertRaises(StoreError):
                TeachingTasks(None).create(str(uuid.uuid4()), str(uuid.uuid4()), 1, str(uuid.uuid4()), snapshot, True, 2)


@unittest.skipUnless(os.environ.get('TEST_DATABASE_URL'), 'Requires owned disposable PostgreSQL')
class TeachingTaskDatabaseTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)
        self.store = Store(os.environ['TEST_DATABASE_URL'], self.temp.name, PROFILE)
        self.store.initialize()
        self.tasks = TeachingTasks(self.store)
        self.tasks.initialize()
        project = self.store.create_project('Ledger test', 'Teaching content')
        self.project = self.store.add_scene(project['id'], 1, '教学测试。', '要点')
        self.pid, self.sid = self.project['id'], self.project['scenes'][0]['id']
        self.key = str(uuid.uuid4())
        self.snapshot = {'brief': {'title': '教学'}, 'cues': ['first'], 'audio_sha256': H}

    def create(self, **kwargs):
        return self.tasks.create(self.pid, self.sid, self.project['revision'], self.key,
                                 kwargs.get('snapshot', self.snapshot), True, 2)

    def test_concurrent_and_terminal_submissions_reuse_same_root(self):
        with ThreadPoolExecutor(6) as pool:
            roots = list(pool.map(lambda _: self.create(), range(12)))
        self.assertEqual(len({r['id'] for r in roots}), 1)
        root = roots[0]
        self.tasks.cancel(self.pid, root['id'])
        self.assertEqual(self.create()['state'], 'cancelled')
        with self.assertRaises(StoreError): self.create(snapshot={'changed': True})

    def test_lost_ownership_after_reservation_retains_slot_without_provider_io(self):
        root=self.create();requests=[]
        def expired():raise StoreError('conflict','Execution ended')
        with self.assertRaises(StoreError):self.tasks.dispatch_once(self.pid,root['id'],'plan',H,
            lambda:requests.append('unexpected'),before_invoke=expired)
        current=self.tasks.get(self.pid,root['id'])
        self.assertEqual(requests,[]);self.assertEqual(current['requests_used'],1);self.assertEqual(current['calls'][0]['state'],'cancelled')

    def test_atomic_reservation_only_one_worker_can_dispatch(self):
        root = self.create()
        with ThreadPoolExecutor(8) as pool:
            calls = list(pool.map(lambda _: self.tasks.reserve(self.pid, root['id'], 'plan', H), range(16)))
        owners = [c for c in calls if c['dispatch']]
        self.assertEqual(len(owners), 1)
        self.assertEqual(sum('dispatch_token' in c for c in calls), 1)
        self.assertEqual(self.tasks.get(self.pid, root['id'])['requests_used'], 1)
        with self.assertRaises(StoreError): self.tasks.reserve(self.pid, root['id'], 'plan', 'b' * 64)
        with self.assertRaises(StoreError): self.tasks.reserve(self.pid, root['id'], 'revision', H)

    def test_initial_and_revision_share_two_slots_and_keep_cached_outputs(self):
        root = self.create()
        first = self.tasks.reserve(self.pid, root['id'], 'plan', H)
        self.tasks.finish(self.pid, root['id'], first['id'], first['dispatch_token'], 'succeeded', {'plan': 'initial'})
        self.tasks.save_cache(self.pid, root['id'], 'plan', H, {'objects': ['one', 'two']})
        second = self.tasks.reserve(self.pid, root['id'], 'revision', 'b' * 64)
        self.tasks.finish(self.pid, root['id'], second['id'], second['dispatch_token'], 'failed')
        self.assertEqual(self.tasks.get(self.pid, root['id'])['requests_used'], 2)
        for stage, fingerprint in (('plan', H), ('revision', 'b' * 64)):
            self.assertFalse(self.tasks.reserve(self.pid, root['id'], stage, fingerprint)['dispatch'])
        with self.assertRaises(StoreError): self.tasks.reserve(self.pid, root['id'], 'extra-retry', H)
        self.assertEqual(self.tasks.get_cache(self.pid, root['id'], 'plan', H)['payload'], {'objects': ['one', 'two']})
        checkpoint = TeachingTasks(self.store).checkpoint(self.pid, root['id'])
        self.assertEqual(checkpoint['snapshot'], self.snapshot)
        self.assertEqual(checkpoint['root']['requests_used'], 2)
        self.assertIn(('plan', H), [(c['kind'], c['binding_sha256']) for c in checkpoint['cache']])
        self.assertNotIn('dispatch_token', str(checkpoint))

    def test_restart_unknown_and_cancel_never_refund_or_reissue(self):
        root = self.create()
        first = self.tasks.reserve(self.pid, root['id'], 'plan', H)
        restarted = TeachingTasks(self.store)
        self.assertFalse(restarted.reserve(self.pid, root['id'], 'plan', H)['dispatch'])
        with self.store.connection() as conn:
            conn.execute("UPDATE teaching_model_calls SET created_at=now()-interval '11 minutes' WHERE id=%s", [first['id']])
        self.assertEqual(restarted.reconcile(self.pid, root['id']), 1)
        self.assertEqual(restarted.get(self.pid, root['id'])['calls'][0]['state'], 'unknown')
        with self.assertRaises(StoreError): restarted.reserve(self.pid, root['id'], 'revision', H)
        restarted.cancel(self.pid, root['id'])
        restarted.finish(self.pid, root['id'], first['id'], first['dispatch_token'], 'succeeded', {'late': 'response'})
        self.assertEqual(restarted.get(self.pid, root['id'])['state'], 'cancelled')
        self.assertEqual(restarted.get(self.pid, root['id'])['requests_used'], 1)
        with self.assertRaises(StoreError): restarted.reserve(self.pid, root['id'], 'revision', H)

    def test_completion_and_caches_are_immutable_and_project_scoped(self):
        root = self.create()
        call = self.tasks.reserve(self.pid, root['id'], 'plan', H)
        args = (self.pid, root['id'], call['id'])
        with self.assertRaises(StoreError): self.tasks.finish(*args, str(uuid.uuid4()), 'succeeded', {'ok': True})
        self.tasks.finish(*args, call['dispatch_token'], 'succeeded', {'ok': True})
        self.tasks.finish(*args, call['dispatch_token'], 'succeeded', {'ok': True})
        with self.assertRaises(StoreError): self.tasks.finish(*args, call['dispatch_token'], 'succeeded', {'different': True})
        self.tasks.save_cache(self.pid, root['id'], 'audio', H, {'asset_sha256': H})
        self.tasks.save_cache(self.pid, root['id'], 'audio', H, {'asset_sha256': H})
        with self.assertRaises(StoreError): self.tasks.save_cache(self.pid, root['id'], 'audio', H, {'asset_sha256': 'b' * 64})
        with self.assertRaises(StoreError): self.tasks.get(str(uuid.uuid4()), root['id'])
        with self.assertRaises(StoreError): self.tasks.get_cache(str(uuid.uuid4()), root['id'], 'audio', H)
        self.assertNotIn('dispatch_token', self.tasks.get(self.pid, root['id'])['calls'][0])

    def test_dispatch_callback_runs_once_and_timeout_is_not_retried(self):
        root = self.create()
        invocations = []
        def provider():
            invocations.append(True)
            return {'response': 'offline fake provider'}
        with ThreadPoolExecutor(6) as pool:
            list(pool.map(lambda _: self.tasks.dispatch_once(self.pid, root['id'], 'plan', H, provider), range(10)))
        self.assertEqual(len(invocations), 1)
        def timeout(): raise TimeoutError('sensitive transport details')
        with self.assertRaises(StoreError): self.tasks.dispatch_once(self.pid, root['id'], 'revision', 'b' * 64, timeout)
        self.assertFalse(self.tasks.dispatch_once(self.pid, root['id'], 'revision', 'b' * 64, timeout)['dispatch'])
        self.assertEqual(self.tasks.get(self.pid, root['id'])['requests_used'], 2)

    def test_process_exit_after_committed_reservation_never_grants_a_second_owner(self):
        root = self.create()
        code = '''import os
from services.projects.store import Store
from services.tests.test_projects import PROFILE
from services.visual.teaching_tasks import TeachingTasks
store=Store(os.environ['TEST_DATABASE_URL'],os.environ['TEST_PUBLIC'],PROFILE)
TeachingTasks(store).reserve(os.environ['TEST_PROJECT'],os.environ['TEST_ROOT'],'plan','a'*64)
os._exit(17)
'''
        env = {'PATH': os.environ.get('PATH', ''), 'TEST_DATABASE_URL': os.environ['TEST_DATABASE_URL'],
               'TEST_PUBLIC': self.temp.name, 'TEST_PROJECT': self.pid, 'TEST_ROOT': root['id']}
        child = subprocess.run([sys.executable, '-c', code], env=env, capture_output=True, timeout=20)
        self.assertEqual(child.returncode, 17)
        restarted = TeachingTasks(self.store)
        self.assertFalse(restarted.reserve(self.pid, root['id'], 'plan', H)['dispatch'])
        self.assertEqual(restarted.get(self.pid, root['id'])['requests_used'], 1)

    def test_cancel_during_inflight_call_keeps_late_response_without_new_dispatch(self):
        root = self.create()
        started, released = threading.Event(), threading.Event()
        def provider():
            started.set()
            if not released.wait(10): raise TimeoutError()
            return {'late': 'valid response'}
        with ThreadPoolExecutor(1) as pool:
            future = pool.submit(self.tasks.dispatch_once, self.pid, root['id'], 'plan', H, provider)
            try:
                self.assertTrue(started.wait(10))
                self.tasks.cancel(self.pid, root['id'])
            finally: released.set()
            self.assertEqual(future.result(timeout=15)['state'], 'succeeded')
        current = self.tasks.get(self.pid, root['id'])
        self.assertEqual(current['state'], 'cancelled')
        self.assertEqual(current['requests_used'], 1)
        self.assertEqual(self.tasks.get_cache(self.pid, root['id'], 'response-plan', H)['payload'], {'late': 'valid response'})
        with self.assertRaises(StoreError): self.tasks.reserve(self.pid, root['id'], 'revision', H)

    def test_existing_project_delete_cleans_ledger_and_cache_without_foreign_key_failure(self):
        root = self.create()
        self.tasks.dispatch_once(self.pid, root['id'], 'plan', H, lambda: {'response': 'offline'})
        self.tasks.save_cache(self.pid, root['id'], 'audio', H, {'sha256': H})
        self.tasks.cancel(self.pid, root['id'])
        self.store.delete_project(self.pid, self.project['revision'], True)
        with self.store.connection() as conn:
            for table in ('teaching_task_roots', 'teaching_model_calls', 'teaching_task_cache'):
                self.assertEqual(conn.execute('SELECT count(*) AS n FROM ' + table + (' WHERE id=%s' if table=='teaching_task_roots' else ' WHERE root_id=%s'), [root['id']]).fetchone()['n'], 0)

    def test_snapshot_and_cache_freeze_before_waiting_for_database(self):
        original = self.store.connection
        @contextmanager
        def changed_snapshot():
            self.snapshot['brief']['title'] = 'changed while waiting'
            with original() as conn: yield conn
        with patch.object(self.store, 'connection', changed_snapshot): root = self.create()
        with original() as conn:
            saved = conn.execute('SELECT snapshot FROM teaching_task_roots WHERE id=%s', [root['id']]).fetchone()['snapshot']
        self.assertEqual(saved['brief']['title'], '教学')
        payload = {'objects': ['original']}
        @contextmanager
        def changed_payload():
            payload['objects'].append('later mutation')
            with original() as conn: yield conn
        with patch.object(self.store, 'connection', changed_payload): self.tasks.save_cache(self.pid, root['id'], 'plan', H, payload)
        self.assertEqual(self.tasks.get_cache(self.pid, root['id'], 'plan', H)['payload'], {'objects': ['original']})

    def test_numeric_cache_roundtrip_does_not_change_frozen_checksums(self):
        payload = {'large': 1e20, 'larger': 1e40, 'tiny': 1e-20, 'negative_zero': -0.0}
        root = self.create(snapshot={'numeric': payload})
        self.tasks.save_cache(self.pid, root['id'], 'artifact', H, payload)
        self.assertEqual(self.tasks.get_cache(self.pid, root['id'], 'artifact', H)['payload'], payload)
        self.assertEqual(self.tasks.checkpoint(self.pid, root['id'])['snapshot'], {'numeric': payload})
