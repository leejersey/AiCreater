import copy
import json
import os
import unittest
from concurrent.futures import ThreadPoolExecutor

from services.tests.test_projects import ProjectFixture
from services.projects.store import StoreError


@unittest.skipUnless(os.environ.get('TEST_DATABASE_URL'), 'Use run_project_tests.py for real PostgreSQL')
class JobTests(ProjectFixture, unittest.TestCase):
    def setUp(self):
        super().setUp()
        from services.projects.jobs import Jobs
        self.jobs = Jobs(self.store)
        self.scene_id = self.project['scenes'][0]['id']
        self.addCleanup(self.clean_jobs)

    def clean_jobs(self):
        with self.store.connection() as conn:
            conn.execute("UPDATE jobs SET state='cancelled' WHERE project_id=%s AND state IN ('queued','running')", [self.project['id']])
            conn.execute("UPDATE job_attempts SET state='cancelled' WHERE job_id IN (SELECT id FROM jobs WHERE project_id=%s) AND state='running'", [self.project['id']])

    def submit(self): return self.jobs.submit_regenerate(self.scene_id, 1)

    def timing_cache(self):
        scene=self.project['scenes'][0]['scene'];asset=next(a for a in self.dsl['assets'] if a['id']==scene['narration']['audio_asset_id'])
        file=self.public/asset['storage_key'];words=file.with_name(file.stem+'-words.json')
        words.write_text(json.dumps([{'word':scene['narration']['text'],'startTime':0,'endTime':asset['duration_ms']/1000}]))
        return words

    def pending_voice(self, count=2):
        project = self.project
        for row in project['scenes'][:count]:
            project = self.store.edit_scene(row['id'], row['revision'],
                {'narration_text': row['scene']['narration']['text'] + '补充说明。'})
        return project, [{'scene_id': s['id'], 'expected_revision': s['revision']} for s in project['scenes'][:count]]

    def pending_timing(self):
        project=self.project
        for row in project['scenes'][:2]:
            asset=next(a for a in self.dsl['assets'] if a['id']==row['scene']['narration']['audio_asset_id'])
            audio=self.public/asset['storage_key']
            audio.with_name(audio.stem+'-words.json').write_text(json.dumps([{'word':row['scene']['narration']['text'],'startTime':0,'endTime':asset['duration_ms']/1000}]))
            elements=copy.deepcopy(row['scene']['elements']);elements[0]['cue']['text_start']+=1
            project=self.store.edit_scene(row['id'],row['revision'],{'elements':elements})
        return project,[{'scene_id':r['id'],'expected_revision':r['revision']} for r in project['scenes'][:2]]

    def test_batch_timing_reuses_single_concurrent_and_terminal_jobs(self):
        project,selected=self.pending_timing();before=copy.deepcopy(project)
        single=self.jobs.submit_timing(**{'scene_id':selected[0]['scene_id'],'base_revision':selected[0]['expected_revision']})
        with ThreadPoolExecutor(2) as pool:
            batches=list(pool.map(lambda _:self.jobs.submit_batch_timing(project['id'],project['revision'],selected,True),range(2)))
        self.assertEqual([j['id'] for j in batches[0]],[j['id'] for j in batches[1]])
        self.assertEqual(batches[0][0]['id'],single['id'])
        with self.store.connection() as conn:
            self.assertEqual(conn.execute('SELECT count(*) AS n FROM jobs WHERE project_id=%s',[project['id']]).fetchone()['n'],2)
            self.assertEqual(conn.execute('SELECT count(*) AS n FROM job_attempts WHERE job_id IN (SELECT id FROM jobs WHERE project_id=%s)',[project['id']]).fetchone()['n'],0)
            conn.execute("UPDATE jobs SET state='failed' WHERE project_id=%s",[project['id']])
        reused=self.jobs.submit_batch_timing(project['id'],project['revision'],selected,True)
        self.assertTrue(all(j['state']=='failed' for j in reused));self.assertEqual(self.store.get_project(project['id']),before)

    def test_batch_timing_missing_second_cache_rolls_back(self):
        project,selected=self.pending_timing();row=project['scenes'][1]
        asset=next(a for a in self.dsl['assets'] if a['id']==row['scene']['narration']['audio_asset_id']);audio=self.public/asset['storage_key'];audio.with_name(audio.stem+'-words.json').unlink()
        with self.assertRaisesRegex(StoreError,'timing_cache'):self.jobs.submit_batch_timing(project['id'],project['revision'],selected,True)
        self.assertEqual(self.jobs.list_project(project['id']),[])
        self.assertEqual(self.store.get_project(project['id']),project)

    def test_batch_timing_insert_failure_rolls_back_without_touching_existing(self):
        from unittest.mock import patch
        project,selected=self.pending_timing();original=self.jobs._submit;calls=0
        def interrupted(*args):
            nonlocal calls
            calls+=1
            if calls==2:raise RuntimeError('injected second insert failure')
            return original(*args)
        with patch.object(self.jobs,'_submit',side_effect=interrupted):
            with self.assertRaisesRegex(RuntimeError,'second insert'):self.jobs.submit_batch_timing(project['id'],project['revision'],selected,True)
        self.assertEqual(self.jobs.list_project(project['id']),[])

    def test_batch_timing_selection_validation_leaves_no_jobs(self):
        project,selected=self.pending_timing()
        cases=[(project['revision'],selected,False),(True,selected,True),(project['revision']+1,selected,True),(project['revision'],[],True),(project['revision'],selected*11,True),(project['revision'],selected*2,True),(project['revision'],[{**selected[0],'expected_revision':True}],True),(project['revision'],[{**selected[0],'expected_revision':1}],True),(project['revision'],[{**selected[0],'extra':1}],True)]
        ready=project['scenes'][2];cases.append((project['revision'],[{'scene_id':ready['id'],'expected_revision':ready['revision']}],True))
        other=self.store.create_project('外课','别的场景。');other=self.store.add_scene(other['id'],1,'新的口播。','要点')
        cases.append((project['revision'],[{'scene_id':other['scenes'][0]['id'],'expected_revision':1}],True))
        for revision,items,confirmed in cases:
            with self.subTest(items=items,revision=revision):
                with self.assertRaises(StoreError):self.jobs.submit_batch_timing(project['id'],revision,items,confirmed)
                self.assertEqual(self.jobs.list_project(project['id']),[])
        changed=self.store.edit_scene(selected[0]['scene_id'],2,{'narration_text':'重新配音的口播。'})
        with self.assertRaisesRegex(StoreError,'not_ready'):self.jobs.submit_batch_timing(project['id'],changed['revision'],[{'scene_id':selected[0]['scene_id'],'expected_revision':3}],True)

    def test_batch_timing_runs_independently_without_provider_keys(self):
        from services.workflow.worker import run_once
        from unittest.mock import patch,Mock
        import subprocess
        project,selected=self.pending_timing();batch=self.jobs.submit_batch_timing(project['id'],project['revision'],selected,True)
        self.store.objects=Mock();self.store.objects.ensure.side_effect=AssertionError('No downloads');self.store.objects.put.side_effect=AssertionError('No uploads')
        with patch.dict(os.environ,{'DEEPSEEK_API_KEY':'forbidden','VOLCENGINE_API_KEY':'forbidden'}),patch('services.workflow.worker.subprocess.Popen',wraps=subprocess.Popen) as launch:
            done=[run_once(self.jobs),run_once(self.jobs)]
        self.assertEqual({j['id'] for j in done},{j['id'] for j in batch})
        self.assertTrue(all(j['state']=='succeeded' and j['result']['attached'] for j in done))
        for call in launch.call_args_list:
            self.assertNotIn('DEEPSEEK_API_KEY',call.kwargs['env']);self.assertNotIn('VOLCENGINE_API_KEY',call.kwargs['env'])
        current=self.store.get_project(project['id'])
        for old,new in zip(project['scenes'][:2],current['scenes'][:2]):
            self.assertEqual(new['state'],'ready');self.assertEqual(old['scene']['narration'],new['scene']['narration'])

    def test_usage_attempts_keep_frozen_observations_across_explicit_retry(self):
        from services.projects.jobs import Jobs
        self.jobs=Jobs(self.store,'deepseek-flash');job=self.submit();first=self.jobs.claim()
        self.assertEqual(self.jobs.project_usage(self.project['id'])['items'][0]['usage']['state'],'pending')
        self.jobs.record_usage(job['id'],first['attempt_id'],{'state':'reported','input_tokens':100,'output_tokens':20})
        self.jobs.fail(job['id'],first['attempt_id'],'transport_error');self.jobs.retry(job['id'])
        with self.store.connection() as conn:conn.execute('UPDATE jobs SET available_at=now() WHERE id=%s',[job['id']])
        second=self.jobs.claim();self.assertNotEqual(first['attempt_id'],second['attempt_id'])
        self.jobs.record_usage(job['id'],first['attempt_id'],{'state':'reported','input_tokens':1,'output_tokens':1})
        data=self.jobs.project_usage(self.project['id']);self.assertEqual(data['summary']['attempts'],2)
        by_number={r['number']:r for r in data['items']}
        self.assertEqual(by_number[1]['usage']['quantity']['input_tokens'],100)
        self.assertEqual(by_number[2]['usage']['state'],'pending');self.assertEqual(data['summary']['unknown'],1)
        import uuid
        with self.assertRaises(StoreError):self.jobs.record_usage(job['id'],str(uuid.uuid4()),{'state':'submitted'})
        self.jobs.fail(job['id'],second['attempt_id'],'configuration')

    def test_worker_preserves_reported_usage_after_cancellation(self):
        import sys,time
        from services.workflow.worker import run_once
        job=self.submit();marker=self.public/'usage-reported-test-marker'
        self.assertFalse(marker.exists())
        script='''import json,sys,time
from pathlib import Path
p=json.load(sys.stdin)
Path(p['_usage_file']).write_text(json.dumps({'state':'reported','input_tokens':100,'output_tokens':20}))
Path(sys.argv[1]).touch()
time.sleep(20)
'''
        with ThreadPoolExecutor() as pool:
            future=pool.submit(run_once,self.jobs,[sys.executable,'-c',script,str(marker)],heartbeat_interval=.05)
            for _ in range(200):
                if marker.is_file():break
                time.sleep(.02)
            else:self.fail('usage-writing test worker did not report')
            self.jobs.cancel(job['id']);self.assertEqual(future.result(timeout=5)['state'],'cancelled')
        row=self.jobs.project_usage(self.project['id'])['items'][0]
        self.assertEqual(row['usage']['state'],'reported');self.assertEqual(row['usage']['quantity']['input_tokens'],100)
        self.assertEqual(self.store.get_candidates(self.scene_id),[])

    def test_worker_records_usage_on_child_failure_and_timeout(self):
        import sys
        from services.workflow.worker import run_once
        from services.projects.jobs import Jobs
        self.jobs=Jobs(self.store,'deepseek-flash');job=self.submit()
        code="import json,sys,pathlib;d=json.load(sys.stdin);pathlib.Path(d['_usage_file']).write_text(json.dumps({'state':'reported','input_tokens':10,'output_tokens':3}));print(json.dumps({'error':'transport_error'}))"
        self.assertEqual(run_once(self.jobs,[sys.executable,'-c',code])['state'],'failed')
        first=self.jobs.project_usage(self.project['id']);self.assertEqual(first['items'][0]['usage']['state'],'reported')
        self.jobs.retry(job['id'])
        with self.store.connection() as conn:conn.execute('UPDATE jobs SET available_at=now() WHERE id=%s',[job['id']])
        code="import json,sys,pathlib,time;d=json.load(sys.stdin);pathlib.Path(d['_usage_file']).write_text(json.dumps({'state':'submitted'}));time.sleep(10)"
        self.assertEqual(run_once(self.jobs,[sys.executable,'-c',code],timeout=1,heartbeat_interval=.1)['error']['code'],'timeout')
        data=self.jobs.project_usage(self.project['id']);self.assertEqual(data['summary']['unknown'],1)
        self.assertEqual({r['number']:r for r in data['items']}[2]['usage']['state'],'submitted')

    def test_old_attempts_remain_unknown_without_backfill(self):
        job=self.submit();first=self.jobs.claim();self.jobs.fail(job['id'],first['attempt_id'],'configuration')
        with self.store.connection() as conn:conn.execute('UPDATE job_attempts SET usage=NULL WHERE id=%s',[first['attempt_id']])
        self.jobs.record_usage(job['id'],first['attempt_id'],{'state':'reported','input_tokens':1,'output_tokens':1})
        data=self.jobs.project_usage(self.project['id']);self.assertIsNone(data['items'][0]['usage'])
        self.assertEqual(data['summary']['historical_unknown'],1)

    def test_project_voice_dedup_and_cost_agree_without_reusing_wrong_voice(self):
        from services.projects.estimates import estimate_project
        project,scenes=self.pending_voice(1)
        old=self.jobs.submit_voice(scenes[0]['scene_id'],scenes[0]['expected_revision'])
        changed=self.store.set_voice(project['id'],project['revision'],'voice_A')
        quote=lambda:estimate_project(self.store,self.jobs.model,project['id'],changed['revision'],'batch_voice',scenes)
        self.assertEqual(quote()['quantity']['calls'],1)
        new=self.jobs.submit_batch_voice(project['id'],changed['revision'],scenes,True)[0]
        self.assertNotEqual(new['id'],old['id']);self.assertEqual(new['input']['profile']['voice']['speaker'],'voice_A')
        self.assertEqual(self.jobs.submit_voice(scenes[0]['scene_id'],scenes[0]['expected_revision'])['id'],new['id'])
        self.assertEqual(self.jobs.submit_batch_voice(project['id'],changed['revision'],scenes,True)[0]['id'],new['id'])
        self.assertEqual(quote()['status'],'no_new_call')
        self.assertEqual(self.jobs.get(old['id'])['input'],old['input']);self.assertEqual(self.jobs.get(old['id'])['state'],'queued')
        listed={j['id']:j for j in self.jobs.list_project(project['id'])}
        self.assertFalse(listed[old['id']]['voice_current']);self.assertTrue(listed[new['id']]['voice_current'])
        self.jobs.cancel(new['id'])
        self.assertEqual(self.jobs.submit_batch_voice(project['id'],changed['revision'],scenes,True)[0]['state'],'cancelled')
        changed=self.store.set_voice(project['id'],changed['revision'],'voice_B')
        other=self.jobs.submit_voice(scenes[0]['scene_id'],scenes[0]['expected_revision'])
        changed=self.store.set_voice(project['id'],changed['revision'],'voice_A')
        with self.store.connection() as conn:
            for i in range(51):self.jobs._submit(conn,project['id'],scenes[0]['scene_id'],1,{'kind':'regenerate','voice_history_test':i})
        listed={j['id']:j for j in self.jobs.list_project(project['id'])}
        self.assertIn(new['id'],listed);self.assertTrue(listed[new['id']]['voice_current'])
        self.assertNotIn(other['id'],listed)

    def test_project_voice_old_job_cannot_overwrite_and_new_voice_can_publish(self):
        old=self.jobs.submit_voice(self.scene_id,1);attempt=self.jobs.claim()
        changed=self.store.set_voice(self.project['id'],1,'voice_A')
        document={**copy.deepcopy(self.dsl),'scenes':[copy.deepcopy(self.dsl['scenes'][0])]}
        stale=self.jobs.publish_voice(old['id'],attempt['attempt_id'],document)
        self.assertFalse(stale['result']['attached']);self.assertEqual(self.store.get_project(self.project['id']),changed)
        new=self.jobs.submit_voice(self.scene_id,1);attempt=self.jobs.claim()
        self.assertEqual(new['input']['profile']['voice']['speaker'],'voice_A')
        done=self.jobs.publish_voice(new['id'],attempt['attempt_id'],document)
        self.assertTrue(done['result']['attached']);self.assertEqual(self.jobs.get(old['id'])['input'],old['input'])

    def test_project_voice_is_frozen_in_local_timing_versions_and_preview(self):
        old=self.store.create_version(self.project['id'],1)
        changed=self.store.set_voice(self.project['id'],1,'voice_A');self.timing_cache()
        timing=self.jobs.submit_timing(self.scene_id,1)
        version=self.store.create_version(changed['id'],changed['revision']);preview=self.jobs.submit_preview(self.scene_id,1)
        for profile in [timing['input']['profile'],version['profile'],preview['input']['version']['profile']]:
            self.assertEqual(profile['voice']['speaker'],'voice_A')
        self.assertEqual(self.store.get_version(old['id']),old)
        self.assertEqual(self.store.get_project(self.project['id'])['scenes'],self.project['scenes'])

    def test_batch_voice_is_atomic_idempotent_and_preserves_draft(self):
        project, scenes = self.pending_voice()
        def submit(): return self.jobs.submit_batch_voice(project['id'], project['revision'], scenes, True)
        with ThreadPoolExecutor(max_workers=2) as pool:
            first, second = list(pool.map(lambda _: submit(), range(2)))
        self.assertEqual([j['id'] for j in first], [j['id'] for j in second])
        self.assertEqual(len(first), 2)
        self.assertTrue(all(j['state'] == 'queued' and j['attempts'] == 0 for j in first))
        self.assertEqual(self.store.get_project(project['id']), project)
        self.jobs.cancel(first[0]['id'])
        with self.store.connection() as conn:
            conn.execute("UPDATE jobs SET state='failed',error=%s WHERE id=%s",
                [json.dumps({'code': 'timeout', 'retryable': True}), first[1]['id']])
        terminal = submit()
        self.assertEqual([j['state'] for j in terminal], ['cancelled', 'failed'])
        self.assertTrue(all(j['attempts'] == 0 for j in terminal))
        self.assertEqual(len(self.jobs.list_project(project['id'])), 2)

    def test_batch_voice_rejects_unconfirmed_stale_foreign_duplicate_and_ready(self):
        import uuid
        project, scenes = self.pending_voice()
        invalid = [([], True, project['revision']), (scenes, False, project['revision']),
            (scenes, True, 1), ([scenes[0], scenes[0]], True, project['revision']),
            ([scenes[0], {**scenes[1], 'expected_revision': 1}], True, project['revision']),
            ([scenes[0], {'scene_id': str(uuid.uuid4()), 'expected_revision': 1}], True, project['revision']),
            ([scenes[0], {'scene_id': project['scenes'][2]['id'], 'expected_revision': 1}], True, project['revision']),
            ([{**scenes[0], 'unexpected': True}], True, project['revision']),
            ([{**scenes[0], 'expected_revision': True}], True, project['revision'])]
        for selected, confirmed, base in invalid:
            with self.subTest(selected=selected, confirmed=confirmed, base=base):
                with self.assertRaises(StoreError):
                    self.jobs.submit_batch_voice(project['id'], base, selected, confirmed)
                self.assertEqual(self.jobs.list_project(project['id']), [])
                self.assertEqual(self.store.get_project(project['id']), project)
        # Single-scene jobs must also be reused, regardless of a subsequently changed voice profile.
        existing = self.jobs.submit_voice(scenes[0]['scene_id'], scenes[0]['expected_revision'])
        self.store.profile['voice']['speaker'] = 'new_voice'
        result = self.jobs.submit_batch_voice(project['id'], project['revision'], [scenes[0]], True)
        self.assertEqual(result[0]['id'], existing['id'])

    def test_batch_voice_preserves_timing_audio_and_rolls_back_internal_failure(self):
        from unittest.mock import patch
        project, scenes = self.pending_voice()
        row = project['scenes'][2]
        draft = self.jobs._draft_scene(row['scene']); draft['elements'][0]['cue']['text_start'] += 1
        candidate = self.store.create_candidate(row['id'], row['revision'], draft)
        project = self.store.accept_candidate(row['id'], candidate['id'], row['revision'])
        timing = project['scenes'][2]
        self.assertEqual(timing['state'], 'needs_timing')
        with self.assertRaisesRegex(StoreError, 'not_ready'):
            self.jobs.submit_batch_voice(project['id'], project['revision'],
                [scenes[0], {'scene_id': timing['id'], 'expected_revision': timing['revision']}], True)
        real_voice = self.jobs._voice
        def interrupted(conn, project_id, selected):
            if selected['id'] == scenes[1]['scene_id']: raise StoreError('validation', 'Injected failure')
            return real_voice(conn, project_id, selected)
        with patch.object(self.jobs, '_voice', side_effect=interrupted):
            with self.assertRaisesRegex(StoreError, 'Injected failure'):
                self.jobs.submit_batch_voice(project['id'], project['revision'], scenes, True)
        self.assertEqual(self.jobs.list_project(project['id']), [])
        self.assertEqual(self.store.get_project(project['id']), project)
        self.assertEqual(timing['scene']['narration'], row['scene']['narration'])

    def test_course_jobs_include_current_voice_beyond_recent_history(self):
        project, scenes = self.pending_voice(1)
        voice = self.jobs.submit_voice(scenes[0]['scene_id'], scenes[0]['expected_revision'])
        with self.store.connection() as conn:
            for i in range(51):
                self.jobs._submit(conn, project['id'], scenes[0]['scene_id'], 1,
                    {'kind': 'regenerate', 'history_fixture': i})
        listed = self.jobs.list_project(project['id'])
        self.assertIn(voice['id'], [j['id'] for j in listed])
        self.assertEqual(len(listed), 51)

    def test_local_timing_worker_restores_candidate_without_provider(self):
        from services.workflow.worker import run_once
        self.timing_cache()
        draft=self.jobs._draft_scene(self.project['scenes'][0]['scene']);draft['elements'][0]['cue']['text_start']=1
        candidate=self.store.create_candidate(self.scene_id,1,draft)
        changed=self.store.accept_candidate(self.scene_id,candidate['id'],1)
        self.assertEqual(changed['scenes'][0]['state'],'needs_timing')
        job=self.jobs.submit_timing(self.scene_id,2)
        self.assertEqual(self.jobs.submit_timing(self.scene_id,2)['id'],job['id'])
        from unittest.mock import Mock
        self.store.objects=Mock()
        self.store.objects.ensure.side_effect=AssertionError('No object downloads')
        self.store.objects.put.side_effect=AssertionError('No object uploads')
        from unittest.mock import patch
        import subprocess
        with patch.dict(os.environ,{'DEEPSEEK_API_KEY':'test-only','VOLCENGINE_API_KEY':'test-only'}), patch('services.workflow.worker.subprocess.Popen', wraps=subprocess.Popen) as launch:
            done=run_once(self.jobs)
        self.assertNotIn('DEEPSEEK_API_KEY',launch.call_args.kwargs['env'])
        self.assertNotIn('VOLCENGINE_API_KEY',launch.call_args.kwargs['env'])
        self.assertEqual(done['state'],'succeeded');self.assertTrue(done['result']['attached'])
        scene=self.store.get_project(self.project['id'])['scenes'][0]
        self.assertEqual(scene['state'],'ready');self.assertEqual(scene['scene']['narration'],self.project['scenes'][0]['scene']['narration'])
        self.assertEqual(done['result']['document']['assets'],[job['input']['asset']])
        self.store.initialize()  # v5 must remain valid after another startup with a timing row.
        self.assertEqual(self.jobs.submit_timing(self.scene_id,2)['id'],job['id'])

    def test_concept_local_timing_preserves_roles_and_audio_without_provider(self):
        from services.workflow.worker import run_once
        from unittest.mock import patch
        self.project=self.import_concept();row=self.project['scenes'][0];self.scene_id=row['id'];cache=self.timing_cache()
        text=row['scene']['narration']['text'];asset=next(a for a in self.dsl['assets'] if a['id']==row['scene']['narration']['audio_asset_id'])
        unit=asset['duration_ms']/1000/len(text)
        # Word-level test data, not a claim of measured acoustic timing.
        cache.write_text(json.dumps([{'word':c,'startTime':i*unit,'endTime':(i+.8)*unit} for i,c in enumerate(text)]))
        elements=copy.deepcopy(row['scene']['elements']);elements[0]['cue']['text_start']+=1;cue=elements[0]['cue']
        elements[0]['content']=row['scene']['narration']['text'][cue['text_start']:cue['text_end']][:40]
        changed=self.store.edit_scene(self.scene_id,1,{'elements':elements});self.assertEqual(changed['scenes'][0]['state'],'needs_timing')
        job=self.jobs.submit_timing(self.scene_id,2)
        with patch.dict(os.environ,{'DEEPSEEK_API_KEY':'','VOLCENGINE_API_KEY':''}):done=run_once(self.jobs)
        self.assertEqual(done['id'],job['id']);self.assertEqual(done['state'],'succeeded',done.get('error'));self.assertTrue(done['result']['attached'])
        current=self.store.get_project(self.project['id'])['scenes'][0]
        self.assertEqual(current['state'],'ready');self.assertEqual(current['scene']['elements'],elements)
        self.assertEqual(current['scene']['narration'],row['scene']['narration'])
        self.assertEqual([e['concept_role'] for e in current['scene']['elements']],[e['concept_role'] for e in row['scene']['elements']])

    def test_manual_cue_retimes_cached_audio_and_old_timing_cannot_overwrite(self):
        from services.workflow.local_timing import timing_document
        from services.workflow.worker import run_once
        from unittest.mock import patch
        row=self.project['scenes'][0];self.timing_cache()
        old=self.jobs.submit_timing(self.scene_id,1);attempt=self.jobs.claim()
        document=timing_document(old['input'],self.public)
        elements=copy.deepcopy(row['scene']['elements']);elements[0]['cue']['text_start']+=1
        changed=self.store.edit_scene(self.scene_id,1,{'elements':elements})
        done=self.jobs.publish_voice(old['id'],attempt['attempt_id'],document)
        self.assertFalse(done['result']['attached']);self.assertEqual(self.store.get_project(self.project['id']),changed)
        current=self.jobs.submit_timing(self.scene_id,2)
        with patch.dict(os.environ,{'DEEPSEEK_API_KEY':'','VOLCENGINE_API_KEY':''}):
            done=run_once(self.jobs)
        self.assertEqual(done['id'],current['id']);self.assertTrue(done['result']['attached'])
        updated=self.store.get_project(self.project['id'])['scenes'][0]
        self.assertEqual(updated['state'],'ready');self.assertEqual(updated['scene']['narration'],row['scene']['narration'])
        self.assertEqual(updated['scene']['elements'],elements);self.assertIn('animations',updated['scene'])

    def test_local_timing_missing_changed_cache_and_needs_voice_rejected(self):
        from services.workflow.worker import run_once
        with self.assertRaisesRegex(StoreError,'timing_cache'):self.jobs.submit_timing(self.scene_id,1)
        words=self.timing_cache();job=self.jobs.submit_timing(self.scene_id,1);words.write_text('[]')
        result=run_once(self.jobs)
        self.assertEqual(result['error']['code'],'timing_cache');self.assertFalse(result['error']['retryable'])
        self.store.edit_scene(self.scene_id,1,{'narration_text':self.project['scenes'][0]['scene']['narration']['text']+'新的说明。'})
        with self.assertRaisesRegex(StoreError,'not_ready'):self.jobs.submit_timing(self.scene_id,2)

    def test_local_timing_stale_result_and_audio_replacement_rejected(self):
        from services.workflow.local_timing import timing_document
        self.timing_cache();job=self.jobs.submit_timing(self.scene_id,1);attempt=self.jobs.claim()
        document=timing_document(job['input'],self.public)
        wrong=copy.deepcopy(document);wrong['assets'][0]['id']='other_audio';wrong['scenes'][0]['narration']['audio_asset_id']='other_audio'
        with self.assertRaises(StoreError):self.jobs.publish_voice(job['id'],attempt['attempt_id'],wrong)
        elements=copy.deepcopy(self.project['scenes'][0]['scene']['elements']);elements[0]['content']='人工新标题'
        self.store.edit_scene(self.scene_id,1,{'elements':elements})
        done=self.jobs.publish_voice(job['id'],attempt['attempt_id'],document)
        self.assertFalse(done['result']['attached']);self.assertEqual(self.store.get_project(self.project['id'])['scenes'][0]['scene']['elements'][0]['content'],'人工新标题')

    def test_local_timing_old_attempt_cannot_publish_after_explicit_retry(self):
        from services.workflow.local_timing import timing_document
        self.timing_cache();job=self.jobs.submit_timing(self.scene_id,1);old=self.jobs.claim()
        document=timing_document(job['input'],self.public)
        self.jobs.fail(job['id'],old['attempt_id'],'timeout');self.jobs.retry(job['id'])
        with self.store.connection() as conn:conn.execute('UPDATE jobs SET available_at=now() WHERE id=%s',[job['id']])
        new=self.jobs.claim();self.assertIsNotNone(new)
        with self.assertRaises(StoreError):self.jobs.publish_voice(job['id'],old['attempt_id'],document)
        self.assertTrue(self.jobs.publish_voice(job['id'],new['attempt_id'],document)['result']['attached'])

    def test_local_timing_cancel_never_attaches(self):
        from services.workflow.local_timing import timing_document
        self.timing_cache();job=self.jobs.submit_timing(self.scene_id,1);attempt=self.jobs.claim()
        self.jobs.cancel(job['id'])
        result=self.jobs.publish_voice(job['id'],attempt['attempt_id'],timing_document(job['input'],self.public))
        self.assertEqual(result['state'],'cancelled')

    def expire(self, job):
        with self.store.connection() as conn:
            conn.execute("UPDATE jobs SET heartbeat_at=now()-interval '61 seconds' WHERE id=%s", [job['id']])

    def test_dedup_and_input_snapshot_and_model_version(self):
        from services.projects.jobs import Jobs
        first = self.submit()
        self.assertEqual(self.submit()['id'], first['id'])
        self.assertNotEqual(Jobs(self.store, model='deepseek-v-next').submit_regenerate(self.scene_id, 1)['id'], first['id'])
        elements = copy.deepcopy(self.project['scenes'][0]['scene']['elements'])
        elements[0]['content'] = '新教学标题'
        self.store.edit_scene(self.scene_id, 1, {'elements': elements})
        self.assertEqual(self.jobs.get(first['id'])['input'], first['input'])
        with self.assertRaisesRegex(StoreError, 'conflict'): self.submit()
        self.assertNotEqual(self.jobs.submit_regenerate(self.scene_id, 2)['id'], first['id'])

    def test_parallel_claim_has_one_workflow_slot(self):
        self.submit()
        from services.projects.jobs import Jobs
        Jobs(self.store, model='other-model').submit_regenerate(self.scene_id, 1)
        with ThreadPoolExecutor(2) as pool: results = list(pool.map(lambda _: self.jobs.claim(), range(2)))
        self.assertEqual(sum(r is not None for r in results), 1)

    def test_queued_and_running_cancel_and_terminal_fence(self):
        queued = self.submit()
        self.assertEqual(self.jobs.cancel(queued['id'])['state'], 'cancelled')
        with self.assertRaisesRegex(StoreError, 'conflict'): self.jobs.retry(queued['id'])
        from services.projects.jobs import Jobs
        jobs = Jobs(self.store, model='other-model')
        running = jobs.submit_regenerate(self.scene_id, 1)
        attempt = jobs.claim()
        self.assertEqual(jobs.cancel(running['id'])['state'], 'running')
        self.assertTrue(jobs.heartbeat(running['id'], attempt['attempt_id'])['cancel_requested'])
        self.assertEqual(jobs.ack_cancel(running['id'], attempt['attempt_id'])['state'], 'cancelled')
        with self.assertRaisesRegex(StoreError, 'conflict'): jobs.fail(running['id'], attempt['attempt_id'], 'provider_error')

    def test_expired_attempt_cannot_write_and_explicit_retry(self):
        job = self.submit()
        first = self.jobs.claim()
        self.expire(job)
        self.assertEqual(self.jobs.recover(), 1)
        with self.assertRaisesRegex(StoreError, 'conflict'): self.jobs.heartbeat(job['id'], first['attempt_id'])
        self.jobs.retry(job['id'])
        with self.store.connection() as conn: conn.execute('UPDATE jobs SET available_at=now() WHERE id=%s', [job['id']])
        second = self.jobs.claim()
        self.assertNotEqual(second['attempt_id'], first['attempt_id'])
        with self.assertRaisesRegex(StoreError, 'conflict'): self.jobs.fail(job['id'], first['attempt_id'], 'timeout')
        self.assertEqual(self.jobs.get(job['id'])['state'], 'running')

    def test_three_attempt_cap_and_validation_not_retryable(self):
        job = self.submit()
        for i in range(3):
            attempt = self.jobs.claim()
            self.jobs.fail(job['id'], attempt['attempt_id'], 'provider_error')
            if i < 2:
                queued = self.jobs.retry(job['id'])
                self.assertEqual(queued['attempts'], i + 1)
                self.assertIsNone(self.jobs.claim())
                with self.store.connection() as conn: conn.execute('UPDATE jobs SET available_at=now() WHERE id=%s', [job['id']])
        with self.assertRaisesRegex(StoreError, 'conflict'): self.jobs.retry(job['id'])
        from services.projects.jobs import Jobs
        other = Jobs(self.store, model='new-model').submit_regenerate(self.scene_id, 1)
        attempt = self.jobs.claim()
        self.jobs.fail(other['id'], attempt['attempt_id'], 'validation')
        with self.assertRaisesRegex(StoreError, 'conflict'): self.jobs.retry(other['id'])

    def test_cancel_queued_retry_does_not_rewrite_failed_attempt(self):
        job = self.submit()
        first = self.jobs.claim()
        self.jobs.fail(job['id'], first['attempt_id'], 'timeout')
        self.jobs.retry(job['id'])
        self.jobs.cancel(job['id'])
        with self.store.connection() as conn:
            attempt = conn.execute('SELECT * FROM job_attempts WHERE id=%s', [first['attempt_id']]).fetchone()
        self.assertEqual(attempt['state'], 'failed')
        self.assertEqual(attempt['error']['code'], 'timeout')

    def test_queued_retry_expired_budget_never_launches_new_attempt(self):
        job = self.submit()
        attempt = self.jobs.claim()
        self.jobs.fail(job['id'], attempt['attempt_id'], 'transport_error')
        self.jobs.retry(job['id'])
        with self.store.connection() as conn:
            conn.execute("UPDATE jobs SET started_at=now()-interval '901 seconds',available_at=now() WHERE id=%s", [job['id']])
        self.assertIsNone(self.jobs.claim())
        self.assertEqual(self.jobs.get(job['id'])['attempts'], 1)
        self.assertFalse(self.jobs.get(job['id'])['error']['retryable'])

    def test_markdown_materials_survive_jobs_but_not_narration_or_tts_config(self):
        from services.workflow.manuscript_document import format_document
        from services.projects.estimates import estimate_project
        from services.tests.test_manuscript_document import SECTIONS
        project = self.store.create_project('Markdown',format_document({'sections':SECTIONS}),manuscript_format='markdown')
        self.project = project
        job = self.jobs.submit_generate(project['id'],1)
        self.assertEqual(job['input']['materials'],SECTIONS)
        self.assertEqual(job['input']['source_text'],SECTIONS[0]['narration'])
        self.assertEqual(job['input']['protocol_version'],'teaching-outline:9')
        self.assertEqual(self.jobs.submit_generate(project['id'],1)['id'],job['id'])
        self.assertEqual(estimate_project(self.store,self.jobs.model,project['id'],1,'generate',[])['status'],'no_new_call')
        attempt = self.jobs.claim()
        draft = {'scenes':[{'id':'s1','type':'card_sequence','narration':{'text':SECTIONS[0]['narration']},
                 'elements':[{'id':'e1','content':'uv add requests','cue':{'text_start':0,'text_end':5}}]}]}
        self.assertEqual(self.jobs.publish_outline(job['id'],attempt['attempt_id'],draft)['state'],'succeeded')
        saved = self.store.get_project(project['id']);row = saved['scenes'][0]
        candidate = self.jobs.submit_regenerate(row['id'],row['revision'])
        self.assertEqual(candidate['input']['materials'],SECTIONS)
        self.assertEqual(candidate['input']['protocol_version'],'scene-candidate:9')
        voice = self.jobs.submit_voice(row['id'],row['revision'])
        self.assertNotIn('manuscript',voice['input'])
        self.assertNotIn('uv add',voice['input']['scene']['narration']['text'])

    def test_frozen_v6_provider_publishes_source_bound_graphics(self):
        import io,json,httpx
        from contextlib import redirect_stdout
        from unittest.mock import patch
        from services.workflow.worker import child
        from services.projects.estimates import estimate_project
        self.jobs.model='deepseek-flash'
        project=self.store.create_project('紧凑导演链','先识别，再校验。');self.project=project
        job=self.jobs.submit_generate(project['id'],1)
        self.assertEqual(job['input']['protocol_version'],'teaching-outline:8')
        quote=estimate_project(self.store,self.jobs.model,project['id'],1,'generate',[])
        self.assertEqual(quote['status'],'no_new_call')
        args={'p1':{'layout':'process','a':1,'b':2,'c':0,'d':0,'note_a':0,'note_b':0}}
        calls=[]
        def handler(req):
            calls.append(json.loads(req.content));value={'p1':{'layout':'process'}} if len(calls)==1 else args
            return httpx.Response(200,json={'choices':[{'finish_reason':'tool_calls','message':{'tool_calls':[{'type':'function','function':{'name':'plan_lesson','arguments':json.dumps(value)}}]}}]})
        client=httpx.Client(transport=httpx.MockTransport(handler))
        output=io.StringIO()
        with patch('httpx.Client',return_value=client),patch.dict('os.environ',{'DEEPSEEK_API_KEY':'test'}),patch('sys.stdin',io.StringIO(json.dumps({**job['input'],'protocol_version':'teaching-outline:6'}))),redirect_stdout(output):child()
        draft=json.loads(output.getvalue())['draft'];self.assertEqual(len(calls),2);attempt=self.jobs.claim()
        self.assertEqual(self.jobs.publish_outline(job['id'],attempt['attempt_id'],draft)['state'],'succeeded')
        saved=self.store.get_project(project['id']);self.assertIn('process',saved['scenes'][0]['scene'])
        self.assertEqual(saved['scenes'][0]['state'],'needs_voice')

    def test_frozen_v4_mock_provider_publishes_all_graphics(self):
        import io,json,httpx
        from contextlib import redirect_stdout
        from unittest.mock import patch
        from services.tests.test_teaching_diagrams import funnel_draft,draft,process_draft
        from services.tests.test_director import wire
        from services.workflow.storyboard import source_parts
        from services.workflow.worker import child
        from services.projects.estimates import estimate_project
        scenes=[funnel_draft(),draft(),process_draft()];text=''.join(s['narration']['text'] for s in scenes)
        project=self.store.create_project('导演完整链',text,teaching_style='technical');self.project=project
        self.jobs.model='deepseek-flash'
        payload={'kind':'generate','project_id':project['id'],'base_revision':1,'source_text':text,'profile':copy.deepcopy(self.store.profile),'model':self.jobs.model,'protocol_version':'teaching-outline:4','teaching_style':'technical'}
        with self.store.connection() as conn:job=self.jobs._submit(conn,project['id'],None,1,payload)
        quote=estimate_project(self.store,self.jobs.model,project['id'],1,'generate',[])
        self.assertEqual(quote['status'],'estimated')
        output=[];cursor=1
        for scene in scenes:
            count=len(source_parts(scene['narration']['text']));output.append(wire(scene,list(range(cursor,cursor+count))));cursor+=count
        calls=[]
        def handler(request):
            body=json.loads(request.content);calls.append(body)
            schema=json.JSONDecoder().raw_decode(body['messages'][0]['content'].split('JSON Schema: ',1)[1])[0]
            self.assertIn('funnel',schema['definitions']['Scene']['properties'])
            return httpx.Response(200,json={'choices':[{'finish_reason':'stop','message':{'content':json.dumps({'scenes':output})}}]})
        client=httpx.Client(transport=httpx.MockTransport(handler));captured=io.StringIO()
        with patch('httpx.Client',return_value=client),patch.dict('os.environ',{'DEEPSEEK_API_KEY':'test-only'}),patch('sys.stdin',io.StringIO(json.dumps(job['input']))),redirect_stdout(captured):child()
        value=json.loads(captured.getvalue());self.assertEqual(value,{'draft':{'scenes':scenes}});self.assertEqual(len(calls),1)
        attempt=self.jobs.claim();self.assertEqual(attempt['id'],job['id'])
        result=self.jobs.publish_outline(job['id'],attempt['attempt_id'],value['draft'])
        self.assertEqual(result['state'],'succeeded')
        saved=self.store.get_project(project['id'])
        self.assertEqual([s['scene'] for s in saved['scenes']],scenes)
        self.assertTrue(all(s['state']=='needs_voice' for s in saved['scenes']))
        selected=saved['scenes'][1];candidate=self.jobs.submit_regenerate(selected['id'],selected['revision'])
        quote=estimate_project(self.store,self.jobs.model,project['id'],saved['revision'],'regenerate',[{'scene_id':selected['id'],'expected_revision':selected['revision']}])
        self.assertEqual(quote['status'],'no_new_call');self.assertEqual(quote['quantity']['reused_jobs'],1)
        self.assertEqual(candidate['input']['protocol_version'],'scene-candidate:8')

    def test_v5_generation_dedup_does_not_reuse_failed_legacy_jobs(self):
        project=self.store.create_project('protocol upgrade','规则匹配。');self.project=project;old_ids=[]
        for version in [1,2,3,4,5]:
            payload={'kind':'generate','project_id':project['id'],'base_revision':1,'source_text':'规则匹配。',
                     'profile':copy.deepcopy(self.store.profile),'model':self.jobs.model,'protocol_version':f'teaching-outline:{version}'}
            with self.store.connection() as conn:old=self.jobs._submit(conn,project['id'],None,1,payload)
            attempt=self.jobs.claim();self.assertEqual(attempt['id'],old['id'])
            self.jobs.fail(old['id'],attempt['attempt_id'],'storyboard_invalid_cue');old_ids.append(old['id'])
        current=self.jobs.submit_generate(project['id'],1)
        self.assertNotIn(current['id'],old_ids);self.assertEqual(current['input']['protocol_version'],'teaching-outline:8')
        self.assertEqual(self.jobs.submit_generate(project['id'],1)['id'],current['id'])
        self.assertTrue(all(self.jobs.get(identifier)['state']=='failed' for identifier in old_ids))
        self.assertEqual(len(self.jobs.list_project(project['id'])),6)

    def test_v5_regeneration_hash_is_distinct_from_legacy_inputs(self):
        current=self.submit();old_ids=[]
        for version in [1,2,3,4,5]:
            payload=copy.deepcopy(current['input']);payload['protocol_version']=f'scene-candidate:{version}'
            with self.store.connection() as conn:old=self.jobs._submit(conn,current['project_id'],current['scene_id'],current['base_revision'],payload)
            old_ids.append(old['id']);self.assertEqual(self.jobs.get(old['id'])['input']['protocol_version'],payload['protocol_version'])
        self.assertEqual(current['input']['protocol_version'],'scene-candidate:8');self.assertNotIn(current['id'],old_ids)
        self.assertEqual(len(set(old_ids+[current['id']])),6);self.assertEqual(self.submit()['id'],current['id'])

    def test_cancelled_or_failed_generate_resubmit_reopens_same_job(self):
        for title, finish in [('取消后再生成', 'cancel'), ('失败后再生成', 'fail')]:
            empty = self.store.create_project(title, '规则匹配。')
            job = self.jobs.submit_generate(empty['id'], 1)
            if finish == 'cancel':
                self.assertEqual(self.jobs.cancel(job['id'])['state'], 'cancelled')
            else:
                attempt = self.jobs.claim()
                self.jobs.fail(job['id'], attempt['attempt_id'], 'storyboard_invalid_cue')
                self.assertEqual(self.jobs.get(job['id'])['state'], 'failed')
            again = self.jobs.submit_generate(empty['id'], 1)
            self.assertEqual(again['id'], job['id'])
            self.assertEqual(again['state'], 'queued')
            self.assertEqual(again['progress'], 0)
            self.assertEqual(again['attempts'], 0)
            self.assertIsNone(again['ended_at'])
            self.assertEqual(self.jobs.submit_generate(empty['id'], 1)['id'], job['id'])
            claimed = self.jobs.claim()
            self.assertEqual(claimed['id'], job['id'])
            self.assertEqual(claimed['attempts'], 1)
            self.assertTrue(self.jobs.cancel(job['id'])['cancel_requested'])
            self.assertEqual(self.jobs.fail(job['id'],claimed['attempt_id'],'transport_error')['state'],'cancelled')

    def test_failed_generate_resubmit_picks_up_edited_source_text(self):
        empty = self.store.create_project('改稿后再生成', '旧稿规则匹配。')
        job = self.jobs.submit_generate(empty['id'], 1)
        attempt = self.jobs.claim()
        self.jobs.fail(job['id'], attempt['attempt_id'], 'storyboard_concept_roles')
        with self.store.connection() as conn:
            conn.execute("UPDATE projects SET source_text=%s WHERE id=%s", ['新稿三条路径对比。', empty['id']])
        again = self.jobs.submit_generate(empty['id'], 1)
        self.assertEqual(again['id'], job['id'])
        self.assertEqual(again['state'], 'queued')
        self.assertEqual(again['input']['source_text'], '新稿三条路径对比。')
        self.assertNotEqual(again['input_hash'], job['input_hash'])
        self.jobs.cancel(job['id'])

    def test_initial_outline_dedup_attach_and_block_export_until_voice(self):
        from services.tests.test_generation import outline
        empty = self.store.create_project('Python 教学', '规则匹配。')
        job = self.jobs.submit_generate(empty['id'], 1)
        self.assertIsNone(job['scene_id'])
        self.assertEqual(self.jobs.submit_generate(empty['id'], 1)['id'], job['id'])
        attempt = self.jobs.claim()
        result = self.jobs.publish_outline(job['id'], attempt['attempt_id'], outline())
        self.assertEqual(result['state'], 'succeeded')
        self.assertTrue(result['result']['attached'])
        self.assertEqual(self.jobs.submit_generate(empty['id'], 1)['id'], job['id'])
        project = self.store.get_project(empty['id'])
        self.assertEqual(project['revision'], 2)
        self.assertEqual(project['source_text'], '规则匹配。')
        self.assertEqual(project['scenes'][0]['state'], 'needs_voice')
        self.assertEqual(project['scenes'][0]['generated_revision'], 1)
        with self.assertRaisesRegex(StoreError, 'not_ready'): self.store.create_version(empty['id'], 2)
        with self.assertRaises(StoreError): self.jobs.submit_generate(empty['id'], 2)
        with self.assertRaises(StoreError): self.jobs.publish_outline(job['id'], attempt['attempt_id'], outline())

    def test_delete_and_retry_serialize_on_project_lock(self):
        from threading import Barrier
        job = self.submit(); attempt = self.jobs.claim()
        self.jobs.fail(job['id'], attempt['attempt_id'], 'configuration')
        gate = Barrier(2)
        def act(operation):
            gate.wait(timeout=5)
            try:
                operation()
                return 'ok'
            except StoreError as error:
                return error.code
        with ThreadPoolExecutor(max_workers=2) as pool:
            deleted = pool.submit(act, lambda: self.store.delete_scene(self.project['id'], 1, self.scene_id, 1, True))
            retried = pool.submit(act, lambda: self.jobs.retry(job['id']))
            result = (deleted.result(timeout=15), retried.result(timeout=15))
        present = any(s['id'] == self.scene_id for s in self.store.get_project(self.project['id'])['scenes'])
        if present:
            self.assertEqual(result, ('not_ready', 'ok'))
            self.assertEqual(self.jobs.get(job['id'])['state'], 'queued')
        else:
            self.assertEqual(result, ('ok', 'not_found'))
            self.assertEqual(self.jobs.get(job['id'])['state'], 'failed')

    def test_configuration_failure_allows_explicit_retry(self):
        job = self.submit()
        attempt = self.jobs.claim()
        failed = self.jobs.fail(job['id'], attempt['attempt_id'], 'configuration')
        self.assertTrue(failed['error']['retryable'])
        self.assertEqual(self.jobs.retry(job['id'])['state'], 'queued')
        self.assertEqual(self.store.get_project(self.project['id']), self.project)

    def test_late_initial_outline_is_retained_without_attachment(self):
        from services.tests.test_generation import outline
        empty = self.store.create_project('AI 教学', '规则匹配。')
        job = self.jobs.submit_generate(empty['id'], 1)
        attempt = self.jobs.claim()
        with self.store.connection() as conn:
            conn.execute('UPDATE projects SET revision=revision+1 WHERE id=%s', [empty['id']])
        result = self.jobs.publish_outline(job['id'], attempt['attempt_id'], outline())
        self.assertFalse(result['result']['attached'])
        self.assertEqual(result['result']['draft'], outline())
        self.assertEqual(self.store.get_project(empty['id'])['scenes'], [])

    def test_initial_outline_wrong_text_and_cancel_do_not_attach(self):
        from services.tests.test_generation import outline
        empty = self.store.create_project('AI 教学', '规则匹配。')
        job = self.jobs.submit_generate(empty['id'], 1)
        attempt = self.jobs.claim()
        with self.assertRaises(StoreError):
            self.jobs.publish_outline(job['id'], attempt['attempt_id'], outline('规则变化。'))
        self.assertEqual(self.store.get_project(empty['id'])['scenes'], [])
        self.jobs.cancel(job['id'])
        self.assertEqual(self.jobs.publish_outline(job['id'], attempt['attempt_id'], outline())['state'], 'cancelled')
        self.assertEqual(self.store.get_project(empty['id'])['scenes'], [])

    def test_voice_publication_ready_dedup_and_immutable_old_version(self):
        version = self.store.create_version(self.project['id'], 1)
        job = self.jobs.submit_voice(self.scene_id, 1)
        self.assertEqual(self.jobs.submit_voice(self.scene_id, 1)['id'], job['id'])
        attempt = self.jobs.claim()
        document = copy.deepcopy(self.dsl)
        document['scenes'] = document['scenes'][:1]
        done = self.jobs.publish_voice(job['id'], attempt['attempt_id'], document)
        self.assertTrue(done['result']['attached'])
        self.assertEqual(self.store.get_project(self.project['id'])['revision'], 2)
        self.assertEqual(self.jobs.submit_voice(self.scene_id, 1)['id'], job['id'])
        self.assertEqual(self.store.get_version(version['id']), version)

    def test_voice_restores_invalidated_narration_and_allows_new_version(self):
        original = self.project['scenes'][0]['scene']['narration']['text']
        self.store.edit_scene(self.scene_id, 1, {'narration_text': '新的教学讲解。'})
        changed = self.store.edit_scene(self.scene_id, 2, {'narration_text': original})
        self.assertEqual(changed['scenes'][0]['state'], 'needs_voice')
        job = self.jobs.submit_voice(self.scene_id, 3)
        attempt = self.jobs.claim()
        document = copy.deepcopy(self.dsl)
        document['scenes'] = document['scenes'][:1]
        self.jobs.publish_voice(job['id'], attempt['attempt_id'], document)
        ready = self.store.get_project(self.project['id'])
        self.assertEqual(ready['scenes'][0]['state'], 'ready')
        self.assertEqual(ready['scenes'][0]['revision'], 3)
        self.assertEqual(ready['scenes'][0]['user_revision'], 2)
        self.store.create_version(self.project['id'], ready['revision'])

    def test_late_voice_is_retained_without_overwriting_edit(self):
        job = self.jobs.submit_voice(self.scene_id, 1)
        attempt = self.jobs.claim()
        changed = self.store.edit_scene(self.scene_id, 1, {'narration_text': '新的教学讲解。'})
        document = copy.deepcopy(self.dsl)
        document['scenes'] = document['scenes'][:1]
        done = self.jobs.publish_voice(job['id'], attempt['attempt_id'], document)
        self.assertFalse(done['result']['attached'])
        self.assertEqual(self.store.get_project(self.project['id']), changed)
        self.assertEqual(done['result']['document'], document)

    def test_voice_invalid_assets_cancel_and_wrong_scene_cannot_publish(self):
        job = self.jobs.submit_voice(self.scene_id, 1)
        attempt = self.jobs.claim()
        document = copy.deepcopy(self.dsl)
        document['scenes'] = document['scenes'][:1]
        wrong = copy.deepcopy(document)
        wrong['scenes'][0]['id'] = 'wrong_scene'
        with self.assertRaises(StoreError): self.jobs.publish_voice(job['id'], attempt['attempt_id'], wrong)
        broken = copy.deepcopy(document)
        broken['assets'][0]['checksum'] = '0' * 64
        with self.assertRaises(StoreError): self.jobs.publish_voice(job['id'], attempt['attempt_id'], broken)
        self.jobs.cancel(job['id'])
        self.assertEqual(self.jobs.publish_voice(job['id'], attempt['attempt_id'], document)['state'], 'cancelled')
        self.assertEqual(self.store.get_project(self.project['id']), self.project)

    def test_preview_freezes_only_ready_scene_without_new_project_version(self):
        other=self.project['scenes'][1]
        self.store.edit_scene(other['id'],1,{'narration_text':other['scene']['narration']['text']+'新增说明。'})
        job=self.jobs.submit_preview(self.scene_id,1)
        self.assertEqual(job['kind'],'render');self.assertEqual(job['input']['protocol_version'],'scene-preview:2')
        self.assertEqual(job['input']['version']['profile']['visual_style'],self.project['visual_style'])
        self.assertEqual(job['input']['version']['dsl']['scenes'],[self.project['scenes'][0]['scene']])
        self.assertEqual(len(job['input']['version']['dsl']['assets']),1)
        self.assertEqual(self.jobs.submit_preview(self.scene_id,1)['id'],job['id'])
        with self.store.connection() as conn:
            self.assertEqual(conn.execute('SELECT count(*) n FROM project_versions WHERE project_id=%s',[self.project['id']]).fetchone()['n'],0)
        self.store.edit_scene(self.scene_id,1,{'narration_text':self.project['scenes'][0]['scene']['narration']['text']+'新的讲解。'})
        self.assertEqual(self.jobs.get(job['id'])['input'],job['input'])
        with self.assertRaises(StoreError):self.jobs.submit_preview(self.scene_id,1)
        with self.assertRaisesRegex(StoreError,'not_ready'):self.jobs.submit_preview(self.scene_id,2)

    def test_preview_real_render_does_not_return_fake_project_version(self):
        from services.workflow.worker import run_once
        job=self.jobs.submit_preview(self.scene_id,1)
        done=run_once(self.jobs,timeout=180,lane='render')
        self.assertEqual(done['state'],'succeeded',done['error'])
        self.assertNotIn('version_id',done['result'])
        self.assertEqual(done['result']['scene_id'],self.scene_id)
        self.assertEqual(done['result']['snapshot_checksum'],job['input']['snapshot_checksum'])
        self.assertGreater(self.jobs.render_file(job['id'],'mp4').stat().st_size,1000)
        self.assertIn(self.project['scenes'][0]['scene']['captions'][0]['text'],self.jobs.render_file(job['id'],'srt').read_text())
        self.assertEqual(self.store.get_project(self.project['id']),self.project)

    def test_unknown_render_protocol_never_runs(self):
        from services.workflow.worker import run_once
        version=self.store.create_version(self.project['id'],1)
        original=self.jobs.submit_render(self.project['id'],version['id']);payload=copy.deepcopy(original['input'])
        self.jobs.cancel(original['id']);payload['protocol_version']='unknown'
        with self.store.connection() as conn:bad=self.jobs._submit(conn,self.project['id'],None,1,payload)
        done=run_once(self.jobs,lane='render')
        self.assertEqual(done['id'],bad['id']);self.assertEqual(done['state'],'failed')
        self.assertEqual(done['error']['code'],'validation')

    def test_render_freezes_version_and_dedups_across_later_edit(self):
        version = self.store.create_version(self.project['id'], 1)
        job = self.jobs.submit_render(self.project['id'], version['id'])
        self.assertEqual(job['kind'], 'render')
        self.assertEqual(job['stage'], 'render')
        self.store.edit_scene(self.scene_id, 1, {'narration_text': '新的教学讲解。'})
        self.assertEqual(self.jobs.submit_render(self.project['id'], version['id'])['id'], job['id'])
        self.assertEqual(self.jobs.get(job['id'])['input']['version'], job['input']['version'])
        self.assertEqual(job['input']['version']['dsl'], self.dsl)
        with self.assertRaises(StoreError): self.jobs.submit_render(self.project['id'], '00000000-0000-0000-0000-000000000000')

    def test_render_cannot_publish_missing_files_or_unknown_paths(self):
        version = self.store.create_version(self.project['id'], 1)
        job = self.jobs.submit_render(self.project['id'], version['id'])
        attempt = self.jobs.claim()
        with self.assertRaises(StoreError): self.jobs.publish_render(job['id'], attempt['attempt_id'])
        with self.assertRaises(StoreError): self.jobs.render_file(job['id'], '../secret')
        self.jobs.cancel(job['id'])
        self.jobs.ack_cancel(job['id'], attempt['attempt_id'])
        with self.assertRaises(StoreError): self.jobs.render_file(job['id'], 'mp4')

    def test_real_remotion_render_and_checksum_download(self):
        from services.workflow.worker import run_once
        version = self.store.create_version(self.project['id'], 1)
        job = self.jobs.submit_render(self.project['id'], version['id'])
        result = run_once(self.jobs, timeout=180, heartbeat_interval=1, lane='render')
        if result['state'] != 'succeeded':
            log = self.jobs.render_directory(result) / 'renderer.log'
            self.fail('Real renderer failed: ' + (log.read_text()[-3000:] if log.exists() else str(result['error'])))
        video = self.jobs.render_file(job['id'], 'mp4')
        subtitle = self.jobs.render_file(job['id'], 'srt')
        self.assertGreater(video.stat().st_size, 1000)
        self.assertIn('-->', subtitle.read_text())
        from fastapi.testclient import TestClient
        from services.api.app import create_app
        with TestClient(create_app(self.store, authentication=False), base_url='http://127.0.0.1:8000', client=('127.0.0.1', 50000)) as client:
            response = client.get('/api/jobs/' + job['id'] + '/files/srt')
            self.assertEqual(response.status_code, 200)
            self.assertEqual(response.content, subtitle.read_bytes())
            self.assertIn('attachment', response.headers['content-disposition'])
        import subprocess
        subprocess.run(['ffmpeg', '-v', 'error', '-i', str(video), '-f', 'null', '-'], check=True, capture_output=True, timeout=60)
        subtitle.write_text('tampered')
        with self.assertRaises(StoreError): self.jobs.render_file(job['id'], 'srt')

    def test_render_and_workflow_have_separate_single_slots(self):
        workflow = self.submit()
        version = self.store.create_version(self.project['id'], 1)
        render = self.jobs.submit_render(self.project['id'], version['id'])
        self.assertEqual(self.jobs.claim(lane='workflow')['id'], workflow['id'])
        self.assertEqual(self.jobs.claim(lane='render')['id'], render['id'])
        self.assertIsNone(self.jobs.claim(lane='workflow'))
        self.assertIsNone(self.jobs.claim(lane='render'))
        with self.assertRaises(StoreError): self.jobs.claim(lane='invalid')

    def test_renderer_profile_change_before_execution_is_rejected(self):
        from services.workflow.worker import run_once
        version = self.store.create_version(self.project['id'], 1)
        job = self.jobs.submit_render(self.project['id'], version['id'])
        self.store.profile['font_hash'] = '1' * 64
        self.assertEqual(run_once(self.jobs, lane='render')['state'], 'failed')
        with self.assertRaises(StoreError): self.jobs.submit_render(self.project['id'], version['id'])
        self.assertEqual(self.jobs.get(job['id'])['error']['code'], 'validation')

    def draft(self):
        scene = self.project['scenes'][0]['scene']
        draft = {k: copy.deepcopy(v) for k, v in scene.items() if k in ['id', 'type', 'elements', 'edges', 'code']}
        draft['narration'] = {'text': scene['narration']['text']}
        return draft

    def test_publish_is_atomic_and_has_attempt_provenance(self):
        job = self.submit()
        attempt = self.jobs.claim()
        result = self.jobs.publish_candidate(job['id'], attempt['attempt_id'], self.draft())
        self.assertEqual(result['state'], 'succeeded')
        self.assertEqual(result['progress'], 100)
        candidate = self.store.get_candidates(self.scene_id)[0]
        self.assertEqual(candidate['source_job_id'], job['id'])
        self.assertEqual(candidate['source_attempt_id'], attempt['attempt_id'])
        self.assertEqual(result['result']['candidate_id'], candidate['id'])
        self.assertEqual(self.store.get_project(self.project['id'])['revision'], 1)
        with self.assertRaisesRegex(StoreError, 'conflict'):
            self.jobs.publish_candidate(job['id'], attempt['attempt_id'], self.draft())
        self.assertEqual(len(self.store.get_candidates(self.scene_id)), 1)

    def test_cancelled_and_superseded_attempt_cannot_publish(self):
        job = self.submit()
        first = self.jobs.claim()
        self.expire(job)
        self.jobs.recover()
        self.jobs.retry(job['id'])
        with self.store.connection() as conn: conn.execute('UPDATE jobs SET available_at=now() WHERE id=%s', [job['id']])
        second = self.jobs.claim()
        with self.assertRaisesRegex(StoreError, 'conflict'):
            self.jobs.publish_candidate(job['id'], first['attempt_id'], self.draft())
        self.jobs.cancel(job['id'])
        self.assertEqual(self.jobs.publish_candidate(job['id'], second['attempt_id'], self.draft())['state'], 'cancelled')
        self.assertEqual(self.store.get_candidates(self.scene_id), [])

    def test_stale_scene_result_is_candidate_not_auto_overwrite(self):
        job = self.submit()
        attempt = self.jobs.claim()
        elements = copy.deepcopy(self.project['scenes'][0]['scene']['elements'])
        elements[0]['content'] = '用户已修改的教学标题'
        self.store.edit_scene(self.scene_id, 1, {'elements': elements})
        self.jobs.publish_candidate(job['id'], attempt['attempt_id'], self.draft())
        candidate = self.store.get_candidates(self.scene_id)[0]
        self.assertEqual(candidate['base_revision'], 1)
        with self.assertRaisesRegex(StoreError, 'conflict'):
            self.store.accept_candidate(self.scene_id, candidate['id'], 2)
        self.assertEqual(self.store.get_project(self.project['id'])['revision'], 2)

    def test_invalid_candidate_and_rewritten_narration_roll_back(self):
        job = self.submit()
        attempt = self.jobs.claim()
        for draft in [{}, {**self.draft(), 'narration': {'text': '模型篡改口播'}}]:
            with self.assertRaises(StoreError): self.jobs.publish_candidate(job['id'], attempt['attempt_id'], draft)
        self.assertEqual(self.jobs.get(job['id'])['state'], 'running')
        self.assertEqual(self.store.get_candidates(self.scene_id), [])

    def test_worker_runs_real_subprocess_without_paid_network(self):
        import sys
        from services.workflow.worker import run_once
        job = self.submit()
        script = "import json,sys;p=json.load(sys.stdin);s=p['scene'];d={k:v for k,v in s.items() if k in ['id','type','elements','edges','code']};d['narration']={'text':s['narration']['text']};print(json.dumps({'draft':d}))"
        result = run_once(self.jobs, [sys.executable, '-c', script])
        self.assertEqual(result['state'], 'succeeded')
        self.assertEqual(result['id'], job['id'])
        self.assertEqual(len(self.store.get_candidates(self.scene_id)), 1)

    def test_worker_cancellation_stops_child_before_releasing_attempt(self):
        import sys
        from unittest.mock import patch
        from services.workflow.worker import run_once
        job = self.submit()
        heartbeat = self.jobs.heartbeat
        def cancel_at_heartbeat(*args, **kwargs):
            self.jobs.cancel(job['id'])
            return heartbeat(*args, **kwargs)
        with patch.object(self.jobs, 'heartbeat', side_effect=cancel_at_heartbeat):
            result = run_once(self.jobs, [sys.executable, '-c', 'import time;time.sleep(5)'])
        self.assertEqual(result['state'], 'cancelled')
        self.assertEqual(self.store.get_candidates(self.scene_id), [])
        history=self.jobs.project_usage(self.project['id'])
        self.assertEqual(history['summary']['unknown'],1)
        self.assertIsNone(history['items'][0]['usage']['reference']['maximum_cny'])

    def test_worker_preserves_fixed_storyboard_error_without_raw_output_or_retry(self):
        import sys
        from services.workflow.worker import run_once
        self.submit()
        result = run_once(self.jobs, [sys.executable, '-c', "import json;print(json.dumps({'error':'storyboard_source_mismatch','message':'secret-provider-content'}))"])
        self.assertEqual(result['error']['code'], 'storyboard_source_mismatch')
        self.assertFalse(result['error']['retryable'])
        self.assertNotIn('secret', json.dumps(result['error']))
        with self.assertRaises(StoreError): self.jobs.retry(result['id'])

    def test_worker_persists_only_safe_cue_diagnostics(self):
        import sys
        from services.workflow.worker import run_once
        job=self.submit()
        payload={'error':'storyboard_invalid_cue','cue_error':{'path':'/scenes/0/elements/0/cue','reason':'quote_not_found','raw':'secret','text_end':999}}
        result=run_once(self.jobs,[sys.executable,'-c','print('+repr(json.dumps(payload))+')'])
        self.assertEqual(result['error']['cue_error'],{'path':'/scenes/0/elements/0/cue','reason':'quote_not_found'})
        self.assertFalse(result['error']['retryable']);self.assertNotIn('secret',json.dumps(result['error']))
        with self.store.connection() as conn:
            attempt=conn.execute('SELECT error FROM job_attempts WHERE job_id=%s',[job['id']]).fetchone()
        self.assertEqual(attempt['error'],result['error']);self.assertEqual(self.store.get_candidates(self.scene_id),[])

    def test_worker_persists_only_safe_schema_diagnostics(self):
        import sys
        from services.workflow.worker import run_once
        job=self.submit()
        payload={'error':'storyboard_schema_error','schema_errors':[{'path':'/scenes/0/secret-api-key','rule':'type','message':'secret-response'},{'path':'/scenes/0/elements/0/type','rule':'enum'}]}
        script='import json;print('+repr(json.dumps(payload))+')'
        result=run_once(self.jobs,[sys.executable,'-c',script])
        self.assertEqual(result['error'].get('schema_errors'),[{'path':'/scenes/0','rule':'type'},{'path':'/scenes/0/elements/0/type','rule':'enum'}])
        self.assertFalse(result['error']['retryable'])
        self.assertNotIn('secret',json.dumps(result['error']))
        with self.store.connection() as conn:
            attempt=conn.execute('SELECT error FROM job_attempts WHERE job_id=%s',[job['id']]).fetchone()
        self.assertEqual(attempt['error'],result['error'])
        self.assertEqual(self.store.get_candidates(self.scene_id),[])

    def test_worker_timeout_and_secret_stderr_never_publish(self):
        import sys
        from services.workflow.worker import run_once
        self.submit()
        result = run_once(self.jobs, [sys.executable, '-c', "import sys,time;print('secret-provider',file=sys.stderr);time.sleep(5)"], timeout=0.1)
        self.assertEqual(result['error']['code'], 'timeout')
        self.assertNotIn('secret', json.dumps(result['error']))
        self.assertEqual(self.store.get_candidates(self.scene_id), [])

    def test_progress_is_bounded_monotonic_and_attempt_owned(self):
        job = self.submit()
        attempt = self.jobs.claim()
        self.assertEqual(self.jobs.heartbeat(job['id'], attempt['attempt_id'], progress=50)['progress'], 50)
        self.assertEqual(self.jobs.heartbeat(job['id'], attempt['attempt_id'], progress=20)['progress'], 50)
        for value in [True, 100, -1, 0.5]:
            with self.assertRaises(StoreError): self.jobs.heartbeat(job['id'], attempt['attempt_id'], progress=value)
        self.jobs.fail(job['id'], attempt['attempt_id'], 'provider_error')
        self.jobs.retry(job['id'])
        with self.store.connection() as conn: conn.execute('UPDATE jobs SET available_at=now() WHERE id=%s', [job['id']])
        self.assertEqual(self.jobs.claim()['progress'], 0)

    def test_deadline_and_error_details_are_server_owned(self):
        job = self.submit()
        attempt = self.jobs.claim()
        with self.assertRaises(StoreError): self.jobs.fail(job['id'], attempt['attempt_id'], 'secret-api-key')
        with self.store.connection() as conn:
            conn.execute("UPDATE jobs SET started_at=now()-interval '901 seconds' WHERE id=%s", [job['id']])
        self.jobs.recover()
        failed = self.jobs.get(job['id'])
        self.assertFalse(failed['error']['retryable'])
        with self.assertRaises(StoreError): self.jobs.retry(job['id'])
