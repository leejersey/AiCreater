import assert from 'node:assert/strict';
import {existsSync} from 'node:fs';
import test from 'node:test';
import {parseArtifact,sourceHash} from '../src/contract';
import {cuesFromManifest,parseDesign,designHash,type VisualReview} from '../src/design';
import type {AssemblyChapterInput} from '../src/assembly';

async function api(){
  assert.ok(existsSync(new URL('../src/assembly.ts',import.meta.url)),'assembly timeline is not implemented');
  return import('../src/assembly');
}
function manifest(){return {segments:[
  {chapter:'intro',text:'未选择的开头。',audio:'intro/1.mp3',start:20,duration:2,pauseAfter:1},
  {chapter:'loop',text:'思考。',audio:'loop/1.mp3',start:23,duration:1.01,pauseAfter:0.19},
  {chapter:'loop',text:'再执行。',audio:'loop/2.wav',start:24.2,duration:1.5,pauseAfter:0.5},
  {chapter:'unused',text:'未选择的中间章。',audio:'unused/1.mp3',start:26.2,duration:2,pauseAfter:1},
  {chapter:'context',text:'留下所需。',audio:'context/1.MP3',start:29.2,duration:1.1,pauseAfter:0.9},
]};}
function chapter(name:string,m=manifest()):AssemblyChapterInput {
  const track=cuesFromManifest(m,name);
  const artifact=parseArtifact({schemaVersion:'custom-scene:1',brief:{schemaVersion:'custom-scene-brief:1',id:name,title:name,
    narration:track.narration,visualGoal:'固定原稿与测量时序',facts:['只使用已测时序'],materials:[],width:1920,height:1080,fps:30,durationInFrames:track.durationInFrames},
    rationale:'原稿驱动',source:'export default function Scene(){return <svg/>}'});
  const design=parseDesign({schemaVersion:'visual-design:1',brief:artifact.brief,cues:track.cues,thesis:'已批准设计',metaphor:'循环任务',
    objects:[{id:'task',meaning:'当前任务',appearance:'任务纸片',x:300,y:300,width:200,height:200}],
    beats:track.cues.map(c=>({cueId:c.id,focus:'task',action:'执行状态变化',changes:[{objectId:'task',from:'准备',to:'完成'}]})),
    composition:'留出字幕安全区',palette:'blueprint',avoid:['改写原稿'],acceptance:['时序一致']});
  return {chapter:name,artifact,design,approval:sourceHash(artifact)};
}
function review(input:AssemblyChapterInput,verdict:'pass'|'revise'='pass'):VisualReview {
  const end=input.artifact.brief.durationInFrames-1;
  return {schemaVersion:'visual-review:1',sha256:sourceHash(input.artifact),designSha256:designHash(input.design),verdict,
    evidence:[{frame:0,observation:'开场可见'},{frame:Math.round(end/2),observation:'动作有因果'},{frame:end,observation:'结束状态稳定'}],feedback:'人工检查记录'};
}

test('selected chapters rebase globally, retain local cue/audio frames and chapter-tail pauses',async()=>{
  const {assembleTimeline}=await api();
  const a=chapter('loop'),b=chapter('context');a.review=review(a);
  const before=JSON.stringify({m:manifest(),a,b});
  const result=assembleTimeline(manifest(),[a,b]);
  assert.deepEqual([result.fps,result.width,result.height,result.durationInFrames],[30,1920,1080,156]);
  assert.deepEqual(result.chapters.map(c=>[c.chapter,c.from,c.durationInFrames,c.visual]),[['loop',0,96,'pass'],['context',96,60,'pending']]);
  assert.deepEqual(result.chapters[0].cues,a.design.cues);
  assert.deepEqual(result.chapters[0].audio,[
    {file:'loop/1.mp3',from:0,durationInFrames:31,durationSeconds:1.01},
    {file:'loop/2.wav',from:36,durationInFrames:45,durationSeconds:1.5},
  ]);
  assert.equal(result.chapters[1].audio[0].from,0);
  assert.equal(result.chapters[1].sha256,sourceHash(b.artifact));
  assert.equal(result.chapters[1].designSha256,designHash(b.design));
  assert.equal(JSON.stringify({m:manifest(),a,b}),before);
});

