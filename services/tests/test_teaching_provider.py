import copy
import json
import os
import traceback
import unittest
from unittest.mock import patch

import httpx

from services.projects.store import StoreError
from services.workflow.providers import Settings
from services.visual.teaching_pipeline import host_command
from services.visual.teaching_provider import TeachingPlanProvider


SECRET = 'test-secret-never-expose'
SETTINGS = Settings(SECRET, 'deepseek-flash', '', '', '', '', '')


def host_request(stage='plan'):
    return {'schemaVersion': 'teaching-host-request:1', 'stage': stage,
            'inputSha256': 'a' * 64, 'requestSha256': 'b' * 64,
            'prompt': 'Return one semantic teaching-scene-plan:1 JSON object.',
            'outputSchema': {'name': 'teaching_scene_plan_v1', 'schema': {'type': 'object'}}}


def envelope(content='{"schemaVersion":"teaching-scene-plan:1"}'):
    return {'choices': [{'finish_reason': 'stop',
                         'message': {'role': 'assistant', 'content': content}}]}


class TeachingPlanProviderTests(unittest.TestCase):
    def setUp(self):
        # Any accidental non-MockTransport request fails before opening a socket.
        self.network = patch('httpx.HTTPTransport.handle_request',
                             side_effect=AssertionError('Real network forbidden'))
        self.network.start()
        self.addCleanup(self.network.stop)
        self.requests = []

    def client(self, response=None, handler=None, **kwargs):
        def handle(request):
            self.requests.append(request)
            return handler(request) if handler else response
        client = httpx.Client(transport=httpx.MockTransport(handle), **kwargs)
        self.addCleanup(client.close)
        return client

    def invoke(self, data, **kwargs):
        response = httpx.Response(200, json=data)
        client = self.client(response)
        return TeachingPlanProvider(SETTINGS, client=client)(host_request(**kwargs))

    def assert_safe_failure(self, client, request=None):
        try:
            TeachingPlanProvider(SETTINGS, client=client)(request or host_request())
        except StoreError as error:
            rendered = ''.join(traceback.format_exception(error))
            self.assertNotIn(SECRET, rendered)
            self.assertNotIn('provider-private-body', rendered)
            self.assertTrue(error.code.startswith('teaching_provider'))
            return error
        self.fail('Expected a sanitized StoreError')

    def test_request_contract_both_stages_and_injected_client_ownership(self):
        for stage in ('plan', 'revision'):
            with self.subTest(stage=stage):
                self.requests.clear()
                client = self.client(httpx.Response(200, json=envelope()), follow_redirects=True,
                                     timeout=999, auth=('unwanted', 'auth'))
                request = host_request(stage)
                original = copy.deepcopy(request)
                result = TeachingPlanProvider(SETTINGS, client=client)(request)
                self.assertEqual(result, {'schemaVersion': 'teaching-scene-plan:1'})
                self.assertEqual(request, original)
                self.assertEqual(len(self.requests), 1)
                sent = self.requests[0]
                self.assertEqual(str(sent.url), 'https://api.deepseek.com/chat/completions')
                self.assertEqual(sent.method, 'POST')
                self.assertEqual(sent.headers['authorization'], 'Bearer ' + SECRET)
                self.assertEqual(sent.extensions['timeout'], dict.fromkeys(
                    ('connect', 'read', 'write', 'pool'), 60.0))
                body = json.loads(sent.content)
                self.assertEqual(body['model'], SETTINGS.model)
                self.assertEqual(body['response_format'], {'type': 'json_object'})
                self.assertFalse(body['stream'])
                self.assertEqual(body['thinking'], {'type': 'disabled'})
                self.assertEqual([m['role'] for m in body['messages']], ['system', 'user'])
                self.assertEqual(json.loads(body['messages'][1]['content']), original)
                system = body['messages'][0]['content']
                for term in ('semantic', 'JSON', 'source code', 'coordinates', 'outputSchema'):
                    self.assertIn(term, system)
                self.assertNotIn('tools', body)
                self.assertFalse(client.is_closed)

    def test_real_offline_node_host_request_is_accepted(self):
        request = host_command('request', {'brief': {
            'schemaVersion': 'custom-scene-brief:1', 'id': 'provider-test', 'title': 'Example',
            'narration': 'First.', 'visualGoal': 'Explain a mechanism', 'facts': ['Example only'],
            'materials': [], 'width': 1920, 'height': 1080, 'fps': 30, 'durationInFrames': 60},
            'cues': [{'id': 'first', 'text': 'First.', 'startFrame': 6, 'endFrame': 54}]})
        client = self.client(httpx.Response(200, json=envelope()))
        TeachingPlanProvider(SETTINGS, client=client)(request)
        body = json.loads(self.requests[0].content)
        self.assertEqual(json.loads(body['messages'][1]['content']), request)

    def test_accepts_json_whitespace_unicode_and_empty_object_without_schema_validation(self):
        for content, expected in [(' \n {"label":"组合"}\t', {'label': '组合'}), ('{}', {})]:
            with self.subTest(content=content):
                self.assertEqual(self.invoke(envelope(content)), expected)

    def test_rejects_non_strict_content_without_repair(self):
        contents = ['```json\n{}\n```', '<DSML>{}</DSML>', 'prefix {}', '{} trailing', '{}{}',
                    '{', '', '[]', 'null', 'true', '42', '"object"',
                    '{"a":NaN}', '{"a":Infinity}', '{"a":-Infinity}', '{"a":1e400}',
                    '{"a":1,"a":2}', '{"nested":{"a":1,"a":2}}',
                    None, {}, [], [{'type': 'text', 'text': '{}'}]]
        for content in contents:
            with self.subTest(content=content):
                self.requests.clear()
                self.assert_safe_failure(self.client(httpx.Response(200, json=envelope(content))))
                self.assertEqual(len(self.requests), 1)

    def test_rejects_ambiguous_incomplete_or_tool_responses(self):
        invalid = [None, [], {}, {'choices': []}, {'choices': {}},
                   {'choices': [None]}, {'choices': [envelope()['choices'][0]] * 2}]
        for reason in ('length', 'content_filter', 'tool_calls', 'function_call', None, 'unknown'):
            data = envelope()
            data['choices'][0]['finish_reason'] = reason
            invalid.append(data)
        for field, value in [('tool_calls', [{'id': 'one'}]),
                             ('tool_calls', [{'id': 'one'}, {'id': 'two'}]),
                             ('tool_calls', {}), ('function_call', {}),
                             ('refusal', 'provider-private-body'), ('role', 'tool')]:
            data = envelope()
            data['choices'][0]['message'][field] = value
            invalid.append(data)
        for message in (None, [], 'provider-private-body', {'role': 'assistant'}):
            data = envelope()
            data['choices'][0]['message'] = message
            invalid.append(data)
        for data in invalid:
            with self.subTest(data=data):
                self.requests.clear()
                self.assert_safe_failure(self.client(httpx.Response(200, json=data)))
                self.assertEqual(len(self.requests), 1)

    def test_rejects_http_errors_redirects_and_non_json_types_without_retry(self):
        for status in (301, 302, 307, 308, 400, 401, 429, 500, 503):
            with self.subTest(status=status):
                self.requests.clear()
                client = self.client(httpx.Response(status, text=SECRET + 'provider-private-body',
                    headers={'location': 'https://example.invalid/leak'}), follow_redirects=True)
                self.assert_safe_failure(client)
                self.assertEqual(len(self.requests), 1)
        for mime in (None, 'text/plain', 'text/html', 'text/event-stream'):
            with self.subTest(mime=mime):
                headers = {'content-type': mime} if mime else {}
                self.assert_safe_failure(self.client(httpx.Response(
                    200, content=json.dumps(envelope()).encode(), headers=headers)))

    def test_rejects_invalid_outer_json_and_duplicate_keys(self):
        for raw in (b'{', b'{}{}', b'\xff', b'{"choices":[],"choices":[]}',
                    b'{"extra":NaN,"choices":[]}', b'{"extra":1e400,"choices":[]}'):
            with self.subTest(raw=raw):
                self.assert_safe_failure(self.client(httpx.Response(200, content=raw,
                    headers={'content-type': 'application/json'})))

    def test_transport_and_unexpected_client_failures_are_sanitized_and_not_retried(self):
        for error_type in (httpx.ReadTimeout, httpx.ConnectError, httpx.RemoteProtocolError, RuntimeError):
            with self.subTest(error_type=error_type):
                self.requests.clear()
                def fail(request):
                    raise error_type(SECRET + 'provider-private-body')
                self.assert_safe_failure(self.client(handler=fail))
                self.assertEqual(len(self.requests), 1)

    def test_injected_store_error_cannot_bypass_sanitization(self):
        def fail(request):
            raise StoreError('private-code', SECRET + 'provider-private-body')
        self.assert_safe_failure(self.client(handler=fail))
        self.assertEqual(len(self.requests), 1)

    def test_response_limit_accepts_exact_boundary_and_rejects_one_more_byte(self):
        raw = json.dumps(envelope()).encode()
        raw += b' ' * (1024 * 1024 - len(raw))
        response = httpx.Response(200, content=raw, headers={
            'content-type': 'application/json; charset=utf-8'})
        result = TeachingPlanProvider(SETTINGS, client=self.client(response))(host_request())
        self.assertIsInstance(result, dict)
        error = self.assert_safe_failure(self.client(httpx.Response(200, content=raw + b' ',
            headers={'content-type': 'application/json'})))
        self.assertEqual(error.code, 'teaching_provider_response_limit')

    def test_oversize_request_is_rejected_without_dispatch(self):
        request = host_request()
        request['prompt'] = 'x' * (16 * 1024 * 1024)
        self.assert_safe_failure(self.client(), request)
        self.assertEqual(self.requests, [])

    def test_stream_limit_stops_consuming_and_closes_response(self):
        class LargeStream(httpx.SyncByteStream):
            closed = False
            def __iter__(self):
                yield b' ' * (1024 * 1024)
                yield b' '
                raise AssertionError('Response should already have been rejected')
            def close(self):
                self.closed = True
        stream = LargeStream()
        response = httpx.Response(200, stream=stream, headers={'content-type': 'application/json'})
        error = self.assert_safe_failure(self.client(response))
        self.assertEqual(error.code, 'teaching_provider_response_limit')
        self.assertTrue(stream.closed)

    def test_declared_oversize_is_rejected_before_read(self):
        class UnreadStream(httpx.SyncByteStream):
            def __iter__(self):
                raise AssertionError('Oversize body must not be read')
                yield b''
        response = httpx.Response(200, stream=UnreadStream(), headers={
            'content-type': 'application/json', 'content-length': str(1024 * 1024 + 1)})
        error = self.assert_safe_failure(self.client(response))
        self.assertEqual(error.code, 'teaching_provider_response_limit')
        self.assertTrue(response.is_closed)

    def test_owned_client_is_closed_on_success_and_failure(self):
        for response in (httpx.Response(200, json=envelope()), httpx.Response(500, text=SECRET)):
            with self.subTest(status=response.status_code):
                client = self.client(response)
                with patch('services.visual.teaching_provider.httpx.Client', return_value=client):
                    provider = TeachingPlanProvider(SETTINGS)
                    if response.status_code == 200:
                        provider(host_request())
                    else:
                        with self.assertRaises(StoreError):
                            provider(host_request())
                self.assertTrue(client.is_closed)

    def test_invalid_request_and_settings_do_not_dispatch(self):
        invalid = [None, [], {}, host_request('other')]
        for field, value in [('schemaVersion', 'wrong'), ('prompt', ''), ('prompt', []),
                             ('outputSchema', []), ('inputSha256', 'bad'),
                             ('requestSha256', 'bad')]:
            request = host_request()
            request[field] = value
            invalid.append(request)
        data = host_request()
        data['outputSchema']['schema']['bad'] = float('nan')
        invalid.append(data)
        for request in invalid:
            with self.subTest(request=request):
                client = self.client(httpx.Response(200, json=envelope()))
                with self.assertRaises(StoreError):
                    TeachingPlanProvider(SETTINGS, client=client)(request)
        for key, model in [('', 'deepseek-flash'), (SECRET + '\n', 'deepseek-flash'),
                           (SECRET, ''), (None, 'deepseek-flash')]:
            with self.subTest(key=bool(key), model=model):
                with self.assertRaises(StoreError):
                    TeachingPlanProvider(Settings(key, model, '', '', '', '', ''),
                                         client=self.client())(host_request())
        self.assertEqual(self.requests, [])

    def test_from_env_reads_only_deepseek_settings_without_http_or_tts(self):
        class Values:
            def __init__(self):
                self.reads = []
            def get(self, name, default=None):
                self.reads.append(name)
                return {'DEEPSEEK_API_KEY': SECRET, 'DEEPSEEK_MODEL': 'deepseek-v4-flash'}.get(name, default)
        values = Values()
        with patch('services.visual.teaching_provider.httpx.Client',
                   side_effect=AssertionError('Construction must not create an HTTP client')):
            provider = TeachingPlanProvider.from_env(values)
        self.assertEqual(values.reads, ['DEEPSEEK_API_KEY', 'DEEPSEEK_MODEL'])
        self.assertEqual(provider.settings, Settings(SECRET, 'deepseek-v4-flash', '', '', '', '', ''))
        self.assertIsNone(provider.client)
        self.assertEqual(self.requests, [])

    def test_from_env_defaults_model_and_supports_process_environment(self):
        for model in (None, '', '  '):
            with self.subTest(model=model):
                values = {'DEEPSEEK_API_KEY': SECRET}
                if model is not None:
                    values['DEEPSEEK_MODEL'] = model
                provider = TeachingPlanProvider.from_env(values)
                self.assertEqual(provider.settings.model, 'deepseek-flash')
        with patch.dict(os.environ, {'DEEPSEEK_API_KEY': '  ' + SECRET + '  ',
                                   'DEEPSEEK_MODEL': ' deepseek-flash '}, clear=True):
            provider = TeachingPlanProvider.from_env()
        self.assertEqual(provider.settings, Settings(SECRET, 'deepseek-flash', '', '', '', '', ''))

    def test_from_env_missing_key_disables_executor_without_environment_fallback(self):
        with patch.dict(os.environ, {'DEEPSEEK_API_KEY': SECRET}):
            for values in ({}, {'DEEPSEEK_API_KEY': ''}, {'DEEPSEEK_API_KEY': '  '}):
                with self.subTest(values=values):
                    with self.assertRaises(StoreError) as caught:
                        TeachingPlanProvider.from_env(values)
                    self.assertEqual(caught.exception.code, 'teaching_executor_disabled')
                    self.assertNotIn(SECRET, str(caught.exception))

    def test_from_env_rejects_controls_before_trimming_with_safe_errors(self):
        for field in ('DEEPSEEK_API_KEY', 'DEEPSEEK_MODEL'):
            for control in ('\x00', '\t', '\n', '\r', '\x1f', '\x7f'):
                with self.subTest(field=field, control=repr(control)):
                    values = {'DEEPSEEK_API_KEY': SECRET, 'DEEPSEEK_MODEL': 'deepseek-flash'}
                    values[field] = SECRET + control
                    with self.assertRaises(StoreError) as caught:
                        TeachingPlanProvider.from_env(values)
                    self.assertEqual(caught.exception.code, 'teaching_provider_config')
                    self.assertNotIn(SECRET, str(caught.exception))
        self.assertEqual(self.requests, [])


if __name__ == '__main__':
    unittest.main()
