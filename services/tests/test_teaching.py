import contextlib
import io
import json
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

import httpx

from services.tests.test_generation import settings
from services.workflow.generate import generate_project
from services.workflow.providers import ProviderError
from services.workflow.storyboard import ROOT, validate_storyboard


class TeachingTests(unittest.TestCase):
    def test_lesson_drafts_preserve_narration_and_visual_bounds(self):
        for name in ['python-sum', 'rag', 'comparison', 'state']:
            draft = json.loads((ROOT / f'examples/lessons/{name}.json').read_text())
            text = ''.join(s['narration']['text'] for s in draft['scenes'])
            validate_storyboard(draft, text)

    def test_comparison_drafts_require_complete_pairs(self):
        import copy
        original = json.loads((ROOT / 'examples/lessons/rag.json').read_text())['scenes'][0]
        for count in [1, 2, 3, 4, 5, 6]:
            scene = copy.deepcopy(original)
            scene['type'] = 'comparison_panel'; scene.pop('edges')
            scene['elements'] = scene['elements'][:count]
            draft = {'scenes': [scene]}
            if count % 2:
                with self.assertRaises(ProviderError): validate_storyboard(draft, scene['narration']['text'])
            else: validate_storyboard(draft, scene['narration']['text'])

    def test_handwritten_state_values_match_known_array_object_stack_operations(self):
        scenes = json.loads((ROOT / 'examples/lessons/state.json').read_text())['scenes']
        nums = []; array = [list(nums)]
        nums.extend([2, 3]); array.append(list(nums)); self.assertEqual(nums[0], 2); array.append(list(nums))
        nums[0] = 5; array.append(list(nums))
        user = {}; objects = [dict(user)]
        user.update(name='小林', level='3'); objects.append(dict(user))
        user['level'] = '5'; objects.append(dict(user)); del user['level']; objects.append(dict(user))
        stack = []; stacks = [list(stack)]
        stack.append('甲'); stacks.append(list(stack)); stack.append('乙'); stacks.append(list(stack))
        self.assertEqual(stack.pop(), '乙'); stacks.append(list(stack))
        self.assertEqual(stack.pop(), '甲'); stacks.append(list(stack))
        self.assertEqual([[item['value'] for item in e['items']] for e in scenes[0]['elements']], [[str(v) for v in s] for s in array])
        self.assertEqual([{item['key']: item['value'] for item in e['items']} for e in scenes[1]['elements']], objects)
        self.assertEqual([[item['value'] for item in e['items']] for e in scenes[2]['elements']], stacks)
        for s in scenes:
            text = s['narration']['text']
            self.assertEqual(''.join(text[e['cue']['text_start']:e['cue']['text_end']] for e in s['elements']), text)

    def test_rag_uncertain_branch_starts_at_retrieval_not_after_answer(self):
        scene = json.loads((ROOT / 'examples/lessons/rag.json').read_text())['scenes'][0]
        self.assertIn({'from': 'retrieve', 'to': 'boundary'}, scene['edges'])
        self.assertNotIn({'from': 'answer', 'to': 'boundary'}, scene['edges'])

    def test_known_python_example_really_prints_five(self):
        source = 'total = 0\nfor n in [2, 3]:\n    total += n\nprint(total)'
        draft = json.loads((ROOT / 'examples/lessons/python-sum.json').read_text())
        scene = draft['scenes'][0]
        self.assertEqual(scene['code']['source'], source)
        output, variables = io.StringIO(), {'__builtins__': {'print': print}}
        # Execute only the literal maintained test snippet, never a user/LLM-provided source.
        with contextlib.redirect_stdout(output): exec(source, variables)
        self.assertEqual(output.getvalue(), '5\n')
        self.assertEqual(variables['total'], 5)
        self.assertEqual(scene['elements'][-1]['output'], '5')
        trace, total = [{'total': '0'}], 0
        for n in [2, 3]:
            trace.append({'n': str(n), 'total': str(total)})
            total += n
            trace.append({'n': str(n), 'total': str(total)})
        trace.append({'n': '3', 'total': str(total)})
        self.assertEqual([{v['name']: v['value'] for v in e['variables']} for e in scene['elements']], trace)
        self.assertEqual([e['code_lines'] for e in scene['elements']], [[1], [2], [3], [2], [3], [4]])

    def test_bad_supplied_storyboard_is_rejected_before_paid_calls(self):
        draft = json.loads((ROOT / 'examples/lessons/python-sum.json').read_text())
        text = draft['scenes'][0]['narration']['text']
        draft['scenes'][0]['code']['source'] = 'x' * 61
        with tempfile.TemporaryDirectory() as folder, httpx.Client() as client:
            with patch('services.workflow.generate.deepseek_storyboard') as llm:
                with self.assertRaisesRegex(ProviderError, 'code_layout'):
                    generate_project(text, Path(folder) / 'out.json', Path(folder) / 'public',
                                     settings(), client, draft=draft)
                llm.assert_not_called()
