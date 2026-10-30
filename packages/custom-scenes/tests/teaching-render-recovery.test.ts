import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {freezeTeachingScene,validateTeachingArtifact} from '../src/teaching-artifact';
import {prepareTeachingRenderRecovery,runTeachingRenderRecovery} from '../src/teaching-render-recovery';
import {expectedTeachingForeground,expectedTeachingSolids} from '../src/teaching-scene-audit';
import {teachingExample,teachingBrief as brief,teachingCues as cues} from './fixtures/teaching-examples';
import {teachingSampledFrames} from '../src/teaching-render-policy';

const digest=(v:unknown)=>createHash('sha256').update(JSON.stringify(v)).digest('hex');
async function fixture(variant:'default'|'upper'|'lower'='default'){
 const artifact=await freezeTeachingScene(teachingExample('flow'),brief,cues,variant);
 const requiredFrames=[...new Set([0,59,119,...artifact.compiled.schedule.events.flatMap(e=>[e.startFrame,e.endFrame-1])])].sort((a,b)=>a-b);
 const frames=Object.fromEntries(requiredFrames.map(frame=>[frame,{frame,status:'passed',issues:[] as {kind:string;target:string;detail:string}[],labels:artifact.compiled.objects.reduce((n,o)=>n+o.asset.text.lines.length,0),solids:expectedTeachingSolids(artifact).length,foreground:expectedTeachingForeground(artifact,frame).length,routes:artifact.compiled.transports.filter(t=>frame>=t.startFrame&&frame<t.endFrame).length,movers:artifact.compiled.transports.filter(t=>frame>=t.startFrame&&frame<t.endFrame).length,occlusionChecks:0}]));
 frames[6].status='failed';frames[6].issues.push({kind:'label-occluded',target:'label-paper-0',detail:'Later receiver foreground covers label'});
 return {artifact,report:{artifactSha256:artifact.artifactSha256,status:'failed',requiredFrames,frames,invalidLogs:[]}};
}

test('bound geometric failure prepares a distinct frozen host variant, never a success claim',async()=>{
 const {artifact,report}=await fixture(),before=structuredClone(report);
 const result=await prepareTeachingRenderRecovery(artifact,artifact.artifactSha256,report,digest(report),'stills');
 assert.equal(result.status,'candidate-ready');assert.equal(result.accepted,false);
 if(result.status!=='candidate-ready')return;
 assert.equal(result.candidate.layoutVariant,'upper');assert.notEqual(result.candidate.artifactSha256,artifact.artifactSha256);
 assert.deepEqual(result.candidate.compiled.plan,artifact.compiled.plan);assert.deepEqual(result.candidate.cues,artifact.cues);
 assert.deepEqual(report,before);assert.equal(result.failure.status,'failed');assert.equal(result.modelCalls,0);
 assert.notDeepEqual(result.candidate.compiled.transports,artifact.compiled.transports);
 await validateTeachingArtifact(result.candidate,result.candidate.artifactSha256);
});

test('missing measurements, identity failures and invalid geometry never trigger a misleading content retry',async()=>{
 const {artifact,report}=await fixture();
 for(const kind of ['font-not-loaded','identity-coverage','foreground-paint','measurement-failed','label-region','invalid-geometry','unexpected-failure']){
  const copy=structuredClone(report);copy.frames[6].issues[0].kind=kind;
  const result=await prepareTeachingRenderRecovery(artifact,artifact.artifactSha256,copy,digest(copy),'stills');
  assert.equal(result.status,'blocked');assert.equal('candidate' in result,false);
 }
 const missing=structuredClone(report);delete missing.frames[0];
 assert.equal((await prepareTeachingRenderRecovery(artifact,artifact.artifactSha256,missing,digest(missing),'stills')).status,'blocked');
 const unexplained=structuredClone(report);unexplained.frames[0].status='failed';
 assert.equal((await prepareTeachingRenderRecovery(artifact,artifact.artifactSha256,unexplained,digest(unexplained),'stills')).status,'blocked');
});

test('report and artifact must match external trusted bindings and phase coverage',async()=>{
 const {artifact,report}=await fixture();
 await assert.rejects(prepareTeachingRenderRecovery(artifact,artifact.artifactSha256,report,'0'.repeat(64),'stills'),/binding/);
 const changed={...report,artifactSha256:'0'.repeat(64)};
 await assert.rejects(prepareTeachingRenderRecovery(artifact,artifact.artifactSha256,changed,digest(changed),'stills'),/binding/);
 assert.equal((await prepareTeachingRenderRecovery(artifact,artifact.artifactSha256,report,digest(report),'continuous')).status,'blocked');
 const spoof=structuredClone(report);spoof.requiredFrames=[6];
 const result=await prepareTeachingRenderRecovery(artifact,artifact.artifactSha256,spoof,digest(spoof),'stills');
 assert.equal(result.status,'blocked');
});

