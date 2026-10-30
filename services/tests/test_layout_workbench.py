import copy
import json
import os
import shutil
import uuid
import unittest
from unittest.mock import MagicMock,patch
from fastapi import FastAPI
from fastapi.testclient import TestClient
from services.visual.store import VisualJobs
from services.projects.store import StoreError

BASE={'brief':{},'cues':[],'scene':{},'asset':{},'fingerprint':'f'}
RESULT={'design_sha256':'a'*64,'original_design_sha256':'b'*64,'layout_sha256':'c'*64,'design':{},'moves':[{'objectId':'label','from':{'x':0,'y':0},'to':{'x':0,'y':40}}],'unresolved':[],'layout_preflight':'passed',
    'requests_dispatched':0,'generation_mode':'source','execution':'not_run','technical':'passed','visual':'pending','production_adopted':False,'diagnostic':True,'_files':{'design.json':'d'*64}}


class LayoutWorkbenchTests(unittest.TestCase):
    @unittest.skipUnless(shutil.which('node'),'Requires local Node runtime')
    def test_real_free_queue_command_and_paid_input_media_gate(self):
        from services.visual import worker
        parent_id=str(uuid.uuid4());job_id=str(uuid.uuid4());parent=worker.job_directory(parent_id);out=worker.job_directory(job_id);parent.mkdir(parents=True)
        self.addCleanup(lambda:shutil.rmtree(parent,ignore_errors=True));self.addCleanup(lambda:shutil.rmtree(out,ignore_errors=True))
        self.addCleanup(lambda:(worker.WORK_ROOT/(job_id+'.input.json')).unlink(missing_ok=True));self.addCleanup(lambda:(worker.WORK_ROOT/(job_id+'.log')).unlink(missing_ok=True))
        brief={'schemaVersion':'custom-scene-brief:1','id':'example','title':'Example','narration':'Measured.','visualGoal':'Show change','facts':[],'materials':[],'width':1920,'height':1080,'fps':30,'durationInFrames':60}
        cues=[{'id':'one','text':'Measured.','startFrame':6,'endFrame':54}]
        design={'schemaVersion':'visual-design:1','brief':brief,'cues':cues,'thesis':'Change','metaphor':'Paper','objects':[{'id':'paper','meaning':'input','appearance':'paper','x':100,'y':200,'width':100,'height':100,'kind':'solid'},
            {'id':'label','meaning':'title','appearance':'label','x':100,'y':200,'width':100,'height':30,'kind':'label'}],'beats':[{'cueId':'one','focus':'paper','action':'move','changes':[{'objectId':'paper','from':'left','to':'right'}]}],
            'composition':'Center','palette':'blueprint','avoid':['cards'],'acceptance':['visible change'],'overlaps':[]}
        for name,value in {'generation-mode.json':{'generation_mode':'source'},'failure.json':{'failed':True,'requests_dispatched':1,'code':'layout_preflight'},'request-count.json':{'requests_dispatched':1},'frozen-design.json':design,'provider-1.json':{'content':json.dumps(design),'finishReason':'stop'}}.items():(parent/name).write_text(json.dumps(value))
        audio=parent/'audio.dat';audio.write_bytes(b'voice');base={**BASE,'brief':brief,'cues':cues,'asset':{'id':'voice','checksum':worker._hash(audio)}}
        original={'id':parent_id,'kind':'generate','state':'failed','input':base,'result':{'requests_dispatched':1}}
        job={'id':job_id,'project_id':'p','scene_id':'s','attempt_id':str(uuid.uuid4()),'kind':'propose-layout','input':{**base,'generation_id':parent_id,'generation_mode':'source'}}
        jobs=MagicMock();jobs.claim.return_value=job;jobs.get.return_value={'current':True};jobs.heartbeat.return_value=True;jobs.get_raw.return_value=original
        jobs.finish.side_effect=lambda _id,_token,result,error=None:{'state':'failed' if error else 'succeeded','result':result,'error':error}
        with patch.dict(os.environ,{'DEEPSEEK_API_KEY':'must-not-leak'}):
            self.assertNotIn('DEEPSEEK_API_KEY',worker.child_environment('propose-layout'));done=worker.run_once(jobs)
        self.assertEqual(done['state'],'succeeded',done);result=done['result'];self.assertEqual(result['layout_preflight'],'passed');self.assertEqual(result['requests_dispatched'],0)
        proposal={**job,'state':'succeeded','result':result};jobs.get_raw.side_effect=lambda p,j:proposal if j==job_id else original;jobs.store.asset_file.return_value=audio
        apply={'kind':'repair','project_id':'p','input':{**base,'layout_id':job_id,'design_sha256':result['design_sha256'],'layout_sha256':result['layout_sha256'],'generation_mode':'source'}}
        command=worker.command_input(jobs,apply);self.assertEqual(command['layout']['design_sha256'],result['design_sha256']);jobs.store.asset_file.assert_called_once_with('p','voice')
        audio.write_bytes(b'changed')
        with self.assertRaises(ValueError):worker.command_input(jobs,apply)

    def test_routes_are_strict_and_capture_both_hashes(self):
        from services.api.visual import router
        app=FastAPI();app.include_router(router);app.state.visual=MagicMock();app.state.visual.propose_layout.return_value={};app.state.visual.apply_layout.return_value={}
        c=TestClient(app);base='/api/projects/p/visual/j'
        self.assertEqual(c.post(base+'/propose-layout',json={'confirmed':True}).status_code,202)
        body={'confirmed':True,'max_requests':1,'design_sha256':'a'*64,'layout_sha256':'c'*64}
        self.assertEqual(c.post(base+'/apply-layout',json=body).status_code,202)
        app.state.visual.apply_layout.assert_called_once_with('p','j',True,1,'a'*64,'c'*64)
        for bad in ({**body,'path':'/tmp/x'},{**body,'layout_sha256':'bad'}):self.assertEqual(c.post(base+'/apply-layout',json=bad).status_code,422)

    def test_free_proposal_and_confirmed_single_code_request_keep_snapshot(self):
        store=MagicMock();store._read.return_value={'id':'p'};jobs=VisualJobs(store)
        parent={'id':'parent','scene_id':'s','kind':'generate','state':'failed','input':copy.deepcopy(BASE),'result':{'requests_dispatched':1}}
        with patch.object(jobs,'_generation',return_value=parent),patch.object(jobs,'_submit',side_effect=lambda c,p,s,k,d:(k,d)):
            self.assertEqual(jobs.propose_layout('p','parent',True),('propose-layout',{**BASE,'generation_id':'parent','generation_mode':'source'}))
        proposal={'id':'proposal','scene_id':'s','kind':'propose-layout','state':'succeeded','input':{**BASE,'generation_id':'parent'},'result':copy.deepcopy(RESULT)}
        with patch.object(jobs,'_read',return_value=proposal),patch.object(jobs,'_current',return_value=True),patch.object(jobs,'_submit',side_effect=lambda c,p,s,k,d:(k,d)):
            kind,data=jobs.apply_layout('p','proposal',True,1,'a'*64,'c'*64);self.assertEqual(kind,'repair');self.assertEqual(data['layout_id'],'proposal')
            for changed in ({'layout_preflight':'failed'},{'moves':[]},{'layout_sha256':'0'*64}):
                proposal['result']={**RESULT,**changed}
                with self.assertRaises(StoreError):jobs.apply_layout('p','proposal',True,1,'a'*64,'c'*64)
        with self.assertRaises(StoreError):VisualJobs(None).apply_layout('p','j',True,2,'a'*64,'c'*64)

    def test_layout_proposal_is_never_a_generation_or_accepted_preview(self):
        row={'kind':'propose-layout','input':{}}
        self.assertTrue(VisualJobs._valid_result(row,RESULT));self.assertFalse(VisualJobs._acceptable({**row,'state':'succeeded','result':RESULT}))
        for change in ({'requests_dispatched':1},{'source':'export {}'},{'sha256':'a'*64},{'video':'video.mp4'},{'accepted':True}):self.assertFalse(VisualJobs._valid_result(row,{**RESULT,**change}))
