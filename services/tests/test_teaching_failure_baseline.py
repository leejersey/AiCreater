"""Pure offline replay of invalid request-budget inputs; never opens a database."""
import json
from pathlib import Path
import unittest
from services.projects.store import StoreError
from services.visual.store import VisualJobs

class TeachingFailureBudgetTests(unittest.TestCase):
    def test_sanitized_budget_cases_stop_before_database_or_provider_access(self):
        file=Path(__file__).resolve().parents[2]/'packages/custom-scenes/tests/fixtures/teaching-failures-v1.json'
        cases=[c for c in json.loads(file.read_text())['cases'] if c['checker']=='python-budget']
        self.assertTrue(cases)
        for case in cases:
            for value in case['input']['invalid']:
                with self.subTest(case=case['id'],value=value):
                    with self.assertRaises(StoreError) as raised:
                        VisualJobs(None).generate('fixture-project','fixture-scene',1,value['confirmed'],value['max_requests'])
                    self.assertEqual(raised.exception.code,case['expected']['code'])
