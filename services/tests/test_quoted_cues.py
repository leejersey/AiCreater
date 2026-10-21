import copy
import inspect
import json
import unittest

import httpx

from services.tests.test_generation import outline, settings
from services.workflow.providers import ProviderError, deepseek_storyboard
from services.workflow.storyboard import restore_storyboard, source_parts


def quoted(text, quote):
    raw = outline(text)
    scene = raw['scenes'][0]
    scene.pop('narration')
    scene['source_part_ids'] = [p['id'] for p in source_parts(text)]
    scene['elements'][0]['cue'] = {'quote': quote}
    return raw


class QuotedCueTests(unittest.TestCase):
    def test_exact_unicode_offsets_and_input_immutability(self):
        text = ' 前面🙂。\r\n下一句 e\u0301。\n'
        for quote in ['🙂', '。\r\n下一句', ' e\u0301']:
            raw = quoted(text, quote); before = copy.deepcopy(raw)
            try: result = restore_storyboard(raw, text, source_parts(text))
            except ProviderError: self.fail('Exact original quoted cues must be restored')
            scene = result['scenes'][0]
            self.assertEqual(scene['narration']['text'], text)
            self.assertEqual(scene['elements'][0]['cue'], {'text_start': text.index(quote), 'text_end': text.index(quote) + len(quote)})
            self.assertNotIn('source_part_ids', scene); self.assertEqual(raw, before)

    def test_explicit_topic_survives_exact_quote_restoration(self):
        text='规则匹配。';raw=quoted(text,'规则');raw['scenes'][0]['elements'][0]['role']='topic'
        result=restore_storyboard(raw,text,source_parts(text),require_quotes=True)
        self.assertEqual(result['scenes'][0]['elements'][0]['role'],'topic')
        self.assertEqual(result['scenes'][0]['elements'][0]['cue'],{'text_start':0,'text_end':2})

    def test_absent_blank_ambiguous_and_overlapping_quotes_are_safe_failures(self):
        for text,quote,reason in [('匹配。','secret','quote_not_found'),('匹配。',' ','quote_blank'),('匹配，匹配。','匹配','quote_ambiguous'),('aaaa。','aa','quote_ambiguous'),('e\u0301。','é','quote_not_found')]:
            with self.subTest(reason=reason), self.assertRaises(ProviderError) as raised:
                restore_storyboard(quoted(text,quote), text, source_parts(text))
            self.assertEqual(raised.exception.code,'invalid_cue')
            self.assertEqual(raised.exception.cue_error,{'path':'/scenes/0/elements/0/cue','reason':reason})
            if quote.strip(): self.assertNotIn(quote,str(raised.exception))

    def test_quote_is_matched_only_in_its_own_scene(self):
        text='第一句。第二句。';raw=quoted(text,'第二句')
        first=raw['scenes'][0];first['source_part_ids']=[1]
        second=copy.deepcopy(first);second['id']='scene_2';second['source_part_ids']=[2];raw['scenes'].append(second)
        with self.assertRaises(ProviderError) as raised:restore_storyboard(raw,text,source_parts(text))
        self.assertEqual(raised.exception.code,'invalid_cue');self.assertEqual(raised.exception.cue_error['reason'],'quote_not_found')

    def test_new_protocol_refuses_numeric_and_mixed_responses_but_legacy_reads_remain(self):
        self.assertIn('require_quotes',inspect.signature(restore_storyboard).parameters)
        text='规则匹配。';parts=source_parts(text);numeric=outline();wire=copy.deepcopy(numeric)
        wire['scenes'][0].pop('narration');wire['scenes'][0]['source_part_ids']=[1]
        for raw in [numeric,wire]:
            self.assertEqual(restore_storyboard(raw,text,parts),numeric)
            with self.assertRaises(ProviderError):restore_storyboard(raw,text,parts,require_quotes=True)
        mixed=quoted(text,'规则');mixed['scenes'][0]['elements'][0]['cue']['text_start']=0
        with self.assertRaises(ProviderError):restore_storyboard(mixed,text,parts,require_quotes=True)

    def test_adapter_requests_quotes_and_resolves_regeneration(self):
        text=' 规则🙂匹配。\n';raw=quoted(text,'🙂匹配');raw['scenes'][0]['id']='scene_1';raw['scenes'][0]['elements'][0]['role']='topic'
        original=outline(text)['scenes'][0]
        def handler(request):
            body=json.loads(request.content);prompt=body['messages'][0]['content']
            self.assertIn('cue.quote',prompt);self.assertIn('exactly once',prompt);self.assertIn('element.role=topic',prompt)
            self.assertNotIn('code-point (not UTF-16) cue offsets',prompt)
            schema_text=prompt.split('JSON Schema: ',1)[1]
            schema,end=json.JSONDecoder().raw_decode(schema_text)
            self.assertIn('Regenerate exactly ONE scene',schema_text[end:])
            self.assertEqual(schema['definitions']['Element']['properties']['cue']['required'],['quote'])
            return httpx.Response(200,json={'choices':[{'finish_reason':'stop','message':{'content':json.dumps(raw)}}]})
        with httpx.Client(transport=httpx.MockTransport(handler)) as client:
            result=deepseek_storyboard(text,settings(),client,original)
        self.assertEqual(result['scenes'][0]['elements'][0]['cue'],{'text_start':3,'text_end':6})
        self.assertEqual(result['scenes'][0]['elements'][0]['role'],'topic')

    def test_new_adapter_never_falls_back_to_valid_numeric_output(self):
        with httpx.Client(transport=httpx.MockTransport(lambda _:httpx.Response(200,json={'choices':[{'finish_reason':'stop','message':{'content':json.dumps(outline())}}]}))) as client:
            with self.assertRaises(ProviderError):deepseek_storyboard('规则匹配。',settings(),client)

    def test_child_emits_only_safe_quote_failure_metadata(self):
        import io
        from contextlib import redirect_stdout
        from unittest.mock import patch
        from services.workflow.worker import child
        text='规则匹配。';raw=quoted(text,'secret-provider-quote');output=io.StringIO()
        client=httpx.Client(transport=httpx.MockTransport(lambda _:httpx.Response(200,json={'choices':[{'finish_reason':'stop','message':{'content':json.dumps(raw)}}]})))
        payload={'kind':'generate','model':'test-model','source_text':text,'protocol_version':'teaching-outline:2'}
        with patch('httpx.Client',return_value=client),patch.dict('os.environ',{'DEEPSEEK_API_KEY':'test-key'}),patch('sys.stdin',io.StringIO(json.dumps(payload))),redirect_stdout(output):child()
        self.assertEqual(json.loads(output.getvalue()),{'error':'storyboard_invalid_cue','cue_error':{'path':'/scenes/0/elements/0/cue','reason':'quote_not_found'}})
        self.assertNotIn('secret',output.getvalue())

    def test_frozen_v1_jobs_use_legacy_adapter_but_v2_and_v3_jobs_do_not(self):
        import io
        from contextlib import redirect_stdout
        from unittest.mock import patch
        from services.workflow.worker import child
        for kind,prefix in [('generate','teaching-outline'),('regenerate','scene-candidate')]:
            for version in [1,2,3]:
                payload={'kind':kind,'model':'test-model','source_text':'规则匹配。','scene':outline()['scenes'][0],'protocol_version':prefix+':'+str(version)}
                with patch('services.workflow.providers.deepseek_storyboard',return_value=outline()) as adapter,patch('httpx.Client'),patch.dict('os.environ',{'DEEPSEEK_API_KEY':'test-key'}),patch('sys.stdin',io.StringIO(json.dumps(payload))),redirect_stdout(io.StringIO()):child()
                base = {'teaching_style': 'popular'}
                self.assertEqual(adapter.call_args.kwargs, {**base, **({'cue_quotes': False} if version == 1 else {})})

    def test_v1_adapter_preserves_legacy_numeric_output(self):
        self.assertIn('cue_quotes',inspect.signature(deepseek_storyboard).parameters)
        def handler(request):
            self.assertIn('code-point (not UTF-16) cue offsets',json.loads(request.content)['messages'][0]['content'])
            return httpx.Response(200,json={'choices':[{'finish_reason':'stop','message':{'content':json.dumps(outline())}}]})
        with httpx.Client(transport=httpx.MockTransport(handler)) as client:
            self.assertEqual(deepseek_storyboard('规则匹配。',settings(),client,cue_quotes=False),outline())
