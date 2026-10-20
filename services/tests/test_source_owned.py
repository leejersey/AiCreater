import copy,json,unittest
import httpx
from services.tests.test_generation import outline,settings
from services.workflow.providers import deepseek_storyboard,ProviderError
from services.workflow.storyboard import source_parts,restore_storyboard

def wire(ids, quote=None):
    s=copy.deepcopy(outline()['scenes'][0]);s.pop('narration');s['source_part_ids']=ids
    if quote is not None:s['elements'][0]['cue']={'quote':quote}
    return {'scenes':[s]}

class SourceOwnedTests(unittest.TestCase):
    def test_split_is_lossless_and_bounded(self):
        for text in [' 规则匹配。 \r\n\n下一句🙂。\n','x'*4000,('甲。\n'*500), '\n开头。结尾\n']:
            parts=source_parts(text)
            self.assertEqual(''.join(p['text'] for p in parts),text)
            self.assertLessEqual(len(parts),200)
            self.assertEqual([p['id'] for p in parts],list(range(1,len(parts)+1)))

    def test_full_manuscripts_can_group_parts_without_recopying_text(self):
        from pathlib import Path
        root=Path(__file__).resolve().parents[2]
        for name in ['python-loop','rag']:
            text=(root/('examples/lessons/full/'+name+'.txt')).read_text();parts=source_parts(text)
            middle=len(parts)//2
            raw=wire([p['id'] for p in parts[:middle]])
            second=wire([p['id'] for p in parts[middle:]])['scenes'][0];second['id']='scene_2'
            raw['scenes'].append(second)
            result=restore_storyboard(raw,text,parts)
            self.assertEqual(''.join(s['narration']['text'] for s in result['scenes']),text)
            second['source_part_ids']=[parts[0]['id']]
            with self.assertRaises(ProviderError):restore_storyboard(raw,text,parts)

    def test_program_restores_exact_source_including_final_newline(self):
        text=' 规则匹配。\r\n下一句🙂。\n';parts=source_parts(text);raw=wire([p['id'] for p in parts]);original=copy.deepcopy(raw)
        result=restore_storyboard(raw,text,parts)
        self.assertEqual(result['scenes'][0]['narration']['text'],text)
        self.assertNotIn('source_part_ids',result['scenes'][0]);self.assertEqual(raw,original)

    def test_references_cannot_omit_duplicate_reorder_invent_or_use_booleans(self):
        text='规则匹配。下一句。';parts=source_parts(text)
        for ids in [[1],[2,1],[1,1,2],[1,3],[True,2],[1.0,2],[]]:
            with self.subTest(ids=ids),self.assertRaises(ProviderError):restore_storyboard(wire(ids),text,parts)

    def test_invented_narration_and_bad_cues_still_fail(self):
        text='规则匹配。';parts=source_parts(text)
        raw=wire([1]);raw['scenes'][0]['narration']={'text':'invented'}
        with self.assertRaises(ProviderError):restore_storyboard(raw,text,parts)
        raw=wire([1]);raw['scenes'][0]['elements'][0]['cue']['text_end']=999
        with self.assertRaises(ProviderError):restore_storyboard(raw,text,parts)

    def test_existing_exact_canonical_drafts_remain_valid_but_rewrites_reject(self):
        text='规则匹配。';self.assertEqual(restore_storyboard(outline(),text,source_parts(text)),outline())
        with self.assertRaises(ProviderError):restore_storyboard(outline('规则改变。'),text,source_parts(text))

    def test_http_adapter_requests_parts_and_restores_without_model_narration(self):
        text='规则匹配。\n'
        def handler(request):
            body=json.loads(request.content);data=json.loads(body['messages'][1]['content'])
            self.assertEqual(''.join(p['text'] for p in data['source_parts']),text)
            self.assertIn('source_part_ids',body['messages'][0]['content'])
            return httpx.Response(200,json={'choices':[{'finish_reason':'stop','message':{'content':json.dumps(wire([1],quote='规则匹配'))}}]})
        with httpx.Client(transport=httpx.MockTransport(handler)) as client:
            self.assertEqual(deepseek_storyboard(text,settings(),client)['scenes'][0]['narration']['text'],text)

    def test_worker_boundary_only_emits_canonical_draft_and_safe_reference_errors(self):
        import io
        from contextlib import redirect_stdout
        from unittest.mock import patch
        from services.workflow.worker import child
        for ids in [[1], [2]]:
            output=io.StringIO();payload={'kind':'generate','model':'test-model','source_text':'规则匹配。\n'}
            response=httpx.Response(200,json={'choices':[{'finish_reason':'stop','message':{'content':json.dumps(wire(ids,quote='规则匹配'))}}]})
            client=httpx.Client(transport=httpx.MockTransport(lambda _:response))
            with patch('httpx.Client',return_value=client), patch.dict('os.environ',{'DEEPSEEK_API_KEY':'test-only'}), patch('sys.stdin',io.StringIO(json.dumps(payload))), redirect_stdout(output):
                child()
            result=json.loads(output.getvalue())
            if ids==[1]:
                self.assertEqual(result['draft']['scenes'][0]['narration']['text'],payload['source_text'])
                self.assertNotIn('source_part_ids',result['draft']['scenes'][0])
            else:self.assertEqual(result,{'error':'storyboard_source_reference'})

    def test_regeneration_one_part_retains_scene_and_whitespace(self):
        text=' 规则匹配。 下一句。\n';original=outline(text)['scenes'][0]
        def handler(request):
            data=json.loads(json.loads(request.content)['messages'][1]['content'])
            self.assertEqual(data['source_parts'],[{'id':1,'text':text}])
            self.assertEqual(data['original_scene'],original)
            return httpx.Response(200,json={'choices':[{'finish_reason':'stop','message':{'content':json.dumps(wire([1],quote='规则匹配'))}}]})
        with httpx.Client(transport=httpx.MockTransport(handler)) as client:
            self.assertEqual(deepseek_storyboard(text,settings(),client,original)['scenes'][0]['narration']['text'],text)
