"""Teaching image decisions are metadata, never implicit image-generation requests."""
import copy
import json
import os
import unittest
from unittest.mock import patch
import httpx
from services.workflow.providers import Settings, ProviderError, storyboard_request, deepseek_storyboard
from services.workflow.storyboard import restore_storyboard, source_parts
from services.tests.test_projects import ProjectFixture

TEXT = '项目甲独立管理依赖，项目乙互不影响。'

def raw_plan(needed=True):
    return {'needed': needed, 'reason': '用独立工具箱解释隔离' if needed else '命令用代码组件即可', 'requirements': [
        {'element_id':'a','purpose':'metaphor','description':'独立蓝色工具箱，不含文字',
         'composition':'主体完整，简洁底色，为程序标签留白','alt':'项目甲的独立工具箱','quote':'项目甲独立管理依赖'},
        {'element_id':'b','purpose':'metaphor','description':'独立黄色工具箱，不含文字',
         'composition':'主体完整，简洁底色，为程序标签留白','alt':'项目乙的独立工具箱','quote':'项目乙互不影响'}] if needed else []}

def wire():
    return {'scenes':[{'id':'s1','type':'comparison_panel','source_part_ids':[1],
        'elements':[{'id':'a','content':'项目甲','cue':{'quote':'项目甲独立管理依赖'}},
                    {'id':'b','content':'项目乙','cue':{'quote':'项目乙互不影响'}}], 'image_plan':raw_plan()}]}

class ImagePlanTests(unittest.TestCase):
    def restore(self, raw):
        return restore_storyboard(raw,TEXT,source_parts(TEXT),require_quotes=True,semantic_graphics=True,image_planning=True)

    def test_single_request_even_if_compact_requested_and_narration_unchanged(self):
        requests=[]
        def response(request):
            requests.append(request)
            return httpx.Response(200,json={'choices':[{'finish_reason':'stop','message':{'content':json.dumps(wire())}}]})
        with httpx.Client(transport=httpx.MockTransport(response)) as client:
            draft=deepseek_storyboard(TEXT,Settings('key','deepseek-flash','','','','',''),client,
                                     semantic_graphics=True,compact_director=True,image_planning=True)
        self.assertEqual(len(requests),1)
        self.assertNotIn('tools',json.loads(requests[0].content))
        self.assertEqual(draft['scenes'][0]['narration']['text'],TEXT)
        self.assertEqual(draft['scenes'][0]['image_plan'],raw_plan())

    def test_explicit_no_image_and_old_protocol_still_work(self):
        raw=wire();raw['scenes'][0]['image_plan']=raw_plan(False)
        self.assertFalse(self.restore(raw)['scenes'][0]['image_plan']['needed'])
        del raw['scenes'][0]['image_plan']
        restore_storyboard(raw,TEXT,source_parts(TEXT),require_quotes=True,semantic_graphics=True)
        with self.assertRaises(ProviderError):self.restore(raw)

    def test_strict_targets_quotes_limits_and_unsupported_layouts(self):
        mutations=[lambda s:s['image_plan'].update(needed=False),
            lambda s:s['image_plan']['requirements'][0].update(element_id='missing'),
            lambda s:s['image_plan']['requirements'][0].update(quote='没有这句话'),
            lambda s:s['image_plan']['requirements'][0].update(quote='项目甲'),
            lambda s:s['image_plan']['requirements'][0].update(url='https://example.org/x'),
            lambda s:s['image_plan']['requirements'].append(copy.deepcopy(s['image_plan']['requirements'][0])),
            lambda s:s['image_plan']['requirements'][1].update(element_id='a'),
            lambda s:s.update(type='flow_diagram'),lambda s:s.update(motif='means_row'),
            lambda s:s['image_plan'].update(reason='\u200b'),
            lambda s:s['image_plan']['requirements'][0].update(description='x\u0000y')]
        for mutate in mutations:
            raw=wire();mutate(raw['scenes'][0])
            with self.subTest(raw=raw),self.assertRaises(ProviderError):self.restore(raw)

    def test_materials_are_inert_and_schema_does_not_accept_final_assets(self):
        body,_=storyboard_request(TEXT,'deepseek-flash',semantic_graphics=True,image_planning=True,
                materials=[{'id':'s1','title':'依赖隔离','narration':TEXT,'materials':'uv add requests','visual_intent':'展示工具箱'}])
        self.assertIn('image_plan',body['messages'][0]['content'])
        self.assertIn('Never generate images',body['messages'][0]['content'])
        self.assertIn('uv add requests',body['messages'][1]['content'])
        raw=wire();raw['scenes'][0]['images']=[{'asset_id':'fake','element_id':'a','alt':'图'}]
        with self.assertRaises(ProviderError):self.restore(raw)


