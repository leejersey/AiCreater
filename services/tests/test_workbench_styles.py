import copy
import io
import json
import os
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch
from services.tests.test_projects import ProjectFixture, PROFILE
from services.projects.store import StoreError


@unittest.skipUnless(os.environ.get('TEST_DATABASE_URL'), 'Use disposable PostgreSQL')
class WorkbenchStyleTests(ProjectFixture, unittest.TestCase):
    def change(self, style='whiteboard',revision=1):
        self.assertTrue(callable(getattr(self.store,'set_visual_style',None)),'missing style setting')
        return self.store.set_visual_style(self.project['id'],revision,style)

    def test_save_preserves_audio_dsl_other_projects_and_voice_profile(self):
        before=copy.deepcopy(self.project);other=self.store.create_project('另一课程','不改变。')
        changed=self.change();self.assertEqual(changed['revision'],2)
        self.assertEqual(changed['visual_style']['id'],'whiteboard')
        self.assertEqual(changed['scenes'],before['scenes']);self.assertEqual(self.store._dsl(changed),self.dsl)
        self.assertEqual(self.store.profile_for(changed),PROFILE);self.assertEqual(self.store.get_project(other['id']),other)
        self.assertEqual(self.change(revision=2),changed)
        with self.assertRaises(StoreError):self.change('minimal',1)
        with self.assertRaises(StoreError):self.change('unknown',2)
        with self.store.connection() as conn:self.assertEqual(conn.execute('SELECT count(*) AS n FROM jobs WHERE project_id=%s',[self.project['id']]).fetchone()['n'],0)

    def test_frozen_versions_and_preview_jobs_keep_style_snapshot(self):
        from services.projects.jobs import Jobs
        before=self.store.create_version(self.project['id'],1)
        changed=self.change();version=self.store.create_version(changed['id'],2)
        self.assertEqual(version['profile']['visual_style'],changed['visual_style'])
        jobs=Jobs(self.store);preview=jobs.submit_preview(changed['scenes'][0]['id'],1)
        render=jobs.submit_render(changed['id'],version['id'])
        self.assertEqual(preview['input']['protocol_version'],'scene-preview:2')
        self.assertEqual(render['input']['protocol_version'],'snapshot-render:2')
        for job in [preview,render]:self.assertEqual(job['input']['version']['profile']['visual_style'],changed['visual_style'])
        self.change('minimal',2)
        self.assertEqual(self.store.get_version(version['id']),version);self.assertEqual(self.store.get_version(before['id']),before)
        self.assertEqual(jobs.get(render['id'])['input']['version']['profile'],version['profile'])

    def test_theme_and_voice_saves_keep_style_metadata_but_timing_dsl_excludes_it(self):
        from services.projects.jobs import Jobs
        changed=self.change();themed=self.store.set_theme(changed['id'],2,'light_teaching')
        voiced=self.store.set_voice(changed['id'],3,'test_voice')
        self.assertEqual(voiced['visual_style'],changed['visual_style'])
        row=voiced['scenes'][0];asset=next(a for a in voiced['config']['assets'] if a['id']==row['scene']['narration']['audio_asset_id']);audio=self.public/asset['storage_key']
        audio.with_name(audio.stem+'-words.json').write_text(json.dumps([{'word':row['scene']['narration']['text'],'startTime':0,'endTime':asset['duration_ms']/1000}]))
        job=Jobs(self.store).submit_timing(row['id'],1)
        self.assertNotIn('visual_style',job['input']['config'])
        self.assertNotIn('visual_style',self.store._dsl(voiced))
        self.assertEqual(job['input']['profile']['voice'],voiced['voice'])

    def test_legacy_version_without_style_remains_v1(self):
        from services.projects.jobs import Jobs
        version=self.store.create_version(self.project['id'],1)
        profile=copy.deepcopy(version['profile']);profile.pop('visual_style',None)
        from psycopg.types.json import Jsonb
        with self.store.connection() as conn:conn.execute('UPDATE project_versions SET profile=%s WHERE id=%s',[Jsonb(profile),version['id']])
        job=Jobs(self.store).submit_render(self.project['id'],version['id'])
        self.assertEqual(job['input']['protocol_version'],'snapshot-render:1')
        self.assertNotIn('visual_style',job['input']['version']['profile'])

    def test_api_is_strict_revision_guarded_and_never_submits_tasks(self):
        from fastapi.testclient import TestClient
        from services.api.app import create_app
        with TestClient(create_app(self.store, authentication=False),base_url='http://127.0.0.1:8000',client=('127.0.0.1',50000)) as client:
            url='/api/projects/'+self.project['id']+'/visual-style'
            ok=client.patch(url,json={'expected_revision':1,'visual_style':'minimal'})
            self.assertEqual(ok.status_code,200);self.assertEqual(ok.json()['visual_style']['id'],'minimal')
            self.assertEqual(client.patch(url,json={'expected_revision':1,'visual_style':'whiteboard'}).status_code,409)
            for body in [{'expected_revision':True,'visual_style':'minimal'},{'expected_revision':2,'visual_style':'unknown'},{'expected_revision':2,'visual_style':'whiteboard','tokens':{}}]:
                self.assertIn(client.patch(url,json=body).status_code,[400,422])
            denied=client.patch(url,json={'expected_revision':2,'visual_style':'whiteboard'},headers={'Origin':'https://evil.invalid'})
            self.assertEqual(denied.status_code,403)
            self.assertEqual(client.get('/api/projects/'+self.project['id']+'/jobs').json(),[])


class RenderStyleChildTests(unittest.TestCase):
    def test_v2_child_passes_frozen_style_file_without_provider(self):
        from services.workflow.worker import child
        from services.workflow.storyboard import ROOT
        tokens=json.loads((ROOT/'packages/video-components/src/visual-styles.json').read_text())['whiteboard']
        snapshot={'id':'whiteboard','tokens':tokens}
        with tempfile.TemporaryDirectory() as folder:
            directory=Path(folder)/'render'
            payload={'kind':'render','protocol_version':'snapshot-render:2','render_directory':str(directory),'public_root':folder,'version':{'dsl':{},'profile':{'visual_style':snapshot}}}
            with patch('sys.stdin',io.StringIO(json.dumps(payload))),patch('sys.stdout',new_callable=io.StringIO) as output,patch('subprocess.run') as run:
                child()
            self.assertTrue(json.loads(output.getvalue()).get('rendered'))
            args=run.call_args.args[0];flag=next((x for x in args if x.startswith('--visual-style-file=')),None)
            self.assertIsNotNone(flag);self.assertEqual(json.loads(Path(flag.split('=',1)[1]).read_text()),snapshot)
