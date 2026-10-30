"""Offline unit tests and an owned, socket-only temporary PostgreSQL cluster."""
import os
from contextlib import ExitStack, contextmanager
from pathlib import Path
import shutil
import subprocess
import tempfile
import threading
import time
import unittest
import uuid
from unittest.mock import MagicMock, patch

from services.projects.store import Store, StoreError
from services.visual import teaching_health
from services.visual.teaching_health import WorkerHealth


class WorkerHealthOfflineTests(unittest.TestCase):
    def test_construction_is_passive_and_interval_is_ten_seconds(self):
        store = MagicMock()
        WorkerHealth(store)
        store.connection.assert_not_called()
        self.assertEqual(teaching_health._BEAT_SECONDS, 10)

    def test_invalid_roles_and_instances_never_touch_database(self):
        store = MagicMock()
        health = WorkerHealth(store)
        for role in ('render', '', None, [], 'private-role'):
            with self.subTest(role=role), self.assertRaises(StoreError) as raised:
                health.beat(role, str(uuid.uuid4()))
            self.assertEqual(raised.exception.code, 'validation')
            self.assertNotIn('private', str(raised.exception))
        for instance in ('private-instance', None, True, {}, 42):
            with self.subTest(instance=instance), self.assertRaises(StoreError):
                health.beat('scheduler', instance)
        for roles in ([], (), 'scheduler', None, ['render'], ['scheduler', []]):
            self.assertFalse(health.ready(roles))
            with self.assertRaises(StoreError) as raised:
                health.require_ready(roles)
            self.assertEqual(raised.exception.code, 'teaching_unavailable')
        store.connection.assert_not_called()

    def test_database_failure_is_redacted_and_readiness_fails_closed(self):
        store = MagicMock()
        store.connection.side_effect = RuntimeError('postgresql://private:secret@host/private-path')
        health = WorkerHealth(store)
        for operation in (health.initialize, lambda: health.beat('scheduler', str(uuid.uuid4())),
                          lambda: health.require_ready(['scheduler'])):
            with self.assertRaises(StoreError) as raised:
                operation()
            self.assertEqual(raised.exception.code, 'teaching_unavailable')
            self.assertNotIn('private', str(raised.exception))
            self.assertIsNone(raised.exception.__cause__)
            self.assertTrue(raised.exception.__suppress_context__)
        self.assertFalse(health.ready(['scheduler']))
        with patch.object(teaching_health, 'Thread') as thread:
            with self.assertRaises(StoreError):
                with health.lease('scheduler'):
                    self.fail('Failed initial beat must not enter lease')
            thread.assert_not_called()

    def test_transaction_exit_failure_is_not_reported_as_ready_or_written(self):
        store = MagicMock()
        store.connection.return_value.__enter__.return_value.execute.return_value.fetchone.return_value = {'n': 1}
        store.connection.return_value.__exit__.side_effect = RuntimeError('private commit failure')
        health = WorkerHealth(store)
        self.assertFalse(health.ready(['scheduler']))
        for operation in (health.initialize, lambda: health.beat('scheduler', str(uuid.uuid4()))):
            with self.assertRaises(StoreError) as raised:
                operation()
            self.assertEqual(raised.exception.code, 'teaching_unavailable')
            self.assertNotIn('private', str(raised.exception))


