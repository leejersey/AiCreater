import copy
import json
import os
import shutil
import unittest
import uuid
from unittest.mock import Mock,patch
from services.visual import worker


@unittest.skipUnless(shutil.which('node'),'Requires local Node runtime')
class SourceRecoveryWorkerTests(unittest.TestCase):
    def test_real_offline_node_inspection_publishes_text_and_bound_single_repair_input(self):
        parent_id=str(uuid.uuid4());job_id=str(uuid.uuid4());parent=worker.job_directory(parent_id);out=worker.job_directory(job_id)
        parent.mkdir(parents=True)
        self.addCleanup(lambda:shutil.rmtree(parent,ignore_errors=True));self.addCleanup(lambda:shutil.rmtree(out,ignore_errors=True))
        self.addCleanup(lambda:(worker.WORK_ROOT/(job_id+'.input.json')).unlink(missing_ok=True))
        self.addCleanup(lambda:(worker.WORK_ROOT/(job_id+'.log')).unlink(missing_ok=True))
        brief={'schemaVersion':'custom-scene-brief:1','id':'example','title':'Example','narration':'Measured.','visualGoal':'Show change','facts':[],'materials':[],'width':1920,'height':1080,'fps':30,'durationInFrames':60}
        cues=[{'id':'one','text':'Measured.','startFrame':6,'endFrame':54}]
        design={'schemaVersion':'visual-design:1','brief':brief,'cues':cues,'thesis':'Change','metaphor':'Paper','objects':[{'id':'paper','meaning':'input','appearance':'paper','x':100,'y':200,'width':100,'height':100}],
            'beats':[{'cueId':'one','focus':'paper','action':'move','changes':[{'objectId':'paper','from':'left','to':'right'}]}],'composition':'Center','palette':'blueprint','avoid':['cards'],'acceptance':['visible change'],'overlaps':[]}
        source='export default function Scene(){return <svg/>}'
        artifact={'schemaVersion':'custom-scene:1','brief':brief,'rationale':'Draw','source':source}
        suffix='</\uff5c\uff5cDSML\uff5c\uff5c parameter>\n</\uff5c\uff5cDSML\uff5c\uff5c invoke>\n</\uff5c\uff5cDSML\uff5c\uff5c calls>'
        for name,value in {'generation-mode.json':{'generation_mode':'source'},'failure.json':{'failed':True,'requests_dispatched':2},'request-count.json':{'requests_dispatched':2},'frozen-design.json':design,'provider-2.json':{'content':json.dumps(artifact)+suffix,'finishReason':'stop'}}.items():
            (parent/name).write_text(json.dumps(value))
        audio=parent/'audio.dat';audio.write_bytes(b'frozen-audio')
        base={'brief':brief,'cues':cues,'scene':{},'asset':{'id':'voice','checksum':worker._hash(audio)},'fingerprint':'f'}
        original={'id':parent_id,'kind':'generate','state':'failed','input':base,'result':{'requests_dispatched':2}}
        job={'id':job_id,'project_id':'p','scene_id':'s','attempt_id':str(uuid.uuid4()),'kind':'recover-source','input':{**base,'generation_id':parent_id,'generation_mode':'source'}}
        jobs=Mock();jobs.claim.return_value=job;jobs.get.return_value={'current':True};jobs.heartbeat.return_value=True;jobs.get_raw.return_value=original
        jobs.finish.side_effect=lambda _id,_token,result,error=None:{'state':'failed' if error else 'succeeded','result':result,'error':error}
        with patch.dict(os.environ,{'DEEPSEEK_API_KEY':'must-not-leak'}):
            self.assertNotIn('DEEPSEEK_API_KEY',worker.child_environment('recover-source'))
            done=worker.run_once(jobs)
        self.assertEqual(done['state'],'succeeded',done)
        result=done['result'];self.assertEqual(result['requests_dispatched'],0);self.assertEqual(result['source'],source)
        self.assertEqual(result['execution'],'not_run');self.assertNotIn('video',result)
        inspection={**job,'state':'succeeded','result':result}
        jobs.get_raw.side_effect=lambda p,j:inspection if j==job_id else original
        jobs.store.asset_file.return_value=audio
        repair={'kind':'repair','project_id':'p','input':{**base,'generation_mode':'source','recovery_id':job_id,'sha256':result['sha256'],'recovery_sha256':result['recovery_sha256'],'feedback':'Fix motion'}}
        command=worker.command_input(jobs,repair)
        jobs.store.asset_file.assert_called_once_with('p','voice')
        self.assertEqual(command['recovery']['sha256'],result['sha256']);self.assertEqual(command['previous_directory'],str(out));self.assertEqual(command['recovery']['generation_directory'],str(parent))
        bad=copy.deepcopy(repair);bad['input']['sha256']='0'*64
        jobs.store.asset_file.reset_mock()
        with self.assertRaises(ValueError):worker.command_input(jobs,bad)
        jobs.store.asset_file.assert_not_called()
        audio.write_bytes(b'changed')
        with self.assertRaises(ValueError):worker.command_input(jobs,repair)
        audio.write_bytes(b'frozen-audio')
        (out/'source.txt').write_text('changed')
        with self.assertRaises(ValueError):worker.command_input(jobs,repair)
