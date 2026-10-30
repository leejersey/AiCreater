import hashlib
import os
import unittest
from unittest.mock import patch
from concurrent.futures import ThreadPoolExecutor

from services.tests import test_teaching_media
from services.visual.teaching_media import run_once
from services.visual.teaching_renders import TeachingRenders
from services.projects.store import StoreError


@unittest.skipUnless(os.environ.get('TEST_DATABASE_URL'),'Requires disposable PostgreSQL')
class TeachingAvQueueTests(unittest.TestCase):
    def setUp(self):
        fixture=test_teaching_media.TeachingMediaTests('test_real_compiler_and_audio_check_persist_an_immutable_binding_without_rendering')
        fixture.setUp();self.addCleanup(fixture.doCleanups);self.fixture=fixture
        self.store=fixture.store;self.pid=fixture.pid;self.rid=fixture.rid;self.media=fixture.media
        self.job=self.media.enqueue(self.pid,self.rid)

    def fake_renderer(self,audiovisual,expected,audio_file,output):
        output.mkdir();render=output/'render';render.mkdir()
        (render/'video.mp4').write_bytes(b'fake media; not a real-render acceptance')
        (render/'captions.srt').write_text('fake captions; queue publication test only')
        return {'status':'audiovisual-ready','audiovisualSha256':expected,'artifactSha256':audiovisual['artifactSha256'],
            'previewFile':'render/video.mp4','videoSha256':hashlib.sha256((render/'video.mp4').read_bytes()).hexdigest(),
            'captionsSha256':hashlib.sha256((render/'captions.srt').read_bytes()).hexdigest(),'accepted':False}

    def test_binding_automatically_admits_one_frozen_audiovisual_render(self):
        run_once(self.media)
        renders=TeachingRenders(self.store)
        queued=renders.get(self.pid,self.rid)
        self.assertEqual(queued['state'],'queued');self.assertEqual(queued['timing_mode'],'measured')
        with ThreadPoolExecutor(3) as pool:
            jobs=list(pool.map(lambda _:renders.enqueue_audio(self.pid,self.job['id']),range(3)))
        self.assertEqual({j['id'] for j in jobs},{queued['id']})
        self.assertIsNone(run_once(self.media))
        self.assertEqual(self.fixture.tasks.get(self.pid,self.rid)['requests_used'],1)

    def test_owned_worker_publishes_bound_video_and_subtitle_without_model_requests(self):
        run_once(self.media);renders=TeachingRenders(self.store)
        with patch('services.visual.teaching_renders.render_audiovisual',side_effect=self.fake_renderer) as renderer:
            result=renders.run(self.pid,self.rid)
            self.assertEqual(result['state'],'succeeded');self.assertTrue(result['video_ready'])
            self.assertEqual(result['timing_mode'],'measured');self.assertFalse(result['accepted'])
            self.assertEqual(renders.subtitle_path(self.pid,self.rid).suffix,'.srt')
            self.assertEqual(renders.run(self.pid,self.rid),result);self.assertEqual(renderer.call_count,1)
        self.assertEqual(self.fixture.tasks.get(self.pid,self.rid)['requests_used'],1)

    def test_restart_after_binding_commit_recovers_only_render_admission(self):
        with patch.object(self.media,'admit_render',side_effect=RuntimeError('simulated process exit')):
            with self.assertRaises(RuntimeError):run_once(self.media)
        before=self.media.binding(self.pid,self.job['id'])
        with patch('services.visual.teaching_media.bind_teaching_audio',side_effect=AssertionError('No repeat binding')):
            run_once(self.media)
        self.assertEqual(self.media.binding(self.pid,self.job['id']),before)
        self.assertEqual(TeachingRenders(self.store).get(self.pid,self.rid)['state'],'queued')

    def test_admission_io_failure_is_terminal_without_repeat_work(self):
        with patch('services.visual.teaching_renders.TeachingRenders.enqueue_audio',side_effect=OSError('synthetic storage failure')):
            result=run_once(self.media)
        self.assertEqual(result['render_admission'],'failed')
        self.assertIsNone(run_once(self.media))
        self.assertEqual(self.fixture.tasks.get(self.pid,self.rid)['requests_used'],1)

    def test_cancellation_during_render_never_publishes_late_audio_video(self):
        run_once(self.media);renders=TeachingRenders(self.store)
        def cancelled(*args):
            result=self.fake_renderer(*args);self.fixture.tasks.cancel(self.pid,self.rid);return result
        with patch('services.visual.teaching_renders.render_audiovisual',side_effect=cancelled):
            result=renders.run(self.pid,self.rid)
        self.assertEqual(result['state'],'cancelled');self.assertFalse(result['video_ready'])

    def test_changed_subtitle_invalidates_the_joint_media_receipt(self):
        run_once(self.media);renders=TeachingRenders(self.store)
        with patch('services.visual.teaching_renders.render_audiovisual',side_effect=self.fake_renderer):renders.run(self.pid,self.rid)
        subtitle=renders.subtitle_path(self.pid,self.rid);subtitle.write_text('changed')
        self.assertFalse(renders.get(self.pid,self.rid)['video_ready'])
        with self.assertRaises(StoreError):renders.media_path(self.pid,self.rid)

    def test_failed_new_audio_render_keeps_the_previous_playable_version(self):
        run_once(self.media);renders=TeachingRenders(self.store)
        with patch('services.visual.teaching_renders.render_audiovisual',side_effect=self.fake_renderer):renders.run(self.pid,self.rid)
        previous=renders.media_path(self.pid,self.rid)
        with self.store.connection() as conn:
            conn.execute('UPDATE scenes SET revision=revision+1 WHERE id=%s',[self.fixture.fixture.sid])
        self.media.enqueue(self.pid,self.rid);run_once(self.media)
        with patch('services.visual.teaching_renders.render_audiovisual',side_effect=StoreError('test','synthetic render failure')):
            failed=renders.run(self.pid,self.rid)
        self.assertEqual(failed['state'],'failed');self.assertFalse(failed['video_ready'])
        self.assertTrue(failed['previous_video_ready'])
        self.assertEqual(renders.media_path(self.pid,self.rid),previous)
        self.assertTrue(previous.is_file())

    @unittest.skipUnless(os.environ.get('RUN_TEACHING_AV_TEST')=='1','Explicit real audiovisual container opt-in')
    def test_real_durable_binding_to_owned_container_and_media_publication(self):
        run_once(self.media);renders=TeachingRenders(self.store)
        result=renders.run(self.pid,self.rid)
        self.assertEqual(result['state'],'succeeded');self.assertTrue(result['video_ready'])
        self.assertTrue(renders.subtitle_path(self.pid,self.rid).is_file())
        self.assertFalse(result['accepted']);self.assertEqual(self.fixture.tasks.get(self.pid,self.rid)['requests_used'],1)