@unittest.skipUnless(shutil.which('initdb') and shutil.which('pg_ctl'), 'Requires local PostgreSQL tools on PATH')
class WorkerHealthPostgresTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        # Never use DATABASE_URL/TEST_DATABASE_URL or any existing server.
        temporary = tempfile.TemporaryDirectory(prefix='th-', dir='/tmp')
        cls.addClassCleanup(temporary.cleanup)
        folder = temporary.name
        cls.folder = Path(folder)
        cls.data = cls.folder / 'data'
        cls.env = {key: os.environ[key] for key in ('PATH', 'SYSTEMROOT') if key in os.environ}
        cls.env['LC_ALL'] = 'C'
        subprocess.run(['initdb', '-D', str(cls.data), '-A', 'trust', '-U', 'postgres', '--no-locale', '-E', 'UTF8'],
                       env=cls.env, capture_output=True, check=True, timeout=30)
        cls.addClassCleanup(cls.stop_postgres)
        subprocess.run(['pg_ctl', '-D', str(cls.data), '-l', str(cls.folder / 'postgres.log'),
                        '-o', f"-F -h '' -k {folder} -p 55432", '-w', 'start'],
                       env=cls.env, capture_output=True, check=True, timeout=30)
        profile = {'theme_version': 'test', 'template_version': 'test', 'font_hash': '0' * 64,
                   'voice': {'resource_id': 'unused', 'speaker': 'unused'}}
        cls.store = Store(f'host={folder} port=55432 dbname=postgres user=postgres', folder, profile)
        with cls.store.connection() as conn:
            conn.execute('CREATE SCHEMA aicreater')

    @classmethod
    def stop_postgres(cls):
        if (cls.data / 'postmaster.pid').exists():
            subprocess.run(['pg_ctl', '-D', str(cls.data), '-m', 'immediate', '-w', 'stop'],
                           env=cls.env, capture_output=True, check=True, timeout=30)

    def setUp(self):
        with self.store.connection() as conn:
            conn.execute('DROP TABLE IF EXISTS teaching_worker_health')
        self.health = WorkerHealth(self.store)

    def rows(self):
        with self.store.connection() as conn:
            return conn.execute('SELECT * FROM teaching_worker_health ORDER BY role, instance_id').fetchall()

    def test_initialize_is_explicit_idempotent_and_missing_table_is_not_ready(self):
        self.assertFalse(self.health.ready(['scheduler']))
        with self.assertRaises(StoreError) as raised:
            self.health.beat('scheduler', str(uuid.uuid4()))
        self.assertEqual(raised.exception.code, 'teaching_unavailable')
        self.health.initialize()
        self.health.initialize()
        self.assertEqual(self.rows(), [])
        with self.store.connection() as conn:
            columns = conn.execute("SELECT column_name, data_type FROM information_schema.columns WHERE table_schema='aicreater' AND table_name='teaching_worker_health' ORDER BY ordinal_position").fetchall()
        self.assertEqual([(r['column_name'], r['data_type']) for r in columns],
                         [('role', 'text'), ('instance_id', 'uuid'), ('schema_version', 'text'), ('expires_at', 'timestamp with time zone')])

    def test_worker_initial_registration_recovers_after_api_creates_table(self):
        with patch.object(teaching_health,'_BEAT_SECONDS',0.02):
            with self.health.lease('scheduler',retry_initial=True):
                self.assertFalse(self.health.ready(['scheduler']))
                self.health.initialize()
                deadline=time.monotonic()+3
                while not self.health.ready(['scheduler']) and time.monotonic()<deadline:time.sleep(0.01)
                self.assertTrue(self.health.ready(['scheduler']))
            self.assertFalse(self.health.ready(['scheduler']))

    def test_beat_upserts_with_database_clock_and_distinct_role_instance_keys(self):
        self.health.initialize()
        instance = str(uuid.uuid4())
        with self.store.connection() as conn:
            before = conn.execute('SELECT clock_timestamp() AS t').fetchone()['t']
        self.health.beat('teaching-plan', instance)
        first = self.rows()[0]
        self.assertEqual(first['schema_version'], 'teaching-worker:1')
        self.assertEqual(str(first['instance_id']), instance)
        with self.store.connection() as conn:
            after = conn.execute('SELECT clock_timestamp() AS t').fetchone()['t']
            conn.execute("UPDATE teaching_worker_health SET expires_at=clock_timestamp()-interval '1 second'")
        self.assertGreaterEqual((first['expires_at'] - before).total_seconds(), 45)
        self.assertLessEqual((first['expires_at'] - after).total_seconds(), 45)
        self.health.beat('teaching-plan', uuid.UUID(instance))
        self.health.beat('teaching-render', instance)
        self.assertEqual(len(self.rows()), 2)
        self.assertTrue(self.health.ready(['teaching-plan', 'teaching-render']))
        self.assertFalse(self.health.ready(['scheduler']))

    def test_ready_requires_every_role_current_schema_and_unexpired_row(self):
        self.health.initialize()
        for role in ('teaching-plan', 'teaching-render', 'scheduler'):
            self.health.beat(role, str(uuid.uuid4()))
        roles = ['teaching-plan', 'teaching-render', 'scheduler']
        self.assertTrue(self.health.ready(roles))
        self.health.require_ready(roles)
        with self.store.connection() as conn:
            conn.execute("UPDATE teaching_worker_health SET schema_version='teaching-worker:0' WHERE role='scheduler'")
        self.assertFalse(self.health.ready(roles))
        self.health.beat('scheduler', str(uuid.uuid4()))
        self.assertTrue(self.health.ready(roles + ['scheduler']))
        with self.store.connection() as conn:
            conn.execute("UPDATE teaching_worker_health SET expires_at=clock_timestamp() WHERE role='teaching-render'")
        self.assertFalse(self.health.ready(roles))
        self.assertTrue(self.health.ready(['teaching-plan']))
        with self.assertRaises(StoreError) as raised:
            self.health.require_ready(roles)
        self.assertEqual(raised.exception.code, 'teaching_unavailable')

    def test_beat_uses_wall_clock_not_transaction_start(self):
        self.health.initialize()
        @contextmanager
        def same_transaction():
            yield conn
        with self.store.connection() as conn:
            conn.execute('SELECT pg_sleep(0.02)')
            with patch.object(self.store, 'connection', same_transaction):
                self.health.beat('scheduler', str(uuid.uuid4()))
            row = conn.execute("SELECT expires_at > transaction_timestamp()+interval '45 seconds' AS fresh FROM teaching_worker_health").fetchone()
            self.assertTrue(row['fresh'])

    def test_lease_renews_on_daemon_while_caller_is_blocked_then_joins_and_deletes(self):
        self.health.initialize()
        renewed = threading.Event()
        threads = []
        initial = []
        beat = self.health.beat
        def recorded(role, instance):
            beat(role, instance)
            if threading.current_thread() is not threading.main_thread():
                threads.append(threading.current_thread())
                renewed.set()
            else:
                initial.extend(self.rows())
        with patch.object(teaching_health, '_BEAT_SECONDS', 0.02), patch.object(self.health, 'beat', recorded):
            with self.health.lease('teaching-plan') as instance:
                self.assertEqual(str(uuid.UUID(instance)), instance)
                first = initial[0]
                self.assertEqual(str(first['instance_id']), instance)
                self.assertTrue(self.health.ready(['teaching-plan']))
                self.assertTrue(renewed.wait(3), 'Background beat must run while caller waits')
                self.assertTrue(threads[0].daemon)
                self.assertGreater(self.rows()[0]['expires_at'], first['expires_at'])
        self.assertFalse(threads[0].is_alive())
        self.assertEqual(self.rows(), [])
        self.assertFalse(self.health.ready(['teaching-plan']))

    def test_nested_same_role_leases_delete_only_their_own_instance_on_error(self):
        self.health.initialize()
        with self.health.lease('scheduler') as outer:
            with self.assertRaisesRegex(ValueError, 'body failed'):
                with self.health.lease('scheduler') as inner:
                    self.assertNotEqual(outer, inner)
                    self.assertEqual(len(self.rows()), 2)
                    raise ValueError('body failed')
            self.assertEqual([str(row['instance_id']) for row in self.rows()], [outer])
            self.assertTrue(self.health.ready(['scheduler']))
        self.assertEqual(self.rows(), [])

    def test_background_database_errors_are_quiet_expire_and_recover(self):
        self.health.initialize()
        failed = threading.Event()
        store_connection = self.store.connection
        reader = WorkerHealth(Store(self.store._dsn, self.folder, self.store.profile))
        def broken():
            failed.set()
            raise RuntimeError('private database secret')
        with patch.object(teaching_health, '_BEAT_SECONDS', 0.02), patch('threading.excepthook') as uncaught:
            with self.health.lease('scheduler'):
                with patch.object(self.store, 'connection', broken):
                    self.assertTrue(failed.wait(3))
                    self.assertFalse(self.health.ready(['scheduler']))
                    with store_connection() as conn:
                        conn.execute("UPDATE teaching_worker_health SET expires_at=clock_timestamp()-interval '1 second'")
                    self.assertFalse(reader.ready(['scheduler']))
                deadline = time.monotonic() + 3
                while not self.health.ready(['scheduler']) and time.monotonic() < deadline:
                    threading.Event().wait(0.01)
                self.assertTrue(self.health.ready(['scheduler']))
            uncaught.assert_not_called()
        self.assertEqual(self.rows(), [])

    def test_delete_failure_does_not_mask_body_error_and_leftover_row_expires(self):
        self.health.initialize()
        with ExitStack() as stack:
            with self.assertRaisesRegex(ValueError, 'body failed'):
                with self.health.lease('scheduler') as instance:
                    stack.enter_context(patch.object(self.store, 'connection', side_effect=RuntimeError('private secret')))
                    raise ValueError('body failed')
        self.assertEqual([str(row['instance_id']) for row in self.rows()], [instance])
        with self.store.connection() as conn:
            conn.execute("UPDATE teaching_worker_health SET expires_at=clock_timestamp()-interval '1 second'")
        self.assertFalse(self.health.ready(['scheduler']))


if __name__ == '__main__':
    unittest.main()