test('caller order controls assembly and unrelated chapters never leave global gaps',async()=>{
  const {assembleTimeline}=await api();
  const result=assembleTimeline(manifest(),[chapter('context'),chapter('loop')]);
  assert.deepEqual(result.chapters.map(c=>[c.chapter,c.from]),[['context',0],['loop',60]]);
  assert.equal(result.durationInFrames,156);
});

test('rejects empty, oversized, malformed and duplicate chapter inputs',async()=>{
  const {assembleTimeline}=await api();
  const a=chapter('loop');
  const bad:unknown[]=[null,{},[],[null],[{...a,chapter:'../loop'}],[{...a,chapter:''}],[{...a,extra:true}],
    [a,a],Array.from({length:21},(_,i)=>({...a,chapter:`c-${i}`}))];
  for(const inputs of bad)assert.throws(()=>assembleTimeline(manifest(),inputs as AssemblyChapterInput[]),/assembly/);
});

test('uses artifact validation and exact source/brief approval before assembly',async()=>{
  const {assembleTimeline}=await api();const a=chapter('loop');
  assert.throws(()=>assembleTimeline(manifest(),[{...a,approval:'yes'}]),/approval_required/);
  assert.throws(()=>assembleTimeline(manifest(),[{...a,artifact:{...a.artifact,source:a.artifact.source+'\n'}}]),/approval_required/);
  const bad={...a.artifact,source:'import fs from "node:fs";export default function Scene(){return null}'};
  assert.throws(()=>assembleTimeline(manifest(),[{...a,artifact:bad,approval:sourceHash(bad)}]),/custom_scene_source/);
});

test('rejects design cue drift, narration changes and different chapter duration',async()=>{
  const {assembleTimeline}=await api();const a=chapter('loop');
  assert.throws(()=>assembleTimeline(manifest(),[{...a,design:{...a.design,cues:[{...a.design.cues[0],endFrame:29},a.design.cues[1]]}}]),/cue_mismatch/);
  const m=manifest();m.segments[1].text='改写原稿。';
  assert.throws(()=>assembleTimeline(m,[a]),/narration|brief_mismatch/);
  const changed=manifest();changed.segments[2].pauseAfter=0.6;changed.segments[3].start+=0.1;changed.segments[4].start+=0.1;
  assert.throws(()=>assembleTimeline(changed,[a]),/duration|brief_mismatch/);
});

test('review must bind this source and this design; revise stays pending',async()=>{
  const {assembleTimeline}=await api();const a=chapter('loop'),b=chapter('context');
  assert.throws(()=>assembleTimeline(manifest(),[{...a,review:review(b)}]),/source_mismatch/);
  assert.throws(()=>assembleTimeline(manifest(),[{...a,review:{...review(a),designSha256:'0'.repeat(64)}}]),/design_mismatch/);
  assert.throws(()=>assembleTimeline(manifest(),[{...a,review:{...review(a),evidence:[]}}]),/visual_design/);
  assert.equal(assembleTimeline(manifest(),[{...a,review:review(a,'revise')}]).chapters[0].visual,'pending');
});

test('rejects unsafe media paths and accepts only relative MP3/WAV paths',async()=>{
  const {assembleTimeline}=await api();const a=chapter('loop');
  for(const audio of ['../x.mp3','a/../../x.wav','/x.mp3','C:/x.mp3','https://x/a.mp3','a\\b.mp3','a//b.mp3','./a.mp3',
    'a/./b.mp3','a/%2e%2e/b.mp3','a.mp3?x=1','a.mp3#x','a.mp4','a.mp3\n','a\u0000.mp3',' a.mp3','a/../b.mp3']) {
    const m=manifest();m.segments[1].audio=audio;
    assert.throws(()=>assembleTimeline(m,[a]),/audio.*path|media.*path/);
  }
});

test('validates unknown manifest structure, bounded segments and timestamps without coercion',async()=>{
  const {assembleTimeline}=await api();const a=chapter('loop');
  for(const m of [null,{},[],{segments:[]},{segments:[null]},{segments:Array(1001).fill(manifest().segments[0])}]) {
    assert.throws(()=>assembleTimeline(m,[a]),/assembly/);
  }
  for(const delta of [{start:'23'},{start:-1},{duration:0},{duration:NaN},{pauseAfter:-1},{pauseAfter:Infinity},{audio:undefined}]) {
    const m=manifest();Object.assign(m.segments[1],delta);
    assert.throws(()=>assembleTimeline(m,[a]),/assembly/);
  }
  assert.throws(()=>assembleTimeline(manifest(),[{...a,chapter:'missing'}]),/missing/);
});