class ImagePlanWorkerTests(unittest.TestCase):
    def test_new_protocol_forwards_planning_once_without_changing_legacy(self):
        import io
        from contextlib import redirect_stdout
        from services.workflow.worker import child
        for protocol in ['teaching-outline:8','scene-candidate:8','teaching-outline:9','scene-candidate:9','teaching-outline:7']:
            payload={'kind':'generate','source_text':TEXT,'model':'deepseek-flash','protocol_version':protocol}
            output=io.StringIO()
            with self.subTest(protocol=protocol), patch('sys.stdin',io.StringIO(json.dumps(payload))), redirect_stdout(output), \
                 patch.dict('os.environ',{'DEEPSEEK_API_KEY':'test'}), \
                 patch('services.workflow.providers.deepseek_storyboard',return_value={'scenes':[]}) as generate:
                child()
            self.assertEqual(generate.call_count,1)
            self.assertEqual(generate.call_args.kwargs.get('image_planning',False),not protocol.endswith(':7'))
            self.assertNotIn('compact_director',generate.call_args.kwargs)
            self.assertEqual(json.loads(output.getvalue()),{'draft':{'scenes':[]}})

    def test_paper_slide_skips_raster_planning(self):
        import io
        from contextlib import redirect_stdout
        from services.workflow.image_plans import image_planning_enabled, paper_vector_plan
        from services.workflow.worker import child
        self.assertFalse(image_planning_enabled('teaching-outline:9', 'paper_slide'))
        self.assertTrue(image_planning_enabled('teaching-outline:8', None))
        payload={'kind':'generate','source_text':TEXT,'model':'deepseek-flash','protocol_version':'teaching-outline:9','visual_style':'paper_slide'}
        output=io.StringIO()
        with patch('sys.stdin',io.StringIO(json.dumps(payload))), redirect_stdout(output), \
             patch.dict('os.environ',{'DEEPSEEK_API_KEY':'test'}), \
             patch('services.workflow.providers.deepseek_storyboard',return_value={'scenes':[{'id':'s1'}]}) as generate:
            child()
        self.assertFalse(generate.call_args.kwargs.get('image_planning', False))
        scene=json.loads(output.getvalue())['draft']['scenes'][0]
        self.assertEqual(scene['image_plan'], paper_vector_plan())
        self.assertFalse(scene['image_plan']['needed'])


@unittest.skipUnless(os.environ.get('TEST_DATABASE_URL'),'Use disposable PostgreSQL')
class ImagePlanStoreTests(ProjectFixture,unittest.TestCase):
    def test_outline_plans_separate_from_dsl_and_survive_freezing(self):
        from services.projects.jobs import Jobs
        from services.projects.estimates import estimate_payload
        draft=restore_storyboard(wire(),TEXT,source_parts(TEXT),require_quotes=True,semantic_graphics=True,image_planning=True)
        project=self.store.create_project('隔离',TEXT)
        jobs=Jobs(self.store,model='deepseek-flash');job=jobs.submit_generate(project['id'],project['revision'])
        self.assertEqual(job['input']['protocol_version'],'teaching-outline:8')
        self.assertEqual(estimate_payload(job['input'])['quantity']['calls'],1)
        active=jobs.claim();jobs.publish_outline(job['id'],active['attempt_id'],draft)
        saved=self.store.get_project(project['id']);row=saved['scenes'][0]
        entry=saved['config']['image_plans']['s1']
        self.assertEqual(entry['status'],'planned')
        self.assertEqual(len(entry['plan']['requirements']),2)
        self.assertNotIn('image_plan',row['scene'])
        self.assertNotIn('image_plans',self.store._dsl(saved))
        self.assertEqual(Jobs._draft_scene(row['scene'])['narration']['text'],TEXT)
        # Editing narration invalidates the old decision instead of silently reusing old anchors.
        self.store.edit_scene(row['id'],row['revision'],{'narration_text':'项目甲独立管理依赖，项目乙彼此隔离。'})
        changed=self.store.get_project(project['id'])
        self.assertEqual(changed['config']['image_plans']['s1']['status'],'needs_review')
        self.assertEqual(changed['config']['image_plans']['s1']['plan'],entry['plan'])

    def test_accept_candidate_keeps_plan_out_of_render_and_voice(self):
        row=next(r for r in self.project['scenes'] if r['scene']['type']=='card_sequence')
        from services.projects.jobs import Jobs
        draft=Jobs._draft_scene(row['scene']);draft['image_plan']=raw_plan(False)
        candidate=self.store.create_candidate(row['id'],row['revision'],draft)
        accepted=self.store.accept_candidate(row['id'],candidate['id'],row['revision'])
        new=next(r for r in accepted['scenes'] if r['id']==row['id'])
        self.assertEqual(new['scene']['narration'],row['scene']['narration'])
        self.assertNotIn('image_plan',new['scene'])
        self.assertFalse(accepted['config']['image_plans'][row['scene_key']]['plan']['needed'])
        version=self.store.create_version(accepted['id'],accepted['revision'])
        self.assertNotIn('image_plans',version['dsl'])
        self.assertEqual(version['profile']['image_plans'],accepted['config']['image_plans'])
