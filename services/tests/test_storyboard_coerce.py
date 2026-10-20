"""Provider draft coercion keeps common model mistakes from failing schema checks."""
import copy
import unittest

from services.tests.test_generation import outline
from services.workflow.storyboard import coerce_storyboard_draft, validate_storyboard


class StoryboardCoerceTests(unittest.TestCase):
    def test_comparison_with_three_elements_becomes_card_sequence(self):
        draft = outline('甲。乙。丙。')
        scene = draft['scenes'][0]
        scene['type'] = 'comparison_panel'
        scene['elements'] = [
            {'id': 'a', 'content': '甲', 'cue': {'text_start': 0, 'text_end': 1}},
            {'id': 'b', 'content': '乙', 'cue': {'text_start': 2, 'text_end': 3}},
            {'id': 'c', 'content': '丙', 'cue': {'text_start': 4, 'text_end': 5}},
        ]
        scene['edges'] = [{'from': 'a', 'to': 'b'}]
        coerce_storyboard_draft(draft)
        self.assertEqual(scene['type'], 'card_sequence')
        self.assertNotIn('edges', scene)
        validate_storyboard(draft, '甲。乙。丙。')

    def test_concept_without_definition_becomes_card_sequence(self):
        draft = outline('定义句。')
        scene = draft['scenes'][0]
        scene['type'] = 'concept'
        for element in scene['elements']:
            element['concept_role'] = 'feature'
        coerce_storyboard_draft(draft)
        self.assertEqual(scene['type'], 'card_sequence')
        self.assertTrue(all('concept_role' not in e for e in scene['elements']))
        validate_storyboard(draft, '定义句。')

    def test_concept_paraphrase_is_replaced_with_cue_excerpt(self):
        text = '惯性是物体保持原有运动状态的性质。物体都有惯性。'
        draft = outline(text)
        scene = draft['scenes'][0]
        scene['type'] = 'concept'
        scene['elements'] = [
            {'id': 'def', 'content': '惯性是一种性质', 'concept_role': 'definition',
             'cue': {'text_start': 0, 'text_end': 16}},
            {'id': 'feat', 'content': '物体都有惯性', 'concept_role': 'feature',
             'cue': {'text_start': 17, 'text_end': 23}},
        ]
        coerce_storyboard_draft(draft)
        self.assertEqual(scene['type'], 'concept')
        self.assertEqual(scene['elements'][0]['content'], '惯性是物体保持原有运动状态的性质')
        self.assertEqual(scene['elements'][1]['content'], '物体都有惯性')
        validate_storyboard(draft, text)

    def test_foreign_code_fields_are_stripped_from_flow(self):
        draft = outline('流程。')
        scene = draft['scenes'][0]
        scene['type'] = 'flow_diagram'
        scene['edges'] = []
        scene['elements'][0]['code_lines'] = [1]
        scene['elements'][0]['variables'] = []
        scene['elements'][0]['output'] = ''
        scene['elements'][0]['concept_role'] = 'definition'
        coerce_storyboard_draft(draft)
        element = scene['elements'][0]
        self.assertNotIn('code_lines', element)
        self.assertNotIn('variables', element)
        self.assertNotIn('output', element)
        self.assertNotIn('concept_role', element)
        # Empty edges still fail visual checks; only assert coercion removed foreign fields.
        self.assertEqual(scene['type'], 'flow_diagram')
