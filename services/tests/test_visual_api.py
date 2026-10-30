"""Ownership and queue boundary checks against an owned disposable database."""
from contextlib import ExitStack
import os
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
        self.assertEqual(self.client.post('/api/auth/register',json={'username':'qa_'+uuid.uuid4().hex[:16],'password':'test-password-2026'}).status_code,201)
        project=self.client.post('/api/projects',json={'title':'Visual QA','source_text':'先读代码。再修改文件。'}).json()
        self.pid=project['id'];self.path='/api/projects/'+self.pid+'/visual'

    def test_prepare_is_local_strict_and_ownership_checked(self):
        self.assertEqual(self.client.get(self.path).json(),{'jobs':[]})
        for body in [{'expected_revision':True},{'expected_revision':1,'paid':True}]:
            self.assertEqual(self.client.post(self.path+'/prepare',json=body).status_code,422)
        response=self.client.post(self.path+'/prepare',json={'expected_revision':1})
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

    def test_pending_audio_blocks_paid_visual_dispatch(self):
        project=self.client.post(self.path+'/prepare',json={'expected_revision':1}).json()
        body={'scene_id':project['scenes'][0]['id'],'expected_revision':project['revision'],'confirmed':True,'max_requests':2}
        self.assertEqual(self.client.post(self.path+'/generate',json=body).status_code,409)
        self.assertEqual(self.client.get(self.path).json(),{'jobs':[]})

    def test_queue_executor_publishes_authenticated_text_not_executable_source(self):
        self.check_queue_executor('source')

    def test_host_mode_survives_api_queue_and_published_result(self):
        self.check_queue_executor('host-motion')

    def test_intent_mode_survives_api_queue_and_published_result(self):
        self.check_queue_executor('host-intent')

    def test_components_mode_survives_api_queue_and_published_result(self):
        self.check_queue_executor('host-components')

    def check_queue_executor(self,mode):
        from services.visual import worker
        project=self.client.post(self.path+'/prepare',json={'expected_revision':1}).json()
        row=project['scenes'][0];scene=row['scene'];text=scene['narration']['text']
        scene.update(duration_frames=60,captions=[{'text':text,'start_frame':0,'end_frame':60}])
        scene['narration'].update(audio_asset_id='voice',audio_start_frame=0)
        config=project['config'];config['assets']=[{'id':'voice','type':'audio','checksum':'a'*64,'storage_key':'generated/voice.wav','duration_ms':2000}]
        with self.store.connection() as conn:
            conn.execute("UPDATE scenes SET scene=%s,state='ready' WHERE id=%s",[Jsonb(scene),row['id']])
            conn.execute('UPDATE projects SET config=%s WHERE id=%s',[Jsonb(config),self.pid])
        response=self.client.post(self.path+'/generate',json={'scene_id':row['id'],'expected_revision':project['revision'],'confirmed':True,'max_requests':2,'generation_mode':mode})
        self.assertEqual(response.status_code,202,response.text)
        job=response.json();source='export default function Scene(){return null;}'
        # Synthetic provider output checks the queue boundary without dispatching a paid request.
        def launcher(command,**options):
            self.assertNotIn('DATABASE_URL',options['env']);self.assertNotIn('VOLCENGINE_API_KEY',options['env'])
            data=json.loads(Path(command[-2]).read_text());self.assertEqual(data['brief']['narration'],text)
            self.assertEqual(data.get('generation_mode','source'),mode)
            output=Path(command[-1]);output.mkdir()
            (output/'source.txt').write_text(source);(output/'design.json').write_text('{}')
            result={'sha256':'b'*64,'design_sha256':'d'*64,'source':source,'design':{},'requests_dispatched':2}
            if mode!='source':result.update(generation_mode=mode,assembly_sha256='e'*64)
            if mode in ('host-intent','host-components'):result['intent_sha256']='f'*64
            (output/'result.json').write_text(json.dumps(result))
            process=Mock();process.poll.return_value=0;process.returncode=0
            return process
        root=self.store.public.resolve()/'visual'
        with patch.object(worker,'WORK_ROOT',root),patch.object(worker,'_stop'):
            done=worker.run_once(self.client.app.state.visual,launcher=launcher)
            self.assertEqual(done['state'],'succeeded')
            public=self.client.get(self.path).json()['jobs'][0]
            self.assertEqual(public['input_summary']['generation_mode'],mode)
            if mode!='source':self.assertEqual(public['result']['assembly_sha256'],'e'*64)
            if mode in ('host-intent','host-components'):self.assertEqual(public['result']['intent_sha256'],'f'*64)
            self.assertNotIn('_files',public['result']);self.assertNotIn('input',public)
            file=self.client.get(self.path+'/'+job['id']+'/files/source.txt')
            self.assertEqual(file.status_code,200,file.text);self.assertEqual(file.text,source)
            self.assertTrue(file.headers['content-type'].startswith('text/plain'))
            self.assertEqual(file.headers['x-content-type-options'],'nosniff')
            self.assertEqual(self.client.get(self.path+'/'+job['id']+'/files/provider-1.json').status_code,404)
            (root/job['id']/'source.txt').write_text('changed')
            self.assertEqual(self.client.get(self.path+'/'+job['id']+'/files/source.txt').status_code,422)


if __name__=='__main__':unittest.main()
