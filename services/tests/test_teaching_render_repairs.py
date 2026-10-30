import copy
import hashlib
import json
import os
import unittest
import subprocess
import httpx
from unittest.mock import patch
from services.tests import test_teaching_renders
from services.visual.teaching_pipeline import host_command,pipeline_binding
from services.projects.store import StoreError
from services.projects.store import ROOT


@unittest.skipUnless(os.environ.get('TEST_DATABASE_URL'),'Requires disposable PostgreSQL')
class TeachingRenderRepairTests(unittest.TestCase):
    def setUp(self):
        fixture=test_teaching_renders.TeachingRenderQueueTests('test_only_owned_bound_file_is_published_and_resume_does_not_render_again')
        fixture.setUp();self.addCleanup(fixture.doCleanups);self.fixture=fixture
        self.pid=fixture.pid;self.rid=fixture.root['id'];self.tasks=fixture.workbench.tasks
        self.snapshot=self.tasks.checkpoint(self.pid,self.rid)['snapshot']
        binding=pipeline_binding(fixture.root['snapshot_sha256'],'plan')
        self.artifact=self.tasks.get_cache(self.pid,self.rid,'artifact',binding)['payload']
        plan=copy.deepcopy(self.artifact['compiled']['plan']);plan['objects'][0]['component']='loop-node'
        self.revised=host_command('check',{'brief':self.snapshot['brief'],'cues':self.snapshot['cues'],'plan':plan})['artifact']
        self.job=fixture.enqueue();claim=fixture.queue.claim(self.pid,self.rid)
        fixture.queue.fail(self.pid,self.rid,claim['token'],'render-failed')
        folder,_,_=fixture.cleanup_proof(self.job)
        self.report=folder/'failure-evidence/render/recovery-report.json';self.report.parent.mkdir(parents=True)
        self.report.write_text('{"synthetic":true}')
        self.request={'schemaVersion':'teaching-render-revision:1','requestSha256':'e'*64,
            'reportSha256':hashlib.sha256(self.report.read_bytes()).hexdigest(),'sourceArtifactSha256':self.artifact['artifactSha256']}
        from services.visual.teaching_render_repairs import TeachingRenderRepairs
        self.repairs=TeachingRenderRepairs(fixture.store)

    def host(self,operation,payload):
        if operation=='render-revision':return {'status':'revision-required','request':self.request}
        if operation=='revision':return {'stage':'revision','requestSha256':'f'*64}
        if operation=='check':return {'status':'compiled','artifact':self.revised}
        self.fail('Unexpected host operation '+operation)

    def test_render_repair_shares_root_budget_and_creates_a_distinct_frozen_attempt(self):
        from services.visual.teaching_render_repairs import run_once
        calls=[]
        with patch('services.visual.teaching_render_repairs.host_command',side_effect=self.host):
            repair=self.repairs.prepare(self.pid,self.rid,self.job['id'])
            self.assertEqual(repair['state'],'queued');self.assertEqual(self.tasks.get(self.pid,self.rid)['requests_used'],1)
            result=run_once(self.repairs,lambda request:calls.append(request) or self.revised['compiled']['plan'])
            self.assertEqual(result['state'],'succeeded');self.assertEqual(len(calls),1)
            self.assertIsNone(run_once(self.repairs,lambda _:self.fail('No repeat')))
        current=self.fixture.queue.get(self.pid,self.rid)
        self.assertEqual(current['state'],'queued');self.assertNotEqual(current['id'],self.job['id'])
        self.assertEqual(self.tasks.get(self.pid,self.rid)['requests_used'],2)
        with self.fixture.store.connection() as conn:
            rows=conn.execute('SELECT state FROM teaching_render_jobs WHERE root_id=%s ORDER BY created_at',[self.rid]).fetchall()
        self.assertEqual([row['state'] for row in rows],['failed','queued'])
        self.assertTrue(self.report.exists())

    def test_host_faults_or_exhausted_revision_slot_never_queue_a_paid_repair(self):
        with patch('services.visual.teaching_render_repairs.host_command',return_value={'status':'unsupported'}) as host:
            self.assertIsNone(self.repairs.prepare(self.pid,self.rid,self.job['id']))
        self.assertEqual(self.tasks.get(self.pid,self.rid)['requests_used'],1)
        call=self.tasks.reserve(self.pid,self.rid,'revision','d'*64)
        self.tasks.finish(self.pid,self.rid,call['id'],call['dispatch_token'],'failed')
        with patch('services.visual.teaching_render_repairs.host_command') as host:
            self.assertIsNone(self.repairs.prepare(self.pid,self.rid,self.job['id']));host.assert_not_called()

    def test_changed_evidence_is_rejected_before_request_reservation(self):
        from services.visual.teaching_render_repairs import run_once
        with patch('services.visual.teaching_render_repairs.host_command',side_effect=self.host):
            self.repairs.prepare(self.pid,self.rid,self.job['id']);self.report.write_text('changed')
            result=run_once(self.repairs,lambda _:self.fail('Evidence changed; no provider call'))
        self.assertEqual(result['state'],'failed');self.assertEqual(self.tasks.get(self.pid,self.rid)['requests_used'],1)

    def test_missing_executor_expires_queued_repair_without_a_model_call(self):
        with patch('services.visual.teaching_render_repairs.host_command',side_effect=self.host):
            self.repairs.prepare(self.pid,self.rid,self.job['id'])
        with self.fixture.store.connection() as conn:
            conn.execute("UPDATE teaching_render_repairs SET created_at=clock_timestamp()-interval '3 minutes' WHERE root_id=%s",[self.rid])
        with patch('services.visual.teaching_render_repairs.WorkerHealth.ready',return_value=False):
            repair=self.repairs.get(self.pid,self.rid)
        self.assertEqual(repair['state'],'failed')
        self.assertEqual(repair['result']['code'],'executor-unavailable')
        self.assertEqual(self.tasks.get(self.pid,self.rid)['requests_used'],1)

    def test_unknown_request_is_not_shown_as_an_active_repair(self):
        with patch('services.visual.teaching_render_repairs.host_command',side_effect=self.host):
            self.repairs.prepare(self.pid,self.rid,self.job['id'])
        call=self.tasks.reserve(self.pid,self.rid,'revision','d'*64)
        self.tasks.finish(self.pid,self.rid,call['id'],call['dispatch_token'],'unknown')
        view=self.fixture.workbench.get(self.pid,self.rid)
        self.assertNotIn(view['stage'],('revision-pending','revising'))
        self.assertFalse(view['can_run'])

    def test_cancelled_repair_never_dispatches_and_removes_only_queued_work(self):
        from services.visual.teaching_render_repairs import run_once
        with patch('services.visual.teaching_render_repairs.host_command',side_effect=self.host):self.repairs.prepare(self.pid,self.rid,self.job['id'])
        self.fixture.workbench.cancel(self.pid,self.rid)
        self.assertIsNone(run_once(self.repairs,lambda _:self.fail('Cancelled')))
        self.assertEqual(self.repairs.get(self.pid,self.rid)['state'],'cancelled')
        self.fixture.store.delete_project(self.pid,self.fixture.project['revision'],True)

    @unittest.skipUnless(os.environ.get('RUN_TEACHING_ISOLATED_TEST')=='1','Explicit real-container smoke opt-in')
    def test_synthetic_audit_to_mock_http_revision_to_real_container_uses_two_slots(self):
        # Synthetic failure evidence exercises protocol/queue binding, not real visual recovery acceptance.
        script="""
import {readFileSync} from 'node:fs';
import {runTeachingRenderRecovery} from './packages/custom-scenes/src/teaching-render-recovery.ts';
import {teachingSampledFrames} from './packages/custom-scenes/src/teaching-render-policy.ts';
import {expectedTeachingForeground,expectedTeachingSolids} from './packages/custom-scenes/src/teaching-scene-audit.ts';
const a=JSON.parse(readFileSync(0,'utf8'));
const result=await runTeachingRenderRecovery(a,a.artifactSha256,async candidate=>{
 const requiredFrames=teachingSampledFrames(candidate),first=requiredFrames[0];
 const frames=Object.fromEntries(requiredFrames.map(frame=>{
  const active=candidate.compiled.transports.filter(t=>frame>=t.startFrame&&frame<t.endFrame).length;
  return [frame,{frame,status:frame===first?'failed':'passed',issues:frame===first?[{kind:'label-clipped',target:'label-status-0',detail:'Synthetic measured label clipping fixture'}]:[],
   labels:candidate.compiled.objects.reduce((n,o)=>n+o.asset.text.lines.length,0),solids:expectedTeachingSolids(candidate).length,
   foreground:expectedTeachingForeground(candidate,frame).length,routes:active,movers:active,occlusionChecks:0}];
 }));return {status:'failed',phase:'stills',report:{artifactSha256:candidate.artifactSha256,requiredFrames,frames,invalidLogs:[]}};
});process.stdout.write(JSON.stringify(result));
"""
        child=subprocess.run(['node','--import','tsx','--input-type=module','-e',script],input=json.dumps(self.artifact),
            cwd=ROOT,env={key:os.environ[key] for key in ('PATH','HOME') if key in os.environ},capture_output=True,text=True,timeout=60)
        self.assertEqual(child.returncode,0,child.stderr);self.report.write_text(child.stdout)
        repair=self.repairs.prepare(self.pid,self.rid,self.job['id']);self.assertIsNotNone(repair)
        from services.visual.teaching_provider import TeachingPlanProvider
        from services.workflow.providers import Settings
        from services.visual.teaching_render_repairs import run_once
        requests=[]
        def transport(request):
            requests.append(request)
            return httpx.Response(200,json={'choices':[{'finish_reason':'stop','message':{'role':'assistant','content':json.dumps(self.revised['compiled']['plan'])}}]})
        with httpx.Client(transport=httpx.MockTransport(transport)) as client:
            result=run_once(self.repairs,TeachingPlanProvider(Settings('test-only','deepseek-flash','','','','',''),client=client))
        self.assertEqual(result['state'],'succeeded');self.assertEqual(len(requests),1)
        rendered=self.fixture.queue.run(self.pid,self.rid)
        self.assertEqual(rendered['state'],'succeeded');self.assertTrue(rendered['video_ready']);self.assertFalse(rendered['accepted'])
        self.assertEqual(self.tasks.get(self.pid,self.rid)['requests_used'],2)
