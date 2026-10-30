import unittest
from types import SimpleNamespace
from unittest.mock import Mock

from fastapi import FastAPI
from fastapi.testclient import TestClient


class VisualRoutesTests(unittest.TestCase):
    def setUp(self):
        from services.api.visual import router
        app=FastAPI();app.include_router(router)
        self.jobs=Mock();app.state.visual=self.jobs
        self.client=TestClient(app)
        self.base='/api/projects/11111111-1111-4111-8111-111111111111/visual'

    def test_strict_request_and_project_scoping(self):
        self.jobs.generate.return_value={'id':'test'}
        body={'scene_id':'22222222-2222-4222-8222-222222222222','expected_revision':1,'confirmed':True,'max_requests':2}
        for bad in [{**body,'max_requests':True},{**body,'expected_revision':True},{**body,'arbitrary_path':'/tmp/a'}]:
            self.assertEqual(self.client.post(self.base+'/generate',json=bad).status_code,422)
        self.jobs.generate.assert_not_called()
        self.assertEqual(self.client.post(self.base+'/generate',json=body).status_code,202)
        self.assertEqual(self.jobs.generate.call_args.args[0],self.base.split('/')[3])
        self.assertEqual(self.jobs.generate.call_args.args[-1],'source')

    def test_get_has_no_store_mutations(self):
        self.jobs.list.return_value=[]
        self.assertEqual(self.client.get(self.base).json(),{'jobs':[]})
        self.jobs.list.assert_called_once()

    def test_protocol_only_teaching_plan_is_not_a_production_mode_before_acceptance(self):
        body={'scene_id':'s','expected_revision':1,'confirmed':True,'max_requests':2,'generation_mode':'teaching-plan'}
        for route in ('/generate','/create-video'):
            self.assertEqual(self.client.post(self.base+route,json=body).status_code,422)
        self.jobs.generate.assert_not_called()

    def test_one_click_video_preflights_isolation_and_forwards_explicit_budget(self):
        from unittest.mock import patch
        body={'scene_id':'s','expected_revision':1,'confirmed':True,'max_requests':2,'auto_repair_requests':1}
        self.jobs.generate.return_value={'id':'video'}
        with patch('services.api.visual.subprocess.run') as probe:
            self.assertEqual(self.client.post(self.base+'/create-video',json=body).status_code,202)
            self.assertEqual(self.jobs.generate.call_args.kwargs,{'timing_mode':'measured','auto_render':True,'auto_repair_requests':1})
            probe.assert_called_once()
        self.jobs.generate.reset_mock()
        with patch('services.api.visual.subprocess.run',side_effect=OSError('unavailable')):
            self.assertEqual(self.client.post(self.base+'/create-video',json=body).status_code,503)
            self.jobs.generate.assert_not_called()
        self.jobs.render_video.return_value={'id':'render'}
        with patch('services.api.visual.subprocess.run'):
            self.assertEqual(self.client.post(self.base+'/old-source/render-video',json={'confirmed':True}).status_code,202)
            self.jobs.render_video.assert_called_once_with(self.base.split('/')[3],'old-source',True,0)
        for value in (True,2,-1,'1'):
            self.assertEqual(self.client.post(self.base+'/create-video',json={**body,'auto_repair_requests':value}).status_code,422)
        self.jobs.repair_design_video.return_value={'id':'revision'}
        with patch('services.api.visual.subprocess.run'):
            self.assertEqual(self.client.post(self.base+'/failed/repair-design-video',json={'confirmed':True,'max_requests':2}).status_code,202)
            self.jobs.repair_design_video.assert_called_once_with(self.base.split('/')[3],'failed',True,2)

    def test_quality_repair_budget_is_explicit_bounded_and_not_a_user_feedback_field(self):
        self.jobs.preview.return_value={'id':'preview'}
        body={'confirmed':True,'sha256':'a'*64,'auto_repair_requests':1}
        self.assertEqual(self.client.post(self.base+'/g/preview',json=body).status_code,202)
        self.assertEqual(self.jobs.preview.call_args.kwargs,{'auto_repair_requests':1})
        for value in (True,2,-1,'1'):
            self.assertEqual(self.client.post(self.base+'/g/preview',json={**body,'auto_repair_requests':value}).status_code,422)
        self.jobs.repair_preview.return_value={'id':'repair'}
        self.assertEqual(self.client.post(self.base+'/v/repair-video',json={'confirmed':True,'max_requests':1}).status_code,202)
        self.jobs.repair_preview.assert_called_once_with(self.base.split('/')[3],'v',True,1)
        self.assertEqual(self.client.post(self.base+'/v/repair-video',json={'confirmed':True,'max_requests':1,'feedback':'skip checks'}).status_code,422)

    def test_draft_timing_and_free_alignment_are_explicit_strict_routes(self):
        self.jobs.generate.return_value={'id':'draft'}
        body={'scene_id':'scene','expected_revision':1,'confirmed':True,'max_requests':2,'timing_mode':'draft'}
        self.assertEqual(self.client.post(self.base+'/generate',json=body).status_code,202)
        self.assertEqual(self.jobs.generate.call_args.kwargs,{'timing_mode':'draft'})
        for value in ('guess',True,None):self.assertEqual(self.client.post(self.base+'/generate',json={**body,'timing_mode':value}).status_code,422)
        self.jobs.align_draft.return_value={'id':'aligned'}
        self.assertEqual(self.client.post(self.base+'/draft/align',json={'confirmed':True,'sha256':'a'*64}).status_code,202)
        self.assertEqual(self.jobs.align_draft.call_args.args,(self.base.split('/')[3],'draft',True,'a'*64))
        self.assertEqual(self.client.post(self.base+'/draft/align',json={'confirmed':True,'sha256':'a'*64,'max_requests':1}).status_code,422)

    def test_generation_mode_is_explicit_and_strict(self):
        self.jobs.generate.return_value={'id':'test'}
        body={'scene_id':'scene','expected_revision':1,'confirmed':True,'max_requests':2,'generation_mode':'host-motion'}
        self.assertEqual(self.client.post(self.base+'/generate',json=body).status_code,202)
        self.assertEqual(self.jobs.generate.call_args.args[-1],'host-motion')
        self.jobs.generate.reset_mock()
        for mode in ['automatic','',True,None,[]]:
            self.assertEqual(self.client.post(self.base+'/generate',json={**body,'generation_mode':mode}).status_code,422)
        self.jobs.generate.assert_not_called()

    def test_intent_generation_mode_is_forwarded_without_changing_repair_contract(self):
        self.check_inherited_mode_contract('host-intent')

    def test_components_generation_mode_is_forwarded_without_changing_repair_contract(self):
        self.check_inherited_mode_contract('host-components')

    def check_inherited_mode_contract(self,mode):
        self.jobs.generate.return_value={'id':'test'}
        body={'scene_id':'scene','expected_revision':1,'confirmed':True,'max_requests':2,'generation_mode':mode}
        self.assertEqual(self.client.post(self.base+'/generate',json=body).status_code,202)
        self.assertEqual(self.jobs.generate.call_args.args[-1],mode)
        for action in ('repair','revise-design'):
            self.assertEqual(self.client.post(self.base+'/parent/'+action,json={'confirmed':True,'max_requests':1,'feedback':'fix','generation_mode':mode}).status_code,422)

    def test_source_approval_hash_is_strict(self):
        self.jobs.preview.return_value={'id':'test'}
        for value in ['wrong','f'*63,True]:
            self.assertEqual(self.client.post(self.base+'/abc/preview',json={'confirmed':True,'sha256':value}).status_code,422)
        self.jobs.preview.assert_not_called()

    def test_design_revision_is_explicit_project_scoped_and_rejects_paths(self):
        self.jobs.revise_design.return_value={'id':'new'}
        body={'confirmed':True,'max_requests':2,'feedback':'修复第三步标签的状态衔接'}
        self.assertEqual(self.client.post(self.base+'/parent/revise-design',json={**body,'path':'/tmp/raw'}).status_code,422)
        self.jobs.revise_design.assert_not_called()
        self.assertEqual(self.client.post(self.base+'/parent/revise-design',json=body).status_code,202)
        self.jobs.revise_design.assert_called_once_with(self.base.split('/')[3],'parent',True,2,body['feedback'])


if __name__=='__main__':unittest.main()
