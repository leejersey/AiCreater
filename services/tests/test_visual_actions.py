import copy
import unittest

from services.workflow.storyboard import validate_storyboard, REFERENCE_SCHEMA
from services.workflow.providers import ProviderError
from services.tts.timing import time_scene
from services.projects.jobs import Jobs
from services.projects.store import draft_valid


def draft():
    return {'id': 'actions', 'type': 'card_sequence', 'narration': {'text': '🙂规则，再看上下文，最后模型。'},
            'elements': [
                {'id': 'a', 'content': '规则', 'cue': {'text_start': 1, 'text_end': 3}},
                {'id': 'b', 'content': '上下文', 'cue': {'text_start': 6, 'text_end': 9}},
                {'id': 'c', 'content': '模型', 'cue': {'text_start': 12, 'text_end': 14}}],
            'visual_actions': [
                {'kind': 'connect', 'target': 'a', 'to': 'b', 'cue': {'text_start': 6, 'text_end': 9}},
                {'kind': 'highlight', 'target': 'b', 'cue': {'text_start': 6, 'text_end': 9}},
                {'kind': 'update', 'target': 'a', 'source': 'c', 'cue': {'text_start': 12, 'text_end': 14}}]}


class VisualActionTests(unittest.TestCase):
    def test_actions_are_not_advertised_to_online_models_before_director_integration(self):
        self.assertNotIn('visual_actions', REFERENCE_SCHEMA['definitions']['Scene']['properties'])

    def test_canonical_draft_validation_and_real_word_time_mapping(self):
        d = draft(); original = copy.deepcopy(d)
        validate_storyboard({'scenes': [d]}, d['narration']['text'])
        segments = [{'text_start': i, 'text_end': i+1, 'start_ms': i*100, 'end_ms': (i+1)*100}
                    for i in range(len(d['narration']['text']))]
        s = time_scene(d, 'audio', 2000, segments)
        self.assertEqual([a['start_frame'] for a in s['visual_actions']], [24, 24, 42])
        self.assertTrue(all(a['duration_frames'] >= 1 for a in s['visual_actions']))
        self.assertEqual(d, original)
        stripped = Jobs._draft_scene(s)
        self.assertEqual(stripped['visual_actions'], d['visual_actions'])
        draft_valid({'scenes': [s]})

    def test_invalid_source_cue_unknown_reference_and_overload_rejected(self):
        variants = []
        d = draft(); d['visual_actions'][2]['source'] = 'missing'; variants.append(d)
        d = draft(); d['visual_actions'][2]['cue'] = {'text_start': 6, 'text_end': 9}; variants.append(d)
        d = draft(); d['visual_actions'].reverse(); variants.append(d)
        d = draft(); d['visual_actions'] *= 5; variants.append(d)
        for d in variants:
            with self.subTest(d=d), self.assertRaises(ProviderError):
                validate_storyboard({'scenes': [d]}, d['narration']['text'])

    def test_action_without_aligned_speech_fails_instead_of_guessing(self):
        d = draft(); d['visual_actions'][0]['cue'] = {'text_start': 4, 'text_end': 5}
        segments = [{'text_start': a['cue']['text_start'], 'text_end': a['cue']['text_end'],
                     'start_ms': i*200, 'end_ms': (i+1)*200} for i,a in enumerate(d['elements'])]
        with self.assertRaises(ProviderError):
            time_scene(d, 'audio', 2000, segments)
