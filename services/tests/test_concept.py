import copy
import unittest

from services.workflow.storyboard import validate_storyboard, restore_storyboard, source_parts, validator
from services.workflow.providers import ProviderError, storyboard_request
from services.tts.timing import align_words, time_scene


def concept_draft():
    parts = ['惯性是物体保持原有运动状态的性质', '物体都有惯性', '汽车刹车时乘客身体向前倾', '惯性不是一种力']
    text = '开头🙂 e\u0301。' + '。'.join(parts) + '。'
    return {'id': 'concept1', 'type': 'concept', 'narration': {'text': text}, 'elements': [
        {'id': f'c{i}', 'content': content, 'concept_role': role,
         'cue': {'text_start': text.index(content), 'text_end': text.index(content) + len(content)}}
        for i, (content, role) in enumerate(zip(parts, ['definition', 'feature', 'example', 'summary']))]}


class ConceptTests(unittest.TestCase):
    def test_draft_and_unique_quote_restoration_preserve_original_and_roles(self):
        scene = concept_draft(); text = scene['narration']['text']; before = copy.deepcopy(scene)
        validate_storyboard({'scenes': [scene]}, text)
        wire = copy.deepcopy(scene); wire.pop('narration'); wire['source_part_ids'] = [p['id'] for p in source_parts(text)]
        for element in wire['elements']:
            cue = element['cue']; element['cue'] = {'quote': text[cue['text_start']:cue['text_end']]}
        self.assertEqual(restore_storyboard({'scenes': [wire]}, text, source_parts(text), require_quotes=True), {'scenes': [scene]})
        self.assertEqual(scene, before)
        minimal = copy.deepcopy(scene); minimal['elements'] = minimal['elements'][:1]
        validate_storyboard({'scenes': [minimal]}, text)
        scene['elements'][0]['concept_role'] = 'example'; scene['elements'][2]['concept_role'] = 'definition'
        validate_storyboard({'scenes': [scene]}, text)

    def test_invalid_roles_content_and_cue_order_fail_without_rewriting(self):
        mutations = [lambda s: s['elements'][0].pop('concept_role'),
                     lambda s: s['elements'][0].update(concept_role='feature'),
                     lambda s: s['elements'][1].update(concept_role='definition'),
                     lambda s: s['elements'][1].update(concept_role='summary'),
                     lambda s: s['elements'][0].update(content='惯性是一种力'),
                     lambda s: s['elements'][1].update(cue={'text_start': 0, 'text_end': 2}),
                     lambda s: s['elements'][0].update(role='topic'),
                     lambda s: s['elements'][0].update(icon='idea'),
                     lambda s: s.update(type='card_sequence')]
        for change in mutations:
            scene = concept_draft(); change(scene); before = copy.deepcopy(scene)
            with self.subTest(scene=scene), self.assertRaises(ProviderError):
                validate_storyboard({'scenes': [scene]}, scene['narration']['text'])
            self.assertEqual(scene, before)

    def test_unicode_excerpt_requires_exact_combining_characters(self):
        scene = concept_draft(); element = scene['elements'][0]
        element.update(content='🙂 e\u0301', cue={'text_start': 2, 'text_end': 6})
        validate_storyboard({'scenes': [scene]}, scene['narration']['text'])
        element['content'] = 'é'
        with self.assertRaises(ProviderError): validate_storyboard({'scenes': [scene]}, scene['narration']['text'])

    def test_shared_request_supports_generic_concepts_without_changing_quote_protocol(self):
        for quoted in [True, False]:
            body, parts = storyboard_request(concept_draft()['narration']['text'], 'test-model', cue_quotes=quoted)
            prompt = body['messages'][0]['content']
            self.assertIn('concept_role', prompt); self.assertIn('definition', prompt)
            self.assertNotIn('Create a programming-language or AI teaching video', prompt)
            self.assertIn('source_part_ids', prompt); self.assertIn('code_walkthrough', prompt)
            self.assertIn('source_parts', body['messages'][1]['content'])
            self.assertTrue(parts)

    def test_local_timing_does_not_treat_definition_as_early_topic(self):
        scene = concept_draft(); text = scene['narration']['text']; before = copy.deepcopy(scene)
        words = [{'word': c, 'startTime': i * .1, 'endTime': i * .1 + .08} for i, c in enumerate(text)]
        duration = len(text) * 100
        segments = align_words(text, words, duration)
        final = time_scene(scene, 'audio1', duration, segments)
        self.assertEqual(validator.validate_scene_visuals(final, '/scenes/0'), [])
        self.assertGreater(final['animations'][0]['start_frame'], 6)
        self.assertEqual([e['concept_role'] for e in final['elements']], [e['concept_role'] for e in scene['elements']])
        self.assertEqual(scene, before)
