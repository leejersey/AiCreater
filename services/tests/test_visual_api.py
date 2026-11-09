"""Ownership and queue boundary checks against an owned disposable database."""
from contextlib import ExitStack
import os
import copy
import json
from pathlib import Path
import tempfile
import unittest
import uuid
from unittest.mock import Mock, patch

from fastapi.testclient import TestClient
from psycopg.types.json import Jsonb

from services.projects.store import Store
from services.tests.test_projects import PROFILE


@unittest.skipUnless(os.environ.get('TEST_DATABASE_URL'),'Requires disposable PostgreSQL')
class VisualApiTests(unittest.TestCase):
    def setUp(self):
        from services.api.app import create_app
        stack=ExitStack();self.addCleanup(stack.close)
        self.store=Store(os.environ['TEST_DATABASE_URL'],stack.enter_context(tempfile.TemporaryDirectory()),PROFILE)
        self.client=stack.enter_context(TestClient(create_app(self.store),base_url='http://127.0.0.1:8000',client=('127.0.0.1',51000)))
        # Many tests register from the same address; a disposable database may reset the registration rate limit.
        with self.store.connection() as conn:conn.execute('DELETE FROM auth_limits')
        self.assertEqual(self.client.post('/api/auth/register',json={'username':'qa_'+uuid.uuid4().hex[:16],'password':'test-password-2026'}).status_code,201)
        project=self.client.post('/api/projects',json={'title':'Visual QA','source_text':'先读代码。再修改文件。'}).json()
        self.pid=project['id'];self.path='/api/projects/'+self.pid+'/visual'
        # Workers claim the oldest queued job of a lane: start each test with nothing queued or running.
        with self.store.connection() as conn:conn.execute("UPDATE jobs SET state='cancelled' WHERE state IN ('queued','running')")

    def test_prepare_is_local_strict_and_ownership_checked(self):
        self.assertEqual(self.client.get(self.path).json(),{'jobs':[]})
        for body in [{'expected_revision':True},{'expected_revision':1,'paid':True}]:
            self.assertEqual(self.client.post(self.path+'/prepare',json=body).status_code,422)
        # Creating the course already prepared its chapters; preparing again changes nothing.
        current=self.client.get('/api/projects/'+self.pid).json()
        self.assertTrue(current['scenes'])
        response=self.client.post(self.path+'/prepare',json={'expected_revision':current['revision']})
        self.assertEqual(response.status_code,200,response.text)
        self.assertTrue(response.json()['scenes'])
        self.assertEqual(self.client.get(self.path).json(),{'jobs':[]})
        with self.store.connection() as conn:
            self.assertEqual(conn.execute('SELECT count(*) AS n FROM jobs WHERE project_id=%s',[self.pid]).fetchone()['n'],0)
        self.client.post('/api/auth/logout',json={})
        self.assertEqual(self.client.get(self.path).status_code,401)
        self.client.post('/api/auth/register',json={'username':'other_'+uuid.uuid4().hex[:16],'password':'test-password-2026'})
        self.assertEqual(self.client.get(self.path).status_code,404)
        self.assertEqual(self.client.post(self.path+'/prepare',json={'expected_revision':1}).status_code,404)

    def test_a_deleted_chapter_can_be_restored_in_place_for_ten_minutes(self):
        project=self.client.get('/api/projects/'+self.pid).json()
        project=self.client.post(self.path+'/chapters/'+project['scenes'][0]['id']+'/split',json={'expected_revision':project['revision'],'at':5}).json()
        first,second=[s['id'] for s in project['scenes']]
        deleted=self.client.post(self.path+'/chapters/'+first+'/delete',json={'expected_revision':project['revision'],'confirmed':True}).json()
        self.assertEqual([s['id'] for s in deleted['scenes']],[second])
        url=self.path+'/chapters/'+first+'/restore'
        self.assertEqual(self.client.post(url,json={'expected_revision':project['revision'],'at':0}).status_code,409)  # stale revision
        restored=self.client.post(url,json={'expected_revision':deleted['revision'],'at':0})
        self.assertEqual(restored.status_code,200,restored.text)
        self.assertEqual([s['id'] for s in restored.json()['scenes']],[first,second])
        self.assertEqual(self.client.post(url,json={'expected_revision':restored.json()['revision'],'at':0}).status_code,409)  # not deleted any more
        again=self.client.post(self.path+'/chapters/'+first+'/delete',json={'expected_revision':restored.json()['revision'],'confirmed':True}).json()
        with self.store.connection() as conn:conn.execute("UPDATE scenes SET deleted_at=now()-interval '11 minutes' WHERE id=%s",[first])
        self.assertEqual(self.client.post(url,json={'expected_revision':again['revision'],'at':0}).status_code,409)

    def test_a_running_agent_shows_its_newest_frames(self):
        from services.visual import worker
        project,row,_=self.ready_scene()
        job=self.client.post(self.path+'/agent',json={'scene_id':row['id'],'expected_revision':project['revision'],'confirmed':True,'max_turns':25}).json()
        live=self.path+'/'+job['id']+'/live'
        self.assertEqual(self.client.get(live).json(),{'frames':[]})  # queued: nothing yet
        claim=self.client.app.state.visual.claim('workflow')
        root=self.store.public.resolve()/'visual'
        with patch.object(worker,'WORK_ROOT',root):
            stills=worker.job_directory(job['id'])/'workspace'/'stills'
            old=stills/'aaaaaaaaaaaa';old.mkdir(parents=True)
            for n in (30,60):(old/f'frame-{n:04d}.png').write_bytes(b'old')
            import os as _os,time as _time;_os.utime(old,(_time.time()-60,_time.time()-60))
            new=stills/'bbbbbbbbbbbb';new.mkdir()
            for n in (30,60,90,120,150):(new/f'frame-{n:04d}.png').write_bytes(b'png%d'%n)
            frames=self.client.get(live).json()['frames']
            self.assertEqual(frames,['bbbbbbbbbbbb/frame-0030.png','bbbbbbbbbbbb/frame-0090.png','bbbbbbbbbbbb/frame-0150.png'])
            self.assertEqual(self.client.get(live+'/bbbbbbbbbbbb/frame-0090.png').content,b'png90')
            for bad in ['/aaaaaaaaaaaa/frame-0030.png'.replace('aaaaaaaaaaaa','..'),'/bbbbbbbbbbbb/..%2Fsecret.png','/bbbbbbbbbbbb/source.txt']:
                self.assertEqual(self.client.get(live+bad).status_code,404,bad)
            self.client.app.state.visual.cancel(self.pid,job['id'])
            self.client.app.state.visual.finish(job['id'],claim['attempt_id'],{})
            self.assertEqual(self.client.get(live).json(),{'frames':[]})  # ended: no live view

    def test_the_course_pipeline_moves_chapters_one_step_at_a_time_and_never_retries(self):
        from cryptography.fernet import Fernet
        from services import chapters
        from services.visual.autopilot import Autopilot
        project,row,_=self.ready_scene()
        with self.store.connection() as conn:
            project=self.store._insert_scene(conn,self.store._read(conn,self.pid),chapters.chapter('第二句话。',None),1,'needs_voice')
        second=project['scenes'][1]['id']
        plan=self.client.get(self.path+'/autopilot').json()
        self.assertEqual([c['steps'] for c in plan['chapters']],[['agent'],['voice','agent']])
        self.assertEqual((plan['agent']['chapters'],plan['agent']['max_turns_total']),(2,50))
        self.assertEqual(plan['voice']['quantity']['characters'],len('第二句话。'))
        self.assertEqual(plan['llm'],{'source':'env','model':'deepseek-flash'})
        body={'expected_revision':project['revision'],'confirmed':True,'max_turns':20}
        self.assertEqual(self.client.post(self.path+'/autopilot',json={**body,'confirmed':False}).status_code,422)
        started=self.client.post(self.path+'/autopilot',json=body).json()
        self.assertEqual((started['autopilot']['state'],started['autopilot']['scene_ids']),('running',[row['id'],second]))
        self.assertEqual(started['revision'],project['revision'])  # not a content change
        pilot=Autopilot(self.store)
        kind,agent_id=pilot.advance()[0]
        self.assertEqual(kind,'agent')
        self.assertEqual(self.client.app.state.visual.get_raw(self.pid,agent_id)['input']['max_turns'],20)
        self.assertEqual(pilot.advance(),[])  # one step at a time
        self.client.app.state.visual.cancel(self.pid,agent_id)  # this chapter's try ended without a version
        kind,voice_id=pilot.advance()[0]
        self.assertEqual(kind,'voice')
        with self.store.connection() as conn:conn.execute("UPDATE jobs SET state='failed',ended_at=now() WHERE id=%s",[voice_id])
        self.assertEqual(pilot.advance(),[('done',self.pid)])  # failed steps are not retried
        self.assertEqual(self.client.get('/api/projects/'+self.pid).json()['autopilot']['state'],'done')
        # A change of model settings after confirming stops a pipeline before its next Agent step.
        with self.store.connection() as conn:conn.execute("UPDATE jobs SET created_at=now()-interval '1 hour' WHERE project_id=%s",[self.pid])
        project=self.client.get('/api/projects/'+self.pid).json()
        self.client.post(self.path+'/autopilot',json={**body,'expected_revision':project['revision']})
        with patch.dict(os.environ,{'ACCOUNT_CREDENTIALS_KEY':Fernet.generate_key().decode()}):
            self.client.post('/api/auth/model-settings',json={'base_url':'https://api.example.com/v1','api_key':'k','model':'m'},headers={'Origin':'http://127.0.0.1:3000'})
            self.assertEqual(pilot.advance(),[('stopped','llm_changed')])
        self.assertEqual(self.client.get('/api/projects/'+self.pid).json()['autopilot']['reason'],'llm_changed')
        restarted=self.client.post(self.path+'/autopilot',json={**body,'expected_revision':project['revision']}).json()
        stopped=self.client.post(self.path+'/autopilot/stop',json={}).json()
        self.assertEqual((restarted['autopilot']['state'],stopped['autopilot']['state'],stopped['autopilot']['reason']),('running','stopped','user'))

    def test_the_course_streams_a_change_event_for_the_page(self):
        import services.api.app as api
        with patch.object(api,'EVENT_TICKS',1),self.client.stream('GET','/api/projects/'+self.pid+'/events') as response:
            self.assertEqual(response.headers['content-type'].split(';')[0],'text/event-stream')
            first=next(response.iter_lines())
            self.assertEqual(first,'event: change')
        self.client.cookies.clear()
        self.assertEqual(self.client.get('/api/projects/'+self.pid+'/events').status_code,401)

    def test_pending_audio_blocks_paid_visual_dispatch(self):
        project=self.client.get('/api/projects/'+self.pid).json()
        body={'scene_id':project['scenes'][0]['id'],'expected_revision':project['revision'],'confirmed':True,'max_turns':25}
        self.assertEqual(self.client.post(self.path+'/agent',json=body).status_code,409)
        self.assertEqual(self.client.get(self.path).json(),{'jobs':[]})

    def ready_scene(self,project=None):
        """A prepared scene with real measured audio on disk, as voicing and alignment would leave it."""
        import hashlib
        project=project or self.client.get('/api/projects/'+self.pid).json()
        row=project['scenes'][0];scene=row['scene'];text=scene['narration']['text']
        scene.update(duration_frames=60,captions=[{'text':text,'start_frame':0,'end_frame':60}])
        scene['narration'].update(audio_asset_id='voice',audio_start_frame=0)
        audio=b'RIFF-test-audio';(self.store.public/'generated').mkdir(parents=True,exist_ok=True);(self.store.public/'generated'/'voice.wav').write_bytes(audio)
        config=project['config'];config['assets']=[{'id':'voice','type':'audio','checksum':hashlib.sha256(audio).hexdigest(),'storage_key':'generated/voice.wav','duration_ms':2000}]
        with self.store.connection() as conn:
            conn.execute("UPDATE scenes SET scene=%s,state='ready' WHERE id=%s",[Jsonb(scene),row['id']])
            conn.execute('UPDATE projects SET config=%s WHERE id=%s',[Jsonb(config),self.pid])
        return project,row,text

    def test_chapters_can_be_edited_split_merged_and_deleted_and_lose_their_voice(self):
        project,row,text=self.ready_scene()  # '先读代码。再修改文件。' as one voiced chapter
        base=self.path+'/chapters/'+row['id']
        texts=lambda p:[s['scene']['narration']['text'] for s in p['scenes']]
        for body in [{'expected_revision':project['revision'],'narration':''},{'expected_revision':project['revision'],'narration':'x'*801},{'expected_revision':project['revision']}]:
            self.assertEqual(self.client.patch(base,json=body).status_code,422)
        self.assertEqual(self.client.patch(base,json={'expected_revision':project['revision']+1,'narration':'改'}).status_code,409)
        edited=self.client.patch(base,json={'expected_revision':project['revision'],'narration':'先读代码。然后修改文件。'})
        self.assertEqual(edited.status_code,200,edited.text);edited=edited.json()
        chapter=edited['scenes'][0]
        self.assertEqual((chapter['state'],chapter['revision']),('needs_voice',row['revision']+1))
        self.assertNotIn('audio_asset_id',chapter['scene']['narration']);self.assertNotIn('captions',chapter['scene'])
        split=self.client.post(base+'/split',json={'expected_revision':edited['revision'],'at':5}).json()
        self.assertEqual(texts(split),['先读代码。','然后修改文件。'])
        self.assertTrue(all(s['state']=='needs_voice' for s in split['scenes']))
        for at in [0,13]:self.assertEqual(self.client.post(base+'/split',json={'expected_revision':split['revision'],'at':at}).status_code,422)
        last=split['scenes'][1]['id']
        self.assertEqual(self.client.post(self.path+'/chapters/'+last+'/merge-next',json={'expected_revision':split['revision']}).status_code,422)
        merged=self.client.post(base+'/merge-next',json={'expected_revision':split['revision']}).json()
        self.assertEqual(texts(merged),['先读代码。然后修改文件。'])
        self.assertEqual(self.client.post(base+'/delete',json={'expected_revision':merged['revision'],'confirmed':True}).status_code,422)  # keep one
        again=self.client.post(base+'/split',json={'expected_revision':merged['revision'],'at':5}).json()
        self.assertEqual(self.client.post(base+'/delete',json={'expected_revision':again['revision'],'confirmed':False}).status_code,422)
        deleted=self.client.post(base+'/delete',json={'expected_revision':again['revision'],'confirmed':True}).json()
        self.assertEqual(texts(deleted),['然后修改文件。'])
        # A queued job blocks editing; another user's project is not reachable.
        _,ready,_=self.ready_scene(deleted)
        current=self.client.get('/api/projects/'+self.pid).json()
        job=self.client.post(self.path+'/agent',json={'scene_id':ready['id'],'expected_revision':current['revision'],'confirmed':True,'max_turns':25}).json()
        self.assertEqual(self.client.patch(self.path+'/chapters/'+ready['id'],json={'expected_revision':current['revision'],'narration':'改'}).status_code,409)
        self.client.post(self.path+'/'+job['id']+'/cancel',json={})

    def test_agent_request_requires_confirmed_turn_limit_and_measured_audio(self):
        project=self.client.get('/api/projects/'+self.pid).json()
        body={'scene_id':project['scenes'][0]['id'],'expected_revision':project['revision'],'confirmed':True,'max_turns':25}
        self.assertEqual(self.client.post(self.path+'/agent',json=body).status_code,409)  # no voice yet
        project,row,_=self.ready_scene(project)
        body.update(scene_id=row['id'],expected_revision=project['revision'])
        for change in [{'confirmed':False},{'max_turns':0},{'max_turns':26},{'max_turns':True}]:
            response=self.client.post(self.path+'/agent',json={**body,**change})
            self.assertIn(response.status_code,(400,422),change)
        self.assertEqual(self.client.get(self.path).json(),{'jobs':[]})
        job=self.client.post(self.path+'/agent',json=body).json()
        self.assertEqual((job['kind'],job['state'],job['input_summary']['model'],job['input_summary']['max_turns']),('agent','queued','deepseek-flash-thinking',25))
        self.assertEqual(self.client.post(self.path+'/agent',json=body).json()['id'],job['id'])  # identical request reuses the job
        # Leave no queued job behind: workers in other tests claim the oldest queued job of their lane.
        self.assertEqual(self.client.post(self.path+'/'+job['id']+'/cancel',json={}).json()['state'],'cancelled')

    def test_the_owners_model_is_frozen_at_submission_and_a_later_change_stops_the_job(self):
        from cryptography.fernet import Fernet
        from services.visual import worker
        key=Fernet.generate_key().decode()
        with patch.dict(os.environ,{'ACCOUNT_CREDENTIALS_KEY':key,'DEEPSEEK_API_KEY':'sk-server','DATABASE_URL':'postgresql://secret'}),\
             patch.object(worker,'WORK_ROOT',self.store.public.resolve()/'visual'),patch.object(worker,'_stop'):
            saved=self.client.post('/api/auth/model-settings',json={'base_url':'https://api.example.com/v1','api_key':'sk-own','model':'qwen-plus'},headers={'Origin':'http://127.0.0.1:3000'})
            self.assertEqual(saved.status_code,200,saved.text)
            project,row,_=self.ready_scene()
            body={'scene_id':row['id'],'expected_revision':project['revision'],'confirmed':True,'max_turns':25}
            job=self.client.post(self.path+'/agent',json=body).json()
            self.assertEqual(job['input_summary']['llm'],{'source':'account','model':'qwen-plus'})
            raw=self.client.app.state.visual.get_raw(self.pid,job['id'])
            self.assertEqual(raw['input']['llm']['base_url'],'https://api.example.com/v1')
            self.assertNotIn('sk-own',json.dumps(raw['input']))
            # Changed after confirming: never runs with the new settings, nothing launched.
            self.client.post('/api/auth/model-settings',json={'base_url':'https://api.example.com/v1','api_key':'','model':'qwen-max'},headers={'Origin':'http://127.0.0.1:3000'})
            done=worker.run_once(self.client.app.state.visual,launcher=lambda *a,**k:self.fail('launched with changed settings'))
            self.assertEqual(done['state'],'failed');self.assertIn('模型配置在提交后变更',done['error']);self.assertEqual(done['error_code'],'agent_llm_changed')
            # Unchanged: the child gets the owner's key and not the server's.
            again=self.client.post(self.path+'/agent',json=body).json()
            seen={}
            def launcher(command,**options):
                seen.update(env=options['env']);raise RuntimeError('stop here')
            worker.run_once(self.client.app.state.visual,launcher=launcher)
            self.assertEqual((seen['env']['ACCOUNT_LLM_API_KEY'],seen['env']['ACCOUNT_LLM_MODEL']),('sk-own','qwen-max'))
            self.assertNotIn('DEEPSEEK_API_KEY',seen['env']);self.assertNotIn('ACCOUNT_CREDENTIALS_KEY',seen['env'])
            self.assertEqual(again['input_summary']['llm']['model'],'qwen-max')

    def run_agent_job(self,write,check=lambda job:None):
        from services.visual import worker
        project,row,text=self.ready_scene()
        job=self.client.post(self.path+'/agent',json={'scene_id':row['id'],'expected_revision':project['revision'],'confirmed':True,'max_turns':25}).json()
        seen={}
        def launcher(command,**options):
            seen.update(command=command,env=options['env'],input=json.loads(Path(command[-2]).read_text()))
            output=Path(command[-1]);output.mkdir();write(output)
            process=Mock();process.poll.return_value=0;process.returncode=0
            return process
        root=self.store.public.resolve()/'visual'
        with patch.dict(os.environ,{'DEEPSEEK_API_KEY':'sk-test','DATABASE_URL':'postgresql://secret'}),patch.object(worker,'WORK_ROOT',root),patch.object(worker,'_stop'):
            done=worker.run_once(self.client.app.state.visual,launcher=launcher)
            check(job)  # files live under the patched work root
        return job,done,seen,text

    def test_a_passed_agent_version_can_be_revised_with_feedback(self):
        from services.visual import worker
        import hashlib
        source='export default function Scene(){return null;}'
        sha=hashlib.sha256(source.encode()).hexdigest()
        def write(output):
            (output/'source.txt').write_text(source);(output/'video.mp4').write_bytes(b'mp4');(output/'video.srt').write_text('1\n')
            (output/'stills').mkdir();(output/'stills'/'frame-30.png').write_bytes(b'png')
            (output/'result.json').write_text(json.dumps({'status':'passed','model':'deepseek-flash-thinking','turns':4,'requests_dispatched':4,
                'usage':{'inputTokens':1,'outputTokens':1,'cachedInputTokens':0},'sha256':sha,'finish_by':'model',
                'frames':['stills/frame-30.png'],'video':'video.mp4','srt':'video.srt'}))
        def check(job):
            project=self.client.get('/api/projects/'+self.pid).json();row=project['scenes'][0]
            body={'scene_id':row['id'],'expected_revision':project['revision'],'confirmed':True,'max_turns':25}
            for bad in [{'revise':job['id']},{'feedback':'放大'},{'revise':job['id'],'feedback':'   '},{'revise':job['id'],'feedback':'x'*2001},{'revise':str(uuid.uuid4()),'feedback':'放大'}]:
                self.assertIn(self.client.post(self.path+'/agent',json={**body,**bad}).status_code,(404,409,422),bad)
            revised=self.client.post(self.path+'/agent',json={**body,'revise':job['id'],'feedback':' 把流程图画大一些 '})
            self.assertEqual(revised.status_code,202,revised.text);revised=revised.json()
            self.assertEqual((revised['input_summary']['revision_of'],revised['input_summary']['feedback']),(job['id'],'把流程图画大一些'))
            seen={}
            def launcher(command,**options):
                seen.update(input=json.loads(Path(command[-2]).read_text()))
                process=Mock();process.poll.return_value=0;process.returncode=0;return process
            worker.run_once(self.client.app.state.visual,launcher=launcher)
            self.assertEqual(seen['input']['revision']['feedback'],'把流程图画大一些')
            self.assertEqual(seen['input']['revision']['sha256'],sha)
            self.assertEqual(Path(seen['input']['revision']['source_file']).read_text(),source)
        job,done,_,_=self.run_agent_job(write,check)
        self.assertEqual(done['state'],'succeeded',done.get('error'))

    def test_agent_job_runs_the_scene_agent_and_publishes_a_voiced_video(self):
        source='export default function Scene(){return null;}'
        def write(output):
            (output/'source.txt').write_text(source);(output/'video.mp4').write_bytes(b'mp4');(output/'video.srt').write_text('1\n')
            (output/'stills').mkdir();(output/'stills'/'frame-30.png').write_bytes(b'png')
            (output/'result.json').write_text(json.dumps({'status':'passed','model':'deepseek-flash-thinking','turns':6,'requests_dispatched':6,
                'usage':{'inputTokens':70000,'outputTokens':19000,'cachedInputTokens':66000},'sha256':'c'*64,'finish_by':'model',
                'frames':['stills/frame-30.png'],'video':'video.mp4','srt':'video.srt'}))
        def files(job):
            video=self.client.get(self.path+'/'+job['id']+'/files/video.mp4')
            self.assertEqual((video.status_code,video.content),(200,b'mp4'))
            self.assertIn('captions.srt',self.client.get(self.path+'/'+job['id']+'/files/video.srt').headers['content-disposition'])
            self.assertEqual(self.client.get(self.path+'/'+job['id']+'/files/source.txt').text,source)
            self.assertEqual(self.client.get(self.path+'/'+job['id']+'/files/stills/frame-30.png').content,b'png')
        job,done,seen,text=self.run_agent_job(write,files)
        self.assertEqual(done['state'],'succeeded',done.get('error'))
        self.assertTrue(seen['command'][1].endswith('scripts/scene-agent-job.ts'))
        self.assertEqual(seen['env'].get('DEEPSEEK_API_KEY'),'sk-test');self.assertNotIn('DATABASE_URL',seen['env'])
        self.assertEqual((seen['input']['model'],seen['input']['max_turns'],seen['input']['brief']['narration']),('deepseek-flash-thinking',25,text))
        self.assertTrue(Path(seen['input']['audio_file']).is_file())
        public=self.client.get(self.path).json()['jobs'][0]
        self.assertEqual((public['result']['status'],public['result']['turns'],public['result']['finish_by']),('passed',6,'model'))
        self.assertNotIn('_files',public['result'])

    def test_a_new_theme_restyles_a_passed_version_without_a_model_call(self):
        from services.visual import worker
        import hashlib
        source='export default function Scene(){return null;}'
        sha=hashlib.sha256(source.encode()).hexdigest()
        def write(output):
            (output/'source.txt').write_text(source);(output/'video.mp4').write_bytes(b'mp4');(output/'video.srt').write_text('1\n')
            (output/'stills').mkdir();(output/'stills'/'frame-30.png').write_bytes(b'png')
            (output/'result.json').write_text(json.dumps({'status':'passed','model':'deepseek-flash-thinking','turns':4,'requests_dispatched':4,
                'usage':{'inputTokens':1,'outputTokens':1,'cachedInputTokens':0},'sha256':sha,'finish_by':'model',
                'frames':['stills/frame-30.png'],'video':'video.mp4','srt':'video.srt'}))
        def check(job):
            project=self.client.get('/api/projects/'+self.pid).json()
            url=self.path+'/'+job['id']+'/restyle'
            self.assertEqual(self.client.post(url,json={'expected_revision':project['revision']}).status_code,422)  # already in this theme
            project=self.client.patch('/api/projects/'+self.pid+'/theme',json={'expected_revision':project['revision'],'theme_id':'paper-press'}).json()
            self.assertEqual(self.client.post(url,json={'expected_revision':project['revision']-1}).status_code,409)
            restyle=self.client.post(url,json={'expected_revision':project['revision']})
            self.assertEqual(restyle.status_code,202,restyle.text);restyle=restyle.json()
            self.assertEqual((restyle['kind'],restyle['input_summary']['agent_id'],restyle['input_summary']['theme_id']),('restyle',job['id'],'paper-press'))
            self.assertEqual(self.client.post(url,json={'expected_revision':project['revision']}).json()['id'],restyle['id'])  # deduplicated
            self.assertIsNone(worker.run_once(self.client.app.state.visual,lane='workflow',launcher=lambda *a,**k:self.fail('wrong lane')))
            seen={}
            def launcher(command,**options):
                seen.update(command=command,env=options['env'],input=json.loads(Path(command[-2]).read_text()))
                output=Path(command[-1]);output.mkdir()
                (output/'video.mp4').write_bytes(b'paper');(output/'video.srt').write_text('1\n')
                (output/'result.json').write_text(json.dumps({'video':'video.mp4','srt':'video.srt','durationInFrames':60}))
                process=Mock();process.poll.return_value=0;process.returncode=0;return process
            done=worker.run_once(self.client.app.state.visual,lane='render',launcher=launcher)
            self.assertEqual(done['state'],'succeeded',done.get('error'))
            self.assertTrue(seen['command'][1].endswith('scene-agent-course-job.ts'))
            self.assertNotIn('DEEPSEEK_API_KEY',seen['env'])
            self.assertEqual(seen['input']['theme']['id'],'paper-press')
            self.assertEqual(Path(seen['input']['chapters'][0]['source_file']).read_text(),source)
            listed=lambda job_id:next(j for j in self.client.get(self.path).json()['jobs'] if j['id']==job_id)
            self.assertTrue(listed(done['id'])['current'])
            self.assertEqual(self.client.get(self.path+'/'+done['id']+'/files/video.mp4').content,b'paper')
            # Another theme change makes the restyled preview historical; the Agent version itself stays current.
            project=self.client.get('/api/projects/'+self.pid).json()
            self.client.patch('/api/projects/'+self.pid+'/theme',json={'expected_revision':project['revision'],'theme_id':'chalk-garden'})
            self.assertFalse(listed(done['id'])['current'])
            self.assertTrue(listed(job['id'])['current'])
        job,done,_,_=self.run_agent_job(write,check)
        self.assertEqual(done['state'],'succeeded',done.get('error'))

    def test_a_course_card_shows_a_still_of_its_latest_passed_video(self):
        import hashlib
        listed=lambda:next(p for p in self.client.get('/api/projects').json() if p['id']==self.pid)
        self.assertEqual((listed()['thumbnail'],listed()['theme_id']),(None,'blueprint'))
        source='export default function Scene(){return null;}'
        def write(output):
            (output/'source.txt').write_text(source);(output/'video.mp4').write_bytes(b'mp4');(output/'video.srt').write_text('1\n')
            (output/'stills').mkdir()
            for n in (30,60,90):(output/'stills'/f'frame-{n}.png').write_bytes(b'png')
            (output/'result.json').write_text(json.dumps({'status':'passed','model':'deepseek-flash-thinking','turns':4,'requests_dispatched':4,
                'usage':{'inputTokens':1,'outputTokens':1,'cachedInputTokens':0},'sha256':hashlib.sha256(source.encode()).hexdigest(),'finish_by':'model',
                'frames':['stills/frame-30.png','stills/frame-60.png','stills/frame-90.png'],'video':'video.mp4','srt':'video.srt'}))
        job,done,_,_=self.run_agent_job(write)
        self.assertEqual(done['state'],'succeeded',done.get('error'))
        self.assertEqual(listed()['thumbnail'],{'job_id':job['id'],'file':'stills/frame-60.png'})

    def revoice(self,audio=b'RIFF-new-recording',duration=72):
        """A new recording of the same words: another audio asset, other durations, same captions text."""
        import hashlib
        (self.store.public/'generated'/'voice2.wav').write_bytes(audio)
        with self.store.connection() as conn:
            project=self.store._read(conn,self.pid);row=project['scenes'][0];scene=copy.deepcopy(row['scene'])
            text=scene['narration']['text']
            scene.update(duration_frames=duration,captions=[{'text':text,'start_frame':0,'end_frame':duration}])
            scene['narration']['audio_asset_id']='voice2'
            config=copy.deepcopy(project['config'])
            config['assets'].append({'id':'voice2','type':'audio','storage_key':'generated/voice2.wav','checksum':hashlib.sha256(audio).hexdigest(),'duration_ms':duration*1000//30})
            conn.execute('UPDATE projects SET config=%s,revision=revision+1 WHERE id=%s',[Jsonb(config),self.pid])
            conn.execute('UPDATE scenes SET scene=%s,revision=revision+1 WHERE id=%s',[Jsonb(scene),row['id']])

    def test_a_retimable_version_survives_a_new_recording_and_is_re_rendered_on_it(self):
        import hashlib
        from services.visual import worker
        source='export default function Scene({timing}:any){return null;}'
        sha=hashlib.sha256(source.encode()).hexdigest()
        def write(output,retimable=True):
            (output/'source.txt').write_text(source);(output/'video.mp4').write_bytes(b'mp4');(output/'video.srt').write_text('1\n')
            (output/'stills').mkdir();(output/'stills'/'frame-30.png').write_bytes(b'png')
            (output/'result.json').write_text(json.dumps({'status':'passed','model':'deepseek-flash-thinking','turns':4,'requests_dispatched':4,
                'usage':{'inputTokens':1,'outputTokens':1,'cachedInputTokens':0},'sha256':sha,'finish_by':'model','retimable':retimable,
                'frames':['stills/frame-30.png'],'video':'video.mp4','srt':'video.srt'}))
        job,done,_,_=self.run_agent_job(write)
        self.assertEqual(done['state'],'succeeded',done.get('error'))
        accepted=self.client.post(self.path+'/'+job['id']+'/accept',json={'confirmed':True,'sha256':sha})
        self.assertEqual(accepted.status_code,200,accepted.text)
        listed=lambda job_id:next(j for j in self.client.get(self.path).json()['jobs'] if j['id']==job_id)
        self.assertEqual((listed(job['id'])['input_summary']['retimable'],listed(job['id'])['input_summary']['timing_current']),(True,True))
        self.revoice()
        after=listed(job['id'])
        self.assertTrue(after['current']);self.assertTrue(after['accepted'])        # the words did not change
        self.assertEqual(after['input_summary']['timing_current'],False)          # its own video is on the old recording
        visual=self.client.app.state.visual
        with self.store.connection() as conn:conn.execute("UPDATE jobs SET result=result-'retimable' WHERE kind='agent' AND project_id<>%s",[self.pid])
        restyle=visual.retime_stale()
        self.assertEqual((restyle['kind'],restyle['input_summary']['agent_id']),('restyle',job['id']))
        raw=visual.get_raw(self.pid,restyle['id'])
        self.assertEqual(raw['input']['asset']['id'],'voice2');self.assertEqual(raw['input']['scene']['duration_frames'],72)
        self.assertIsNone(visual.retime_stale())  # one re-render per recording
        # The export renders every chapter on its current recording.
        with self.store.connection() as conn:conn.execute("UPDATE jobs SET state='cancelled' WHERE id=%s",[restyle['id']])
        project=self.client.get('/api/projects/'+self.pid).json()
        export=self.client.post(self.path+'/export',json={'expected_revision':project['revision'],'confirmed':True})
        self.assertEqual(export.status_code,202,export.text)
        chapter=visual.get_raw(self.pid,export.json()['id'])['input']['chapters'][0]
        self.assertEqual((chapter['asset']['id'],chapter['scene']['duration_frames']),('voice2',72))
        self.assertTrue(listed(export.json()['id'])['current'])

    def test_a_version_with_fixed_frames_does_not_survive_a_new_recording(self):
        import hashlib
        source='export default function Scene(){return null;}'
        sha=hashlib.sha256(source.encode()).hexdigest()
        def write(output):
            (output/'source.txt').write_text(source);(output/'video.mp4').write_bytes(b'mp4');(output/'video.srt').write_text('1\n')
            (output/'stills').mkdir();(output/'stills'/'frame-30.png').write_bytes(b'png')
            (output/'result.json').write_text(json.dumps({'status':'passed','model':'deepseek-flash-thinking','turns':4,'requests_dispatched':4,
                'usage':{'inputTokens':1,'outputTokens':1,'cachedInputTokens':0},'sha256':sha,'finish_by':'model',
                'frames':['stills/frame-30.png'],'video':'video.mp4','srt':'video.srt'}))
        job,done,_,_=self.run_agent_job(write)
        self.client.post(self.path+'/'+job['id']+'/accept',json={'confirmed':True,'sha256':sha})
        self.revoice()
        after=next(j for j in self.client.get(self.path).json()['jobs'] if j['id']==job['id'])
        self.assertFalse(after['current']);self.assertNotIn('retimable',after['input_summary'])
        mine=lambda r:r is not None and r['project_id']==self.pid  # other tests' projects share the database
        self.assertFalse(mine(self.client.app.state.visual.retime_stale()))

    def test_accepted_agent_video_exports_through_the_agent_course_renderer(self):
        from services.visual import worker
        source='export default function Scene(){return null;}'
        import hashlib
        sha=hashlib.sha256(source.encode()).hexdigest()
        def write(output):
            (output/'source.txt').write_text(source);(output/'video.mp4').write_bytes(b'mp4');(output/'video.srt').write_text('1\n')
            (output/'stills').mkdir();(output/'stills'/'frame-30.png').write_bytes(b'png')
            (output/'result.json').write_text(json.dumps({'status':'passed','model':'deepseek-flash-thinking','turns':4,'requests_dispatched':4,
                'usage':{'inputTokens':1,'outputTokens':1,'cachedInputTokens':0},'sha256':sha,'finish_by':'model',
                'frames':['stills/frame-30.png'],'video':'video.mp4','srt':'video.srt'}))
        root=self.store.public.resolve()/'visual'
        def check(job):
            project=self.client.get('/api/projects/'+self.pid).json()
            export=self.client.post(self.path+'/export',json={'expected_revision':project['revision'],'confirmed':True})
            self.assertEqual(export.status_code,409)  # not accepted yet
            self.assertEqual(self.client.post(self.path+'/'+job['id']+'/accept',json={'confirmed':True,'sha256':'0'*64}).status_code,409)
            accepted=self.client.post(self.path+'/'+job['id']+'/accept',json={'confirmed':True,'sha256':sha})
            self.assertEqual(accepted.status_code,200,accepted.text);self.assertTrue(accepted.json()['result']['accepted'])
            export=self.client.post(self.path+'/export',json={'expected_revision':project['revision'],'confirmed':True})
            self.assertEqual(export.status_code,202,export.text);export=export.json()
            seen={}
            def launcher(command,**options):
                seen.update(command=command,input=json.loads(Path(command[-2]).read_text()))
                output=Path(command[-1]);output.mkdir()
                (output/'video.mp4').write_bytes(b'course');(output/'video.srt').write_text('1\n')
                (output/'result.json').write_text(json.dumps({'video':'video.mp4','srt':'video.srt','durationInFrames':60}))
                process=Mock();process.poll.return_value=0;process.returncode=0
                return process
            done=worker.run_once(self.client.app.state.visual,lane='render',launcher=launcher)
            self.assertEqual(done['state'],'succeeded',done.get('error'))
            self.assertTrue(seen['command'][1].endswith('scripts/scene-agent-course-job.ts'))
            [chapter]=seen['input']['chapters']
            self.assertEqual((chapter['kind'],chapter['sha256']),('agent',sha))
            self.assertEqual(Path(chapter['source_file']).read_text(),source)
            self.assertEqual(self.client.get(self.path+'/'+export['id']+'/files/video.mp4').content,b'course')
        self.run_agent_job(write,check)

    def test_agent_lease_outlives_the_default_240_seconds(self):
        project,row,_=self.ready_scene()
        job=self.client.post(self.path+'/agent',json={'scene_id':row['id'],'expected_revision':project['revision'],'confirmed':True,'max_turns':25}).json()
        jobs=self.client.app.state.visual
        claimed=jobs.claim('workflow');self.assertEqual(claimed['id'],job['id'])
        def age(seconds):
            with self.store.connection() as conn:
                conn.execute("UPDATE jobs SET started_at=now()-make_interval(secs=>%s) WHERE id=%s",[seconds,job['id']])
        age(300)  # chapters with many labels routinely take 4-6 minutes
        self.assertTrue(jobs.heartbeat(job['id'],claimed['attempt_id']))
        self.assertIsNone(jobs.claim('render'))  # recovery in the other lane must not expire it either
        self.assertEqual(self.client.get(self.path).json()['jobs'][0]['state'],'running')
        age(1900)
        self.assertFalse(jobs.heartbeat(job['id'],claimed['attempt_id']))

    def test_agent_progress_reaches_the_job_stage(self):
        from services.visual import worker
        from services.projects.store import StoreError
        project,row,_=self.ready_scene()
        job=self.client.post(self.path+'/agent',json={'scene_id':row['id'],'expected_revision':project['revision'],'confirmed':True,'max_turns':25}).json()
        jobs=self.client.app.state.visual
        claimed=jobs.claim('workflow')
        with tempfile.TemporaryDirectory() as directory:
            (Path(directory)/'workspace').mkdir()
            lines=['{"type":"start"}','{"type":"turn","turn":1}','{"type":"turn","turn":2}',
                   json.dumps({'type':'auto_check','text':'typecheck passed\naudit of frames 1: 2 high / 0 medium / 0 low'},separators=(',',':'),ensure_ascii=False)]
            (Path(directory)/'workspace'/'transcript.jsonl').write_text('\n'.join(lines)+'\n')
            stage=worker.agent_progress(directory)
        self.assertEqual(stage,'第 2 轮 · 检查发现 2 个需修正的问题')
        self.assertTrue(jobs.heartbeat(job['id'],claimed['attempt_id'],stage))
        self.assertEqual(self.client.get(self.path).json()['jobs'][0]['stage'],stage)
        with self.assertRaises(StoreError):jobs.heartbeat(job['id'],claimed['attempt_id'],'x'*121)
        self.assertEqual(self.client.post(self.path+'/'+job['id']+'/cancel',json={}).json()['state'],'running')
        self.assertFalse(jobs.heartbeat(job['id'],claimed['attempt_id']))  # the worker is told to stop and then reports it
        self.assertEqual(jobs.finish(job['id'],claimed['attempt_id'],{'requests_dispatched':2},error='agent_internal')['state'],'cancelled')

    def test_stopping_an_already_exited_process_group_does_not_raise(self):
        from services.visual import worker
        process=Mock();process.pid=999999
        with patch.object(worker.os,'killpg',side_effect=PermissionError(1,'Operation not permitted')):
            worker._stop(process)
        process.wait.assert_called()

    def test_agent_failure_counts_answered_turns_from_the_transcript(self):
        # A run that crashed before writing result.json, with a final request that never got a response.
        def write(output):
            (output/'workspace').mkdir()
            lines=[{'type':'start'}]+[{'type':'turn','turn':i} for i in (1,2,3,4)]+[{'type':'provider_error','turn':5}]
            (output/'workspace'/'transcript.jsonl').write_text(''.join(json.dumps(l,separators=(',',':'))+'\n' for l in lines))
            (output/'result.json').write_text(json.dumps({'status':'failed','reason':'provider_request: HTTP 400: context too long','model':'deepseek-flash-thinking','turns':5,
                'usage':{'inputTokens':9,'outputTokens':9,'cachedInputTokens':0},'requests_dispatched':5}))
        _,done,_,_=self.run_agent_job(write)
        self.assertEqual(done['state'],'failed')
        self.assertIn('模型服务拒绝了请求格式',done['error'])
        self.assertEqual(done['result']['requests_dispatched'],4)

    def test_agent_run_that_stops_fails_honestly_and_reports_paid_turns(self):
        def write(output):
            (output/'workspace').mkdir()
            (output/'workspace'/'transcript.jsonl').write_text(''.join(json.dumps({'type':'turn','turn':i},separators=(',',':'))+'\n' for i in range(1,26)))
            (output/'result.json').write_text(json.dumps({'status':'stopped','reason':'budget_turns','model':'deepseek-flash-thinking','turns':25,'requests_dispatched':25,
                'usage':{'inputTokens':1,'outputTokens':1,'cachedInputTokens':0}}))
        _,done,_,_=self.run_agent_job(write)
        self.assertEqual(done['state'],'failed')
        self.assertIn('Agent 未在轮数上限内完成',done['error'])
        self.assertEqual(done['result']['requests_dispatched'],25)

    def test_agent_rejected_key_says_so_and_counts_no_paid_turn(self):
        def write(output):
            (output/'result.json').write_text(json.dumps({'status':'stopped','reason':'provider_auth','model':'deepseek-flash-thinking','turns':1,'requests_dispatched':1,
                'usage':{'inputTokens':0,'outputTokens':0,'cachedInputTokens':0}}))
        _,done,_,_=self.run_agent_job(write)
        self.assertEqual(done['state'],'failed')
        self.assertIn('模型服务拒绝请求',done['error'])
        self.assertEqual(done['result']['requests_dispatched'],0)

    def test_agent_result_claiming_success_without_video_is_rejected(self):
        def write(output):
            (output/'source.txt').write_text('x')
            (output/'result.json').write_text(json.dumps({'status':'passed','model':'deepseek-flash-thinking','turns':3,'requests_dispatched':3,
                'usage':{'inputTokens':1,'outputTokens':1,'cachedInputTokens':0},'sha256':'c'*64,'finish_by':'model','frames':[],'video':'video.mp4','srt':'video.srt'}))
        _,done,_,_=self.run_agent_job(write)
        self.assertEqual(done['state'],'failed')

if __name__=='__main__':unittest.main()
