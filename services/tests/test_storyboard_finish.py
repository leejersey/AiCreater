import json
import unittest
import httpx
from services.tests.test_generation import outline, settings, quoted_wire
from services.workflow.providers import deepseek_storyboard, ProviderError
from services.projects.jobs import ERRORS, Jobs

class FinishTests(unittest.TestCase):
    def test_known_flash_models_disable_thinking_without_increasing_budget(self):
        for model in ['deepseek-flash', 'deepseek-v4-flash']:
            with self.subTest(model=model):
                def handler(request):
                    body=json.loads(request.content)
                    self.assertEqual(body['thinking'], {'type':'disabled'})
                    self.assertEqual(body['max_tokens'],8192)
                    return httpx.Response(200,json={'choices':[{'finish_reason':'stop','message':{'content':json.dumps(quoted_wire(outline()))}}]})
                with httpx.Client(transport=httpx.MockTransport(handler)) as client:
                    self.assertEqual(deepseek_storyboard('规则匹配。',settings(DEEPSEEK_MODEL=model),client),outline())

    def test_legacy_or_custom_model_is_not_given_new_parameter(self):
        for model in ['deepseek-chat','custom-test']:
            def handler(request):
                self.assertNotIn('thinking',json.loads(request.content))
                return httpx.Response(200,json={'choices':[{'finish_reason':'stop','message':{'content':json.dumps(quoted_wire(outline()))}}]})
            with httpx.Client(transport=httpx.MockTransport(handler)) as client:
                deepseek_storyboard('规则匹配。',settings(DEEPSEEK_MODEL=model),client)

    def test_known_finish_codes_never_expose_provider_reason_or_partial_json(self):
        for finish, code in [('length','output_limit'),('content_filter','response_filtered'),('tool_calls','incomplete_response'),('secret-provider-reason','incomplete_response'),(None,'incomplete_response')]:
            with self.subTest(finish=finish):
                response=httpx.Response(200,json={'choices':[{'finish_reason':finish,'message':{'content':'secret-partial-body'}}]})
                with httpx.Client(transport=httpx.MockTransport(lambda _:response)) as client, self.assertRaises(ProviderError) as caught:
                    deepseek_storyboard('规则匹配。',settings(),client)
                self.assertEqual(caught.exception.code,code)
                self.assertNotIn('secret',str(caught.exception))
                public='storyboard_'+code
                self.assertIn(public,ERRORS)
                error=Jobs._error({'stage':'storyboard','attempts':1,'scene_id':None},public)
                self.assertFalse(error['retryable'])
