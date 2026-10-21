import copy
import unittest
from services.workflow.storyboard import validate_storyboard, REFERENCE_SCHEMA
from services.workflow.providers import ProviderError
from services.tts.timing import time_scene
from services.projects.jobs import Jobs


def draft():
    text = '等待消息，订单A，取消订单。'
    labels = ['等待消息', '订单A', '取消订单']
    return {'id': 'conversation', 'type': 'card_sequence', 'motif': 'dialogue_split',
            'narration': {'text': text},
            'elements': [{'id': f'e{i}', 'content': s, 'cue': {'text_start': text.index(s), 'text_end': text.index(s)+len(s)}} for i,s in enumerate(labels)],
            'dialogue': {'messages': ['e1','e2'], 'state': 'e0'},
            'visual_actions': [{'kind': 'update', 'target': 'e0', 'source': 'e2', 'cue': {'text_start': 9, 'text_end': 13}}]}


def process_draft():
    text = '提出调用，取消订单A，校验参数，失败拒绝，通过后执行工具，等待真实结果。'
    labels = ['提出调用', '校验参数', '执行工具', '真实结果', '取消订单A', '失败拒绝']
    return {'id': 'process', 'type': 'flow_diagram', 'narration': {'text': text},
            'elements': [{'id': f'e{i}', 'content': s, 'cue': {'text_start': text.index(s), 'text_end': text.index(s)+len(s)}} for i,s in enumerate(labels)],
            'process': {'stages': ['e0','e1','e2','e3'], 'details': ['e4','e5']},
            'edges': [{'from': 'e0', 'to': 'e1'}, {'from': 'e1', 'to': 'e2'}, {'from': 'e2', 'to': 'e3'}]}


def funnel_draft():
    text = '在这个示例中，先过规则，再到小模型，最后到大模型。能力提高，成本提高，总结逐层升级。'
    labels = ['规则', '小模型', '大模型', '能力提高', '成本提高', '逐层升级']
    return {'id': 'layers', 'type': 'card_sequence', 'motif': 'funnel', 'narration': {'text': text},
            'elements': [{'id': f'e{i}', 'content': s, 'cue': {'text_start': text.index(s), 'text_end': text.index(s)+len(s)}, **({'panel_style': 'conclusion'} if i == 5 else {})} for i,s in enumerate(labels)],
            'funnel': {'layers': ['e0','e1','e2'], 'notes': [{'element_id':'e3','direction':'down'}, {'element_id':'e4','direction':'down'}, {'element_id':'e5','target':'e2'}]}}


class TeachingDiagramTests(unittest.TestCase):
    def test_annotated_funnel_timing_and_source_bound_notes(self):
        raw = funnel_draft(); text = raw['narration']['text']
        validate_storyboard({'scenes': [raw]}, text)
        segments = [{'text_start':i,'text_end':i+1,'start_ms':i*100,'end_ms':(i+1)*100} for i in range(len(text))]
        self.assertEqual(Jobs._draft_scene(time_scene(raw, 'audio', len(text)*100, segments))['funnel'], raw['funnel'])
        for mode in ['unknown','duplicate','missing','direction','target','unquoted','early_source']:
            d = copy.deepcopy(raw)
            if mode == 'unknown': d['funnel']['notes'][0]['element_id'] = 'missing'
            if mode == 'duplicate': d['funnel']['notes'][0]['element_id'] = 'e0'
            if mode == 'missing': d['funnel']['notes'].pop()
            if mode == 'direction': d['funnel']['notes'][0]['direction'] = 'left'
            if mode == 'target': d['funnel']['notes'][-1]['target'] = 'missing'
            if mode == 'unquoted': d['elements'][-1]['content'] = '并不存在'
            if mode == 'early_source': d['elements'][0]['source_label'] = '成本提高'
            with self.subTest(mode=mode), self.assertRaises(ProviderError): validate_storyboard({'scenes':[d]}, text)

    def test_validate_retime_and_strip_preserve_explicit_groups(self):
        d = draft()
        validate_storyboard({'scenes': [d]}, d['narration']['text'])
        segments = [{'text_start': i, 'text_end': i+1, 'start_ms': i*100, 'end_ms': (i+1)*100} for i in range(len(d['narration']['text']))]
        timed = time_scene(d, 'audio', 2000, segments)
        self.assertEqual(timed['dialogue'], d['dialogue'])
        self.assertEqual(Jobs._draft_scene(timed)['dialogue'], d['dialogue'])

    def test_unknown_duplicate_missing_and_unquoted_binding_rejected(self):
        for mode in ['unknown', 'duplicate', 'missing', 'invented', 'too_long']:
            d = draft()
            if mode == 'unknown': d['dialogue']['state'] = 'missing'
            if mode == 'duplicate': d['dialogue']['messages'].append('e0')
            if mode == 'missing': d['dialogue']['messages'].pop()
            if mode == 'invented': d['elements'][1]['content'] = '并不存在'
            if mode == 'too_long': d['elements'][0]['content'] = '字'*17
            with self.subTest(mode=mode), self.assertRaises(ProviderError):
                validate_storyboard({'scenes': [d]}, d['narration']['text'])

    def test_process_groups_survive_timing_and_reject_detail_edges(self):
        d = process_draft()
        validate_storyboard({'scenes': [d]}, d['narration']['text'])
        segments = [{'text_start': i, 'text_end': i+1, 'start_ms': i*100, 'end_ms': (i+1)*100} for i in range(len(d['narration']['text']))]
        timed = time_scene(d, 'audio', 5000, segments)
        self.assertEqual(Jobs._draft_scene(timed)['process'], d['process'])
        d['edges'].append({'from': 'e0', 'to': 'e4'})
        with self.assertRaises(ProviderError): validate_storyboard({'scenes': [d]}, d['narration']['text'])

    def test_not_advertised_to_online_models_until_director_integration(self):
        props = REFERENCE_SCHEMA['definitions']['Scene']['properties']
        self.assertNotIn('dialogue', props)
        self.assertNotIn('process', props)
        self.assertNotIn('Dialogue', REFERENCE_SCHEMA['definitions'])
        self.assertNotIn('Process', REFERENCE_SCHEMA['definitions'])
        self.assertNotIn('funnel', props)
        self.assertNotIn('Funnel', REFERENCE_SCHEMA['definitions'])
