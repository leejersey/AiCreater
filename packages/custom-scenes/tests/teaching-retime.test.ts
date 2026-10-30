import test from 'node:test';
import assert from 'node:assert/strict';
import {freezeTeachingScene,validateTeachingArtifact} from '../src/teaching-artifact';
import {retimeTeachingScene} from '../src/teaching-retime';
import {teachingBrief as brief,teachingCues as cues,teachingExample} from './fixtures/teaching-examples';

test('six structures recompile measured cue times without changing semantic content',async()=>{
 for(const structure of ['flow','loop','comparison','filter','composition','state-change'] as const){
  const source=await freezeTeachingScene(teachingExample(structure),brief,cues);
  const target={...brief,durationInFrames:240},track=cues.map(c=>({...c,startFrame:c.startFrame*2,endFrame:c.endFrame*2}));
  const result=await retimeTeachingScene(source,source.artifactSha256,target,track);
  assert.equal(result.modelCalls,0);assert.equal(result.accepted,false);
  assert.equal(result.sourceArtifactSha256,source.artifactSha256);
  assert.notEqual(result.artifact.artifactSha256,source.artifactSha256);
  assert.deepEqual(result.artifact.compiled.plan,{...source.compiled.plan,inputSha256:result.artifact.compiled.plan.inputSha256});
  assert.deepEqual(result.artifact.cues,track);
  await validateTeachingArtifact(result.artifact,result.artifact.artifactSha256);
 }
});

test('retiming rejects changed meaning, cue identity/text, bad provenance and insufficient action time',async()=>{
 const source=await freezeTeachingScene(teachingExample('flow'),brief,cues);
 for(const [target,track] of [
  [{...brief,title:'Different'},cues],
  [brief,cues.map((c,i)=>i?c:{...c,id:'new'})],
  [brief,cues.map((c,i)=>i?c:{...c,text:'Altered.'})],
  [brief,cues.map((c,i)=>i?c:{...c,endFrame:c.startFrame+1})],
 ] as const)await assert.rejects(retimeTeachingScene(source,source.artifactSha256,target,track));
 await assert.rejects(retimeTeachingScene(source,'0'.repeat(64),brief,cues));
});
