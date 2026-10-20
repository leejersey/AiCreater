import copy
import json
import unittest
from unittest.mock import patch
import httpx
from services.tests.test_generation import settings, quoted_wire
from services.workflow.storyboard import validate_storyboard
from services.workflow.providers import deepseek_storyboard, ProviderError
from services.tts.timing import time_scene
from services.projects.store import draft_valid
from services.projects.jobs import Jobs


def state_draft():
    return {'id': 'state', 'type': 'state_diagram', 'structure': {'kind': 'array', 'name': 'nums'},
            'narration': {'text': '初始化。更新值。'}, 'elements': [
                {'id': 'init', 'content': '初始化', 'cue': {'text_start': 0, 'text_end': 3},
                 'items': [{'id': 'i0', 'key': '0', 'value': '0'}], 'active_item_ids': ['i0']},
                {'id': 'update', 'content': '更新值', 'cue': {'text_start': 4, 'text_end': 7},
                 'items': [{'id': 'i0', 'key': '0', 'value': '1'}], 'active_item_ids': ['i0']}]}


class StateDiagramTests(unittest.TestCase):
    def test_draft_and_timed_scene_keep_structure_and_snapshots(self):
        draft = state_draft()
        validate_storyboard({'scenes': [draft]}, draft['narration']['text'])
        scene = time_scene(draft, 'audio', 2600, [
            {'text_start': 0, 'text_end': 3, 'start_ms': 0, 'end_ms': 1000},
            {'text_start': 4, 'text_end': 7, 'start_ms': 1200, 'end_ms': 2400}])
        draft_valid({'scenes': [scene]})
        self.assertEqual(Jobs._draft_scene(scene), draft)
        self.assertEqual(scene['structure'], draft['structure'])
        self.assertEqual(scene['elements'], draft['elements'])
        self.assertNotIn('audio_asset_id', draft['narration'])

    def test_bad_item_reference_rejected_in_draft(self):
        draft = state_draft(); draft['elements'][0]['active_item_ids'] = ['missing']
        with self.assertRaises(ProviderError): validate_storyboard({'scenes': [draft]}, draft['narration']['text'])

    def test_state_prompt_and_schema_enter_supplier_request(self):
        draft = state_draft()
        def handler(request):
            prompt = json.loads(request.content)['messages'][0]['content']
            for word in ['state_diagram', 'complete snapshot', 'active_item_ids', 'bottom-to-top']:
                self.assertIn(word, prompt)
            return httpx.Response(200, json={'choices': [{'finish_reason': 'stop', 'message': {'content': json.dumps(quoted_wire({'scenes': [draft]}))}}]})
        with httpx.Client(transport=httpx.MockTransport(handler)) as client:
            self.assertEqual(deepseek_storyboard(draft['narration']['text'], settings(), client), {'scenes': [draft]})
