import json
import subprocess
import sys
import tempfile
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
SCRIPT = ROOT / 'services/tests/run_queue_smoke.py'

class QueueSmokeCliTests(unittest.TestCase):
    def test_help_does_not_start_services(self):
        result = subprocess.run([sys.executable, str(SCRIPT), '--help'], capture_output=True, text=True, timeout=10)
        self.assertEqual(result.returncode, 0)
        self.assertIn('No paid', result.stdout)

    def test_rustfs_missing_sample_still_fails_before_starting_services(self):
        with tempfile.TemporaryDirectory() as folder:
            destination = Path(folder) / 'not-created'
            result = subprocess.run([sys.executable, str(SCRIPT), '--rustfs', '--project', str(Path(folder)/'missing.json'),
                                     '--output', str(destination)], capture_output=True, text=True, timeout=10)
            self.assertEqual(result.returncode, 1)
            self.assertEqual(json.loads(result.stdout)['code'], 'sample_missing')
            self.assertFalse(destination.exists())

    def test_missing_sample_is_rejected_before_creating_output(self):
        with tempfile.TemporaryDirectory() as folder:
            destination = Path(folder) / 'not-created'
            result = subprocess.run([sys.executable, str(SCRIPT), '--project', str(Path(folder)/'missing.json'),
                                     '--output', str(destination)], capture_output=True, text=True, timeout=10)
            self.assertEqual(result.returncode, 1)
            self.assertEqual(json.loads(result.stdout)['code'], 'sample_missing')
            self.assertFalse(destination.exists())
