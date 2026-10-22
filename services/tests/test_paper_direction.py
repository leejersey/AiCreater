import copy
import io
import json
import unittest
from contextlib import redirect_stdout
from unittest.mock import patch

from services.projects.jobs import Jobs
from services.tts.timing import align_words, time_scene
from services.workflow.paper_direction import apply_paper_direction
from services.workflow.storyboard import validate_storyboard


def scene(scene_id, text, elements, kind='card_sequence'):
    return {'id': scene_id, 'type': kind, 'narration': {'text': text}, 'elements': elements}


def element(element_id, content, start, end, **extra):
    return {'id': element_id, 'content': content, 'cue': {'text_start': start, 'text_end': end}, **extra}


def lesson(*scenes):
    return {'scenes': list(scenes)}


class PaperDirectionTests(unittest.TestCase):
    def test_section_arc_keywords_vectors_and_curve_revisit(self):
        draft = lesson(
            scene('s0', '甲。', [element('a', '甲', 0, 1)]),
            scene('s1', '乙。', [element('b', '乙', 0, 1)]),
            scene('s2', '丙。', [element('c', '丙', 0, 1)]),
            scene('s3', '丁。', [element('d', '丁', 0, 1)]),
            scene('s4', '戊。', [element('e', '戊', 0, 1)]),
            scene('s5', '己。', [element('f', '己', 0, 1)]),
        )
        apply_paper_direction(draft)
        self.assertEqual([s['section'] for s in draft['scenes']],
                         ['intro', 'two_extremes', 'solution', 'layers', 'tradeoff', 'conclusion'])

        directed = lesson(
            scene('intro', '先看问题。', [element('t', '先看问题', 0, 4, role='topic')], 'title_reveal'),
            scene('risk', '一方面有风险。', [element('w', '风险', 4, 6, icon='warning')]),
            scene('funnel', '漏斗过滤噪声。', [
                element('l1', '漏斗', 0, 2), element('l2', '过滤', 2, 4), element('l3', '噪声', 4, 6)]),
            scene('curve', '方案画出曲线。', [element('c1', '方案', 0, 2), element('c2', '曲线', 4, 6)]),
            scene('again', '曲线继续增长。', [element('c3', '曲线', 0, 2), element('c4', '增长', 2, 4)]),
            scene('end', '最后记住结论。', [element('z', '记住结论', 2, 6, role='topic')], 'title_reveal'),
        )
        cues = copy.deepcopy([[e['cue'] for e in s['elements']] for s in directed['scenes']])
        apply_paper_direction(directed)
        self.assertEqual([s['section'] for s in directed['scenes']],
                         ['intro', 'two_extremes', 'layers', 'solution', 'two_extremes', 'conclusion'])
        self.assertNotIn('vector', directed['scenes'][0])
        self.assertNotIn('vector', directed['scenes'][1])
        self.assertEqual(directed['scenes'][2]['vector'], {'kind': 'dot_funnel'})
        self.assertEqual(directed['scenes'][3]['vector'], {'kind': 'stroke_curve'})
        self.assertEqual(directed['scenes'][4]['vector'], {'kind': 'stroke_curve'})
        self.assertEqual(directed['scenes'][3]['camera'], {'x': 960, 'y': 470, 'scale': 1.12})
        self.assertEqual(directed['scenes'][4]['camera']['scale'], 1.38)
        self.assertGreater(directed['scenes'][4]['camera']['scale'], directed['scenes'][3]['camera']['scale'])
        self.assertEqual([e['cue'] for e in directed['scenes'][2]['elements']], cues[2])
        self.assertNotIn('chart', directed['scenes'][3])
        self.assertEqual(directed['scenes'][0]['elements'][0]['entrance'], 'scale_pop')
        self.assertEqual(directed['scenes'][1]['elements'][0]['entrance'], 'shake')
        self.assertEqual([e['entrance'] for e in directed['scenes'][2]['elements']], ['draw', 'draw', 'draw'])
        self.assertEqual(directed['scenes'][5]['elements'][0]['entrance'], 'scale_pop')
        again = copy.deepcopy(directed)
        apply_paper_direction(again)
        self.assertEqual(again, directed)
        meter = lesson(
            scene('a', '甲。', [element('a', '甲', 0, 1)]),
            scene('g', '仪表越过红线。', [element('m', '仪表', 0, 2), element('z', '红线', 4, 6)]),
            scene('b', '乙。', [element('b', '乙', 0, 1)]),
        )
        apply_paper_direction(meter)
        self.assertEqual(meter['scenes'][1]['vector'], {'kind': 'gauge'})
        self.assertEqual([item['entrance'] for item in meter['scenes'][1]['elements']], ['fade_slide', 'draw'])
        self.assertNotIn('chart', meter['scenes'][1])

    def test_shake_once_and_two_emphasis_effects_per_scene(self):
        warnings = lesson(*[
            scene(f's{i}', '注意风险。', [element('w', '风险', 2, 4, icon='warning')]) for i in range(4)
        ])
        apply_paper_direction(warnings)
        shakes = [s['elements'][0]['entrance'] for s in warnings['scenes']]
        self.assertEqual(shakes.count('shake'), 1)
        self.assertEqual(shakes[0], 'shake')
        self.assertTrue(all(effect == 'fade_slide' for effect in shakes[1:]))

        crowded = lesson(scene('s', '重点结论定义关键。', [
            element('t', '主题', 0, 2, role='topic'),
            element('a', '重点', 0, 2),
            element('b', '结论', 2, 4),
            element('c', '定义', 4, 6, highlight={'text_start': 0, 'text_end': 1}),
        ]))
        apply_paper_direction(crowded)
        entrances = [e['entrance'] for e in crowded['scenes'][0]['elements']]
        self.assertEqual(entrances[0], 'scale_pop')
        self.assertEqual(entrances[1], 'box')
        self.assertEqual(entrances[2:], ['fade_slide', 'fade_slide'])

    def test_vectors_skip_code_charts_concepts_titles_and_long_lists(self):
        chart = {'kind': 'proportion', 'title': '占比', 'unit': '份', 'source_note': '示意', 'data': [{'values': [3]}]}
        coded = scene('code', '曲线增长。', [element('a', '曲线', 0, 2)], 'code_walkthrough')
        coded['code'] = {'language': 'python', 'source': 'x = 1'}
        charted = scene('chart', '仪表越过红线。', [element('a', '仪表', 0, 2)], 'data_chart')
        charted['chart'] = copy.deepcopy(chart)
        concept = scene('idea', '三角权衡成本。', [
            element('a', '三角', 0, 2, concept_role='definition'),
            element('b', '成本', 4, 6, concept_role='summary'),
        ], 'concept')
        titled = scene('title', '漏斗过滤噪声。', [element('a', '漏斗', 0, 2)], 'title_reveal')
        wide = scene('wide', '漏斗过滤噪声。', [element(f'e{i}', '漏斗', 0, 2) for i in range(6)])
        edged = scene('flow', '曲线显示增长。', [element('a', '曲线', 0, 2), element('b', '增长', 2, 4)], 'flow_diagram')
        edged['edges'] = [{'from': 'a', 'to': 'b'}]
        draft = lesson(coded, charted, concept, titled, wide, edged)
        apply_paper_direction(draft)
        self.assertTrue(all('vector' not in s for s in draft['scenes']))
        self.assertEqual(draft['scenes'][1]['chart'], chart)
        self.assertEqual(concept['elements'][0]['entrance'], 'box')
        self.assertNotIn('chart', draft['scenes'][0])

    def test_lone_regenerate_uses_keywords_not_intro(self):
        lone = scene('s', '三角权衡成本。', [
            element('a', '三角', 0, 2), element('b', '权衡', 2, 4), element('c', '成本', 4, 6)])
        apply_paper_direction(lone)
        self.assertEqual(lone['section'], 'tradeoff')
        self.assertEqual(lone['vector'], {'kind': 'tradeoff_triangle'})
        self.assertEqual(lone['camera'], {'x': 960, 'y': 700, 'scale': 1.16})
        self.assertEqual(lone['elements'][-1]['entrance'], 'box')
        plain = scene('s', '甲乙。', [element('a', '甲', 0, 1)])
        apply_paper_direction(plain)
        self.assertEqual(plain['section'], 'solution')
        self.assertNotIn('vector', plain)

    def test_model_original_strips_program_direction(self):
        raw = scene('s', '曲线显示增长。', [element('a', '曲线', 0, 2, entrance='draw')])
        raw.update(camera={'x': 1, 'y': 2, 'scale': 1.2}, vector={'kind': 'gauge'}, section='intro')
        kept = Jobs._draft_scene(raw)
        self.assertEqual(kept['camera']['scale'], 1.2)
        self.assertEqual(kept['vector']['kind'], 'gauge')
        self.assertEqual(kept['section'], 'intro')
        self.assertEqual(kept['elements'][0]['entrance'], 'draw')
        original = Jobs.model_original(raw)
        self.assertTrue({'camera', 'vector', 'section'}.isdisjoint(original))
        self.assertNotIn('entrance', original['elements'][0])
        self.assertEqual(original['narration']['text'], raw['narration']['text'])

    def test_directed_outline_validates_and_timing_uses_entrance(self):
        parts = ['先看问题。', '一方面有风险。', '漏斗过滤噪声。', '三角权衡成本。', '最后记住结论。']
        draft = lesson(
            scene('s0', parts[0], [element('t0', '先看问题', 0, 4, role='topic')], 'title_reveal'),
            scene('s1', parts[1], [element('w', '风险', 4, 6, icon='warning')]),
            scene('s2', parts[2], [element('a', '漏斗', 0, 2), element('b', '过滤', 2, 4), element('c', '噪声', 4, 6)]),
            scene('s3', parts[3], [element('d', '三角', 0, 2), element('e', '权衡', 2, 4), element('f', '成本', 4, 6)]),
            scene('s4', parts[4], [element('t1', '记住结论', 2, 6, role='topic')], 'title_reveal'),
        )
        apply_paper_direction(draft)
        validate_storyboard(draft, ''.join(parts))
        self.assertEqual(draft['scenes'][2]['vector']['kind'], 'dot_funnel')
        self.assertEqual(draft['scenes'][3]['vector']['kind'], 'tradeoff_triangle')
        self.assertEqual(sum(e['entrance'] == 'shake' for s in draft['scenes'] for e in s['elements']), 1)
        text = parts[2]
        words = [{'word': text[i:i + 2], 'startTime': i * 0.12, 'endTime': i * 0.12 + 0.1} for i in range(0, 6, 2)]
        timed = time_scene(draft['scenes'][2], 'audio', 1000, align_words(text, words, 1000))
        self.assertEqual([a['effect'] for a in timed['animations']], ['draw', 'draw', 'draw'])
        self.assertGreater(timed['animations'][0]['duration_frames'], 1)
        self.assertIn('camera', timed)
        self.assertEqual(timed['vector']['kind'], 'dot_funnel')

    def test_worker_directs_only_paper_slide(self):
        from services.workflow.worker import child
        payload = {'kind': 'generate', 'source_text': '甲。', 'model': 'deepseek-flash',
                   'protocol_version': 'teaching-outline:9', 'visual_style': 'paper_slide'}
        output = io.StringIO()
        with patch('sys.stdin', io.StringIO(json.dumps(payload))), redirect_stdout(output), \
             patch.dict('os.environ', {'DEEPSEEK_API_KEY': 'test'}), \
             patch('services.workflow.providers.deepseek_storyboard', return_value=lesson(scene('s1', '甲。', [element('a', '甲', 0, 1)]))):
            child()
        directed = json.loads(output.getvalue())['draft']['scenes'][0]
        self.assertEqual(directed['section'], 'intro')
        self.assertEqual(directed['camera'], {'x': 960, 'y': 540, 'scale': 1})
        self.assertEqual(directed['elements'][0]['entrance'], 'fade_slide')
        plain = io.StringIO()
        bare = {'kind': 'generate', 'source_text': '甲。', 'model': 'deepseek-flash', 'protocol_version': 'teaching-outline:9'}
        with patch('sys.stdin', io.StringIO(json.dumps(bare))), redirect_stdout(plain), \
             patch.dict('os.environ', {'DEEPSEEK_API_KEY': 'test'}), \
             patch('services.workflow.providers.deepseek_storyboard', return_value=lesson(scene('s1', '甲。', [element('a', '甲', 0, 1)]))):
            child()
        untouched = json.loads(plain.getvalue())['draft']['scenes'][0]
        self.assertNotIn('camera', untouched)
        self.assertNotIn('section', untouched)
        self.assertNotIn('entrance', untouched['elements'][0])


if __name__ == '__main__':
    unittest.main()