test('variant search is finite, unchanged geometry is not re-rendered, and passed audits are not failures',async()=>{
 const {artifact,report}=await fixture('lower');
 assert.equal((await prepareTeachingRenderRecovery(artifact,artifact.artifactSha256,report,digest(report),'stills')).status,'exhausted');
 const passing=structuredClone(report);passing.frames[6].status='passed';passing.frames[6].issues=[];
 assert.equal((await prepareTeachingRenderRecovery(artifact,artifact.artifactSha256,passing,digest(passing),'stills')).status,'not-failed');
 await assert.rejects(freezeTeachingScene(teachingExample('flow'),brief,cues,'arbitrary' as 'default'),/variant/);
});

test('free recovery rounds recheck candidates, retain failures, and stop after the fixed variants',async()=>{
 const {artifact}=await fixture(),variants:string[]=[];
 const result=await runTeachingRenderRecovery(artifact,artifact.artifactSha256,async candidate=>{
  variants.push(candidate.layoutVariant);
  const next=await fixture(candidate.layoutVariant);
  return {status:'failed',phase:'stills',report:next.report};
 });
 assert.deepEqual(variants,['default','upper','lower']);assert.equal(result.status,'exhausted');
 assert.equal(result.history.length,3);assert.ok(result.history.every(r=>r.recovery.failure.status==='failed'));
 assert.equal(result.modelCalls,0);assert.equal(result.accepted,false);
});

test('producer success cannot bypass complete continuous audits or media validation',async()=>{
 const {artifact,report}=await fixture();
 const result=await runTeachingRenderRecovery(artifact,artifact.artifactSha256,async()=>({status:'preview-ready',report,media:{}}));
 assert.equal(result.status,'blocked');assert.equal(result.accepted,false);
});

const validMedia={streams:[{codec_type:'video',codec_name:'h264',width:1920,height:1080,r_frame_rate:'30/1',nb_read_frames:'120',start_time:'0.000000'}],format:{duration:'4.000000'}};
function passingContinuous(artifact:Awaited<ReturnType<typeof freezeTeachingScene>>){
 const requiredFrames=Array.from({length:brief.durationInFrames},(_,i)=>i);
 return {artifactSha256:artifact.artifactSha256,requiredFrames,invalidLogs:[],frames:Object.fromEntries(requiredFrames.map(frame=>{
  const active=artifact.compiled.transports.filter(t=>frame>=t.startFrame&&frame<t.endFrame).length;
  return [frame,{frame,status:'passed',issues:[] as {kind:string;target:string;detail:string}[],labels:artifact.compiled.objects.reduce((n,o)=>n+o.asset.text.lines.length,0),solids:expectedTeachingSolids(artifact).length,foreground:expectedTeachingForeground(artifact,frame).length,routes:active,movers:active,occlusionChecks:0}];
 }))};
}

test('a repaired round only finishes after complete fresh frame evidence and valid media',async()=>{
 const {artifact,report}=await fixture();let calls=0;
 const result=await runTeachingRenderRecovery(artifact,artifact.artifactSha256,async candidate=>{
  calls++;
  return calls===1?{status:'failed',phase:'stills',report}:{status:'preview-ready',report:passingContinuous(candidate),media:validMedia};
 });
 assert.equal(calls,2);assert.equal(result.status,'preview-ready');assert.equal(result.accepted,false);
 assert.equal(result.history[0].recovery.failure.status,'failed');assert.equal(result.history[1].recovery.failure.status,'passed');
 await assert.rejects(runTeachingRenderRecovery(artifact,artifact.artifactSha256,async candidate=>({status:'preview-ready',report:passingContinuous(candidate),media:{...validMedia,format:{duration:'NaN'}}})),/media integrity/);
});

test('unchanged host variants are not rendered, even when a geometric issue was reported',async()=>{
 const artifact=await freezeTeachingScene(teachingExample('state-change'),brief,cues),report=passingContinuous(artifact);
 report.frames[6].status='failed';report.frames[6].issues.push({kind:'label-occluded',target:'label-machine-0',detail:'Synthetic contract fixture'});
 const result=await prepareTeachingRenderRecovery(artifact,artifact.artifactSha256,report,digest(report),'continuous');
 assert.equal(result.status,'exhausted');if(result.status==='exhausted')assert.deepEqual(result.attempts.map(a=>a.status),['unchanged','unchanged']);
 assert.deepEqual(teachingSampledFrames(artifact),[0,6,53,59,60,113,119]);
});
