import copy
import json
import os
import shutil
import tempfile
import unittest
from pathlib import Path

from services.workflow.storyboard import ROOT


PROFILE = {'theme_version': 'tech_explainer:1', 'template_version': 'teaching:1',
           'font_hash': '0' * 64, 'voice': {'resource_id': 'seed-tts-2.0', 'speaker': 'test_voice'}}


class ProjectFixture:
    def setUp(self):
        from services.projects.store import Store
        self.folder = tempfile.TemporaryDirectory()
        self.addCleanup(self.folder.cleanup)
        self.public = Path(self.folder.name)
        self.dsl = json.loads((ROOT / 'examples/demo.json').read_text())
        for asset in self.dsl['assets']:
            dest = self.public / asset['storage_key']
            dest.parent.mkdir(parents=True, exist_ok=True)
            shutil.copyfile(ROOT / 'apps/renderer/public' / asset['storage_key'], dest)
        self.store = Store(os.environ['TEST_DATABASE_URL'], self.public, PROFILE)
        self.store.initialize()
        self.project = self.store.import_project('教学测试', self.dsl)

    def import_concept(self):
        # Keep the real narration/audio pair; these roles only exercise persistence, not teaching accuracy.
        dsl=copy.deepcopy(self.dsl);scene=next(s for s in dsl['scenes'] if s['type']=='flow_diagram')
        dsl['scenes']=[scene];scene['type']='concept';scene.pop('edges',None)
        scene['elements']=[{'id':e['id'],'content':scene['narration']['text'][e['cue']['text_start']:e['cue']['text_end']][:40],
                            'cue':e['cue'],'concept_role':'definition' if i==0 else 'feature'} for i,e in enumerate(scene['elements'])]
        return self.store.import_project('概念存储测试',dsl)