test('pauseAfter must match the next global segment within floating-point tolerance',async()=>{
  const {assembleTimeline}=await api();const a=chapter('loop');
  for(const delta of [-0.1,0.1]) {
    const m=manifest();m.segments[1].pauseAfter+=delta;
    assert.throws(()=>assembleTimeline(m,[a]),/pause/);
  }
  const small=manifest();small.segments[0].pauseAfter+=1e-8;
  assert.doesNotThrow(()=>assembleTimeline(small,[a]));
  const tail=manifest();tail.segments[2].pauseAfter=0.8;
  assert.throws(()=>assembleTimeline(tail,[a]),/pause/);
});

test('rejects interleaved chapter rows instead of preserving an unrelated chapter inside local cues',async()=>{
  const {assembleTimeline}=await api();const m=manifest();m.segments[3].chapter='loop';
  m.segments[2].chapter='unused';
  assert.throws(()=>assembleTimeline(m,[chapter('loop')]),/contiguous|interleav/);
});

test('ceil audio duration cannot overlap the next clip after frame quantization',async()=>{
  const {assembleTimeline}=await api();
  const m={segments:[
    {chapter:'tight',text:'甲。',audio:'tight/a.wav',start:100,duration:1.01,pauseAfter:0},
    {chapter:'tight',text:'乙。',audio:'tight/b.wav',start:101.01,duration:1,pauseAfter:1},
  ]};
  assert.throws(()=>assembleTimeline(m,[chapter('tight',m)]),/audio.*overlap/);
});

test('ceil duration must fit chapter end; no clamping or speed changes',async()=>{
  const {assembleTimeline}=await api();
  const m={segments:[
    {chapter:'tail',text:'甲。',audio:'tail/a.wav',start:100,duration:1.02,pauseAfter:0},
    {chapter:'tail',text:'乙。',audio:'tail/b.wav',start:101.02,duration:1.005,pauseAfter:0},
  ]};
  assert.throws(()=>assembleTimeline(m,[chapter('tail',m)]),/audio.*chapter|audio.*end/);
});

test('audio ceil removes floating-point residue but retains genuine fractional frames',async()=>{
  const {assembleTimeline}=await api();
  for(const [duration,expected] of [[1.0000000000000002,30],[1.000001,31]]) {
    const m={segments:[{chapter:'float',text:'保持测量时长。',audio:'float/a.wav',start:0,duration,pauseAfter:0}]};
    const result=assembleTimeline(m,[chapter('float',m)]);
    assert.equal(result.chapters[0].audio[0].durationInFrames,expected);
    assert.equal(result.chapters[0].audio[0].durationSeconds,duration);
    assert.equal(result.durationInFrames,expected);
  }
});

test('SRT uses global cue frames, measured gaps and verbatim sentence text',async()=>{
  const {assembleTimeline,assemblySrt}=await api();
  const timeline=assembleTimeline(manifest(),[chapter('loop'),chapter('context')]);
  assert.equal(assemblySrt(timeline),[
    '1','00:00:00,000 --> 00:00:01,000','思考。','',
    '2','00:00:01,200 --> 00:00:02,700','再执行。','',
    '3','00:00:03,200 --> 00:00:04,300','留下所需。','',
  ].join('\n')+'\n');
});

test('SRT does not split long Chinese sentences or mutate timing records',async()=>{
  const {assembleTimeline,assemblySrt}=await api();
  const m=manifest();m.segments[4].text='这是应当由宿主按字符拆分而本模块必须完整保留的一条较长中文句段。';
  const timeline=assembleTimeline(m,[chapter('context',m)]),saved=JSON.stringify(timeline);
  const srt=assemblySrt(timeline);
  assert.ok(srt.includes(m.segments[4].text));assert.equal((srt.match(/ --> /g)||[]).length,1);
  assert.equal(JSON.stringify(timeline),saved);
});

test('SRT rounds frame timestamps to milliseconds with correct minute/hour carry',async()=>{
  const {assembleTimeline,assemblySrt}=await api();
  const timeline=assembleTimeline(manifest(),[chapter('context')]);
  timeline.chapters[0].from=108000+1799;timeline.durationInFrames=timeline.chapters[0].from+60;
  assert.match(assemblySrt(timeline),/01:00:59,967 --> 01:01:01,067/);
});
