import test from 'node:test';
import assert from 'node:assert/strict';
import {verifyReviewedImportData} from '../src/reviewed-import';
import {parseArtifact,sourceHash} from '../src/contract';
import {parseDesign,designHash,reviewFrames} from '../src/design';
import {workbenchSrt} from '../src/workbench';

async function fixture(){
 const design=parseDesign({schemaVersion:'visual-design:1',palette:'blueprint',brief:{schemaVersion:'custom-scene-brief:1',id:'import-test',title:'Import',narration:'Test.',visualGoal:'A card.',facts:['A card.'],materials:[],width:1920,height:1080,fps:30,durationInFrames:60},
  cues:[{id:'cue-1',text:'Test.',startFrame:0,endFrame:60}],thesis:'A card.',metaphor:'A card.',objects:[{id:'card',meaning:'Card',appearance:'Card',x:100,y:200,width:200,height:100}],
  beats:[{cueId:'cue-1',focus:'card',action:'Show.',changes:[{objectId:'card',from:'Hidden',to:'Shown'}]}],composition:'A card.',avoid:['Overlap'],acceptance:['Clear']});
 const artifact=parseArtifact({schemaVersion:'custom-scene:1',brief:design.brief,rationale:'Retained response fixture',source:'export default function Scene(){return <svg><rect x={100} y={200} width={200} height={100}/></svg>;}'});
 const sha=sourceHash(artifact),dh=designHash(design);
 const scene={duration_frames:design.brief.durationInFrames,narration:{text:design.brief.narration,audio_start_frame:0},captions:design.cues.map(c=>({text:c.text,start_frame:c.startFrame,end_frame:c.endFrame}))};
 const frames=reviewFrames(design),audits=Object.fromEntries(frames.map(f=>[f,{issues:[],labels:1,movers:1,routes:1,obstacles:0}]));
 const composition={durationInFrames:scene.duration_frames,chapters:[{artifact:'chapter-0/artifact.json',sha256:sha,design_sha256:dh,audio:'chapter-0/audio.wav',from:0,scene}]};
 return {artifact,design,provider:{content:JSON.stringify(artifact),finishReason:'stop'},dispatch:{maximumRequests:1,requestsDispatched:1,automaticRetries:0,designSha256:dh},
  measured:{brief:design.brief,cues:design.cues,scene},composition,srt:workbenchSrt(composition),frozenArtifact:artifact,frozenDesign:design,
  report:{sha256:sha,designSha256:dh,technical:'passed',frames:frames.map(f=>`frame-${f}.png`),geometry:{status:'passed',issueCount:0,motionChecks:frames.length,frames:audits}},approval:sha};
}
test('reviewed import validates an actual response and frozen preview without source execution or new requests',async()=>{
 const data=await fixture(),result=verifyReviewedImportData(data);
 assert.equal(result.sha256,data.approval);assert.equal(result.requests_dispatched,1);
 assert.equal(result.new_requests,0);assert.equal(result.accepted,false);
});
test('response pollution, manual source changes and fictional accounting reject',async()=>{
 for(const mutate of [
  (d:any)=>d.provider.content+=' trailing',
  (d:any)=>d.provider.truncated=true,
  (d:any)=>d.artifact.source+='\n// unbound edit',
  (d:any)=>d.dispatch.requestsDispatched=0,
  (d:any)=>d.dispatch.requestsDispatched=true,
  (d:any)=>d.dispatch.designSha256='a'.repeat(64),
 ]){const d=await fixture();mutate(d);assert.throws(()=>verifyReviewedImportData(d));}
});
test('stale timing, failed geometry, missing frames and wrong rendered composition reject',async()=>{
 for(const mutate of [
  (d:any)=>d.measured.scene.captions[0].start_frame++,
  (d:any)=>d.report.geometry.status='failed',
  (d:any)=>d.report.geometry.frames[0].issues.push({kind:'label-overlap',target:'a',detail:'overlap'}),
  (d:any)=>d.report.frames.pop(),
  (d:any)=>{for(const a of Object.values(d.report.geometry.frames) as any[])a.movers=0;},
  (d:any)=>d.composition.chapters[0].sha256='a'.repeat(64),
  (d:any)=>d.srt+='extra',
  (d:any)=>d.frozenArtifact={...d.artifact,source:d.artifact.source+'\n// changed'},
 ]){const d=await fixture();mutate(d);assert.throws(()=>verifyReviewedImportData(d));}
});
test('explicit offline revision keeps original provider provenance and full preview gates',async()=>{
 const make=async()=>{
  const data:any=await fixture();
  const parent={...data.artifact,source:data.artifact.source+'\n// retained parent'};
  data.provider.content=JSON.stringify(parent);
  data.sourceOrigin='local-reviewed-offline-revision';
  data.offlineRevision={schemaVersion:'reviewed-offline-revision:1',parentSha256:sourceHash(parent),sha256:data.approval,designSha256:designHash(data.design),reason:'Human-approved offline correction after failed model output.'};
  return data;
 };
 const data=await make();
 const result=verifyReviewedImportData(data);
 assert.equal((result as any).origin,'local-reviewed-offline-revision');
 assert.equal(result.new_requests,0);assert.equal(result.requests_dispatched,1);
 for(const mutate of [
  (d:any)=>delete d.sourceOrigin,
  (d:any)=>delete d.offlineRevision,
  (d:any)=>d.offlineRevision.parentSha256='a'.repeat(64),
  (d:any)=>d.offlineRevision.sha256='a'.repeat(64),
  (d:any)=>d.offlineRevision.designSha256='a'.repeat(64),
  (d:any)=>d.offlineRevision.reason='',
  (d:any)=>{const p=JSON.parse(d.provider.content);p.brief.narration='Other.';d.provider.content=JSON.stringify(p);},
  (d:any)=>d.provider.content+=' trailing',
  (d:any)=>d.report.geometry.status='failed',
  (d:any)=>d.srt+='extra',
 ]){const d=await make();mutate(d);assert.throws(()=>verifyReviewedImportData(d));}
});
test('offline design revision binds retained parent design to historical dispatch',async()=>{
 const make=async()=>{
  const d:any=await fixture();
  d.sourceOrigin='local-reviewed-offline-revision';
  d.parentDesign=parseDesign({...d.design,thesis:'Original visual direction.'});
  d.dispatch.designSha256=designHash(d.parentDesign);
  d.offlineRevision={schemaVersion:'reviewed-offline-revision:1',parentSha256:sourceHash(d.artifact),sha256:d.approval,
   designSha256:designHash(d.design),parentDesignSha256:designHash(d.parentDesign),reason:'Approved visual-only design revision.'};
  return d;
 };
 assert.equal(verifyReviewedImportData(await make()).new_requests,0);
 for(const mutate of [
  (d:any)=>delete d.parentDesign,
  (d:any)=>d.offlineRevision.parentDesignSha256='a'.repeat(64),
  (d:any)=>d.dispatch.designSha256=designHash(d.design),
  (d:any)=>{d.parentDesign.cues[0].startFrame=1;d.offlineRevision.parentDesignSha256=designHash(d.parentDesign);d.dispatch.designSha256=designHash(d.parentDesign);},
  (d:any)=>delete d.offlineRevision.parentDesignSha256,
 ]){const d=await make();mutate(d);assert.throws(()=>verifyReviewedImportData(d));}
});
