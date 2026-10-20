import json
import unittest
import httpx
from services.tests.test_generation import settings, quoted_wire
from services.workflow.storyboard import validate_storyboard
from services.workflow.providers import deepseek_storyboard, ProviderError
from services.tts.timing import time_scene
from services.projects.store import draft_valid
from services.projects.jobs import Jobs


def timeline_draft():
    return {'id': 'timeline', 'type': 'execution_timeline',
            'timeline': {'duration_ms': 1100, 'lanes': [{'id': 'a', 'label': '任务甲'}, {'id': 'b', 'label': '任务乙'}]},
            'narration': {'text': '任务甲等待。任务乙执行。'}, 'elements': [
                {'id': 'wait', 'content': '任务甲等待', 'cue': {'text_start': 0, 'text_end': 6},
                 'event': {'lane_id': 'a', 'start_ms': 0, 'end_ms': 1000, 'phase': 'wait'}},
                {'id': 'run', 'content': '任务乙执行', 'cue': {'text_start': 6, 'text_end': 12},
                 'event': {'lane_id': 'b', 'start_ms': 0, 'end_ms': 100, 'phase': 'execute'}}]}


class TimelineTests(unittest.TestCase):
    def test_draft_voice_and_job_preserve_axis_and_events(self):
        draft = timeline_draft()
        validate_storyboard({'scenes': [draft]}, draft['narration']['text'])
        scene = time_scene(draft, 'audio', 2600, [
            {'text_start': 0, 'text_end': 6, 'start_ms': 0, 'end_ms': 1000},
            {'text_start': 6, 'text_end': 12, 'start_ms': 1200, 'end_ms': 2400}])
        draft_valid({'scenes': [scene]})
        self.assertEqual(Jobs._draft_scene(scene), draft)
        self.assertEqual(scene['timeline'], draft['timeline'])
        self.assertEqual(scene['elements'], draft['elements'])
        self.assertEqual(scene['animations'][1]['start_frame'], 42)

    def test_unknown_lane_rejected_before_voice(self):
        draft = timeline_draft(); draft['elements'][0]['event']['lane_id'] = 'missing'
        with self.assertRaises(ProviderError): validate_storyboard({'scenes': [draft]}, draft['narration']['text'])

    def test_timeline_prompt_and_schema_in_supplier_request(self):
        draft = timeline_draft()
        def handler(request):
            prompt = json.loads(request.content)['messages'][0]['content']
            for phrase in ['execution_timeline', 'illustrative milliseconds', 'not CPU parallelism', 'explicit timing data']:
                self.assertIn(phrase, prompt)
            return httpx.Response(200, json={'choices': [{'finish_reason': 'stop', 'message': {'content': json.dumps(quoted_wire({'scenes': [draft]}))}}]})
        with httpx.Client(transport=httpx.MockTransport(handler)) as client:
            self.assertEqual(deepseek_storyboard(draft['narration']['text'], settings(), client), {'scenes': [draft]})
