import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,writeFile,readFile,rm} from 'node:fs/promises';
import path from 'node:path';
import {tmpdir} from 'node:os';
import {sourceHash,parseArtifact} from '../src/contract';
import {prepareAssembly,verifyAssembly,verifyAssemblyVideoMetadata,assemblyRenderTimeout} from '../src/assembly-files';

test('course render timeout scales with duration while remaining bounded',()=>{
 assert.equal(assemblyRenderTimeout(3082),600000);
 assert.equal(assemblyRenderTimeout(11743),1565734);
 assert.equal(assemblyRenderTimeout(28800),1800000);
 for(const n of [0,-1,NaN,Infinity,1.5])assert.throws(()=>assemblyRenderTimeout(n),/duration/);
});

test('video verification requires finite measured duration and both media streams',()=>{
 const metadata={format:{duration:'2.2'},streams:[{codec_type:'video',width:1920,height:1080},{codec_type:'audio'}]};
 assert.doesNotThrow(()=>verifyAssemblyVideoMetadata(metadata,66));
 for(const duration of [undefined,'N/A','',0,Infinity,-1,'2.5'])assert.throws(()=>verifyAssemblyVideoMetadata({...metadata,format:{duration}},66),/verification/);
 assert.throws(()=>verifyAssemblyVideoMetadata({...metadata,streams:[metadata.streams[0]]},66),/verification/);
});

async function fixture(){
 const root=await mkdtemp(path.join(tmpdir(),'assembly-files-'));
 const base=JSON.parse(await readFile('examples/custom-scenes/generated-context/design.json','utf8'));
 base.brief={...base.brief,narration:'测试配音。',durationInFrames:66};
 base.cues=[{id:'cue-1',text:'测试配音。',startFrame:0,endFrame:60}];
 base.beats=[{cueId:'cue-1',focus:base.objects[0].id,action:'保持主体',changes:[{objectId:base.objects[0].id,from:'可见',to:'可见'}]}];
 const artifact=parseArtifact({schemaVersion:'custom-scene:1',brief:base.brief,rationale:'fixture',source:'export default function Scene(){return <svg width="1920" height="1080"/>}'});
 await writeFile(path.join(root,'artifact.json'),JSON.stringify(artifact));
 await writeFile(path.join(root,'artifact.json.design.json'),JSON.stringify(base));
 await writeFile(path.join(root,'design.json'),JSON.stringify(base));
 const wav=Buffer.alloc(44+24000*2*2);wav.write('RIFF');wav.writeUInt32LE(wav.length-8,4);wav.write('WAVEfmt ',8);wav.writeUInt32LE(16,16);wav.writeUInt16LE(1,20);wav.writeUInt16LE(1,22);wav.writeUInt32LE(24000,24);wav.writeUInt32LE(48000,28);wav.writeUInt16LE(2,32);wav.writeUInt16LE(16,34);wav.write('data',36);wav.writeUInt32LE(wav.length-44,40);
 await writeFile(path.join(root,'voice.wav'),wav);
 await writeFile(path.join(root,'audio.json'),JSON.stringify({segments:[{chapter:'context',text:'测试配音。',audio:'voice.wav',start:42,duration:2,pauseAfter:.2}]}));
 const config={schemaVersion:'scene-assembly-input:1',audioManifest:'audio.json',chapters:[{chapter:'context',artifact:'artifact.json',design:'design.json',approval:sourceHash(artifact)}]};
 const file=path.join(root,'input.json');await writeFile(file,JSON.stringify(config));
 return {root,file,config};
}
test('assembly freezes media and source; changed files and output collisions fail',async()=>{
 const f=await fixture();try{
  const out=path.join(f.root,'frozen');await prepareAssembly(f.file,out);
  const verified=await verifyAssembly(out);assert.equal(verified.timeline.durationInFrames,66);assert.equal(verified.timeline.chapters[0].visual,'pending');
  await assert.rejects(prepareAssembly(f.file,out),/output_exists/);
  await writeFile(path.join(out,'scene-0.tsx'),'changed');await assert.rejects(verifyAssembly(out),/source|hash/);
 }finally{await rm(f.root,{recursive:true,force:true});}
});
test('assembly rejects changed media and incorrect source approval',async()=>{
 const f=await fixture();try{
  const out=path.join(f.root,'frozen');await prepareAssembly(f.file,out);
  await writeFile(path.join(out,'public','audio','0.wav'),'changed');await assert.rejects(verifyAssembly(out),/media|hash/);
  f.config.chapters[0].approval='0'.repeat(64);await writeFile(f.file,JSON.stringify(f.config));
  await assert.rejects(prepareAssembly(f.file,path.join(f.root,'bad')),/approval_required/);
 }finally{await rm(f.root,{recursive:true,force:true});}
});
test('non-adjacent chapters retain local cues while skipping unrelated global time',async()=>{
 const f=await fixture();try{
  await writeFile(path.join(f.root,'audio.json'),JSON.stringify({segments:[
   {chapter:'context',text:'测试配音。',audio:'voice.wav',start:42,duration:2,pauseAfter:.2},
   {chapter:'unused',text:'未选择。',audio:'not-copied.wav',start:44.2,duration:1,pauseAfter:.2},
   {chapter:'ending',text:'测试配音。',audio:'voice.wav',start:45.4,duration:2,pauseAfter:.2},
  ]}));
  f.config.chapters.push({...f.config.chapters[0],chapter:'ending'});await writeFile(f.file,JSON.stringify(f.config));
  const out=path.join(f.root,'frozen');await prepareAssembly(f.file,out);const {timeline}=await verifyAssembly(out);
  assert.deepEqual(timeline.chapters.map(c=>c.from),[0,66]);assert.equal(timeline.durationInFrames,132);
  const entry=path.join(out,'entry.tsx');await writeFile(entry,(await readFile(entry,'utf8'))+'\n// changed');await assert.rejects(verifyAssembly(out),/entry hash/);
 }finally{await rm(f.root,{recursive:true,force:true});}
});
test('frozen course manifest has its own bounded size budget above single-scene inputs',async()=>{
 const f=await fixture();try{
  const out=path.join(f.root,'frozen');await prepareAssembly(f.file,out);
  const file=path.join(out,'assembly.json'),json=await readFile(file,'utf8');
  await writeFile(file,json+' '.repeat(300000));
  assert.equal((await verifyAssembly(out)).timeline.durationInFrames,66);
  await writeFile(file,json+' '.repeat(2*1024*1024));
  await assert.rejects(verifyAssembly(out),/2 MiB/);
 }finally{await rm(f.root,{recursive:true,force:true});}
});
