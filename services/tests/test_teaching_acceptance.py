import json
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

from services.tests.run_teaching_acceptance import check_case, load_cases, summarize


class TeachingAcceptanceTests(unittest.TestCase):
    def test_twenty_fixed_inputs_cover_languages_and_boundaries(self):
        cases = load_cases()
        self.assertEqual(len(cases), 20)
        self.assertEqual(sum(c['domain'] == 'programming' for c in cases), 8)
        self.assertEqual({c['language'] for c in cases if 'language' in c}, {'python', 'javascript', 'typescript'})
        coverage = {tag for c in cases for tag in c['coverage']}
        self.assertTrue({'repeat', 'mixed', 'numbers', 'punctuation', 'emoji', 'short', 'long', 'long-label'} <= coverage)

    def test_corpus_templates_match_runtime_schema(self):
        from services.projects.store import validator
        supported = set(validator.SCHEMA['definitions']['Scene']['properties']['type']['enum'])
        self.assertLessEqual({case['type'] for case in load_cases()}, supported)

    def test_legacy_template_name_is_rejected(self):
        cases = load_cases()
        cases[0]['type'] = 'bullet_cards'
        with patch('services.tests.run_teaching_acceptance.Path.read_text', return_value=json.dumps(cases)):
            with self.assertRaisesRegex(ValueError, 'invalid_corpus'): load_cases()

    def test_card_sequence_cases_are_accepted(self):
        self.assertEqual(sum(case['type'] == 'card_sequence' for case in load_cases()), 6)

    def test_missing_artifacts_are_not_counted_as_success(self):
        with tempfile.TemporaryDirectory() as directory:
            result = check_case(load_cases()[0], Path(directory), Path(directory))
        self.assertEqual(result['code'], 'missing_artifacts')
        report = summarize([result] * 20)
        self.assertEqual(report['passed'], 0)
        self.assertFalse(report['structural_passed'])
        self.assertEqual(report['formal_acceptance'], 'pending')

    def test_changed_script_is_rejected_before_media_process(self):
        with tempfile.TemporaryDirectory() as directory:
            folder = Path(directory)
            for name in ['video.mp4', 'video.srt']: (folder / name).write_bytes(b'x')
            (folder / 'project.json').write_text(json.dumps({'scenes': [{'narration': {'text': 'changed'}}]}))
            with patch('services.tests.run_teaching_acceptance.final_valid'), patch('services.tests.run_teaching_acceptance.subprocess.run') as child:
                result = check_case(load_cases()[0], folder, folder)
                child.assert_not_called()
        self.assertEqual(result['code'], 'script_changed')

    def test_template_and_language_are_required_and_child_has_no_credentials(self):
        case = load_cases()[0]
        with tempfile.TemporaryDirectory() as directory:
            folder = Path(directory)
            for name in ['video.mp4', 'video.srt']: (folder / name).write_bytes(b'x')
            scene = {'narration': {'text': case['script']}, 'type': 'card_sequence', 'duration_frames': 30}
            file = folder / 'project.json'
            file.write_text(json.dumps({'scenes': [scene]}))
            with patch('services.tests.run_teaching_acceptance.final_valid'), patch('services.tests.run_teaching_acceptance.subprocess.run') as child:
                self.assertEqual(check_case(case, folder, folder)['code'], 'teaching_template_missing')
                child.assert_not_called()
                scene.update(type='code_walkthrough', code={'language': 'javascript'})
                file.write_text(json.dumps({'scenes': [scene]}))
                self.assertEqual(check_case(case, folder, folder)['code'], 'teaching_template_missing')
                scene['code']['language'] = 'python'
                file.write_text(json.dumps({'scenes': [scene]}))
                with patch.dict('os.environ', {'RUSTFS_SECRET_KEY': 'do-not-pass', 'DEEPSEEK_API_KEY': 'do-not-pass'}):
                    self.assertEqual(check_case(case, folder, folder)['status'], 'passed')
                self.assertEqual(child.call_count, 2)
                self.assertNotIn('RUSTFS_SECRET_KEY', child.call_args.kwargs['env'])
                self.assertNotIn('DEEPSEEK_API_KEY', child.call_args.kwargs['env'])

    def test_symlink_deliverable_is_rejected(self):
        with tempfile.TemporaryDirectory() as directory:
            folder = Path(directory)
            for name in ['project.json', 'video.mp4']: (folder / name).write_bytes(b'x')
            (folder / 'video.srt').symlink_to(folder / 'project.json')
            self.assertEqual(check_case(load_cases()[0], folder, folder)['code'], 'unsafe_path')

    def test_eighteen_structural_passes_do_not_claim_formal_teaching_acceptance(self):
        results = [{'status': 'passed'}] * 18 + [{'status': 'failed'}] * 2
        report = summarize(results)
        self.assertTrue(report['structural_passed'])
        self.assertEqual(report['formal_acceptance'], 'pending')
        self.assertEqual(report['paid_calls'], 0)
        self.assertIn('synchronization_listening', report['pending'])
