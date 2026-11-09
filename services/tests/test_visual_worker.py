import os
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch


class VisualWorkerTests(unittest.TestCase):

    def test_render_environment_is_allowlisted(self):
        from services.visual.worker import child_environment
        with patch.dict(os.environ,{'DEEPSEEK_API_KEY':'secret','DATABASE_URL':'db','VOLCENGINE_API_KEY':'tts','MINIO_SECRET_KEY':'s','PATH':'/bin'},clear=True):
            self.assertEqual(child_environment('export'),{'PATH':'/bin'})
            self.assertEqual(child_environment('agent'),{'PATH':'/bin','DEEPSEEK_API_KEY':'secret'})
        from services.accounts.model_settings import LLM
        own=LLM('https://api.example.com/v1','own-key','qwen-plus','account','v1')
        with patch.dict(os.environ,{'DEEPSEEK_API_KEY':'secret','DATABASE_URL':'db','ACCOUNT_CREDENTIALS_KEY':'k','TOS_SECRET_KEY':'t','LLM_FAKE_IP_CIDR':'198.18.0.0/15','PATH':'/bin'},clear=True):
            self.assertEqual(child_environment('agent',own),{'PATH':'/bin','LLM_FAKE_IP_CIDR':'198.18.0.0/15','ACCOUNT_LLM_BASE_URL':'https://api.example.com/v1',
                'ACCOUNT_LLM_API_KEY':'own-key','ACCOUNT_LLM_MODEL':'qwen-plus'})
            self.assertEqual(child_environment('export',own),{'PATH':'/bin'})
            self.assertEqual(child_environment('restyle',own),{'PATH':'/bin'})

    def test_owned_directory_and_file_paths_reject_symlinks_and_traversal(self):
        from services.visual.worker import checked_file,job_directory
        with self.assertRaises(ValueError):job_directory('../private')
        with tempfile.TemporaryDirectory() as directory:
            root=Path(directory).resolve();(root/'source.txt').write_text('safe')
            self.assertEqual(checked_file(root,'source.txt'),root/'source.txt')
            for name in ['../source.txt','/etc/passwd','provider-1.json','stills/../source.txt','design.json']:
                with self.assertRaises(ValueError):checked_file(root,name)
            (root/'video.srt').symlink_to(root/'source.txt')
            with self.assertRaises(ValueError):checked_file(root,'video.srt')

    def test_export_input_refuses_chapters_that_are_not_accepted_agent_videos(self):
        from services.projects.store import StoreError
        from services.visual.worker import command_input
        job={'kind':'export','project_id':'p','input':{'chapters':[{'generation_id':'g','sha256':'a'*64,'scene_id':'s'}]}}
        with self.assertRaisesRegex(StoreError,'conflict'):command_input(None,job)

    def test_published_files_are_stored_and_restored_when_the_local_copy_is_gone(self):
        import hashlib
        from services.projects.storage import ObjectStore
        from services.tests.test_storage import FakeClient
        from services.visual import worker
        with tempfile.TemporaryDirectory() as directory, patch.object(worker,'WORK_ROOT',Path(directory).resolve()):
            job_id='0b4f6f39-5d55-4b1c-9b2a-2f8f2b3c8a11';folder=worker.job_directory(job_id);(folder/'stills').mkdir(parents=True)
            payload={'source.txt':b'export default 1','video.mp4':b'mp4-bytes','stills/frame-1.png':b'png'}
            for name,data in payload.items():(folder/name).write_bytes(data)
            result={'_files':{name:hashlib.sha256(data).hexdigest() for name,data in payload.items()}}
            objects=ObjectStore(FakeClient(),'private-test')
            worker.store_files(objects,job_id,result)
            self.assertEqual(len(objects._client.data),3)
            for name in payload:(folder/name).unlink()
            job={'id':job_id,'result':result}
            self.assertEqual(worker.local_file(objects,job,'video.mp4').read_bytes(),b'mp4-bytes')
            self.assertEqual(worker.local_file(objects,job,'stills/frame-1.png').read_bytes(),b'png')
            with self.assertRaises(ValueError):worker.local_file(objects,job,'video.srt')
            with self.assertRaises(ValueError):worker.local_file(None,job,'source.txt')

    def test_a_failed_upload_is_retried_and_its_mark_cleared(self):
        import hashlib
        from unittest.mock import MagicMock
        from services.projects.storage import ObjectStore
        from services.tests.test_storage import FakeClient
        from services.visual import worker
        with tempfile.TemporaryDirectory() as directory, patch.object(worker,'WORK_ROOT',Path(directory).resolve()):
            job_id='0b4f6f39-5d55-4b1c-9b2a-2f8f2b3c8a12';folder=worker.job_directory(job_id);folder.mkdir(parents=True)
            (folder/'video.mp4').write_bytes(b'mp4');(folder/'video.srt').write_bytes(b'1')
            result={'video':'video.mp4','srt':'video.srt','_stored':False,'_files':{n:hashlib.sha256((folder/n).read_bytes()).hexdigest() for n in ('video.mp4','video.srt')}}
            client=FakeClient();jobs=MagicMock();jobs.store.objects=ObjectStore(client,'private-test')
            conn=jobs.store.connection.return_value.__enter__.return_value
            conn.execute.return_value.fetchall.return_value=[{'id':job_id,'result':result}]
            client.fail=True
            self.assertEqual(worker.retry_storage(jobs),(0,1))  # still down: stays pending
            client.fail=False
            self.assertEqual(worker.retry_storage(jobs),(1,0))
            self.assertEqual(len(client.data),2)
            self.assertIn("result-'_stored'",conn.execute.call_args.args[0])

    def test_pending_backup_is_public_and_nothing_else_from_private_fields(self):
        import uuid
        from services.visual.store import VisualJobs
        row={'id':uuid.uuid4(),'project_id':uuid.uuid4(),'scene_id':None,'kind':'export','state':'succeeded','stage':'complete','created_at':None,'error':None,
             'input':{},'result':{'video':'video.mp4','srt':'video.srt','_stored':False,'_files':{}}}
        self.assertEqual(VisualJobs._public(row)['result'],{'video':'video.mp4','srt':'video.srt','backup':'pending'})
        row['result'].pop('_stored')
        self.assertNotIn('backup',VisualJobs._public(row)['result'])

    def test_course_costs_price_voice_and_only_priced_deepseek_tokens(self):
        from unittest.mock import MagicMock
        from services.visual import costs
        store=MagicMock();conn=store.connection.return_value.__enter__.return_value
        conn.execute.return_value.fetchall.side_effect=[
            [{'input':{'scene':{'narration':{'text':'一'*1000}}}}],
            [{'input':{},'result':{'usage':{'inputTokens':80000,'cachedInputTokens':60000,'outputTokens':20000}}},
             {'input':{'llm':{'source':'account'}},'result':{'usage':{'inputTokens':5,'cachedInputTokens':0,'outputTokens':7}}}]]*2
        plain=costs.course_costs(store,'p',env={})
        self.assertEqual(plain['voice'],{'characters':1000,'cny':0.3})
        self.assertEqual(plain['agent']['server'],{'input':80000,'cached_input':60000,'output':20000,'cny':None})  # no invented price
        self.assertEqual(plain['agent']['own_model']['output'],7)
        self.assertIsNone(plain['next_agent']['max_output_cny']);self.assertEqual(plain['next_agent']['max_output_tokens'],300000)
        priced=costs.course_costs(store,'p',env={'DEEPSEEK_PRICE_INPUT':'2','DEEPSEEK_PRICE_CACHED_INPUT':'0.5','DEEPSEEK_PRICE_OUTPUT':'8'})
        self.assertEqual(priced['agent']['server']['cny'],0.23)  # 20k*2 + 60k*0.5 + 20k*8 per million
        self.assertEqual(priced['next_agent']['max_output_cny'],2.4)
        self.assertIsNone(costs.deepseek_prices({'DEEPSEEK_PRICE_INPUT':'x','DEEPSEEK_PRICE_CACHED_INPUT':'1','DEEPSEEK_PRICE_OUTPUT':'1'}))


if __name__=='__main__':unittest.main()
