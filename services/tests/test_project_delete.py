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
                'scene_candidates': conn.execute(
                    'SELECT count(*) AS n FROM scene_candidates WHERE scene_id IN '
                    '(SELECT id FROM scenes WHERE project_id=%s)',
                    [project_id],
                ).fetchone()['n'],
                'project_versions': conn.execute(
                    'SELECT count(*) AS n FROM project_versions WHERE project_id=%s', [project_id]
                ).fetchone()['n'],
            }

    def test_delete_removes_project_and_children(self):
        project = self.store.create_project('待删项目', '文稿内容。')
        project = self.store.add_scene(project['id'], 1, '补充章节。', '要点')
        version = self.store.create_version(self.project['id'], 1)
        pid = self.project['id']
        rev = self.project['revision']
        before = self.counts_for_project(pid)
        self.assertGreater(before['scenes'], 0)
        self.store.delete_project(pid, rev, True)
        with self.assertRaisesRegex(StoreError, 'not_found'):
            self.store.get_project(pid)
        after = self.counts_for_project(pid)
        self.assertEqual(after, {k: 0 for k in before})
        with self.assertRaisesRegex(StoreError, 'not_found'):
            self.store.get_version(version['id'])
        self.assertEqual(self.store.get_project(project['id']), project)

    def test_delete_rejects_unconfirmed_and_stale_revision(self):
        pid = self.project['id']
        with self.assertRaisesRegex(StoreError, 'validation'):
            self.store.delete_project(pid, 1, False)
        with self.assertRaisesRegex(StoreError, 'validation'):
            self.store.delete_project(pid, 1, None)
        with self.assertRaisesRegex(StoreError, 'conflict'):
            self.store.delete_project(pid, 2, True)
        self.assertEqual(self.store.get_project(pid), self.project)

    def test_delete_rejects_active_jobs(self):
        from services.projects.jobs import Jobs

        jobs = Jobs(self.store)
        fresh = self.store.create_project('正在生成', '初始文稿。')
        self.addCleanup(self.clean_scene_jobs, fresh['id'])
        job = jobs.submit_generate(fresh['id'], 1)
        with self.assertRaisesRegex(StoreError, 'not_ready'):
            self.store.delete_project(fresh['id'], 1, True)
        self.assertEqual(self.store.get_project(fresh['id']), fresh)
        jobs.cancel(job['id'])
        self.store.delete_project(fresh['id'], 1, True)
        with self.assertRaisesRegex(StoreError, 'not_found'):
            self.store.get_project(fresh['id'])

    def test_delete_with_candidate_and_attempt_fk(self):
        from services.projects.jobs import Jobs

        jobs = Jobs(self.store)
        row = self.project['scenes'][0]
        self.addCleanup(self.clean_scene_jobs, self.project['id'])
        submitted = jobs.submit_regenerate(row['id'], 1)
        running = jobs.claim()
        jobs.fail(running['id'], running['attempt_id'], 'transport_error')
        job = jobs.get(submitted['id'])
        draft = Jobs._draft_scene(row['scene'])
        with self.store.connection() as conn:
            candidate = self.store._create_candidate(
                conn, row['id'], 1, draft, job['id'], job['attempt_id']
            )
        self.assertIsNotNone(candidate['source_attempt_id'])
        pid = self.project['id']
        rev = self.project['revision']
        self.store.delete_project(pid, rev, True)
        with self.assertRaisesRegex(StoreError, 'not_found'):
            self.store.get_project(pid)
        self.assertEqual(self.counts_for_project(pid), {
            'scenes': 0,
            'jobs': 0,
            'job_attempts': 0,
            'scene_candidates': 0,
            'project_versions': 0,
        })


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
