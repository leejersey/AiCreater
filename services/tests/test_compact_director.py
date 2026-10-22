import copy,json,unittest
import httpx
from unittest.mock import patch
from services.workflow.providers import deepseek_storyboard,storyboard_request,ProviderError
from services.tests.test_generation import settings,outline

class CompactDirectorTests(unittest.TestCase):
    def test_layout_selection_precedes_exact_layout_specific_id_schema(self):
        from services.workflow.director import request,plan_schema
        from services.workflow.schema_diagnostics import schema_errors
        text='规则，足够长的一段用于教学解释而非短层级标签，模型。'
        initial,_=request(text,'test',None,'popular')
        self.assertEqual(set(initial['tools'][0]['function']['parameters']['properties']['p1']['properties']),{'layout'})
        selection={'p1':{'layout':'funnel'}}
        detailed,_=request(text,'test',None,'popular',layouts=selection)
        field=detailed['tools'][0]['function']['parameters']['properties']['p1']
        self.assertNotIn(2,field['properties']['a']['enum'])
        self.assertNotIn(0,field['properties']['b']['enum'])
        self.assertTrue(schema_errors(detailed['tools'][0]['function']['parameters'],{'p1':{'layout':'funnel','a':2,'b':3,'c':0,'note_a':0,'note_b':0}}))
        self.assertEqual(field,next(v for v in plan_schema(text)['properties']['p1']['anyOf'] if v['properties']['layout']['enum']==['funnel']))

    def test_compiles_fixed_source_sections_without_model_ids_or_text(self):
        from services.workflow.director import compile_plan
        text='先查规则，再查状态，最后找模型，逐层处理。\n\n上一轮选了订单A。这一轮要求取消。关联到订单A。\n\n先识别，再校验，最后执行。'
        wire={'p1':{'layout':'funnel','a':1,'b':2,'c':3,'note_a':4,'note_b':0},'p2':{'layout':'dialogue','a':2,'b':3,'c':0,'state':1,'update':2},'p3':{'layout':'process','a':1,'b':2,'c':3,'d':0,'note_a':0,'note_b':0}}
        before=copy.deepcopy(wire);draft=compile_plan(wire,text)
        self.assertEqual(wire,before);self.assertEqual(''.join(s['narration']['text'] for s in draft['scenes']),text)
        for s,k in zip(draft['scenes'],['funnel','dialogue','process']):self.assertIn(k,s)
        self.assertTrue(any(a['kind']=='update' for a in draft['scenes'][1]['visual_actions']))
        self.assertFalse(any(a['kind']=='highlight' for s in draft['scenes'] for a in s['visual_actions']))
        for s in draft['scenes']:self.assertEqual([a['cue']['text_start'] for a in s['visual_actions']],sorted(a['cue']['text_start'] for a in s['visual_actions']))
        for mutate in [lambda w:w['p1'].update(a=3999),lambda w:w['p1'].update(a='不存在'),lambda w:w['p2'].update(a=1),lambda w:w['p2'].update(state=3,a=1,b=2,update=1),lambda w:w.pop('p3'),lambda w:w['p1'].update(script='alert(1)')]:
            bad=copy.deepcopy(wire);mutate(bad)
            with self.assertRaises(ProviderError):compile_plan(bad,text)
        wire['p1'].update(note_a=0);self.assertNotIn('funnel',compile_plan(wire,text)['scenes'][0])

    def test_dialogue_connects_evidence_only_after_both_endpoints_and_never_connects_result_as_input(self):
        from services.workflow.director import compile_plan
        for text,choice in [
            ('对象未确定。上一轮选中订单A。本轮要求取消。对象关联到订单A。',{'a':2,'b':3,'c':4,'state':1,'update':3}),
            ('上一轮选中订单A。本轮要求取消。对象未确定。对象关联到订单A。',{'a':1,'b':2,'c':4,'state':3,'update':3})]:
            wire={'p1':{'layout':'dialogue',**choice}};before=copy.deepcopy(wire)
            scene=compile_plan(wire,text)['scenes'][0];elements={e['id']:e for e in scene['elements']}
            update=next(a for a in scene['visual_actions'] if a['kind']=='update')
            links=[a for a in scene['visual_actions'] if a['kind']=='connect']
            self.assertEqual(len(links),2)
            self.assertNotIn(update['source'],[a['target'] for a in links])
            for a in links:
                self.assertEqual(a['to'],scene['dialogue']['state'])
                self.assertEqual(a['cue'],max((elements[a['target']],elements[a['to']]),key=lambda e:e['cue']['text_start'])['cue'])
            self.assertEqual(scene['narration']['text'],text);self.assertEqual(wire,before)

    def test_dialogue_update_only_is_not_a_conversation(self):
        from services.workflow.director import compile_plan
        with self.assertRaises(ProviderError) as e:
            compile_plan({'p1':{'layout':'dialogue','a':2,'b':0,'c':0,'state':1,'update':1}},'对象未确定。对象关联到订单A。')
        self.assertEqual(e.exception.code,'diagram_binding')

    def test_dialogue_no_update_connects_but_never_manufactures_a_state_result(self):
        from services.workflow.director import compile_plan
        scene=compile_plan({'p1':{'layout':'dialogue','a':2,'b':0,'c':0,'state':1,'update':0}},'对象未确定。请取消。')['scenes'][0]
        self.assertEqual(sum(a['kind']=='connect' for a in scene['visual_actions']),1)
        self.assertFalse(any(a['kind']=='update' for a in scene['visual_actions']))

    def test_detailed_prompt_explains_source_roles_without_new_fields_or_more_calls(self):
        from services.workflow.director import request
        body,_=request('对象未确定。上一轮选中订单A。本轮要求取消。对象关联到订单A。','test',None,'popular',layouts={'p1':{'layout':'dialogue'}})
        prompt=body['messages'][0]['content'];fields=body['tools'][0]['function']['parameters']['properties']['p1']['properties']
        for word in ['initial state','not a user utterance','evidence-to-state','worked example']:self.assertIn(word,prompt)
        self.assertIn('initial',fields['state'].get('description',''))
        self.assertEqual(set(fields),{'layout','a','b','c','state','update'})

    def test_repeated_words_use_exact_selected_excerpt_positions(self):
        from services.workflow.director import compile_plan
        for text,starts in [('规则，规则。',[0,3]),('🙂规则，🙂规则。',[0,4]),(' 规则， 规则。',[1,5])]:
            result=compile_plan({'p1':{'layout':'cards','a':1,'b':2,'c':0,'d':0}},text)
            self.assertEqual([e['cue']['text_start'] for e in result['scenes'][0]['elements']],starts)
        result=compile_plan({'p1':{'layout':'dialogue','a':2,'b':3,'c':0,'state':1,'update':2}},'取消。取消。取消。')
        update=next(a for a in result['scenes'][0]['visual_actions'] if a['kind']=='update')
        self.assertEqual(update['cue']['text_start'],6)

    def test_flat_strict_schema_and_safe_unused_slot_compatibility(self):
        from services.workflow.director import compile_plan
        body,_=storyboard_request('先识别，再校验。','test',semantic_graphics=True,compact_director=True)
        self.assertNotIn('anyOf',json.dumps(body['tools'][0]['function']['parameters']))
        flat={'p1':{'layout':'process','a':1,'b':2,'c':0,'d':0,'state':0,'update':0,'note_a':0,'note_b':0}}
        before=copy.deepcopy(flat);self.assertIn('process',compile_plan(flat,'先识别，再校验。')['scenes'][0]);self.assertEqual(flat,before)
        self.assertIn('process',compile_plan({'p1':{'layout':'process','a':1,'b':2}},'先识别，再校验。')['scenes'][0])
        for extras in [{'state':1},{'unknown':0},{'state':False},{'a':0},{'a':'1'}]:
            bad=copy.deepcopy(flat);bad['p1'].update(extras)
            with self.assertRaises(ProviderError):compile_plan(bad,'先识别，再校验。')
        self.assertIsNone(compile_plan({'p1':{**flat['p1'],'layout':'standard','a':0,'b':0}},'先识别，再校验。'))

    def test_compact_diagnostics_keep_only_bounded_program_field_names(self):
        from services.workflow.schema_diagnostics import safe_schema_errors
        self.assertEqual(safe_schema_errors([{'path':'/p2/state','rule':'enum'},{'path':'/secret-key','rule':'type'}]),[{'path':'/p2/state','rule':'enum'},{'path':'/','rule':'type'}])

    def test_strict_tool_schema_and_original_id(self):
        wire={'p1':{'layout':'process','a':1,'b':2,'c':0,'d':0,'note_a':0,'note_b':0}};text='先识别，再校验。'
        def handler(request):
            body=json.loads(request.content);self.assertEqual(request.url.path,'/beta/chat/completions')
            fn=body['tools'][0]['function'];self.assertTrue(fn['strict']);self.assertEqual(fn['name'],'plan_lesson')
            def check(s):
                if s.get('type')=='object':self.assertEqual(set(s['required']),set(s['properties']));self.assertFalse(s['additionalProperties'])
                for v in s.values():
                    if isinstance(v,dict):check(v)
                    elif isinstance(v,list):
                        for x in v:
                            if isinstance(x,dict):check(x)
            check(fn['parameters'])
            return self.phase_response(request,wire)
        with httpx.Client(transport=httpx.MockTransport(handler)) as client:result=deepseek_storyboard(text,settings(),client,{'id':'original'},semantic_graphics=True,compact_director=True)
        self.assertEqual(result['scenes'][0]['id'],'original')
        with self.assertRaises(ProviderError):storyboard_request(text,'test',compact_director=True)

    def phase_response(self,request,wire):
        fields=json.loads(request.content)['tools'][0]['function']['parameters']['properties']
        if all(set(f['properties'])=={'layout'} for f in fields.values()):wire={k:{'layout':v['layout']} for k,v in wire.items()}
        return self.response(wire)

    def response(self,wire):
        return httpx.Response(200,json={'usage':{'prompt_tokens':2,'completion_tokens':3,'total_tokens':5},'choices':[{'finish_reason':'tool_calls','message':{'tool_calls':[{'type':'function','function':{'name':'plan_lesson','arguments':json.dumps(wire)}}]}}]})

    def test_parallel_plan_fragments_merge_only_when_disjoint(self):
        text='先识别，再校验。\n\n先选择，再执行。'
        fragments=[{'p1':{'layout':'process','a':1,'b':2,'c':0,'d':0,'note_a':0,'note_b':0}},{'p2':{'layout':'process','a':1,'b':2,'c':0,'d':0,'note_a':0,'note_b':0}}]
        def response(values,name='plan_lesson'):
            return httpx.Response(200,json={'choices':[{'finish_reason':'tool_calls','message':{'tool_calls':[{'type':'function','function':{'name':name,'arguments':json.dumps(v)}} for v in values]}}]})
        def handler(req):
            fields=json.loads(req.content)['tools'][0]['function']['parameters']['properties']
            return response([{k:{'layout':v['layout']} for k,v in f.items()} for f in fragments] if all(set(f['properties'])=={'layout'} for f in fields.values()) else fragments)
        with httpx.Client(transport=httpx.MockTransport(handler)) as client:self.assertEqual(len(deepseek_storyboard(text,settings(),client,semantic_graphics=True,compact_director=True)['scenes']),2)
        for values,name in [(fragments[:1]*2,'plan_lesson'),(fragments,'execute_tool')]:
            with httpx.Client(transport=httpx.MockTransport(lambda _:response(values,name))) as client,self.assertRaises(ProviderError):deepseek_storyboard(text,settings(),client,semantic_graphics=True,compact_director=True)

    def test_two_phases_keep_two_call_limit_and_aggregate_usage(self):
        calls=[];events=[];wire={'p1':{'layout':'process','a':1,'b':2,'c':0,'d':0,'note_a':0,'note_b':0}}
        def handler(req):calls.append(json.loads(req.content));return self.phase_response(req,wire)
        with httpx.Client(transport=httpx.MockTransport(handler)) as client:
            deepseek_storyboard('先识别，再校验。',settings(),client,semantic_graphics=True,compact_director=True,on_usage=events.append)
        self.assertEqual(len(calls),2)
        self.assertEqual(events,[{'state':'submitted'},{'state':'reported','input_tokens':4,'output_tokens':6}])
        self.assertEqual(calls[1]['tools'][0]['function']['parameters']['properties']['p1']['properties']['b']['enum'],[1,2])

    def test_bad_layout_stops_early_and_bad_detail_never_triggers_a_third_request(self):
        for selection,detail,expected in [({'layout':'unknown'},None,1),({'layout':'funnel'},{'layout':'funnel','a':2,'b':3,'c':0,'note_a':0,'note_b':0},2),({'layout':'funnel'},{'layout':'cards','a':1,'b':3,'c':0,'d':0},2)]:
            calls=[]
            def handler(req):
                calls.append(req);return self.response({'p1':selection if len(calls)==1 else detail})
            with self.subTest(selection=selection,detail=detail),httpx.Client(transport=httpx.MockTransport(handler)) as client:
                with self.assertRaises(ProviderError) as err:
                    deepseek_storyboard('规则，足够长的一段用于教学解释而非短层级标签，模型。',settings(),client,semantic_graphics=True,compact_director=True)
                self.assertEqual(len(calls),expected)
                self.assertNotIn('anyOf',[e['rule'] for e in err.exception.schema_errors])

    def test_specialized_fallback_is_bounded_and_usage_sums_both_calls(self):
        calls=[];events=[]
        def handler(req):
            calls.append(req.url.path)
            if len(calls)==1:return self.response({'p1':{'layout':'standard'}})
            raw=outline('规则匹配。')['scenes'][0];raw.pop('narration');raw['source_part_ids']=[1];raw['elements'][0]['cue']={'quote':'规则匹配'}
            return httpx.Response(200,json={'usage':{'prompt_tokens':2,'completion_tokens':3,'total_tokens':5},'choices':[{'finish_reason':'stop','message':{'content':json.dumps({'scenes':[raw]})}}]})
        with httpx.Client(transport=httpx.MockTransport(handler)) as client:deepseek_storyboard('规则匹配。',settings(),client,semantic_graphics=True,compact_director=True,on_usage=events.append)
        self.assertEqual(len(calls),2);self.assertEqual(events,[{'state':'submitted'},{'state':'reported','input_tokens':4,'output_tokens':6}])

    def test_v5_worker_retains_v4_and_estimates_bounded_calls(self):
        import io
        from contextlib import redirect_stdout
        from services.workflow.worker import child
        from services.projects.estimates import estimate_payload
        scene={'id':'s','narration':{'text':'先识别，再校验。'},'elements':[],'type':'card_sequence'}
        for version in [4,5,6]:
            payload={'kind':'generate','protocol_version':f'teaching-outline:{version}','model':'deepseek-flash','source_text':scene['narration']['text']}
            with patch('services.workflow.providers.deepseek_storyboard',return_value={'scenes':[scene]}) as fn,patch('httpx.Client'),patch.dict('os.environ',{'DEEPSEEK_API_KEY':'test'}),patch('sys.stdin',io.StringIO(json.dumps(payload))),redirect_stdout(io.StringIO()):child()
            self.assertEqual(fn.call_args.kwargs.get('compact_director',False),version>=5)
            self.assertEqual(fn.call_args.kwargs.get('role_director',False),version==6)
            estimate=estimate_payload(payload);self.assertEqual(estimate['status'],'estimated');self.assertEqual(estimate['quantity']['calls'],2 if version>=5 else 1)
