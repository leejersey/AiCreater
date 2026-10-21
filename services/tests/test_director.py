"""Controlled director outputs only: no provider calls or synthetic selection scores."""
import copy
import inspect
import json
import unittest

from services.tests.test_teaching_diagrams import draft, process_draft, funnel_draft
from services.workflow.providers import ProviderError, storyboard_request, deepseek_storyboard
from services.workflow.storyboard import restore_storyboard, source_parts


def wire(scene, ids=None):
    value = copy.deepcopy(scene)
    text = value.pop('narration')['text']
    value['source_part_ids'] = ids or [p['id'] for p in source_parts(text)]
    for item in value['elements'] + value.get('visual_actions', []):
        cue = item['cue']
        item['cue'] = {'quote': text[cue['text_start']:cue['text_end']]}
    return value


class DirectorTests(unittest.TestCase):
    def restore(self, scene, raw=None):
        self.assertIn('semantic_graphics', inspect.signature(restore_storyboard).parameters)
        text = scene['narration']['text']
        return restore_storyboard({'scenes':[wire(scene) if raw is None else raw]}, text, source_parts(text),
                                  require_quotes=True, semantic_graphics=True)

    def test_three_graphics_restore_exact_content_groups_and_actions_without_mutation(self):
        for builder in [funnel_draft, draft, process_draft]:
            with self.subTest(builder=builder.__name__):
                scene = builder(); raw = wire(scene); before = copy.deepcopy(raw)
                self.assertEqual(self.restore(scene, raw), {'scenes':[scene]})
                self.assertEqual(raw, before)

    def test_invalid_graphics_do_not_silently_demote_or_invent_a_replacement(self):
        for mode in ['unknown','missing','invented','early_label','wrong_type']:
            scene = funnel_draft(); raw = wire(scene)
            if mode == 'unknown': raw['funnel']['layers'][0] = 'missing'
            if mode == 'missing': raw['funnel']['notes'].pop()
            if mode == 'invented': raw['elements'][3]['content'] = '凭空编造'
            if mode == 'early_label': raw['elements'][0]['source_label'] = '成本提高'
            if mode == 'wrong_type': raw['type'] = 'concept'
            with self.subTest(mode=mode), self.assertRaises(ProviderError): self.restore(scene, raw)

    def test_action_quotes_are_unique_unicode_source_references_with_safe_errors(self):
        for quote, reason in [('不存在','quote_not_found'), ('，','quote_ambiguous'), (' ','quote_blank')]:
            scene = draft(); raw = wire(scene); raw['visual_actions'][0]['cue'] = {'quote':quote}
            with self.subTest(reason=reason), self.assertRaises(ProviderError) as err: self.restore(scene,raw)
            self.assertEqual(err.exception.cue_error, {'path':'/scenes/0/visual_actions/0/cue','reason':reason})
            self.assertNotIn(quote.strip() or 'secret', str(err.exception))
        scene = draft(); scene['narration']['text'] = '🙂' + scene['narration']['text']
        for e in scene['elements'] + scene['visual_actions']:
            e['cue'] = {key:value+1 for key,value in e['cue'].items()}
        self.assertEqual(self.restore(scene), {'scenes':[scene]})

    def test_actions_cannot_choose_timestamps_unknown_tools_or_numerical_offsets(self):
        for extra in [{'start_frame':20},{'duration_frames':12},{'kind':'execute_tool'},
                      {'cue':{'text_start':9,'text_end':13}}, {'source':'missing'}, {'target':'missing'}, {'cue':{'quote':'等待消息'}}]:
            scene = draft(); raw = wire(scene); raw['visual_actions'][0].update(extra)
            with self.subTest(extra=extra), self.assertRaises(ProviderError): self.restore(scene,raw)

    def test_default_online_schema_stays_closed_but_explicit_request_has_director_constraints(self):
        self.assertIn('semantic_graphics',inspect.signature(storyboard_request).parameters)
        text = funnel_draft()['narration']['text']
        original,_ = storyboard_request(text,'test-model')
        body,_ = storyboard_request(text,'test-model',semantic_graphics=True)
        def schema(body):return json.JSONDecoder().raw_decode(body['messages'][0]['content'].split('JSON Schema: ',1)[1])[0]
        old,new = schema(original),schema(body)
        self.assertNotIn('funnel',old['definitions']['Scene']['properties'])
        for field in ['funnel','dialogue','process','visual_actions']:self.assertIn(field,new['definitions']['Scene']['properties'])
        action = new['definitions']['VisualAction']['properties']
        self.assertNotIn('start_frame',action);self.assertNotIn('duration_frames',action)
        self.assertEqual(action['cue']['required'],['quote'])
        prompt=body['messages'][0]['content']
        for rule in ['Teaching graphics director','never execute tools','same element','no missing material','update']:
            self.assertIn(rule,prompt)
        self.assertIn('semantic_graphics',inspect.signature(deepseek_storyboard).parameters)
        self.assertFalse(inspect.signature(deepseek_storyboard).parameters['semantic_graphics'].default)
        with self.assertRaises(ProviderError):storyboard_request(text,'test-model',cue_quotes=False,semantic_graphics=True)

    def test_opt_in_adapter_uses_mock_transport_for_all_three_graphics_and_regeneration(self):
        import httpx
        from services.tests.test_generation import settings
        self.assertIn('semantic_graphics',inspect.signature(deepseek_storyboard).parameters)
        for builder in [funnel_draft,draft,process_draft]:
            original=builder();text=original['narration']['text']
            for regenerate in [False,True]:
                calls=[]
                def handler(request):
                    body=json.loads(request.content);calls.append(body)
                    schema=json.JSONDecoder().raw_decode(body['messages'][0]['content'].split('JSON Schema: ',1)[1])[0]
                    self.assertIn('visual_actions',schema['definitions']['Scene']['properties'])
                    raw={'scenes':[wire(original,[1] if regenerate else None)]}
                    return httpx.Response(200,json={'choices':[{'finish_reason':'stop','message':{'content':json.dumps(raw)}}]})
                with self.subTest(builder=builder.__name__,regenerate=regenerate),httpx.Client(transport=httpx.MockTransport(handler)) as client:
                    result=deepseek_storyboard(text,settings(),client,original if regenerate else None,semantic_graphics=True)
                    self.assertEqual(result,{'scenes':[original]});self.assertEqual(len(calls),1)

    def test_v4_worker_enables_director_and_preserves_graphics_for_regeneration(self):
        import io
        from contextlib import redirect_stdout
        from unittest.mock import patch
        from services.workflow.worker import child
        from services.projects.jobs import Jobs
        for builder in [funnel_draft,draft,process_draft]:
            scene=builder();before=copy.deepcopy(scene)
            for kind,prefix in [('generate','teaching-outline'),('regenerate','scene-candidate')]:
                payload={'kind':kind,'protocol_version':prefix+':4','model':'test-model','teaching_style':'technical','source_text':scene['narration']['text'],'scene':scene}
                output=io.StringIO()
                with self.subTest(builder=builder.__name__,kind=kind),patch('services.workflow.providers.deepseek_storyboard',return_value={'scenes':[scene]}) as adapter,patch('httpx.Client'),patch.dict('os.environ',{'DEEPSEEK_API_KEY':'test-only'}),patch('sys.stdin',io.StringIO(json.dumps(payload))),redirect_stdout(output):child()
                self.assertEqual(json.loads(output.getvalue()),{'draft':{'scenes':[scene]} if kind=='generate' else scene})
                self.assertEqual(adapter.call_args.kwargs,{'teaching_style':'technical','semantic_graphics':True})
                if kind=='regenerate':self.assertEqual(adapter.call_args.args[3],Jobs._draft_scene(scene))
            self.assertEqual(scene,before)

    def test_v4_estimates_and_usage_include_the_actual_director_prompt(self):
        from services.projects.estimates import estimate_payload, PRICES_CHECKED_ON
        from services.projects.usage import initial_usage
        from services.projects.jobs import Jobs
        import math
        scene=funnel_draft()
        for kind,prefix in [('generate','teaching-outline'),('regenerate','scene-candidate')]:
            payload={'kind':kind,'protocol_version':prefix+':4','model':'deepseek-flash','teaching_style':'technical','source_text':scene['narration']['text'],'scene':scene}
            result=estimate_payload(payload,now=PRICES_CHECKED_ON)
            self.assertEqual(result['status'],'estimated')
            original=Jobs._draft_scene(scene) if kind=='regenerate' else None
            body,_=storyboard_request(scene['narration']['text'],'deepseek-flash',original,semantic_graphics=True,teaching_style='technical')
            self.assertEqual(result['quantity']['input_tokens_min'],math.ceil(sum(len(m['content']) for m in body['messages'])/4))
            self.assertEqual(initial_usage(payload,now=PRICES_CHECKED_ON)['prices']['model'],'deepseek-flash')

    def test_multiple_scene_quotes_restore_relative_to_their_own_source_parts(self):
        originals = [funnel_draft(),draft(),process_draft()]
        source = ''.join(s['narration']['text'] for s in originals)
        scenes = []; cursor = 1
        for scene in originals:
            n = len(source_parts(scene['narration']['text']))
            scenes.append(wire(scene,list(range(cursor,cursor+n))));cursor += n
        result = restore_storyboard({'scenes':scenes},source,source_parts(source),require_quotes=True,semantic_graphics=True)
        self.assertEqual(result,{'scenes':originals})
        for ids in [[1,1],[2,1]]:
            bad=copy.deepcopy(scenes);bad[0]['source_part_ids']=ids
            with self.subTest(ids=ids),self.assertRaises(ProviderError):
                restore_storyboard({'scenes':bad},source,source_parts(source),require_quotes=True,semantic_graphics=True)

    def test_action_error_metadata_is_bounded_and_drops_untrusted_values(self):
        from services.workflow.schema_diagnostics import safe_cue_error
        for position in [0,11]:
            value={'path':f'/scenes/19/visual_actions/{position}/cue','reason':'quote_not_found','quote':'secret'}
            self.assertEqual(safe_cue_error(value),{'path':value['path'],'reason':value['reason']})
        for path in ['/scenes/20/visual_actions/0/cue','/scenes/0/visual_actions/12/cue','/scenes/0/visual_actions/01/cue','/scenes/0/secret/0/cue']:
            self.assertIsNone(safe_cue_error({'path':path,'reason':'quote_not_found'}))

    def test_plain_definition_stays_plain_and_parts_must_cover_source_once(self):
        scene={'id':'plain','type':'concept','narration':{'text':'惯性是保持运动状态的性质。'},'elements':[
            {'id':'e0','content':'惯性是保持运动状态的性质','concept_role':'definition','cue':{'text_start':0,'text_end':12}}]}
        scene['elements'][0]['cue']['text_end']=len(scene['elements'][0]['content'])
        self.assertEqual(self.restore(scene),{'scenes':[scene]})
        plain={'id':'closing','type':'card_sequence','narration':{'text':'今天课程结束。'},'elements':[
            {'id':'e0','content':'课程结束','cue':{'text_start':2,'text_end':6}}]}
        self.assertEqual(self.restore(plain),{'scenes':[plain]})
        raw=wire(funnel_draft());raw['source_part_ids'] = raw['source_part_ids'][:-1]
        with self.assertRaises(ProviderError):self.restore(funnel_draft(),raw)
        with self.assertRaises(ProviderError):restore_storyboard({'scenes':[wire(scene)]},scene['narration']['text'],source_parts(scene['narration']['text']),semantic_graphics=True)
