"""Offline failure classification; synthetic probes are not historical scene replay."""
import json
import os
from pathlib import Path
import re
import shutil
import subprocess
import unittest


ROOT = Path(__file__).resolve().parents[2]
FIXTURE = ROOT / 'packages/custom-scenes/tests/fixtures/teaching-runtime-failures-v1.json'


class TeachingRuntimeBaselineTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.baseline = json.loads(FIXTURE.read_text(encoding='utf-8'))
        cls.cases = {case['id']: case for case in cls.baseline['cases']}

    def test_registry_is_minimal_sanitized_and_explicit_about_provenance(self):
        self.assertEqual(self.baseline['schemaVersion'], 'teaching-runtime-failures:1')
        self.assertEqual(len(self.cases), 3)
        self.assertEqual(set(self.cases), {'legacy-layout', 'legacy-provider-json', 'executor-missing'})
        self.assertEqual(set(self.baseline), {'schemaVersion', 'sanitization', 'evidence', 'cases'})
        evidence = self.baseline['evidence']
        self.assertEqual(len(evidence), 6)
        self.assertEqual(len({item['path'] for item in evidence}), 6)
        for item in evidence:
            self.assertEqual(set(item), {'id', 'path', 'sha256'})
            self.assertRegex(item['sha256'], r'^[a-f0-9]{64}$')
            self.assertRegex(item['path'], r'^output/visual-workbench/[a-f0-9-]{36}/(failure|provider-1.failure|generation-mode)\.json$')
        ids = {item['id'] for item in evidence}
        for case in self.cases.values():
            self.assertEqual(set(case), {'id', 'category', 'layer', 'generation_mode', 'provenance', 'input', 'expected'})
            self.assertEqual(set(case['provenance']), {'form', 'evidence_ids', 'historical_replay', 'limitation'})
            self.assertFalse(case['provenance']['historical_replay'])
            self.assertTrue(case['provenance']['limitation'])
            self.assertTrue(set(case['provenance']['evidence_ids']) <= ids)
        text = json.dumps(self.baseline)
        self.assertLess(len(text.encode()), 12 * 1024)
        self.assertIsNone(re.search(r'/Users/|/home/|[A-Za-z]:\\|https?://|sk-[A-Za-z0-9]{12}|Authorization|api[_-]?key|\.env', text, re.I))
        self.assertIsNone(re.search(r'"(?:narration|prompt|messages|content|source|manuscript)"\s*:', text))

    def test_legacy_records_keep_source_mode_and_distinct_error_layers(self):
        layout, provider = self.cases['legacy-layout'], self.cases['legacy-provider-json']
        for case in (layout, provider):
            self.assertEqual(case['generation_mode'], 'source')
            self.assertEqual(case['provenance']['form'], 'sanitized-minimal-reproduction')
            self.assertEqual(len(case['provenance']['evidence_ids']), 3)
            self.assertEqual(case['expected']['requests_dispatched'], 1)
            self.assertEqual(case['expected']['automatic_retries'], 0)
            self.assertFalse(case['expected']['accepted'])
        self.assertEqual((layout['layer'], layout['expected']['code']), ('design', 'layout_preflight'))
        self.assertEqual(layout['expected']['recorded_finding_counts'], {'object-overlap': 6})
        self.assertEqual((provider['layer'], provider['expected']['code']), ('provider', 'invalid_json'))
        self.assertEqual(provider['expected']['executable_artifact'], False)

    def test_synthetic_layout_triggers_existing_preflight_not_original_scene(self):
        self.assertIsNotNone(shutil.which('node'), 'Local Node runtime is required')
        self.assertTrue((ROOT / 'node_modules/tsx').is_dir(), 'Install repository dependencies before running')
        script = """
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {assertDesignLayout, LayoutPreflightError} from './packages/custom-scenes/src/design-layout.ts';
const item = JSON.parse(readFileSync(0, 'utf8'));
assert.throws(() => assertDesignLayout(item.input), error =>
  error instanceof LayoutPreflightError && error.code === item.expected.code &&
  error.findings.length === 1 && error.findings[0].kind === item.expected.probe_finding);
const separated = structuredClone(item.input);
separated.objects[1].x = 500;
assert.doesNotThrow(() => assertDesignLayout(separated));
"""
        # Only the pure bounds checker is imported; no provider, CLI, or renderer.
        env = {key: os.environ[key] for key in ('PATH', 'SYSTEMROOT') if key in os.environ}
        env['TSX_DISABLE_CACHE'] = '1'
        result = subprocess.run(
            ['node', '--import', 'tsx', '--input-type=module', '-e', script],
            cwd=ROOT, env=env, input=json.dumps(self.cases['legacy-layout']),
            text=True, capture_output=True, timeout=30,
        )
        self.assertEqual(result.returncode, 0, result.stderr)

    def test_synthetic_bad_json_is_rejected_by_standard_decoder_only(self):
        case = self.cases['legacy-provider-json']
        self.assertEqual(case['input']['checker'], 'stdlib-json-decode')
        for value in case['input']['invalid_json']:
            with self.subTest(value=value), self.assertRaises(json.JSONDecodeError):
                json.loads(value)
        self.assertEqual(json.loads(case['input']['valid_json']), {'value': 0})
        # shortcut: no new-provider integration here; add its offline rejection test when its API is available.
        self.assertFalse(case['expected']['new_provider_verified'])

    def test_observed_missing_executor_is_not_generation_latency_or_success(self):
        case = self.cases['executor-missing']
        self.assertEqual(case['provenance']['form'], 'observed')
        self.assertEqual(case['provenance']['evidence_ids'], [])
        self.assertIsNone(case['generation_mode'])
        self.assertEqual(case['input'], {'executor': 'missing', 'state': 'queued', 'queue_wait_seconds': 480})
        self.assertEqual(case['category'], 'infrastructure')
        self.assertEqual(case['layer'], 'executor')
        self.assertEqual(case['expected'], {
            'code': 'executor_missing', 'classification': 'blocked_before_generation',
            'generation_slow': False, 'generation_duration_seconds': None,
            'success': False, 'accepted': False, 'execution': 'not_run',
        })


if __name__ == '__main__':
    unittest.main()
