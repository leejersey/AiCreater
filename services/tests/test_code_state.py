import copy
import json
import unittest
from services.workflow.storyboard import ROOT, validate_storyboard, restore_storyboard, source_parts
from services.workflow.providers import ProviderError


def lesson():
    return json.loads((ROOT / 'examples/lessons/code-state.json').read_text())


class CodeStateTests(unittest.TestCase):
    def test_explicit_code_state_and_source_restore(self):
        draft = lesson(); scene = draft['scenes'][0]; text = scene['narration']['text']
        validate_storyboard(draft, text)
        raw = copy.deepcopy(draft); s = raw['scenes'][0]; s.pop('narration'); s['source_part_ids'] = [p['id'] for p in source_parts(text)]
        for e in s['elements']:
            start, end = e['cue']['text_start'], e['cue']['text_end']; e['cue'] = {'quote':text[start:end]}
        self.assertEqual(restore_storyboard(raw,text,source_parts(text),require_quotes=True),draft)
        self.assertEqual({v['name']:v['value'] for v in scene['elements'][-1]['variables']}['i'],'1')
        self.assertEqual(scene['elements'][-1]['pointers'],[])

    def test_current_array_references_loop_and_layout_bounds(self):
        validate_storyboard(lesson(),lesson()['scenes'][0]['narration']['text'])
        for bad in ['pointer','duplicate_pointer','index','loop','control','name','value','missing','legacy','wrong_template']:
            draft = lesson(); s=draft['scenes'][0]; e=s['elements'][1]
            if bad=='pointer': e['pointers'][0]['item_id']='missing'
            if bad=='duplicate_pointer': e['pointers'] *= 2
            if bad=='index': e['array_items'][0]['key']='1'
            if bad=='loop': e['loop']['current']=3
            if bad=='control': e['input']='a\u200bb'
            if bad=='name': e['variables'][0]['name']='变'*7
            if bad=='value': e['array_items'][0]['value']='长'*9
            if bad=='missing': e.pop('input')
            if bad=='legacy': s['code'].pop('array_name')
            if bad=='wrong_template': s['type']='card_sequence';s.pop('code')
            with self.subTest(bad=bad), self.assertRaises(ProviderError): validate_storyboard(draft,s['narration']['text'])
