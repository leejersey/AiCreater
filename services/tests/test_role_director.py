import copy,json,unittest
import httpx
from services.workflow.director import compile_plan,request
from services.workflow.providers import deepseek_storyboard,ProviderError
from services.tests.test_generation import settings
TEXT='上一轮用户选中了订单A。这一轮只说“取消”。当前对象未确定。不能直接认定执行成功。把取消对象关联到订单A。'
CHOICE={'p1':{'layout':'dialogue','context':1,'message':2,'initial_state':3,'state_after':5}}
def role_draft():
 return compile_plan(CHOICE,TEXT,roles=True)['scenes'][0]

class RoleDirectorTests(unittest.TestCase):
 def test_all_roles_use_excerpt_ids_and_no_slot_ordinal(self):
  body,_=request(TEXT,'test',None,'popular',layouts={'p1':{'layout':'dialogue'}},roles=True)
  props=body['tools'][0]['function']['parameters']['properties']['p1']['properties']
  self.assertEqual(set(props),{'layout','context','message','initial_state','state_after'})
  self.assertIn(5,props['state_after']['enum']);self.assertNotIn(0,props['message']['enum']);self.assertIn(0,props['context']['enum'])
  self.assertNotIn('1/2/3',body['messages'][0]['content'])
  from services.workflow.schema_diagnostics import schema_errors
  self.assertEqual(schema_errors(body['tools'][0]['function']['parameters'],{'p1':{**CHOICE['p1'],'state_after':99}}),[{'path':'/p1/state_after','rule':'enum'}])
 def test_compile_retains_context_and_current_roles_and_result_source(self):
  before=copy.deepcopy(CHOICE);s=compile_plan(CHOICE,TEXT,roles=True)['scenes'][0];self.assertEqual(CHOICE,before)
  es={e['id']:e for e in s['elements']};d=s['dialogue'];self.assertEqual([es[i]['content'] for i in d['context_messages']],['上一轮用户选中了订单A'])
  links=[a for a in s['visual_actions'] if a['kind']=='connect'];self.assertEqual(len(links),2)
  update=next(a for a in s['visual_actions'] if a['kind']=='update');self.assertEqual(es[update['source']]['content'],'把取消对象关联到订单A')
  self.assertNotIn(update['source'],[a['target'] for a in links]);self.assertEqual(es[d['state']]['content'],'当前对象未确定')
 def test_absent_context_and_result_are_explicit_and_invalid_roles_rejected(self):
  choice=copy.deepcopy(CHOICE);choice['p1'].update(context=0,state_after=0)
  s=compile_plan(choice,TEXT,roles=True)['scenes'][0];self.assertEqual(s['dialogue']['context_messages'],[]);self.assertFalse(any(a['kind']=='update' for a in s['visual_actions']))
  for change in [{'update':2},{'state_after':99},{'message':0},{'context':2},{'initial_state':5,'state_after':1}]:
   bad=copy.deepcopy(CHOICE);bad['p1'].update(change)
   with self.subTest(change=change),self.assertRaises(ProviderError):compile_plan(bad,TEXT,roles=True)
 def test_legacy_schema_and_compile_keep_old_slot_semantics(self):
  old={'p1':{'layout':'dialogue','a':1,'b':2,'c':5,'state':3,'update':3}}
  self.assertNotIn('context_messages',compile_plan(old,TEXT)['scenes'][0]['dialogue'])
 def test_two_stage_provider_carries_role_mode_without_network(self):
  calls=[]
  def handler(req):
   calls.append(json.loads(req.content));value={'p1':{'layout':'dialogue'}} if len(calls)==1 else CHOICE
   return httpx.Response(200,json={'choices':[{'finish_reason':'tool_calls','message':{'tool_calls':[{'type':'function','function':{'name':'plan_lesson','arguments':json.dumps(value)}}]}}]})
  with httpx.Client(transport=httpx.MockTransport(handler)) as client:result=deepseek_storyboard(TEXT,settings(),client,semantic_graphics=True,compact_director=True,role_director=True)
  self.assertEqual(len(calls),2);self.assertIn('context_messages',result['scenes'][0]['dialogue'])
