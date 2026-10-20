import unittest

from services.workflow.storyboard import coerce_storyboard_draft


class MotifCoerceTests(unittest.TestCase):
    def test_invalid_motif_on_code_is_dropped(self):
        draft = {'scenes': [{
            'type': 'code_walkthrough', 'motif': 'funnel',
            'elements': [{'id': 'a', 'content': '步骤', 'cue': {'text_start': 0, 'text_end': 2}}],
            'code': {'language': 'python', 'source': 'x=1'},
        }]}
        coerce_storyboard_draft(draft)
        self.assertNotIn('motif', draft['scenes'][0])

    def test_valid_funnel_on_card_is_kept(self):
        draft = {'scenes': [{
            'type': 'card_sequence', 'motif': 'funnel',
            'elements': [
                {'id': 'a', 'content': '上层', 'cue': {'text_start': 0, 'text_end': 2}},
                {'id': 'b', 'content': '中层', 'cue': {'text_start': 2, 'text_end': 4}},
                {'id': 'c', 'content': '下层', 'cue': {'text_start': 4, 'text_end': 6}},
            ],
        }]}
        coerce_storyboard_draft(draft)
        self.assertEqual(draft['scenes'][0]['motif'], 'funnel')
