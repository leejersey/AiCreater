import os
import unittest

from services.projects.store import StoreError
from services.tests.test_projects import ProjectFixture


@unittest.skipUnless(os.environ.get('TEST_DATABASE_URL'), 'Use disposable PostgreSQL')
class ProjectDeleteStoreTests(ProjectFixture, unittest.TestCase):
    def clean_scene_jobs(self, project_id):
        with self.store.connection() as conn:
            conn.execute(
                "UPDATE jobs SET state='cancelled' WHERE project_id=%s AND state IN ('queued','running')",
                [project_id],
            )
            conn.execute(
                "UPDATE job_attempts SET state='cancelled' WHERE job_id IN "
                "(SELECT id FROM jobs WHERE project_id=%s) AND state='running'",
                [project_id],
            )

    def counts_for_project(self, project_id):
        with self.store.connection() as conn:
            return {
                'scenes': conn.execute(
                    'SELECT count(*) AS n FROM scenes WHERE project_id=%s', [project_id]
                ).fetchone()['n'],
                'jobs': conn.execute(
                    'SELECT count(*) AS n FROM jobs WHERE project_id=%s', [project_id]
                ).fetchone()['n'],
                'job_attempts': conn.execute(
                    'SELECT count(*) AS n FROM job_attempts WHERE job_id IN '
                    '(SELECT id FROM jobs WHERE project_id=%s)',
                    [project_id],
                ).fetchone()['n'],
            }

    def test_delete_rejects_unconfirmed_and_stale_revision(self):
        pid = self.project['id']
        with self.assertRaisesRegex(StoreError, 'validation'):
            self.store.delete_project(pid, 1, False)
        with self.assertRaisesRegex(StoreError, 'validation'):
            self.store.delete_project(pid, 1, None)
        with self.assertRaisesRegex(StoreError, 'conflict'):
            self.store.delete_project(pid, 2, True)
        self.assertEqual(self.store.get_project(pid), self.project)

class ProjectDeleteApiOfflineTests(unittest.TestCase):
    def test_delete_route_validates_and_delegates(self):
        from fastapi.testclient import TestClient
        from services.api.app import create_app
        from unittest.mock import MagicMock

        store = MagicMock()
        store.initialize = MagicMock()

        def delete_impl(_project_id, _expected_revision, confirmed):
            if confirmed is not True:
                raise StoreError('validation', 'Explicit project deletion confirmation required')

        store.delete_project.side_effect = delete_impl
        app = create_app(store, authentication=False)
        with TestClient(app, base_url='http://127.0.0.1:8000', client=('127.0.0.1', 50000)) as client:
            app.state.jobs = MagicMock()
            ok = client.post('/api/projects/p/delete', json={'expected_revision': 1, 'confirmed': True})
            self.assertEqual(ok.status_code, 200)
            self.assertEqual(ok.json(), {'ok': True})
            store.delete_project.assert_called_once_with('p', 1, True)

            store.delete_project.reset_mock()
            bad = client.post('/api/projects/p/delete', json={'expected_revision': 1, 'confirmed': False})
            self.assertEqual(bad.status_code, 422)
            store.delete_project.assert_called_once_with('p', 1, False)

        with TestClient(
            create_app(store, authentication=False),
            base_url='http://127.0.0.1:8000',
            client=('192.0.2.1', 50000),
        ) as remote:
            self.assertEqual(
                remote.post('/api/projects/p/delete', json={'expected_revision': 1, 'confirmed': True}).status_code,
                403,
            )
