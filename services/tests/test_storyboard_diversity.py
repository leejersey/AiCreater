# services/tests/test_storyboard_diversity.py
import re
import unittest
from services.workflow.providers import storyboard_request

def _prompt_text(body):
    return ' '.join(
        m['content'] if isinstance(m['content'], str) else str(m['content'])
        for m in body['messages'])

class StoryboardDiversityPromptTests(unittest.TestCase):
    def test_shared_action_to_template_guidance_present_on_both_styles(self):
        opener = 'Template selection by teaching action'
        for style in ('popular', 'technical'):
            with self.subTest(style=style):
                body, _ = storyboard_request('解释召回与重排。', 'deepseek-flash', teaching_style=style)
                text = _prompt_text(body)
                self.assertIn(opener, text)
                self.assertIn('title_reveal', text)
                self.assertIn('concept', text)
                self.assertIn('flow_diagram', text)
                self.assertIn('comparison_panel', text)
                self.assertIn('code_walkthrough', text)
                self.assertRegex(text, r'do not invent|without fabricating|only when the script supports', re.I)

    def test_technical_forbids_whole_course_single_flow(self):
        body, _ = storyboard_request('解释召回。', 'deepseek-flash', teaching_style='technical')
        text = _prompt_text(body)
        self.assertIn('Template selection by teaching action', text)
        self.assertIn('Teaching style is technical dry-goods', text)
        self.assertRegex(text, r'single flow|整课|entire (script|course|lesson).{0,40}flow', re.I)

    def test_popular_interleaving_append_present_not_technical(self):
        body, _ = storyboard_request('解释蒸发。', 'deepseek-flash', teaching_style='popular')
        text = _prompt_text(body)
        self.assertNotIn('Teaching style is technical dry-goods', text)
        self.assertRegex(text, r'Teaching style is popular|科普|interleav|穿插', re.I)
        self.assertRegex(text, r'concept|title_reveal|card_sequence', re.I)

    def test_silhouette_selection_delta_strings_on_both_styles(self):
        needles = (
            'Do not split a two-sided contrast into two flow_diagram scenes; use one comparison_panel.',
            'For ordered landing steps use one vertical flow_diagram; do not use icon/step fields to imply a 2x2 grid.',
            'Use code_walkthrough, state_diagram, or execution_timeline only when the script explicitly describes code, mutable state snapshots, or quantified timing; never for metaphor-only scripts.',
            'Optional scene.motif for soft templates only',
            'dialogue_split',
            'means_row',
            'schematic',
        )
        for style in ('popular', 'technical'):
            with self.subTest(style=style):
                body, _ = storyboard_request('解释召回与重排。', 'deepseek-flash', teaching_style=style)
                text = _prompt_text(body)
                for needle in needles:
                    self.assertIn(needle, text)
