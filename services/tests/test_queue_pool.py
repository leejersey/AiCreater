import unittest


class QueuePoolTests(unittest.TestCase):
    def test_single_slot_uses_solo_pool_with_external_job_subprocess(self):
        from services.workflow.queue import app
        self.assertEqual(app.conf.worker_pool, 'solo')
        self.assertEqual(app.conf.worker_concurrency, 1)
