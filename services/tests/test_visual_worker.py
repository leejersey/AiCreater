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


if __name__=='__main__':unittest.main()