@unittest.skipUnless(os.environ.get('TEST_DATABASE_URL'), 'Use run_project_tests.py for real PostgreSQL')
class ProjectTests(ProjectFixture, unittest.TestCase):
    def clean_scene_jobs(self, project_id):
        with self.store.connection() as conn:
            conn.execute("UPDATE jobs SET state='cancelled' WHERE project_id=%s AND state IN ('queued','running')", [project_id])
            conn.execute("UPDATE job_attempts SET state='cancelled' WHERE job_id IN (SELECT id FROM jobs WHERE project_id=%s) AND state='running'", [project_id])

    def test_project_voice_save_pins_only_this_project_and_preserves_media_and_versions(self):
        from services.projects.store import StoreError
        before=copy.deepcopy(self.project);old=self.store.create_version(before['id'],1)
        other=self.store.create_project('另一个项目','不应受影响。')
        changed=self.store.set_voice(before['id'],1,'project_voice')
        self.assertEqual(changed['revision'],2);self.assertTrue(changed['voice_configured'])
        self.assertEqual(changed['voice'],{'resource_id':'seed-tts-2.0','speaker':'project_voice'})
        for key in ['scenes','config','source_text']:self.assertEqual(changed[key],before[key])
        self.assertEqual(self.store.profile,PROFILE);self.assertEqual(self.store.get_project(other['id']),other)
        self.assertEqual(self.store.get_version(old['id']),old)
        self.assertEqual(self.store.set_voice(before['id'],2,'project_voice'),changed)
        with self.assertRaisesRegex(StoreError,'conflict'):self.store.set_voice(before['id'],1,'another_voice')
        self.store.initialize();self.assertEqual(self.store.get_project(before['id']),changed)
        with self.store.connection() as conn:self.assertEqual(conn.execute('SELECT count(*) AS n FROM jobs WHERE project_id=%s',[before['id']]).fetchone()['n'],0)

    def test_project_voice_blocks_active_initial_outline_but_leaves_its_input_unchanged(self):
        from services.projects.jobs import Jobs
        from services.projects.store import StoreError
        fresh=self.store.create_project('尚在生成','初次分镜。');jobs=Jobs(self.store)
        job=jobs.submit_generate(fresh['id'],1);self.addCleanup(jobs.cancel,job['id'])
        with self.assertRaisesRegex(StoreError,'not_ready'):self.store.set_voice(fresh['id'],1,'new_voice')
        self.assertEqual(jobs.get(job['id'])['input'],job['input'])
        self.assertEqual(self.store.get_project(fresh['id']),fresh)

    def test_append_manual_scene_is_draft_and_keeps_existing_media(self):
        before = copy.deepcopy(self.project)
        changed = self.store.add_scene(before['id'], 1, '补充😀知识。', '补充要点')
        self.assertEqual(changed['revision'], 2)
        self.assertEqual(changed['scenes'][:-1], before['scenes'])
        self.assertEqual(changed['config'], before['config'])
        row = changed['scenes'][-1]
        self.assertEqual((row['state'], row['revision'], row['user_revision'], row['generated_revision']), ('needs_voice', 1, 1, 0))
        self.assertEqual(row['scene']['narration'], {'text': '补充😀知识。'})
        self.assertEqual(row['scene']['elements'][0]['cue'], {'text_start': 0, 'text_end': 6})
        self.assertEqual(row['scene']['elements'][0]['content'], '补充要点')
        self.assertEqual(changed['source_text'], before['source_text'] + '补充😀知识。')
        with self.store.connection() as conn:
            self.assertEqual(conn.execute('SELECT count(*) AS n FROM jobs WHERE project_id=%s', [before['id']]).fetchone()['n'], 0)
        empty = self.store.create_project('手动首章', '原草稿')
        first = self.store.add_scene(empty['id'], 1, '第一章。', '第一章')
        self.assertEqual(len(first['scenes']), 1)
        self.assertEqual(first['source_text'], '第一章。')

    def test_mechanism_style_is_optional_freezes_without_revoice_or_old_version_changes(self):
        old = self.store.create_version(self.project['id'], 1)
        changed = self.store.set_visual_style(self.project['id'], 1, 'mechanism')
        self.assertEqual(changed['scenes'], self.project['scenes'])
        self.assertEqual(changed['revision'], 2)
        self.assertEqual(changed['visual_style']['id'], 'mechanism')
        self.assertEqual(self.store.set_visual_style(changed['id'], 2, 'mechanism'), changed)
        frozen = self.store.create_version(changed['id'], 2)
        self.assertEqual(frozen['profile']['visual_style'], changed['visual_style'])
        self.assertNotIn('presentation', frozen['profile']['visual_style']['tokens'])
        self.assertEqual(frozen['dsl'], old['dsl'])
        self.assertEqual(self.store.get_version(old['id']), old)

    def test_visual_actions_survive_import_freeze_clone_and_candidate_retiming(self):
        from services.projects.jobs import Jobs
        dsl = copy.deepcopy(self.dsl)
        scene = next(s for s in dsl['scenes'] if s['type'] == 'flow_diagram')
        dsl['scenes'] = [scene]
        scene['motif'] = 'funnel'
        last = scene['elements'][-1]
        last['content'] = scene['narration']['text'][last['cue']['text_start']:last['cue']['text_end']]
        scene['visual_actions'] = [
            {'kind': 'connect', 'target': 'e1', 'to': 'e2', 'cue': scene['elements'][1]['cue'], 'start_frame': 94, 'duration_frames': 12},
            {'kind': 'highlight', 'target': 'e2', 'cue': scene['elements'][1]['cue'], 'start_frame': 94, 'duration_frames': 12},
            {'kind': 'update', 'target': 'e1', 'source': 'e3', 'cue': last['cue'], 'start_frame': 176, 'duration_frames': 12}]
        project = self.store.import_project('动作持久化测试', dsl)
        row = project['scenes'][0]
        version = self.store.create_version(project['id'], 1)
        self.assertEqual(version['dsl']['scenes'][0]['visual_actions'], scene['visual_actions'])
        cloned = self.store.duplicate_scene(project['id'], 1, row['id'], 1)
        self.assertEqual(cloned['scenes'][1]['scene']['visual_actions'], scene['visual_actions'])
        candidate = self.store.create_candidate(row['id'], 1, Jobs._draft_scene(row['scene']))
        accepted = self.store.accept_candidate(row['id'], candidate['id'], 1)
        changed = next(s for s in accepted['scenes'] if s['id'] == row['id'])
        self.assertEqual(changed['state'], 'needs_timing')
        self.assertNotIn('start_frame', changed['scene']['visual_actions'][0])
        self.assertEqual(changed['scene']['motif'], 'funnel')
        self.assertEqual(self.store.get_version(version['id']), version)

    def test_dialogue_and_process_bindings_survive_freeze_clone_and_candidate(self):
        import hashlib
        import wave
        from services.tests.test_teaching_diagrams import draft, process_draft, funnel_draft
        from services.tests.test_role_director import role_draft
        from services.tests.test_director import wire
        from services.workflow.storyboard import restore_storyboard, source_parts
        from services.tts.timing import time_scene
        from services.projects.jobs import Jobs
        for field, builder in [('dialogue', draft), ('process', process_draft), ('funnel', funnel_draft), ('dialogue', role_draft)]:
            with self.subTest(field=field):
                raw = builder(); text = raw['narration']['text']
                restored = restore_storyboard({'scenes':[wire(raw)]}, text, source_parts(text), require_quotes=True, semantic_graphics=True)
                self.assertEqual(restored, {'scenes':[raw]})
                duration = len(text)*100
                segments = [{'text_start': i, 'text_end': i+1, 'start_ms': i*100, 'end_ms': (i+1)*100} for i in range(len(text))]
                audio = self.public / 'benchmark' / f'{field}-{builder.__name__}.wav'
                audio.parent.mkdir(exist_ok=True)
                with wave.open(str(audio), 'wb') as stream:
                    stream.setparams((1, 2, 24000, 0, 'NONE', 'not compressed'))
                    stream.writeframes(b'\x00\x00' * (duration*24))
                asset = {'id': 'synthetic', 'type': 'audio', 'storage_key': f'benchmark/{field}-{builder.__name__}.wav',
                         'duration_ms': duration, 'checksum': hashlib.sha256(audio.read_bytes()).hexdigest()}
                scene = time_scene(restored['scenes'][0], asset['id'], duration, segments)
                document = {**copy.deepcopy(self.dsl), 'assets': [asset], 'scenes': [scene]}
                project = self.store.import_project('图形绑定存取测试', document)
                row = project['scenes'][0]; version = self.store.create_version(project['id'], 1)
                self.assertEqual(version['dsl']['scenes'][0][field], raw[field])
                cloned = self.store.duplicate_scene(project['id'], 1, row['id'], 1)
                self.assertEqual(cloned['scenes'][1]['scene'][field], raw[field])
                candidate = self.store.create_candidate(row['id'], 1, Jobs._draft_scene(row['scene']))
                accepted = self.store.accept_candidate(row['id'], candidate['id'], 1)
                changed = next(s for s in accepted['scenes'] if s['id'] == row['id'])
                self.assertEqual(changed['scene'][field], raw[field])
                self.assertEqual(self.store.get_version(version['id']), version)

    def test_graphics_patch_preserves_voice_rejects_bad_edits_and_requires_retiming(self):
        from services.projects.store import StoreError
        from services.projects.jobs import Jobs
        row=next(s for s in self.project['scenes'] if s['scene']['type']=='card_sequence')
        graphics={k:v for k,v in Jobs._draft_scene(row['scene']).items() if k in ['motif','funnel','dialogue','process','visual_actions']}
        old=self.store.create_version(self.project['id'],1)
        unchanged=self.store.edit_scene(row['id'],1,{'graphics':graphics})
        self.assertEqual(unchanged,self.project)
        changed=self.store.edit_scene(row['id'],1,{'graphics':{'visual_actions':[{'kind':'highlight','target':row['scene']['elements'][0]['id'],'cue':row['scene']['elements'][0]['cue']}]}})
        current=next(s for s in changed['scenes'] if s['id']==row['id'])
        self.assertEqual(current['state'],'needs_timing')
        self.assertEqual(current['scene']['narration'],row['scene']['narration'])
        self.assertNotIn('animations',current['scene'])
        for bad in [{'execute':'tool'},{'visual_actions':[{'kind':'highlight','target':'missing','cue':row['scene']['elements'][0]['cue']}]},{'visual_actions':[{'kind':'highlight','target':row['scene']['elements'][0]['id'],'cue':row['scene']['elements'][0]['cue'],'start_frame':12}]}]:
            with self.subTest(bad=bad),self.assertRaises(StoreError):self.store.edit_scene(row['id'],2,{'graphics':bad})
            self.assertEqual(self.store.get_project(self.project['id']),changed)
        with self.assertRaises(StoreError):self.store.edit_scene(row['id'],1,{'graphics':{}})
        self.assertEqual(self.store.get_version(old['id']),old)

    def test_duplicate_scene_reuses_audio_and_keeps_snapshot(self):
        row = self.project['scenes'][0]
        old = self.store.create_version(self.project['id'], 1)
        changed = self.store.duplicate_scene(self.project['id'], 1, row['id'], 1)
        clone = changed['scenes'][1]
        self.assertNotEqual(clone['id'], row['id'])
        self.assertNotEqual(clone['scene_key'], row['scene_key'])
        self.assertEqual(clone['scene'], {**row['scene'], 'id': clone['scene_key']})
        self.assertEqual((clone['state'], clone['revision'], clone['generated_revision'], clone['user_revision']), ('ready', 1, 0, 1))
        self.assertEqual([s['position'] for s in changed['scenes']], list(range(len(changed['scenes']))))
        self.assertEqual(changed['config'], self.project['config'])
        self.assertEqual(self.store.get_version(old['id']), old)
        self.assertEqual(self.store.get_candidates(clone['id']), [])
        self.assertEqual(len(self.store.create_version(changed['id'], 2)['dsl']['scenes']), len(changed['scenes']))

    def test_duplicate_pending_scene_does_not_promote_state(self):
        from services.projects.jobs import Jobs
        row = self.project['scenes'][0]
        draft = Jobs._draft_scene(row['scene']); draft['elements'][0]['cue']['text_start'] += 1
        candidate = self.store.create_candidate(row['id'], 1, draft)
        project = self.store.accept_candidate(row['id'], candidate['id'], 1)
        copy1 = self.store.duplicate_scene(project['id'], project['revision'], row['id'], 2)['scenes'][1]
        self.assertEqual(copy1['state'], 'needs_timing')
        self.assertEqual(copy1['scene']['narration'], row['scene']['narration'])
        project = self.store.edit_scene(row['id'], 2, {'narration_text': row['scene']['narration']['text'] + '新口播。'})
        copy2 = self.store.duplicate_scene(project['id'], project['revision'], row['id'], 3)['scenes'][1]
        self.assertEqual(copy2['state'], 'needs_voice')
        self.assertEqual(copy2['scene']['narration'], {'text': row['scene']['narration']['text'] + '新口播。'})
        self.assertNotIn('duration_frames', copy2['scene'])

    def test_delete_scene_archives_history_and_rejects_deleted_callers(self):
        from services.projects.store import StoreError
        from services.projects.jobs import Jobs
        jobs = Jobs(self.store); row = self.project['scenes'][0]
        self.addCleanup(self.clean_scene_jobs, self.project['id'])
        old = self.store.create_version(self.project['id'], 1)
        candidate = self.store.create_candidate(row['id'], 1, Jobs._draft_scene(row['scene']))
        submitted = jobs.submit_regenerate(row['id'], 1)
        running = jobs.claim(); jobs.fail(running['id'], running['attempt_id'], 'transport_error')
        job = jobs.get(submitted['id'])
        changed = self.store.delete_scene(self.project['id'], 1, row['id'], 1, True)
        self.assertEqual(changed['revision'], 2)
        self.assertEqual([s['position'] for s in changed['scenes']], list(range(len(changed['scenes']))))
        self.assertEqual([s['id'] for s in changed['scenes']], [s['id'] for s in self.project['scenes'][1:]])
        self.assertEqual(changed['config'], self.project['config'])
        self.assertEqual(self.store.get_version(old['id']), old)
        self.assertEqual(jobs.get(job['id']), job)
        with self.store.connection() as conn:
            archived = conn.execute('SELECT deleted_at,position FROM scenes WHERE id=%s', [row['id']]).fetchone()
            self.assertIsNotNone(archived['deleted_at']); self.assertGreaterEqual(archived['position'], 20)
            self.assertIsNotNone(conn.execute('SELECT id FROM scene_candidates WHERE id=%s', [candidate['id']]).fetchone())
        operations = [lambda: self.store.edit_scene(row['id'], 1, {'narration_text': '不能改。'}),
            lambda: self.store.get_candidates(row['id']), lambda: self.store.accept_candidate(row['id'], candidate['id'], 1),
            lambda: self.store.create_candidate(row['id'], 1, Jobs._draft_scene(row['scene'])),
            lambda: self.store.set_chart(row['id'], 1, {'confirmed': True}, [], True),
            lambda: jobs.submit_voice(row['id'], 1), lambda: jobs.submit_regenerate(row['id'], 1),
            lambda: jobs.submit_timing(row['id'], 1), lambda: jobs.submit_preview(row['id'], 1), lambda: jobs.retry(job['id'])]
        for operation in operations:
            with self.assertRaisesRegex(StoreError, 'not_found'): operation()
        self.assertEqual(jobs.get(job['id']), job)
        self.store.initialize()
        self.assertEqual(self.store.get_project(changed['id']), changed)
        duplicate = self.store.duplicate_scene(changed['id'], 2, changed['scenes'][0]['id'], 1)
        self.assertEqual([s['position'] for s in duplicate['scenes']], list(range(len(duplicate['scenes']))))

    def test_scene_structure_rejects_stale_foreign_invalid_and_last_delete(self):
        from services.projects.store import StoreError
        row = self.project['scenes'][0]
        other = self.store.import_project('另一项目', self.dsl)
        operations = [lambda: self.store.add_scene(self.project['id'], 2, '新稿。', '新章'),
            lambda: self.store.add_scene(self.project['id'], True, '新稿。', '新章'),
            lambda: self.store.add_scene(self.project['id'], 1, ' ', '新章'),
            lambda: self.store.add_scene(self.project['id'], 1, '新稿。', 'x' * 41),
            lambda: self.store.add_scene(self.project['id'], 1, '\ud800', '新章'),
            lambda: self.store.duplicate_scene(self.project['id'], 1, row['id'], 2),
            lambda: self.store.duplicate_scene(other['id'], 1, row['id'], 1),
            lambda: self.store.delete_scene(self.project['id'], 1, row['id'], 1, False),
            lambda: self.store.delete_scene(self.project['id'], 1, row['id'], 1, 1),
            lambda: self.store.delete_scene(self.project['id'], 2, row['id'], 1, True),
            lambda: self.store.delete_scene(self.project['id'], 1, row['id'], 2, True),
            lambda: self.store.delete_scene(other['id'], 1, row['id'], 1, True)]
        for operation in operations:
            with self.assertRaises(StoreError): operation()
            self.assertEqual(self.store.get_project(self.project['id']), self.project)
        one = copy.deepcopy(self.dsl); one['scenes'] = one['scenes'][:1]
        single = self.store.import_project('至少一章', one)
        with self.assertRaisesRegex(StoreError, 'not_ready'):
            self.store.delete_scene(single['id'], 1, single['scenes'][0]['id'], 1, True)

    def test_scene_structure_limits_and_concurrent_insert(self):
        from concurrent.futures import ThreadPoolExecutor
        from services.projects.store import StoreError
        def append():
            try: return self.store.add_scene(self.project['id'], 1, '并发补充。', '补充')
            except StoreError as exc: return exc.code
        with ThreadPoolExecutor(max_workers=2) as pool: results = list(pool.map(lambda _: append(), range(2)))
        self.assertEqual(sum(isinstance(r, dict) for r in results), 1); self.assertIn('conflict', results)
        project = self.store.get_project(self.project['id'])
        while len(project['scenes']) < 20:
            project = self.store.add_scene(project['id'], project['revision'], '章节。', '要点')
        for operation in [lambda: self.store.add_scene(project['id'], project['revision'], '超额。', '要点'),
                lambda: self.store.duplicate_scene(project['id'], project['revision'], project['scenes'][0]['id'], 1),
                lambda: self.store.add_scene(project['id'], project['revision'], 'x' * 4000, '要点')]:
            with self.assertRaises(StoreError): operation()
        self.assertEqual(self.store.get_project(project['id']), project)
        room = self.store.create_project('文本上限', '原稿')
        room = self.store.add_scene(room['id'], 1, 'x' * 3999, '要点')
        with self.assertRaises(StoreError): self.store.add_scene(room['id'], 2, '追加。', '要点')
        with self.assertRaises(StoreError): self.store.duplicate_scene(room['id'], 2, room['scenes'][0]['id'], 1)
        self.assertEqual(self.store.get_project(room['id']), room)

    def test_delete_waits_for_scene_jobs_and_initial_generation(self):
        from services.projects.jobs import Jobs
        from services.projects.store import StoreError
        jobs = Jobs(self.store); row = self.project['scenes'][0]
        self.addCleanup(self.clean_scene_jobs, self.project['id'])
        job = jobs.submit_voice(row['id'], 1)
        with self.assertRaisesRegex(StoreError, 'not_ready'): self.store.delete_scene(self.project['id'], 1, row['id'], 1, True)
        run = jobs.claim()
        jobs.cancel(job['id'])
        with self.assertRaisesRegex(StoreError, 'not_ready'): self.store.delete_scene(self.project['id'], 1, row['id'], 1, True)
        jobs.ack_cancel(run['id'], run['attempt_id'])
        changed = self.store.delete_scene(self.project['id'], 1, row['id'], 1, True)
        self.assertEqual(len(changed['scenes']), len(self.project['scenes']) - 1)
        fresh = self.store.create_project('正在生成', '初始文稿。')
        self.addCleanup(self.clean_scene_jobs, fresh['id'])
        generate = jobs.submit_generate(fresh['id'], 1)
        with self.assertRaisesRegex(StoreError, 'not_ready'): self.store.add_scene(fresh['id'], 1, '冲突。', '新章')
        jobs.cancel(generate['id'])
        self.assertEqual(len(self.store.add_scene(fresh['id'], 1, '手动。', '新章')['scenes']), 1)

    def test_flow_edges_preserve_audio_timing_and_frozen_version(self):
        from services.projects.store import StoreError
        row=next(s for s in self.project['scenes'] if s['scene']['type']=='flow_diagram')
        old=self.store.create_version(self.project['id'],1)
        from services.projects.jobs import Jobs
        candidate=self.store.create_candidate(row['id'],1,Jobs._draft_scene(row['scene']))
        ids=[e['id'] for e in row['scene']['elements']]
        edges=[{'from':ids[-1],'to':ids[0]}]
        changed=self.store.edit_scene(row['id'],1,{'edges':edges})
        item=next(s for s in changed['scenes'] if s['id']==row['id'])
        self.assertEqual(item['scene'],{**row['scene'],'edges':edges})
        self.assertEqual((item['state'],item['revision'],item['user_revision']),('ready',2,1))
        self.assertEqual(changed['config'],self.project['config']);self.assertEqual(changed['revision'],2)
        self.assertEqual(self.store.get_version(old['id']),old)
        with self.assertRaisesRegex(StoreError,'conflict'):self.store.accept_candidate(row['id'],candidate['id'],2)
        self.assertEqual(self.store.edit_scene(row['id'],2,{'edges':edges}),changed)
        with self.assertRaisesRegex(StoreError,'conflict'):self.store.edit_scene(row['id'],1,{'edges':[]})
        cleared=self.store.edit_scene(row['id'],2,{'edges':[]})
        item=next(s for s in cleared['scenes'] if s['id']==row['id'])
        self.assertEqual(item['scene']['edges'],[]);self.assertEqual(item['state'],'ready')
        frozen=self.store.create_version(self.project['id'],3)
        self.assertEqual(next(s for s in frozen['dsl']['scenes'] if s['id']==row['scene']['id'])['edges'],[])

    def test_invalid_flow_edges_roll_back_combined_edit(self):
        from services.projects.store import StoreError
        row=next(s for s in self.project['scenes'] if s['scene']['type']=='flow_diagram')
        a,b=[e['id'] for e in row['scene']['elements']][:2]
        invalid=[None,{},[{'from':'missing','to':b}],[{'from':a,'to':a}],
                 [{'from':a,'to':b}]*2,[{'from':a,'to':b},{'from':b,'to':a}],
                 [{'from':a,'to':b}]*16,[{'from':a,'to':b,'label':'unapproved'}]]
        for edges in invalid:
            with self.subTest(edges=edges):
                with self.assertRaises(StoreError):self.store.edit_scene(row['id'],1,{'edges':edges,'narration_text':row['scene']['narration']['text']+'新增。'})
                self.assertEqual(self.store.get_project(self.project['id']),self.project)
        other=next(s for s in self.project['scenes'] if s['scene']['type']!='flow_diagram')
        with self.assertRaises(StoreError):self.store.edit_scene(other['id'],1,{'edges':[]})

    def test_flow_edges_do_not_promote_pending_states(self):
        from services.projects.jobs import Jobs
        row=next(s for s in self.project['scenes'] if s['scene']['type']=='flow_diagram')
        draft=Jobs._draft_scene(row['scene']);draft['elements'][0]['cue']['text_start']+=1
        candidate=self.store.create_candidate(row['id'],1,draft)
        self.store.accept_candidate(row['id'],candidate['id'],1)
        pending=self.store.edit_scene(row['id'],2,{'edges':[]})
        item=next(s for s in pending['scenes'] if s['id']==row['id'])
        self.assertEqual(item['state'],'needs_timing');self.assertEqual(item['scene']['narration'],row['scene']['narration'])
        text=row['scene']['narration']['text']+'新增。'
        changed=self.store.edit_scene(row['id'],3,{'edges':row['scene']['edges'],'narration_text':text})
        item=next(s for s in changed['scenes'] if s['id']==row['id'])
        self.assertEqual(item['state'],'needs_voice');self.assertNotIn('audio_asset_id',item['scene']['narration'])
        for key in ['animations','captions','duration_frames']:self.assertNotIn(key,item['scene'])
        pending=self.store.edit_scene(row['id'],4,{'edges':[]})
        self.assertEqual(next(s for s in pending['scenes'] if s['id']==row['id'])['state'],'needs_voice')

    def test_version_history_pages_are_project_scoped_and_read_only(self):
        import uuid
        from psycopg import sql
        from psycopg.types.json import Jsonb
        snapshot=self.store.create_version(self.project['id'],1)
        with self.store.connection() as conn:
            for n in range(2,53):
                dsl=copy.deepcopy(snapshot['dsl'])
                if n==2:dsl.pop('theme',None)
                conn.execute('INSERT INTO project_versions (id,project_id,revision,dsl,profile) VALUES (%s,%s,%s,%s,%s)',
                             [str(uuid.uuid4()),self.project['id'],n,Jsonb(dsl),Jsonb(snapshot['profile'])])
        def state():
            with self.store.connection() as conn:
                return {table:conn.execute(sql.SQL('SELECT row_to_json(t)::text AS value FROM {} t ORDER BY id').format(sql.Identifier(table))).fetchall()
                        for table in ['projects','scenes','scene_candidates','project_versions','jobs','job_attempts']}
        before=state()
        page=self.store.list_versions(self.project['id'])
        self.assertEqual([v['revision'] for v in page['items']],list(range(52,2,-1)))
        self.assertEqual(page['next_before_revision'],3)
        older=self.store.list_versions(self.project['id'],3)
        self.assertEqual([v['revision'] for v in older['items']],[2,1]);self.assertIsNone(older['next_before_revision'])
        self.assertEqual(self.store.list_versions(self.project['id'],1),{'items':[],'next_before_revision':None})
        for item in page['items']+older['items']:
            self.assertEqual(set(item),{'id','project_id','revision','theme','scene_count'})
            self.assertEqual(item['project_id'],self.project['id']);self.assertEqual(item['theme'],'tech_explainer')
            self.assertEqual(item['scene_count'],len(self.dsl['scenes']))
        self.assertEqual(state(),before);self.assertEqual(self.store.get_version(snapshot['id']),snapshot)
        other=self.store.create_project('无冻结版本','原稿')
        self.assertEqual(self.store.list_versions(other['id']),{'items':[],'next_before_revision':None})

    def test_version_history_validation_and_frozen_metadata(self):
        from services.projects.store import StoreError
        old=self.store.create_version(self.project['id'],1)
        self.store.set_theme(self.project['id'],1,'light_teaching')
        row=self.project['scenes'][0]
        self.store.edit_scene(row['id'],1,{'narration_text':row['scene']['narration']['text']+'新稿。'})
        self.assertNotEqual(self.store.get_project(self.project['id'])['scenes'][0]['scene']['narration']['text'],old['dsl']['scenes'][0]['narration']['text'])
        self.assertEqual(self.store.list_versions(self.project['id'])['items'][0]['theme'],'tech_explainer')
        self.assertEqual(self.store.get_version(old['id']),old)
        for cursor in [0,-1,True,1.5,'2',2147483648]:
            with self.subTest(cursor=cursor):
                with self.assertRaisesRegex(StoreError,'invalid_revision'):self.store.list_versions(self.project['id'],cursor)
        with self.assertRaisesRegex(StoreError,'not_found'):self.store.list_versions('00000000-0000-0000-0000-000000000000')
        with self.assertRaisesRegex(StoreError,'invalid_id'):self.store.list_versions('not-a-uuid')

    def test_persistence_and_restart_read(self):
        from services.projects.store import Store
        other = Store(os.environ['TEST_DATABASE_URL'], self.public, PROFILE)
        self.assertEqual(other.get_project(self.project['id']), self.project)

    def test_manual_concept_creation_preserves_other_scenes_and_requires_valid_excerpts(self):
        from services.projects.store import StoreError
        from services.tests.test_concept import concept_draft
        scene=concept_draft();text=scene['narration']['text'];elements=scene['elements'];before=copy.deepcopy(elements)
        for bad in [[],elements*2,[{**elements[0],'content':'非原文'}],
                    [{**e,'concept_role':'feature'} for e in elements],
                    [{**elements[0],'cue':{'text_start':True,'text_end':10}}]]:
            with self.assertRaises(StoreError):self.store.add_concept_scene(self.project['id'],1,text,bad)
            self.assertEqual(self.store.get_project(self.project['id']),self.project)
        changed=self.store.add_concept_scene(self.project['id'],1,text,elements);row=changed['scenes'][-1]
        self.assertEqual(elements,before);self.assertEqual(changed['scenes'][:-1],self.project['scenes'])
        self.assertEqual((changed['revision'],row['revision'],row['state']),(2,1,'needs_voice'))
        self.assertEqual(row['scene']['type'],'concept');self.assertEqual(row['scene']['elements'],elements)
        self.assertEqual(row['scene']['narration'],{'text':text});self.assertNotIn('animations',row['scene'])
        with self.assertRaisesRegex(StoreError,'conflict'):self.store.add_concept_scene(self.project['id'],1,text,elements)
        with self.store.connection() as conn:self.assertEqual(conn.execute('SELECT count(*) AS n FROM jobs WHERE project_id=%s',[self.project['id']]).fetchone()['n'],0)

    def test_concept_role_edits_preserve_audio_and_version_and_still_validate_excerpts(self):
        from services.projects.store import StoreError
        project=self.import_concept();row=project['scenes'][0];frozen=self.store.create_version(project['id'],1)
        elements=copy.deepcopy(row['scene']['elements'])
        elements[0]['concept_role'],elements[1]['concept_role']=elements[1]['concept_role'],elements[0]['concept_role']
        swapped=self.store.edit_scene(row['id'],1,{'elements':elements});current=swapped['scenes'][0]
        self.assertEqual(current['state'],'ready');self.assertEqual(current['scene']['elements'],elements)
        for key in ['narration','animations','captions','duration_frames']:self.assertEqual(current['scene'][key],row['scene'][key])
        self.assertEqual(self.store.get_version(frozen['id']),frozen)
        elements=copy.deepcopy(row['scene']['elements']);elements[0]['content']='并非原文'
        with self.assertRaises(StoreError):self.store.edit_scene(row['id'],2,{'elements':elements})
        self.assertEqual(self.store.get_project(project['id']),swapped)
        elements=copy.deepcopy(row['scene']['elements']);elements[0]['cue']['text_start']+=1
        cue=elements[0]['cue'];elements[0]['content']=row['scene']['narration']['text'][cue['text_start']:cue['text_end']][:40]
        changed=self.store.edit_scene(row['id'],2,{'elements':elements});current=changed['scenes'][0]
        self.assertEqual(current['state'],'needs_timing');self.assertEqual(current['scene']['elements'],elements)
        self.assertEqual(current['scene']['narration'],row['scene']['narration'])
        self.assertEqual(self.store.get_version(frozen['id']),frozen)
        with self.assertRaisesRegex(StoreError,'conflict'):self.store.edit_scene(row['id'],1,{'elements':elements})

    def test_topic_role_is_readonly_and_candidate_requires_local_retiming(self):
        from services.projects.store import StoreError
        row=self.project['scenes'][0];elements=copy.deepcopy(row['scene']['elements']);elements[0]['role']='topic'
        with self.assertRaises(StoreError):self.store.edit_scene(row['id'],1,{'elements':elements})
        from services.projects.jobs import Jobs
        draft=Jobs._draft_scene(row['scene']);draft['elements'][0]['role']='topic'
        candidate=self.store.create_candidate(row['id'],1,draft)
        accepted=self.store.accept_candidate(row['id'],candidate['id'],1)
        self.assertEqual(accepted['scenes'][0]['state'],'needs_timing')
        self.assertEqual(accepted['scenes'][0]['scene']['narration'],row['scene']['narration'])
        self.assertEqual(accepted['scenes'][0]['scene']['elements'][0]['role'],'topic')

    def test_visual_edit_keeps_audio_and_rejects_stale_revision(self):
        from services.projects.store import StoreError
        scene = self.project['scenes'][0]
        elements = copy.deepcopy(scene['scene']['elements'])
        elements[0]['content'] = '新的教学标题'
        changed = self.store.edit_scene(scene['id'], scene['revision'], {'elements': elements})
        self.assertEqual(changed['revision'], self.project['revision'] + 1)
        self.assertEqual(changed['scenes'][0]['user_revision'], 1)
        self.assertEqual(changed['scenes'][0]['scene']['narration'], scene['scene']['narration'])
        with self.assertRaisesRegex(StoreError, 'conflict'):
            self.store.edit_scene(scene['id'], scene['revision'], {'elements': elements})

    def test_code_and_variable_edit_keeps_audio_and_old_snapshot(self):
        dsl = copy.deepcopy(self.dsl)
        dsl['scenes'] = dsl['scenes'][:1]
        scene = dsl['scenes'][0]
        scene['type'] = 'code_walkthrough'
        scene['code'] = {'language': 'python', 'source': 'total = 0\nprint(total)'}
        scene['elements'][0].update(code_lines=[1], variables=[{'name': 'total', 'value': '0'}], output='')
        project = self.store.import_project('代码教学编辑', dsl)
        snapshot = self.store.create_version(project['id'], 1)
        item = project['scenes'][0]
        elements = copy.deepcopy(item['scene']['elements'])
        elements[0]['variables'][0]['value'] = '1'
        changed = self.store.edit_scene(item['id'], 1, {'elements': elements,
            'code': {'language': 'python', 'source': 'total = 1\nprint(total)'}})
        self.assertEqual(changed['config']['assets'], project['config']['assets'])
        self.assertEqual(changed['scenes'][0]['scene']['narration'], item['scene']['narration'])
        self.assertEqual(changed['scenes'][0]['scene']['captions'], item['scene']['captions'])
        self.assertEqual(self.store.get_version(snapshot['id']), snapshot)
        self.assertEqual(changed['scenes'][0]['state'], 'ready')

    def test_code_state_edit_freezes_all_fields_without_revoicing(self):
        from services.projects.store import StoreError
        dsl=copy.deepcopy(self.dsl);dsl['scenes']=dsl['scenes'][:1];s=dsl['scenes'][0]
        s.update(type='code_walkthrough',code={'language':'python','source':'nums = [2, 3]\nprint(nums)'})
        s['elements'][0].update(code_lines=[1],variables=[{'name':'n','value':'2'}],output='')
        project=self.store.import_project('代码同屏测试',dsl);old=self.store.create_version(project['id'],1);row=project['scenes'][0]
        elements=copy.deepcopy(row['scene']['elements']);elements[0].update(array_items=[{'id':'x','key':'0','value':'2'}],pointers=[{'name':'i','item_id':'x'}],loop={'current':1,'total':2},input='源代码常量')
        code={**s['code'],'array_name':'nums'}
        changed=self.store.edit_scene(row['id'],1,{'code':code,'elements':elements});current=changed['scenes'][0]['scene']
        self.assertEqual(changed['scenes'][0]['state'],'ready');self.assertEqual(current['narration'],s['narration']);self.assertEqual(current['animations'],s['animations']);self.assertEqual(current['captions'],s['captions']);self.assertEqual(changed['config']['assets'],project['config']['assets']);self.assertEqual(self.store.get_version(old['id']),old)
        frozen=self.store.create_version(project['id'],2);self.assertEqual(frozen['dsl']['scenes'][0]['elements'][0]['pointers'],elements[0]['pointers'])
        with self.assertRaisesRegex(StoreError,'conflict'):self.store.edit_scene(row['id'],1,{'code':code,'elements':elements})
        elements[0]['pointers'][0]['item_id']='missing'
        with self.assertRaises(StoreError):self.store.edit_scene(row['id'],2,{'elements':elements})
        self.assertEqual(self.store.get_project(project['id']),changed)

    def test_state_edit_retains_structure_audio_and_immutable_snapshot(self):
        from services.projects.store import StoreError
        dsl = copy.deepcopy(self.dsl); dsl['scenes'] = dsl['scenes'][:1]
        scene = dsl['scenes'][0]
        scene.update(type='state_diagram', structure={'kind': 'object', 'name': 'user'})
        scene['elements'][0].update(items=[{'id': 'level', 'key': 'level', 'value': '3'}], active_item_ids=['level'])
        project = self.store.import_project('状态教学编辑', dsl)
        snapshot = self.store.create_version(project['id'], 1)
        row = project['scenes'][0]
        elements = copy.deepcopy(row['scene']['elements']); elements[0]['items'][0]['value'] = '5'
        edited = self.store.edit_scene(row['id'], 1, {'elements': elements})
        ready = edited['scenes'][0]['scene']
        self.assertEqual(ready['structure'], scene['structure'])
        self.assertEqual(ready['narration'], scene['narration'])
        self.assertEqual(ready['captions'], scene['captions'])
        self.assertEqual(self.store.get_version(snapshot['id']), snapshot)
        self.assertEqual(self.store.create_version(project['id'], 2)['dsl']['scenes'][0]['elements'][0]['items'][0]['value'], '5')
        elements[0]['active_item_ids'] = ['missing']
        with self.assertRaises(StoreError): self.store.edit_scene(row['id'], 2, {'elements': elements})
        self.assertEqual(self.store.get_project(project['id']), edited)

    def test_timeline_edit_retains_axis_audio_and_immutable_snapshot(self):
        from services.projects.store import StoreError
        dsl = copy.deepcopy(self.dsl); dsl['scenes'] = dsl['scenes'][:1]
        scene = dsl['scenes'][0]
        scene.update(type='execution_timeline', timeline={'duration_ms': 200, 'lanes': [{'id': 'a', 'label': '请求'}]})
        scene['elements'][0]['event'] = {'lane_id': 'a', 'start_ms': 0, 'end_ms': 100, 'phase': 'wait'}
        project = self.store.import_project('时间线编辑', dsl)
        snapshot = self.store.create_version(project['id'], 1)
        row = project['scenes'][0]
        elements = copy.deepcopy(row['scene']['elements']); elements[0]['event']['end_ms'] = 150
        edited = self.store.edit_scene(row['id'], 1, {'elements': elements})
        ready = edited['scenes'][0]['scene']
        self.assertEqual(ready['timeline'], scene['timeline'])
        self.assertEqual(ready['narration'], scene['narration'])
        self.assertEqual(ready['captions'], scene['captions'])
        self.assertEqual(self.store.get_version(snapshot['id']), snapshot)
        self.assertEqual(self.store.create_version(project['id'], 2)['dsl']['scenes'][0]['elements'][0]['event']['end_ms'], 150)
        elements[0]['event']['end_ms'] = 201
        with self.assertRaises(StoreError): self.store.edit_scene(row['id'], 2, {'elements': elements})
        self.assertEqual(self.store.get_project(project['id']), edited)

    def test_narration_invalidates_and_blocks_snapshot(self):
        from services.projects.store import StoreError
        scene = self.project['scenes'][0]
        text = scene['scene']['narration']['text'] + '这是新增的教学内容。'
        changed = self.store.edit_scene(scene['id'], scene['revision'], {'narration_text': text})
        item = changed['scenes'][0]
        self.assertEqual(item['state'], 'needs_voice')
        self.assertNotIn('audio_asset_id', item['scene']['narration'])
        for field in ['animations', 'captions', 'duration_frames']:
            self.assertNotIn(field, item['scene'])
        with self.assertRaisesRegex(StoreError, 'not_ready'):
            self.store.create_version(changed['id'], changed['revision'])

    def test_version_immutable_after_edit_and_reorder(self):
        version = self.store.create_version(self.project['id'], self.project['revision'])
        scene = self.project['scenes'][0]
        elements = copy.deepcopy(scene['scene']['elements'])
        elements[0]['content'] = '后来编辑'
        changed = self.store.edit_scene(scene['id'], scene['revision'], {'elements': elements})
        changed = self.store.reorder(changed['id'], changed['revision'],
                                     [s['id'] for s in reversed(changed['scenes'])])
        self.assertEqual(self.store.get_version(version['id']), version)
        fresh = self.store.create_version(changed['id'], changed['revision'])
        self.assertNotEqual(fresh['dsl']['scenes'][0]['id'], version['dsl']['scenes'][0]['id'])
        self.assertEqual(fresh['dsl']['assets'], version['dsl']['assets'])
        self.assertEqual(fresh['profile'], {**PROFILE, 'render': self.dsl['video_config'],'visual_style':self.project['visual_style']})

    def test_manual_cue_keeps_audio_invalidates_timing_and_preserves_version(self):
        from services.projects.store import StoreError
        row=self.project['scenes'][0];old=self.store.create_version(self.project['id'],1)
        elements=copy.deepcopy(row['scene']['elements']);elements[0]['cue']['text_start']+=1
        changed=self.store.edit_scene(row['id'],1,{'elements':elements});item=changed['scenes'][0]
        self.assertEqual((changed['revision'],item['revision'],item['user_revision'],item['generated_revision']),(2,2,1,row['generated_revision']))
        self.assertEqual(item['state'],'needs_timing');self.assertNotIn('animations',item['scene'])
        for key in ['narration','captions','duration_frames']:self.assertEqual(item['scene'][key],row['scene'][key])
        self.assertEqual(changed['config'],self.project['config']);self.assertEqual(self.store.get_version(old['id']),old)
        self.assertEqual(self.store.edit_scene(row['id'],2,{'elements':elements}),changed)
        with self.assertRaisesRegex(StoreError,'not_ready'):self.store.create_version(changed['id'],2)
        with self.assertRaisesRegex(StoreError,'conflict'):self.store.edit_scene(row['id'],1,{'elements':elements})
        elements[0]['cue']['text_start']+=1
        pending=self.store.edit_scene(row['id'],2,{'elements':elements})
        self.assertEqual(pending['scenes'][0]['state'],'needs_timing')
        text=row['scene']['narration']['text']+'新口播。'
        voice=self.store.edit_scene(row['id'],3,{'elements':elements,'narration_text':text})
        self.assertEqual(voice['scenes'][0]['state'],'needs_voice')
        self.assertEqual(voice['scenes'][0]['scene']['narration'],{'text':text})
        elements[0]['cue']['text_start']=1
        voice=self.store.edit_scene(row['id'],4,{'elements':elements})
        self.assertEqual(voice['scenes'][0]['state'],'needs_voice')
        with self.store.connection() as conn:self.assertEqual(conn.execute('SELECT count(*) AS n FROM jobs WHERE project_id=%s',[self.project['id']]).fetchone()['n'],0)

    def test_manual_cue_invalid_ranges_identity_and_caption_changes_roll_back(self):
        from services.projects.store import StoreError
        row=self.project['scenes'][1]
        for cue in [{'text_start':0,'text_end':9999},{'text_start':-1,'text_end':2},{'text_start':4,'text_end':4},
                    {'text_start':True,'text_end':6},{'text_start':4.5,'text_end':6},{'text_start':4,'text_end':6.0},{'text_start':'4','text_end':6},None,{}]:
            elements=copy.deepcopy(row['scene']['elements']);elements[0]['cue']=cue
            with self.subTest(cue=cue),self.assertRaises(StoreError):self.store.edit_scene(row['id'],1,{'elements':elements})
            self.assertEqual(self.store.get_project(self.project['id']),self.project)
        for mutation in ['id','role','reverse','remove','captions']:
            elements=copy.deepcopy(row['scene']['elements']);elements[0]['cue']['text_start']+=1;patch={'elements':elements}
            if mutation=='id':elements[0]['id']='other'
            elif mutation=='role':elements[0]['role']='topic'
            elif mutation=='reverse':elements.reverse()
            elif mutation=='remove':elements.pop()
            else:patch['captions']=row['scene']['captions']
            with self.subTest(mutation=mutation),self.assertRaises(StoreError):self.store.edit_scene(row['id'],1,patch)
            self.assertEqual(self.store.get_project(self.project['id']),self.project)

    def test_manual_cue_uses_unicode_codepoints_without_promoting_needs_voice(self):
        from services.projects.store import StoreError
        project=self.store.add_scene(self.project['id'],1,'甲😀 乙','新步骤');row=project['scenes'][-1]
        elements=copy.deepcopy(row['scene']['elements']);elements[0]['cue']={'text_start':1,'text_end':2}
        changed=self.store.edit_scene(row['id'],1,{'elements':elements})
        self.assertEqual(changed['scenes'][-1]['scene']['elements'],elements);self.assertEqual(changed['scenes'][-1]['state'],'needs_voice')
        elements[0]['cue']={'text_start':2,'text_end':3}
        with self.assertRaises(StoreError):self.store.edit_scene(row['id'],2,{'elements':elements})
        self.assertEqual(self.store.get_project(project['id']),changed)

    def test_bad_patch_rollback_and_field_whitelist(self):
        from services.projects.store import StoreError
        scene = self.project['scenes'][0]
        bad = copy.deepcopy(scene['scene']['elements'])
        bad[0]['cue']['text_end'] = len(scene['scene']['narration']['text']) + 1
        for patch in [{'elements': bad}, {'assets': []}, {'revision': 50}, {'code': {'source': 'secret'} }]:
            with self.subTest(fields=list(patch)):
                with self.assertRaises(StoreError): self.store.edit_scene(scene['id'], scene['revision'], patch)
                self.assertEqual(self.store.get_project(self.project['id']), self.project)

    def test_reorder_requires_complete_unique_ids_and_current_revision(self):
        from services.projects.store import StoreError
        ids = [s['id'] for s in self.project['scenes']]
        for bad in [[], ids[:-1], [ids[0]] * len(ids), ids + ['invalid']]:
            with self.subTest(count=len(bad)):
                with self.assertRaises(StoreError): self.store.reorder(self.project['id'], 1, bad)
        self.store.reorder(self.project['id'], 1, ids[::-1])
        with self.assertRaisesRegex(StoreError, 'conflict'): self.store.reorder(self.project['id'], 1, ids)

    def test_parallel_edits_cannot_overwrite_each_other(self):
        from concurrent.futures import ThreadPoolExecutor
        from services.projects.store import StoreError
        scene = self.project['scenes'][0]
        def change(label):
            elements = copy.deepcopy(scene['scene']['elements'])
            elements[0]['content'] = label
            try:
                self.store.edit_scene(scene['id'], scene['revision'], {'elements': elements})
                return 'saved'
            except StoreError as error: return error.code
        with ThreadPoolExecutor(max_workers=2) as pool:
            results = list(pool.map(change, ['并发标题甲', '并发标题乙']))
        self.assertCountEqual(results, ['saved', 'conflict'])
        self.assertEqual(self.store.get_project(self.project['id'])['revision'], 2)

    def test_invalid_narration_and_caption_patch_roll_back(self):
        from services.projects.store import StoreError
        scene = self.project['scenes'][0]
        for patch in [{'narration_text': None}, {'narration_text': []}, {'narration_text': ''}, {'captions': None}]:
            with self.subTest(fields=list(patch)):
                with self.assertRaises(StoreError): self.store.edit_scene(scene['id'], 1, patch)
                self.assertEqual(self.store.get_project(self.project['id']), self.project)

    def test_snapshot_rechecks_asset_tampering(self):
        from services.projects.store import StoreError
        (self.public / self.dsl['assets'][0]['storage_key']).write_bytes(b'tampered')
        with self.assertRaisesRegex(StoreError, 'assets'):
            self.store.create_version(self.project['id'], 1)

    def test_invalid_profile_cannot_persist_keys(self):
        from services.projects.store import Store, StoreError
        with self.assertRaises(StoreError):
            Store(os.environ['TEST_DATABASE_URL'], self.public, {**PROFILE, 'api_key': 'secret'})
        with self.assertRaises(StoreError):
            Store(os.environ['TEST_DATABASE_URL'], self.public,
                  {**PROFILE, 'voice': {**PROFILE['voice'], 'api_key': 'secret'}})

    def test_candidate_cue_change_keeps_audio_but_requires_timing(self):
        from services.projects.store import StoreError
        item = self.project['scenes'][0]
        scene = item['scene']
        draft = {k: copy.deepcopy(v) for k, v in scene.items() if k in ['id', 'type', 'elements', 'edges', 'code']}
        draft['narration'] = {'text': scene['narration']['text']}
        draft['elements'][0]['cue']['text_start'] += 1
        candidate = self.store.create_candidate(item['id'], 1, draft)
        changed = self.store.accept_candidate(item['id'], candidate['id'], 1)
        result = changed['scenes'][0]
        self.assertEqual(result['state'], 'needs_timing')
        self.assertEqual(result['scene']['narration'], scene['narration'])
        self.assertNotIn('animations', result['scene'])
        with self.assertRaisesRegex(StoreError, 'not_ready'): self.store.create_version(changed['id'], 2)

    def test_candidate_cannot_move_scene_or_accept_foreign_candidate(self):
        from services.projects.store import StoreError
        item = self.project['scenes'][0]
        scene = item['scene']
        draft = {k: copy.deepcopy(v) for k, v in scene.items() if k in ['id', 'type', 'elements', 'edges', 'code']}
        draft['narration'] = {'text': scene['narration']['text']}
        candidate = self.store.create_candidate(item['id'], 1, draft)
        with self.assertRaises(StoreError): self.store.accept_candidate(self.project['scenes'][1]['id'], candidate['id'], 1)
        draft['id'] = 'different-scene'
        with self.assertRaises(StoreError): self.store.create_candidate(item['id'], 1, draft)
        self.assertEqual(self.store.get_project(self.project['id']), self.project)

    def test_late_candidate_is_kept_but_cannot_overwrite_newer_edit(self):
        from services.projects.store import StoreError
        item = self.project['scenes'][0]
        scene = item['scene']
        draft = {k: copy.deepcopy(v) for k, v in scene.items() if k in ['id', 'type', 'elements', 'edges', 'code']}
        draft['narration'] = {'text': scene['narration']['text']}
        elements = copy.deepcopy(scene['elements'])
        elements[0]['content'] = '用户的新版本'
        changed = self.store.edit_scene(item['id'], 1, {'elements': elements})
        late = self.store.create_candidate(item['id'], 1, draft)
        with self.assertRaisesRegex(StoreError, 'conflict'): self.store.accept_candidate(item['id'], late['id'], 2)
        self.assertEqual(self.store.get_project(changed['id']), changed)
        self.assertEqual(self.store.get_candidates(item['id']), [late])
        with self.assertRaises(StoreError): self.store.create_candidate(item['id'], 3, draft)
        draft['api_key'] = 'secret-token'
        with self.assertRaises(StoreError): self.store.create_candidate(item['id'], 2, draft)

    def test_invalid_unicode_in_internal_drafts_rolls_back(self):
        from services.projects.store import StoreError
        item = self.project['scenes'][0]
        scene = item['scene']
        elements = copy.deepcopy(scene['elements'])
        elements[0]['content'] += '\ud800'
        with self.assertRaisesRegex(StoreError, 'validation'):
            self.store.edit_scene(item['id'], 1, {'elements': elements})
        draft = {k: copy.deepcopy(v) for k, v in scene.items() if k in ['id', 'type', 'elements', 'edges', 'code']}
        draft['narration'] = {'text': scene['narration']['text'] + '\ud800'}
        with self.assertRaisesRegex(StoreError, 'validation'): self.store.create_candidate(item['id'], 1, draft)
        self.assertEqual(self.store.get_project(self.project['id']), self.project)
        self.assertEqual(self.store.get_candidates(item['id']), [])

    def test_cli_import_snapshot_export_without_paid_calls(self):
        import contextlib
        import io
        from unittest.mock import patch
        from services.projects.manage import main
        source = self.public / 'project.json'
        source.write_text(json.dumps(self.dsl))
        env = {'DATABASE_URL': os.environ['TEST_DATABASE_URL'],
               'VOLCENGINE_RESOURCE_ID': 'seed-tts-2.0', 'VOLCENGINE_SPEAKER': 'test_voice'}
        def run(args):
            stdout = io.StringIO()
            with patch.dict(os.environ, env), patch('services.projects.manage.load_dotenv'), contextlib.redirect_stdout(stdout):
                self.assertEqual(main(args), 0)
            return json.loads(stdout.getvalue())
        project = run(['import', str(source), '--title', 'CLI 教学'])
        version = run(['version', project['id'], '--revision', '1'])
        output = self.public / 'snapshot.json'
        run(['export', version['id'], str(output)])
        self.assertEqual(json.loads(output.read_text()), self.dsl)
        from services.projects.manage import publish
        with self.assertRaises(FileExistsError): publish({'overwrite': True}, output)
        self.assertEqual(json.loads(output.read_text()), self.dsl)

    def test_snapshot_and_edit_require_real_integer_revision(self):
        from services.projects.store import StoreError
        for revision in [True, 0, '1', None]:
            with self.assertRaises(StoreError): self.store.create_version(self.project['id'], revision)
            with self.assertRaises(StoreError): self.store.edit_scene(self.project['scenes'][0]['id'], revision, {})
