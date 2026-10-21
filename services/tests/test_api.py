import copy
from contextlib import ExitStack
import json
import os
import unittest

from fastapi.testclient import TestClient

from services.tests.test_projects import ProjectFixture


def draft_of(scene):
    draft = {k: copy.deepcopy(v) for k, v in scene.items() if k in ['id', 'type', 'elements', 'edges', 'code']}
    draft['narration'] = {'text': scene['narration']['text']}
    return draft


@unittest.skipUnless(os.environ.get('TEST_DATABASE_URL'), 'Use run_project_tests.py for real PostgreSQL')
class ApiTests(ProjectFixture, unittest.TestCase):
    def setUp(self):
        super().setUp()
        from services.api.app import create_app
        stack = ExitStack()
        self.addCleanup(stack.close)
        self.client = stack.enter_context(TestClient(create_app(self.store, authentication=False), base_url='http://127.0.0.1:8000', client=('127.0.0.1', 50000)))

    def test_markdown_routes_validate_and_separate_spoken_text(self):
        from unittest.mock import patch
        from services.workflow.manuscript_document import format_document
        from services.tests.test_manuscript_document import SECTIONS
        markdown = format_document({'sections':SECTIONS})
        body = {'title':'uv','source_text':markdown,'manuscript_format':'markdown'}
        response = self.client.post('/api/projects',json=body)
        self.assertEqual(response.status_code,201)
        self.assertEqual(response.json()['source_text'],SECTIONS[0]['narration'])
        self.assertEqual(response.json()['config']['manuscript']['markdown'],markdown)
        self.assertEqual(self.client.post('/api/projects',json={**body,'source_text':'plain text'}).status_code,422)
        self.assertEqual(self.client.post('/api/projects',json={**body,'manuscript_format':'html'}).status_code,422)
        with patch('services.api.app.Settings.from_env',return_value=None), \
             patch('services.api.app.generate_manuscript',return_value=markdown) as generate:
            generated = self.client.post('/api/manuscripts/generate',json={'title':'uv','manuscript_format':'markdown'})
        self.assertEqual(generated.status_code,200)
        self.assertEqual(generated.json()['text'],markdown)
        self.assertEqual(generate.call_args.kwargs['manuscript_format'],'markdown')

    def test_batch_timing_route_is_strict_atomic_and_public(self):
        from services.tests.test_jobs import JobTests
        project,selected=JobTests.pending_timing(self)
        path='/api/projects/'+project['id']+'/timing';body={'expected_revision':project['revision'],'confirmed':True,'scenes':selected}
        for bad in [{**body,'confirmed':False},{**body,'confirmed':1},{**body,'expected_revision':True},{**body,'scenes':selected*2},{**body,'scenes':[]},{**body,'extra':1},{**body,'scenes':[{**selected[0],'expected_revision':1.0}]}]:
            self.assertEqual(self.client.post(path,json=bad).status_code,422)
        self.assertEqual(self.client.post(path,json={**body,'expected_revision':999}).status_code,409)
        self.assertEqual(self.client.post(path,json=body,headers={'Origin':'https://foreign.invalid'}).status_code,403)
        self.assertEqual(self.client.app.state.jobs.list_project(project['id']),[])
        response=self.client.post(path,json=body);self.assertEqual(response.status_code,202)
        self.assertEqual(len(response.json()),2);self.assertTrue(all(r['kind']=='timing' for r in response.json()))
        for word in ['words_checksum','profile','storage_key','input_hash']:self.assertNotIn(word,response.text)
        self.assertEqual(self.client.post(path,json=body).json(),response.json())
        self.assertEqual(self.store.get_project(project['id']),project)
        for job in response.json():self.addCleanup(self.client.app.state.jobs.cancel,job['job_id'])

    def test_manual_concept_route_validates_payload_and_never_dispatches_voice(self):
        from services.tests.test_concept import concept_draft
        scene=concept_draft();path='/api/projects/'+self.project['id']+'/scenes/concept'
        body={'expected_revision':1,'narration_text':scene['narration']['text'],'elements':scene['elements']}
        for bad in [{**body,'expected_revision':True},{**body,'extra':'secret'},{**body,'elements':[]},
                    {**body,'elements':[{}]},{**body,'elements':[{**scene['elements'][0],'concept_role':'feature'}]}]:
            self.assertEqual(self.client.post(path,json=bad).status_code,422)
            self.assertEqual(self.store.get_project(self.project['id']),self.project)
        response=self.client.post(path,json=body);self.assertEqual(response.status_code,201)
        row=response.json()['scenes'][-1];self.assertEqual(row['scene']['type'],'concept');self.assertEqual(row['state'],'needs_voice')
        self.assertEqual(row['scene']['elements'],scene['elements']);self.assertEqual(self.client.post(path,json=body).status_code,409)
        with self.store.connection() as conn:self.assertEqual(conn.execute('SELECT count(*) AS n FROM jobs WHERE project_id=%s',[self.project['id']]).fetchone()['n'],0)

    def test_concept_patch_preserves_audio_and_allows_valid_reclassification(self):
        project=self.import_concept();row=project['scenes'][0];url='/api/scenes/'+row['id']
        elements=copy.deepcopy(row['scene']['elements'])
        elements[0]['concept_role'],elements[1]['concept_role']=elements[1]['concept_role'],elements[0]['concept_role']
        swapped=self.client.patch(url,json={'expected_revision':1,'changes':{'elements':elements}})
        self.assertEqual(swapped.status_code,200);current=swapped.json()['scenes'][0]
        self.assertEqual(current['state'],'ready');self.assertEqual(current['scene']['narration'],row['scene']['narration'])
        self.assertEqual(current['scene']['animations'],row['scene']['animations'])
        invalid=copy.deepcopy(elements);invalid[1]['concept_role']='feature'
        self.assertEqual(self.client.patch(url,json={'expected_revision':2,'changes':{'elements':invalid}}).status_code,422)
        elements=copy.deepcopy(row['scene']['elements']);elements[0]['cue']['text_start']+=1;cue=elements[0]['cue']
        elements[0]['content']=row['scene']['narration']['text'][cue['text_start']:cue['text_end']][:40]
        body={'expected_revision':2,'changes':{'elements':elements}};response=self.client.patch(url,json=body)
        self.assertEqual(response.status_code,200);current=response.json()['scenes'][0]
        self.assertEqual(current['state'],'needs_timing');self.assertEqual(current['scene']['narration'],row['scene']['narration'])
        self.assertEqual(current['scene']['elements'],elements);self.assertEqual(self.client.patch(url,json=body).status_code,409)
        with self.store.connection() as conn:self.assertEqual(conn.execute('SELECT count(*) AS n FROM jobs WHERE project_id=%s',[project['id']]).fetchone()['n'],0)

    def test_manual_cue_patch_keeps_audio_blocks_preview_and_respects_revision(self):
        row=self.project['scenes'][0];elements=copy.deepcopy(row['scene']['elements']);elements[0]['cue']['text_start']+=1
        url='/api/scenes/'+row['id'];body={'expected_revision':1,'changes':{'elements':elements}}
        response=self.client.patch(url,json=body);self.assertEqual(response.status_code,200)
        project=response.json();self.assertEqual(project['scenes'][0]['state'],'needs_timing')
        self.assertEqual(project['scenes'][0]['scene']['narration'],row['scene']['narration'])
        self.assertEqual(self.client.patch(url,json=body).status_code,409)
        self.assertEqual(self.client.post('/api/scenes/'+row['id']+'/preview',json={'expected_revision':2}).status_code,409)
        elements[0]['cue']['text_end']=9999
        self.assertEqual(self.client.patch(url,json={'expected_revision':2,'changes':{'elements':elements}}).status_code,422)
        self.assertEqual(self.store.get_project(self.project['id']),project)
        with self.store.connection() as conn:self.assertEqual(conn.execute('SELECT count(*) AS n FROM jobs WHERE project_id=%s',[project['id']]).fetchone()['n'],0)

    def test_usage_route_is_readonly_historical_unknown_and_private(self):
        from unittest.mock import patch
        jobs=self.client.app.state.jobs;job=jobs.submit_regenerate(self.project['scenes'][0]['id'],1)
        self.addCleanup(jobs.cancel,job['id']);first=jobs.claim();jobs.fail(job['id'],first['attempt_id'],'configuration')
        with self.store.connection() as conn:conn.execute('UPDATE job_attempts SET usage=NULL WHERE id=%s',[first['attempt_id']])
        before=self.store.get_project(self.project['id'])
        with patch.object(jobs,'recover',side_effect=AssertionError('readonly')):
            response=self.client.get('/api/projects/'+self.project['id']+'/usage')
        self.assertEqual(response.status_code,200);self.assertEqual(response.headers['cache-control'],'no-store')
        self.assertEqual(response.json()['summary']['historical_unknown'],1)
        self.assertNotIn('profile',response.text);self.assertNotIn('source_text',response.text)
        self.assertEqual(self.store.get_project(self.project['id']),before)
        self.assertEqual(self.client.get('/api/projects/'+self.project['id']+'/usage',headers={'Origin':'https://untrusted.invalid'}).status_code,403)

    def test_project_voice_patch_is_free_revision_checked_and_strict(self):
        path='/api/projects/'+self.project['id']+'/voice';before=self.store.get_project(self.project['id'])
        response=self.client.patch(path,json={'expected_revision':1,'speaker':'public_voice'})
        self.assertEqual(response.status_code,200)
        self.assertEqual(response.json()['voice']['speaker'],'public_voice')
        self.assertEqual(response.json()['scenes'],before['scenes'])
        self.assertEqual(self.client.get('/api/projects/'+self.project['id']+'/jobs').json(),[])
        self.assertEqual(self.client.patch(path,json={'expected_revision':1,'speaker':'another_voice'}).status_code,409)
        for fields in [{'speaker':'../bad'},{'speaker':'valid','api_key':'private'},{'speaker':True},{'speaker':'valid','expected_revision':True}]:
            self.assertEqual(self.client.patch(path,json={'expected_revision':2,**fields}).status_code,422)
        self.assertEqual(self.store.get_project(self.project['id'])['voice']['speaker'],'public_voice')

    def test_cost_estimates_are_readonly_and_match_real_submission_dedup(self):
        row=self.project['scenes'][0];project_id=self.project['id']
        url='/api/projects/'+project_id+'/estimate'
        body={'operation':'voice','expected_revision':1,'scenes':[{'scene_id':row['id'],'expected_revision':1}]}
        before=self.store.get_project(project_id)
        quote=self.client.post(url,json=body)
        self.assertEqual(quote.status_code,200);self.assertEqual(quote.headers['cache-control'],'no-store')
        self.assertEqual(quote.json()['quantity']['calls'],1)
        self.assertEqual(self.client.get('/api/projects/'+project_id+'/jobs').json(),[])
        self.assertEqual(self.store.get_project(project_id),before)
        created=self.client.post('/api/scenes/'+row['id']+'/voice',json={'expected_revision':1})
        self.assertEqual(created.status_code,202)
        job=created.json();self.addCleanup(self.client.app.state.jobs.cancel,job['job_id'])
        again=self.client.post(url,json=body).json()
        self.assertEqual(again['status'],'no_new_call');self.assertEqual(again['quantity']['reused_jobs'],1)
        retry=self.client.get('/api/jobs/'+job['job_id']+'/estimate')
        self.assertEqual(retry.status_code,200);self.assertEqual(retry.json()['quantity']['calls'],1)
        regeneration={**body,'operation':'regenerate'}
        self.assertEqual(self.client.post(url,json=regeneration).json()['quantity']['calls'],2)
        regenerated=self.client.post('/api/scenes/'+row['id']+'/regenerate',json={'expected_revision':1})
        self.assertEqual(regenerated.status_code,202);self.addCleanup(self.client.app.state.jobs.cancel,regenerated.json()['job_id'])
        self.assertEqual(self.client.post(url,json=regeneration).json()['status'],'no_new_call')
        self.assertEqual(self.store.get_project(project_id),before)
        self.assertEqual(self.client.post(url,json={**body,'expected_revision':2}).status_code,409)
        for scenes in [[],body['scenes']*2,[{**body['scenes'][0],'scene_id':'33333333-3333-4333-8333-333333333333'}]]:
            self.assertEqual(self.client.post(url,json={**body,'scenes':scenes}).status_code,422)

    def test_cost_generation_and_batch_reuse_match_job_profile_policy(self):
        fresh=self.store.create_project('估价不触发生成','解释循环。');url='/api/projects/'+fresh['id']+'/estimate'
        body={'operation':'generate','expected_revision':1,'scenes':[]}
        # V6 prices both layout and source-role requests, not only the first stage.
        self.assertEqual(self.client.post(url,json=body).json()['quantity']['calls'],2)
        generated=self.client.post('/api/projects/'+fresh['id']+'/generate',json={'expected_revision':1})
        self.assertEqual(generated.status_code,202);self.addCleanup(self.client.app.state.jobs.cancel,generated.json()['job_id'])
        self.assertEqual(self.client.post(url,json=body).json()['status'],'no_new_call')
        row=self.project['scenes'][0]
        project=self.store.edit_scene(row['id'],1,{'narration_text':row['scene']['narration']['text']+'补充。'})
        voice=self.client.post('/api/scenes/'+row['id']+'/voice',json={'expected_revision':2}).json()
        self.addCleanup(self.client.app.state.jobs.cancel,voice['job_id'])
        body={'operation':'batch_voice','expected_revision':project['revision'],'scenes':[{'scene_id':row['id'],'expected_revision':2}]}
        self.store.profile=copy.deepcopy(self.store.profile);self.store.profile['voice']['speaker']='different-for-test'
        url='/api/projects/'+project['id']+'/estimate'
        self.assertEqual(self.client.post(url,json=body).json()['quantity']['reused_jobs'],1)
        # Single-voice dedup is profile-sensitive; batch dedup intentionally is not.
        self.assertEqual(self.client.post(url,json={**body,'operation':'voice'}).json()['quantity']['calls'],1)
        submitted=self.client.post('/api/projects/'+project['id']+'/voice',json={k:v for k,v in {**body,'confirmed':True}.items() if k!='operation'})
        self.assertEqual(submitted.status_code,202);self.assertEqual(submitted.json()[0]['job_id'],voice['job_id'])
        self.assertEqual(len(self.client.get('/api/projects/'+project['id']+'/jobs').json()),1)

    def test_scene_management_routes_are_free_strict_and_revision_checked(self):
        base = '/api/projects/' + self.project['id'] + '/scenes'
        body = {'expected_revision': 1, 'narration_text': '手工补充。', 'content': '补充要点'}
        response = self.client.post(base, json=body)
        self.assertEqual(response.status_code, 201)
        project = response.json(); added = project['scenes'][-1]
        url = base + '/' + added['id']
        duplicate = self.client.post(url + '/duplicate', json={'expected_revision': 2, 'expected_scene_revision': 1})
        self.assertEqual(duplicate.status_code, 201)
        clone = duplicate.json()['scenes'][-1]
        delete_body = {'expected_revision': 3, 'expected_scene_revision': 1, 'confirmed': True}
        self.assertEqual(self.client.post(url + '/delete', json={**delete_body, 'confirmed': False}).status_code, 422)
        self.assertEqual(self.client.post(url + '/delete', json={**delete_body, 'confirmed': 1}).status_code, 422)
        self.assertEqual(self.client.post(url + '/delete', json={k:v for k,v in delete_body.items() if k!='confirmed'}).status_code, 422)
        deleted = self.client.post(url + '/delete', json=delete_body)
        self.assertEqual(deleted.status_code, 200)
        self.assertNotIn(added['id'], [s['id'] for s in deleted.json()['scenes']])
        self.assertIn(clone['id'], [s['id'] for s in deleted.json()['scenes']])
        self.assertEqual(self.client.post(url + '/duplicate', json={'expected_revision': 4, 'expected_scene_revision': 1}).status_code, 404)
        self.assertEqual(self.client.patch('/api/scenes/' + added['id'], json={'expected_revision': 1, 'changes': {'narration_text': '不允许。'}}).status_code, 404)
        self.assertEqual(self.client.get('/api/scenes/' + added['id'] + '/candidates').status_code, 404)
        for endpoint in ['voice','regenerate','timing','preview']:
            self.assertEqual(self.client.post('/api/scenes/' + added['id'] + '/' + endpoint, json={'expected_revision': 1}).status_code, 404)
        self.assertEqual(self.client.post(base, json=body).status_code, 409)
        with self.store.connection() as conn:
            self.assertEqual(conn.execute('SELECT count(*) AS n FROM jobs WHERE project_id=%s', [self.project['id']]).fetchone()['n'], 0)
        for invalid in [{**body, 'expected_revision': True}, {**body, 'expected_revision': '4'},
                {**body, 'expected_revision': 4, 'unknown_secret': 'must-not-echo'},
                {**body, 'expected_revision': 4, 'content': ''}, {**body, 'expected_revision': 4, 'narration_text': '\ud800'}]:
            response = self.client.post(base, content=json.dumps(invalid), headers={'Content-Type': 'application/json'})
            self.assertEqual(response.status_code, 422)
            self.assertNotIn('must-not-echo', response.text)

    def test_batch_voice_requires_explicit_confirmation_and_hides_input(self):
        row = self.project['scenes'][0]
        project = self.store.edit_scene(row['id'], 1, {'narration_text': row['scene']['narration']['text'] + '补充说明。'})
        url = '/api/projects/' + project['id'] + '/voice'
        body = {'expected_revision': project['revision'], 'confirmed': True,
                'scenes': [{'scene_id': row['id'], 'expected_revision': 2}]}
        for bad in [{**body, 'confirmed': False}, {**body, 'confirmed': 'true'},
                    {k: v for k, v in body.items() if k != 'confirmed'}, {**body, 'scenes': []},
                    {**body, 'scenes': body['scenes'] * 21},
                    {**body, 'extra': 'private'}, {**body, 'scenes': [{**body['scenes'][0], 'extra': 1}]}]:
            self.assertEqual(self.client.post(url, json=bad).status_code, 422)
        self.assertEqual(self.client.post(url, json={**body, 'expected_revision': 1}).status_code, 409)
        self.assertEqual(self.client.get('/api/projects/' + project['id'] + '/jobs').json(), [])
        response = self.client.post(url, json=body)
        self.assertEqual(response.status_code, 202)
        jobs = response.json()
        self.assertEqual(len(jobs), 1)
        self.assertEqual(jobs[0]['attempts'], 0)
        self.assertNotIn('input', jobs[0]); self.assertNotIn('input_hash', jobs[0])
        self.assertEqual(self.client.post(url, json=body).json(), jobs)
        self.assertEqual(self.client.get('/api/projects/' + project['id']).json(), project)
        self.client.app.state.jobs.cancel(jobs[0]['job_id'])

    def test_flow_edges_patch_is_atomic_revision_checked_and_free(self):
        row=next(s for s in self.project['scenes'] if s['scene']['type']=='flow_diagram')
        url='/api/scenes/'+row['id'];a,b=[e['id'] for e in row['scene']['elements']][:2]
        result=self.client.patch(url,json={'expected_revision':1,'changes':{'edges':[]}})
        self.assertEqual(result.status_code,200)
        changed=result.json();item=next(s for s in changed['scenes'] if s['id']==row['id'])
        self.assertEqual(item['scene'],{**row['scene'],'edges':[]});self.assertEqual(item['state'],'ready')
        self.assertEqual(self.client.get('/api/projects/'+self.project['id']).json(),changed)
        self.assertEqual(self.client.patch(url,json={'expected_revision':1,'changes':{'edges':[]}}).status_code,409)
        for edges in [[{'from':a,'to':a}],[{'from':a,'to':b},{'from':b,'to':a}],[{'from':a,'to':b,'api_key':'secret'}]]:
            response=self.client.patch(url,json={'expected_revision':2,'changes':{'edges':edges}})
            self.assertEqual(response.status_code,422);self.assertNotIn('secret',response.text)
            self.assertEqual(self.client.get('/api/projects/'+self.project['id']).json(),changed)
        self.assertEqual(self.client.get('/api/projects/'+self.project['id']+'/jobs').json(),[])

    def test_version_history_get_is_bounded_and_does_not_create_jobs(self):
        url='/api/projects/'+self.project['id']+'/versions'
        empty=self.client.get(url);self.assertEqual(empty.status_code,200)
        self.assertEqual(empty.json(),{'items':[],'next_before_revision':None})
        old=self.store.create_version(self.project['id'],1)
        response=self.client.get(url);self.assertEqual(response.status_code,200)
        self.assertEqual(response.json()['items'],[{'id':old['id'],'project_id':self.project['id'],'revision':1,'theme':'tech_explainer','scene_count':len(self.dsl['scenes'])}])
        self.assertNotIn('profile',response.json()['items'][0]);self.assertNotIn('dsl',response.json()['items'][0])
        self.assertEqual(self.client.get(url+'?before_revision=1').json()['items'],[])
        for value in ['0','-1','2147483648','bad','1.5']:
            self.assertEqual(self.client.get(url+'?before_revision='+value).status_code,422)
        self.assertEqual(self.client.get('/api/projects/not-a-uuid/versions').status_code,400)
        self.assertEqual(self.client.get('/api/projects/00000000-0000-0000-0000-000000000000/versions').status_code,404)
        self.assertEqual(self.client.get('/api/projects/'+self.project['id']).json(),self.project)
        self.assertEqual(self.client.get('/api/versions/'+old['id']).json()['dsl'],old['dsl'])
        self.assertEqual(self.client.get('/api/projects/'+self.project['id']+'/jobs').json(),[])

    def test_local_timing_endpoint_is_separate_and_rejects_missing_cache(self):
        row=self.project['scenes'][0];url='/api/scenes/'+row['id']+'/timing'
        response=self.client.post(url,json={'expected_revision':1})
        self.assertEqual(response.status_code,422);self.assertEqual(response.json()['code'],'timing_cache')
        self.assertEqual(self.client.post(url,json={'expected_revision':1,'words_checksum':'forged'}).status_code,422)
        scene=row['scene'];asset=next(a for a in self.dsl['assets'] if a['id']==scene['narration']['audio_asset_id'])
        path=self.public/asset['storage_key'];path.with_name(path.stem+'-words.json').write_text(json.dumps([{'word':scene['narration']['text'],'startTime':0,'endTime':asset['duration_ms']/1000}]))
        response=self.client.post(url,json={'expected_revision':1})
        self.assertEqual(response.status_code,202);self.assertEqual(response.json()['kind'],'timing');self.assertNotIn('input',response.json())
        self.client.app.state.jobs.cancel(response.json()['job_id'])
        self.assertEqual(self.client.post(url,json={'expected_revision':9}).status_code,409)

    def test_theme_switch_is_free_revision_checked_and_snapshot_owned(self):
        row=self.project;old=self.store.create_version(row['id'],1)
        url='/api/projects/'+row['id']+'/theme'
        response=self.client.patch(url,json={'expected_revision':1,'theme':'light_teaching'})
        self.assertEqual(response.status_code,200);changed=response.json()
        self.assertEqual(changed['revision'],2);self.assertEqual(changed['config']['theme'],'light_teaching')
        self.assertEqual(changed['scenes'],self.client.get('/api/projects/'+row['id']).json()['scenes'])
        self.assertEqual(changed['scenes'],row['scenes'])
        self.assertEqual(changed['config']['assets'],row['config']['assets'])
        self.assertEqual(self.store.get_version(old['id']),old)
        self.assertEqual(self.store.create_version(row['id'],2)['dsl']['theme'],'light_teaching')
        self.assertEqual(self.client.patch(url,json={'expected_revision':1,'theme':'tech_multicolor'}).status_code,409)
        self.assertEqual(self.client.patch(url,json={'expected_revision':2,'theme':'unknown'}).status_code,422)
        self.assertEqual(self.client.patch(url,json={'expected_revision':2,'theme':'light_teaching','api_key':'secret'}).status_code,422)
        self.assertEqual(self.client.patch(url,json={'expected_revision':2,'theme':'light_teaching'}).json()['revision'],2)
        self.assertEqual(self.client.get('/api/projects/'+row['id']+'/jobs').json(),[])

    def test_graphic_edit_keeps_timing_and_audio_and_rejects_forged_source(self):
        row=self.project['scenes'][0];elements=copy.deepcopy(row['scene']['elements'])
        elements[0].update(icon='document',step=1,highlight={'text_start':0,'text_end':1},source_label=row['scene']['narration']['text'][:2],panel_style='conclusion')
        response=self.client.patch('/api/scenes/'+row['id'],json={'expected_revision':1,'changes':{'elements':elements}})
        self.assertEqual(response.status_code,200)
        after=response.json()['scenes'][0]
        for key in ['narration','animations','captions']:self.assertEqual(after['scene'][key],row['scene'][key])
        self.assertEqual(after['state'],'ready')
        elements[0]['source_label']='虚构不存在的来源'
        self.assertEqual(self.client.patch('/api/scenes/'+row['id'],json={'expected_revision':2,'changes':{'elements':elements}}).status_code,422)

    def test_editor_lists_projects_jobs_and_validated_audio(self):
        projects = self.client.get('/api/projects')
        self.assertEqual(projects.status_code, 200)
        self.assertIn(self.project['id'], [p['id'] for p in projects.json()])
        job = self.client.app.state.jobs.submit_voice(self.project['scenes'][0]['id'], 1)
        self.addCleanup(self.client.app.state.jobs.cancel, job['id'])
        jobs = self.client.get('/api/projects/' + self.project['id'] + '/jobs').json()
        self.assertIn(job['id'], [j['job_id'] for j in jobs])
        self.assertNotIn('input', jobs[0])
        asset = self.dsl['assets'][0]
        response = self.client.get('/api/projects/' + self.project['id'] + '/assets/' + asset['id'])
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.content, (self.public / asset['storage_key']).read_bytes())
        self.assertEqual(self.client.get('/api/projects/' + self.project['id'] + '/assets/unknown').status_code, 404)
        (self.public / asset['storage_key']).write_bytes(b'tampered')
        self.assertEqual(self.client.get('/api/projects/' + self.project['id'] + '/assets/' + asset['id']).status_code, 422)

    def test_job_api_exposes_safe_cue_diagnostics_without_values(self):
        jobs=self.client.app.state.jobs
        job=jobs.submit_regenerate(self.project['scenes'][0]['id'],1);attempt=jobs.claim()
        jobs.fail(job['id'],attempt['attempt_id'],'storyboard_invalid_cue',cue_error={'path':'/scenes/0/elements/0/cue','reason':'quote_ambiguous','source':'secret','text_start':99})
        response=self.client.get('/api/jobs/'+job['id']);self.assertEqual(response.status_code,200)
        data=response.json();self.assertEqual(data['error']['cue_error'],{'path':'/scenes/0/elements/0/cue','reason':'quote_ambiguous'})
        self.assertNotIn('secret',json.dumps(data));self.assertNotIn('input',data);self.assertFalse(data['error']['retryable'])

    def test_job_api_exposes_safe_schema_diagnostics_without_input(self):
        jobs=self.client.app.state.jobs
        job=jobs.submit_regenerate(self.project['scenes'][0]['id'],1)
        attempt=jobs.claim()
        jobs.fail(job['id'],attempt['attempt_id'],'storyboard_schema_error',[{'path':'/scenes/0/secret-key','rule':'required','message':'secret-response'}])
        response=self.client.get('/api/jobs/'+job['id'])
        self.assertEqual(response.status_code,200)
        data=response.json()
        self.assertEqual(data['error']['schema_errors'],[{'path':'/scenes/0','rule':'required'}])
        self.assertNotIn('secret',json.dumps(data))
        self.assertNotIn('input',data)
        self.assertFalse(data['error']['retryable'])

    def test_create_script_draft_does_not_call_generation(self):
        response = self.client.post('/api/projects', json={'title': 'Python 教学', 'source_text': '讲解函数参数。', 'mode': 'script'})
        self.assertEqual(response.status_code, 201)
        data = response.json()
        self.assertEqual(data['source_text'], '讲解函数参数。')
        self.assertEqual(data['scenes'], [])
        self.assertEqual(self.client.get('/api/projects/' + data['id']).json(), data)
        response = self.client.post('/api/projects/' + data['id'] + '/versions', json={'expected_revision': 1})
        self.assertEqual(response.status_code, 409)
        self.assertEqual(response.json()['code'], 'not_ready')

    def test_import_edit_snapshot_and_reorder(self):
        imported = self.client.post('/api/projects/import', json={'title': 'RAG 教学', 'dsl': self.dsl})
        self.assertEqual(imported.status_code, 201)
        project = imported.json()
        scene = project['scenes'][0]
        elements = copy.deepcopy(scene['scene']['elements'])
        elements[0]['content'] = '新的教学内容'
        url = '/api/scenes/' + scene['id']
        body = {'expected_revision': 1, 'changes': {'elements': elements}}
        changed = self.client.patch(url, json=body)
        self.assertEqual(changed.status_code, 200)
        self.assertEqual(changed.json()['scenes'][0]['scene']['narration'], scene['scene']['narration'])
        self.assertEqual(self.client.patch(url, json=body).status_code, 409)
        base = '/api/projects/' + project['id']
        version = self.client.post(base + '/versions', json={'expected_revision': 2})
        self.assertEqual(version.status_code, 201)
        frozen = version.json()
        self.assertEqual(self.client.get('/api/versions/' + frozen['id']).json(), frozen)
        reordered = self.client.post(base + '/scenes/reorder', json={
            'expected_revision': 2, 'scene_ids': [s['id'] for s in reversed(project['scenes'])]})
        self.assertEqual(reordered.status_code, 200)
        self.assertEqual(reordered.json()['revision'], 3)
        self.assertEqual(self.client.get('/api/versions/' + frozen['id']).json(), frozen)

    def test_candidate_is_explicit_and_stale_candidate_is_preserved(self):
        scene = self.project['scenes'][0]
        draft = draft_of(scene['scene'])
        draft['elements'][0]['content'] = '候选讲解'
        candidate = self.store.create_candidate(scene['id'], 1, draft)
        self.assertEqual(self.store.get_project(self.project['id']), self.project)
        path = '/api/scenes/' + scene['id'] + '/candidates'
        self.assertEqual(self.client.get(path).json(), [candidate])
        user = copy.deepcopy(scene['scene']['elements'])
        user[0]['content'] = '用户已修改'
        self.client.patch('/api/scenes/' + scene['id'], json={'expected_revision': 1, 'changes': {'elements': user}})
        response = self.client.post(path + '/' + candidate['id'] + '/accept', json={'expected_revision': 2})
        self.assertEqual(response.status_code, 409)
        self.assertEqual(self.client.get(path).json(), [candidate])
        self.assertEqual(self.store.get_project(self.project['id'])['scenes'][0]['scene']['elements'], user)

    def test_accept_candidate_reuses_audio_or_invalidates_voice(self):
        scene = self.project['scenes'][0]
        path = '/api/scenes/' + scene['id'] + '/candidates'
        draft = draft_of(scene['scene'])
        draft['elements'][0]['content'] = '确认的讲解'
        candidate = self.store.create_candidate(scene['id'], 1, draft)
        accepted = self.client.post(path + '/' + candidate['id'] + '/accept', json={'expected_revision': 1})
        self.assertEqual(accepted.status_code, 200)
        item = accepted.json()['scenes'][0]
        self.assertEqual(item['scene']['narration'], scene['scene']['narration'])
        self.assertEqual((item['generated_revision'], item['user_revision']), (2, 0))
        draft['narration']['text'] += '这是补充说明。'
        candidate = self.store.create_candidate(scene['id'], 2, draft)
        accepted = self.client.post(path + '/' + candidate['id'] + '/accept', json={'expected_revision': 2})
        self.assertEqual(accepted.status_code, 200)
        item = accepted.json()['scenes'][0]
        self.assertEqual(item['state'], 'needs_voice')
        self.assertNotIn('audio_asset_id', item['scene']['narration'])

    def test_strict_fields_revision_and_errors_do_not_echo_secrets(self):
        for body in [{'title': 'x', 'source_text': 'x', 'api_key': 'secret-token'},
                     {'title': 'x', 'source_text': 23}, {'title': 'x', 'source_text': 'x', 'mode': 'topic'},
                     {'title': 'x', 'source_text': 'x', 'secret-token': True}]:
            response = self.client.post('/api/projects', json=body)
            self.assertEqual(response.status_code, 422)
            self.assertNotIn('secret-token', response.text)
        response = self.client.post('/api/projects/' + self.project['id'] + '/versions', json={'expected_revision': True})
        self.assertEqual(response.status_code, 422)
        self.assertEqual(self.client.get('/api/projects/00000000-0000-0000-0000-000000000000').status_code, 404)
        bad = copy.deepcopy(self.dsl)
        bad['schema_version'] = 'secret-token'
        response = self.client.post('/api/projects/import', json={'title': '错误项目', 'dsl': bad})
        self.assertEqual(response.status_code, 422)
        self.assertTrue(response.json()['validation_errors'])
        self.assertNotIn('secret-token', response.text)
        response = self.client.post('/api/projects', content='{"secret-token"', headers={'Content-Type': 'application/json'})
        self.assertEqual(response.status_code, 422)
        self.assertNotIn('secret-token', response.text)

    def test_invalid_unicode_is_request_error_not_database_failure(self):
        response = self.client.post('/api/projects', content=b'{"title":"x","source_text":"\\ud800"}',
                                    headers={'Content-Type': 'application/json'})
        self.assertEqual(response.status_code, 422)
        bad = copy.deepcopy(self.dsl)
        bad['scenes'][0]['narration']['text'] += '\ud800'
        response = self.client.post('/api/projects/import', content=json.dumps({'title': 'x', 'dsl': bad}),
                                    headers={'Content-Type': 'application/json'})
        self.assertEqual(response.status_code, 422)
        self.assertEqual(response.json()['code'], 'validation')

    def test_host_origin_and_actual_body_limit(self):
        path = '/api/projects/' + self.project['id']
        self.assertEqual(self.client.get(path, headers={'Host': 'attacker.invalid:8000'}).status_code, 403)
        self.assertEqual(self.client.get(path, headers={'Origin': 'https://attacker.invalid'}).status_code, 403)
        self.assertEqual(self.client.get(path, headers={'Origin': 'http://localhost:3000'}).status_code, 200)
        response = self.client.post('/api/projects', content=b'x' * (512 * 1024 + 1), headers={'Content-Length': '1'})
        self.assertEqual(response.status_code, 413)
        response = self.client.options('/api/projects', headers={'Origin': 'http://localhost:3000',
            'Access-Control-Request-Method': 'POST', 'Access-Control-Request-Headers': 'content-type'})
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.headers['access-control-allow-origin'], 'http://localhost:3000')

    def test_default_startup_uses_local_database_configuration(self):
        from unittest.mock import patch
        from services.api.app import create_app
        env = {'DATABASE_URL': os.environ['TEST_DATABASE_URL'], 'VOLCENGINE_RESOURCE_ID': 'seed-tts-2.0',
               'VOLCENGINE_SPEAKER': 'test_voice'}
        with patch.dict(os.environ, env), patch('services.api.app.load_dotenv'):
            with TestClient(create_app(authentication=False), base_url='http://127.0.0.1:8000', client=('127.0.0.1', 50000)) as client:
                self.assertEqual(client.get('/health').json(), {'status': 'ready'})
                self.assertEqual(client.get('/api/projects/' + self.project['id']).json(), self.project)
                from services.projects.store import StoreError
                with patch.object(client.app.state.store, 'connection', side_effect=StoreError('database', 'Unavailable')):
                    self.assertEqual(client.get('/health').status_code, 503)

    def test_nonlocal_peer_cannot_forge_local_host(self):
        from services.api.app import create_app
        with TestClient(create_app(self.store, authentication=False), base_url='http://127.0.0.1:8000', client=('192.0.2.1', 50000)) as client:
            self.assertEqual(client.get('/health').status_code, 403)

    def test_durable_regeneration_poll_cancel_and_explicit_retry(self):
        scene_id = self.project['scenes'][0]['id']
        url = '/api/scenes/' + scene_id + '/regenerate'
        response = self.client.post(url, json={'expected_revision': 1})
        self.assertEqual(response.status_code, 202)
        job = response.json()
        self.assertEqual(job['state'], 'queued')
        self.assertNotIn('input', job)
        self.assertNotIn('attempt_id', job)
        self.assertEqual(self.client.post(url, json={'expected_revision': 1}).json()['job_id'], job['job_id'])
        self.assertEqual(self.client.post(url, json={'expected_revision': True}).status_code, 422)
        jobs = self.client.app.state.jobs
        attempt = jobs.claim()
        jobs.fail(job['job_id'], attempt['attempt_id'], 'transport_error')
        base = '/api/jobs/' + job['job_id']
        self.assertTrue(self.client.get(base).json()['error']['retryable'])
        invalid = self.client.post(base + '/retry', json={'key': 'secret-payload'})
        self.assertEqual(invalid.status_code, 422)
        self.assertNotIn('secret-payload', invalid.text)
        self.assertEqual(self.client.post(base + '/retry').status_code, 202)
        self.assertEqual(self.client.post(base + '/cancel').json()['state'], 'cancelled')
        self.assertEqual(self.client.post(base + '/retry').status_code, 409)

    def test_celery_poll_reuses_executor_and_does_not_transport_payloads(self):
        from unittest.mock import patch
        from services.workflow.queue import app, poll
        self.assertEqual(app.conf.accept_content, ['json'])
        self.assertEqual(app.conf.worker_concurrency, 1)
        with patch('services.workflow.queue.Store', return_value=self.store), patch('services.workflow.queue.profile', return_value=self.store.profile), patch.dict(os.environ, {'DATABASE_URL': 'local-test'}), patch('services.workflow.queue.run_once', return_value=None) as execute:
            self.assertIsNone(poll.apply().get())
            execute.assert_called_once()
            self.assertIs(execute.call_args.args[0].store, self.store)
            execute.return_value = {'id': 'job', 'state': 'succeeded', 'input': {'private': 'manuscript'}}
            self.assertEqual(poll.apply().get(), {'job_id': 'job', 'state': 'succeeded'})
            from services.workflow.queue import render_poll
            self.assertEqual(render_poll.apply().get(), {'job_id': 'job', 'state': 'succeeded'})
            self.assertEqual(execute.call_args.kwargs['lane'], 'render')
            self.assertEqual(app.conf.task_routes['aicreater.render_poll']['queue'], 'render')

    def test_voice_http_worker_attachment_is_revision_checked(self):
        import sys
        from services.workflow.worker import run_once
        scene_id = self.project['scenes'][0]['id']
        submitted = self.client.post('/api/scenes/' + scene_id + '/voice', json={'expected_revision': 1})
        self.assertEqual(submitted.status_code, 202)
        self.assertEqual(submitted.json()['kind'], 'voice')
        self.assertEqual(submitted.json()['stage'], 'tts')
        document = dict(self.dsl, scenes=self.dsl['scenes'][:1])
        result = run_once(self.client.app.state.jobs, [sys.executable, '-c', 'print(' + repr(json.dumps({'document': document})) + ')'])
        self.assertEqual(result['state'], 'succeeded')
        self.assertTrue(result['result']['attached'])
        self.assertEqual(self.client.get('/api/projects/' + self.project['id']).json()['revision'], 2)

    def test_scene_preview_endpoint_uses_local_render_and_public_scope(self):
        row=self.project['scenes'][0];url='/api/scenes/'+row['id']+'/preview'
        self.assertEqual(self.client.post(url,json={}).status_code,422)
        self.assertEqual(self.client.post(url,json={'expected_revision':2}).status_code,409)
        response=self.client.post(url,json={'expected_revision':1})
        self.assertEqual(response.status_code,202)
        job=response.json()
        self.addCleanup(lambda:self.client.post('/api/jobs/'+job['job_id']+'/cancel',json={}))
        self.assertEqual(job['scope'],'scene');self.assertEqual(job['preview_scene_id'],row['id'])
        self.assertNotIn('input',job)
        self.assertEqual(self.client.post(url,json={'expected_revision':1}).json()['job_id'],job['job_id'])
        self.assertEqual(self.client.get('/api/renders/'+job['job_id']).json()['scope'],'scene')

    def test_render_submission_requires_explicit_version_and_download_is_gated(self):
        url = '/api/projects/' + self.project['id'] + '/render'
        self.assertEqual(self.client.post(url, json={}).status_code, 422)
        version = self.store.create_version(self.project['id'], 1)
        submitted = self.client.post(url, json={'version_id': version['id']})
        self.assertEqual(submitted.status_code, 202)
        self.assertEqual(submitted.json()['kind'], 'render')
        job_id = submitted.json()['job_id']
        info = self.client.get('/api/renders/' + job_id)
        self.assertEqual(info.status_code, 200)
        self.assertEqual(info.json()['state'], 'queued');self.assertEqual(info.json()['downloads'], [])
        self.assertNotIn('input', info.json())
        with self.store.connection() as conn:
            self.assertEqual(conn.execute('SELECT count(*) AS n FROM job_attempts WHERE job_id=%s', [job_id]).fetchone()['n'], 0)
        self.assertEqual(self.client.get('/api/jobs/' + job_id + '/files/mp4').status_code, 409)
        self.assertEqual(self.client.get('/api/jobs/' + job_id + '/files/secret').status_code, 422)
        self.assertEqual(self.client.post('/api/jobs/' + job_id + '/cancel').json()['state'], 'cancelled')

    def test_initial_teaching_outline_from_http_through_worker(self):
        import sys
        from services.workflow.storyboard import ROOT
        from services.workflow.worker import run_once
        draft = json.loads((ROOT / 'examples/lessons/python-sum.json').read_text())
        source = ''.join(s['narration']['text'] for s in draft['scenes'])
        project = self.client.post('/api/projects', json={'title': 'Python 循环课', 'source_text': source}).json()
        url = '/api/projects/' + project['id'] + '/generate'
        self.assertEqual(self.client.post(url, json={}).status_code, 422)
        submitted = self.client.post(url, json={'expected_revision': 1})
        self.assertEqual(submitted.status_code, 202)
        self.assertEqual(submitted.json()['kind'], 'generate')
        self.assertEqual(self.client.post(url, json={'expected_revision': 1}).json()['job_id'], submitted.json()['job_id'])
        result = run_once(self.client.app.state.jobs, [sys.executable, '-c', 'print(' + repr(json.dumps({'draft': draft})) + ')'])
        self.assertEqual(result['state'], 'succeeded')
        project = self.client.get('/api/projects/' + project['id']).json()
        self.assertEqual(project['source_text'], source)
        self.assertEqual(project['scenes'][0]['scene']['type'], 'code_walkthrough')
        self.assertEqual(project['scenes'][0]['state'], 'needs_voice')
        self.assertEqual(self.client.post(url, json={'expected_revision': 1}).json()['job_id'], submitted.json()['job_id'])
        self.assertEqual(self.client.post(url, json={'expected_revision': 2}).status_code, 409)
        self.assertEqual(self.client.post('/api/projects/' + project['id'] + '/versions', json={'expected_revision': 2}).status_code, 409)
