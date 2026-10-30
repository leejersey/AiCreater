import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {freezeTeachingScene} from '../src/teaching-artifact';
import {runTeachingRenderRecovery} from '../src/teaching-render-recovery';
import {teachingSampledFrames} from '../src/teaching-render-policy';
import {expectedTeachingForeground,expectedTeachingSolids} from '../src/teaching-scene-audit';
import {teachingExample,teachingBrief as brief,teachingCues as cues} from './fixtures/teaching-examples';
import {prepareTeachingRenderRevision,buildTeachingRenderRevisionPrompt,validateTeachingRenderRevision} from '../src/teaching-render-revision';

const sha=(value:string)=>createHash('sha256').update(value).digest('hex');
async function failure(kind='label-occluded'){
 const artifact=await freezeTeachingScene(teachingExample('flow'),brief,cues);
 const history=await runTeachingRenderRecovery(artifact,artifact.artifactSha256,async candidate=>{
  const requiredFrames=teachingSampledFrames(candidate);
  const frames=Object.fromEntries(requiredFrames.map(frame=>{
   const active=candidate.compiled.transports.filter(t=>frame>=t.startFrame&&frame<t.endFrame).length;
   return [frame,{frame,status:frame===6?'failed':'passed',issues:frame===6?[{kind,target:'label-paper-0',detail:'Receiver foreground covers the label'}]:[],
    labels:candidate.compiled.objects.reduce((n,o)=>n+o.asset.text.lines.length,0),solids:expectedTeachingSolids(candidate).length,
    foreground:expectedTeachingForeground(candidate,frame).length,routes:active,movers:active,occlusionChecks:0}];
  }));
  return {status:'failed',phase:'stills',report:{artifactSha256:candidate.artifactSha256,requiredFrames,frames,invalidLogs:[]}};
 });
 const json=JSON.stringify(history,null,2);
 return {artifact,history,json};
}

test('only bound exhausted placement recovery can request one semantic revision',async()=>{
 const {artifact,json}=await failure();
 const result=await prepareTeachingRenderRevision(artifact,artifact.artifactSha256,json,sha(json));
 assert.equal(result.status,'revision-required');assert.equal(result.modelCalls,0);assert.equal(result.accepted,false);
 if(result.status!=='revision-required')return;
 const request=result.request;
 assert.equal(request.sourceArtifactSha256,artifact.artifactSha256);assert.equal(request.reportSha256,sha(json));
 assert.deepEqual(request.plan,artifact.compiled.plan);assert.equal(request.diagnostics.length,1);
 assert.match(buildTeachingRenderRevisionPrompt(request,brief,cues,request.requestSha256),/Only choose compatible component/);
 const sorted=(v:unknown):unknown=>Array.isArray(v)?v.map(sorted):v&&typeof v==='object'?Object.fromEntries(Object.entries(v).sort(([a],[b])=>a.localeCompare(b)).map(([k,value])=>[k,sorted(value)])):v;
 assert.doesNotThrow(()=>buildTeachingRenderRevisionPrompt(sorted(request) as typeof request,brief,cues,request.requestSha256));
 const next=structuredClone(request.plan);next.objects[1].component='loop-node';
 assert.deepEqual(validateTeachingRenderRevision(request,next,brief,cues,request.requestSha256),next);
});

test('binding mismatches, forged history and unfinished free variants cannot spend a revision',async()=>{
 const {artifact,json,history}=await failure();
 await assert.rejects(prepareTeachingRenderRevision(artifact,artifact.artifactSha256,json,'0'.repeat(64)),/binding/);
 const forged=structuredClone(history);forged.history[0].artifactSha256='0'.repeat(64);
 const forgedJson=JSON.stringify(forged);
 await assert.rejects(prepareTeachingRenderRevision(artifact,artifact.artifactSha256,forgedJson,sha(forgedJson)),/binding/);
 const unfinished={...history,history:history.history.slice(0,1)},text=JSON.stringify(unfinished);
 const result=await prepareTeachingRenderRevision(artifact,artifact.artifactSha256,text,sha(text));
 assert.equal(result.status,'unsupported');assert.equal('request' in result,false);
});

test('host measurement faults do not become model repair requests',async()=>{
 const {artifact,json}=await failure('font-not-loaded');
 const result=await prepareTeachingRenderRevision(artifact,artifact.artifactSha256,json,sha(json));
 assert.equal(result.status,'unsupported');assert.equal('request' in result,false);
});

test('semantic revision cannot drop labels, identities, cue actions or add coordinates',async()=>{
 const {artifact,json}=await failure();
 const result=await prepareTeachingRenderRevision(artifact,artifact.artifactSha256,json,sha(json));
 assert.equal(result.status,'revision-required');if(result.status!=='revision-required')return;
 const request=result.request;
 for(const mutate of [
  (p:any)=>{p.objects[0].label='short';},(p:any)=>{p.objects.pop();},
  (p:any)=>{p.beats[0].actions=[{kind:'hold',objectId:'paper'}];},(p:any)=>{p.objects[0].x=1;},
 ]){const p=structuredClone(request.plan);mutate(p);assert.throws(()=>validateTeachingRenderRevision(request,p,brief,cues,request.requestSha256));}
 assert.throws(()=>buildTeachingRenderRevisionPrompt({...request,reportSha256:'0'.repeat(64)},brief,cues,request.requestSha256),/binding/);
});
