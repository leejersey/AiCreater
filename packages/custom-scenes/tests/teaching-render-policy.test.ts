import test from 'node:test';
import assert from 'node:assert/strict';
import {freezeTeachingScene} from '../src/teaching-artifact';
import {summarizeTeachingRender,recordTeachingAudit,assertTeachingMedia} from '../src/teaching-render-policy';
import {teachingBrief as brief,teachingCues as cues,teachingExample} from './fixtures/teaching-examples';
import {expectedTeachingForeground} from '../src/teaching-scene-audit';

test('zero checks cannot produce a passing report and raw failed findings stay failed',async()=>{
 const artifact=await freezeTeachingScene(teachingExample('comparison'),brief,cues);
 const empty=summarizeTeachingRender(artifact,{},[0,59,119]);assert.equal(empty.status,'failed');assert.ok(empty.missingFrames.length===3);
 const audits:any={0:{frame:0,status:'failed',issues:[{kind:'label-occluded',target:'label',detail:'blocked'}],movers:0,routes:0}};
 const result=summarizeTeachingRender(artifact,audits,[0]);assert.equal(result.status,'failed');assert.equal(result.frames[0].issues[0].kind,'label-occluded');assert.equal(result.accepted,false);
});
test('nonfinite or missing media timings cannot satisfy integrity checks',()=>{
 const media={format:{duration:'4.000000'},streams:[{codec_type:'video',codec_name:'h264',width:1920,height:1080,r_frame_rate:'30/1',nb_read_frames:'120',start_time:'0.000000'}]};
 assert.doesNotThrow(()=>assertTeachingMedia(media,120));
 for(const value of ['NaN',undefined,'garbage','Infinity',null,'']){
  assert.throws(()=>assertTeachingMedia({...media,format:{duration:value}},120),/integrity/);
  assert.throws(()=>assertTeachingMedia({...media,streams:[{...media.streams[0],start_time:value}]},120),/integrity/);
 }
});
test('later logs cannot erase a raw failed finding even if its status field said passed',()=>{
 const frames:any={};
 const original:any={frame:3,status:'passed',issues:[{kind:'label-overlap',target:'label',detail:'retained'}],labels:1,solids:1,routes:0,movers:0,occlusionChecks:0};
 recordTeachingAudit(frames,original);
 recordTeachingAudit(frames,{...original,issues:[]});
 assert.equal(frames[3].issues.length,1);assert.equal(frames[3].issues[0].detail,'retained');
});
test('motion coverage is required exactly when transport is active, not fabricated for static comparisons',async()=>{
 const loop=await freezeTeachingScene(teachingExample('loop'),brief,cues);
 const audit:any={6:{frame:6,status:'passed',issues:[],movers:0,routes:0}};
 assert.equal(summarizeTeachingRender(loop,audit,[6]).status,'failed');
 const comparison=await freezeTeachingScene(teachingExample('comparison'),brief,cues);
 const complete={...audit[6],labels:comparison.compiled.objects.reduce((n,o)=>n+o.asset.text.lines.length,0),solids:comparison.compiled.objects.reduce((n,o)=>n+o.asset.solids.length,0),foreground:expectedTeachingForeground(comparison,6).length};
 assert.equal(summarizeTeachingRender(comparison,{6:complete},[6]).status,'passed');
 assert.equal(summarizeTeachingRender(comparison,{6:{...complete,foreground:0}},[6]).status,'failed');
});
