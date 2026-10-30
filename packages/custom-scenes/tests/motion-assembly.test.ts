import test from 'node:test';
import assert from 'node:assert/strict';
import {parseMotionAssembly,assembleMotionScene,motionAssemblyHash} from '../src/motion-assembly';
import {checkMotionBindings} from '../src/motion-bindings';
import {parseArtifact,sourceHash} from '../src/contract';
import {typecheckSource} from '../src/files';
import {mkdtemp,readFile,writeFile,rm,readdir} from 'node:fs/promises';
import {execFileSync,spawnSync} from 'node:child_process';
import os from 'node:os';
import path from 'node:path';

function fixture():any{return {
 schemaVersion:'motion-assembly:1',
 brief:{schemaVersion:'custom-scene-brief:1',id:'motion-host',title:'Host assembly',narration:'A payload moves.',visualGoal:'One moving payload',facts:[],materials:[],width:1920,height:1080,fps:30,durationInFrames:60},
 plan:{schemaVersion:'motion-plan:1',durationInFrames:60,tracks:[
  {id:'payload',keys:[{frame:0,x:50,y:100,scale:1,opacity:1},{frame:59,x:450,y:100,scale:1,opacity:1}]},
  {id:'context',parentId:'payload',keys:[{frame:0,x:15,y:40,scale:1,opacity:1}]},
 ]},
 layers:[
  {id:'payload',artwork:[{tag:'path',attrs:{d:'M 0 0 H 100 V 150 H 0 Z',fill:'background',stroke:'accent',strokeWidth:2}},{tag:'text',attrs:{x:30,y:35,fill:'foreground',fontSize:28},text:'?'}]},
  {id:'context',artwork:[{tag:'rect',attrs:{x:0,y:0,width:70,height:35,fill:'secondary'}}]},
 ],
};}

test('host assembly creates sole SVG root and actual motion-bound groups',async()=>{
 const input=parseMotionAssembly(fixture());
 const artifact=await assembleMotionScene(input);
 assert.deepEqual(parseArtifact(artifact),artifact);
 checkMotionBindings(artifact.source,['payload','context']);
 assert.match(artifact.source,/const motion = motionTransforms\(plan, props.frame\)/);
 assert.match(artifact.source,/data-object="payload" transform=\{motion\["payload"\].transform\}/);
 assert.doesNotMatch(artifact.source,/<div/);
 await typecheckSource(artifact.source);
});

test('plan and artwork changes cannot reuse the original approval hash',async()=>{
 const v=fixture(),first=await assembleMotionScene(v);
 assert.equal(sourceHash(first),sourceHash(await assembleMotionScene(v)));
 const hash=motionAssemblyHash(v);v.plan.tracks[0].keys[1].x=451;
 assert.notEqual(motionAssemblyHash(v),hash);
 assert.notEqual(sourceHash(await assembleMotionScene(v)),sourceHash(first));
 v.layers[0].artwork[1].text='context';
 assert.notEqual(sourceHash(await assembleMotionScene(v)),sourceHash(first));
});

test('reject executable illustration, foreign identity and motion overrides',()=>{
 const mutations=[
  (v:any)=>v.source='export default function Scene(){}',
  (v:any)=>v.plan.durationInFrames=61,
  (v:any)=>v.layers.pop(),
  (v:any)=>v.layers[1].id='payload',
  (v:any)=>v.layers[0].id='other',
  (v:any)=>v.layers[0].artwork[0].attrs.transform='translate(900 900)',
  (v:any)=>v.layers[0].artwork[0].attrs.style={transform:'none'},
  (v:any)=>v.layers[0].artwork[0].attrs['data-object']='other',
  (v:any)=>v.layers[0].artwork[0].attrs.opacity=0,
  (v:any)=>v.layers[0].artwork[0].attrs.onClick='doSomething()',
  (v:any)=>v.layers[0].artwork[0].attrs.fill='url(https://example.com/x)',
  (v:any)=>v.layers[0].artwork[0].tag='image',
  (v:any)=>v.layers[0].artwork[0].tag='script',
  (v:any)=>v.layers[0].artwork[1].children=[{tag:'script',attrs:{}}],
  (v:any)=>v.layers[0].artwork[0].attrs.d='M 0 0; fetch()',
  (v:any)=>v.layers[0].artwork[0].attrs.strokeWidth=Infinity,
 ];
 for(const mutate of mutations){const v=fixture();mutate(v);assert.throws(()=>parseMotionAssembly(v),/motion_assembly/);}
});

test('copy input data, limit nesting, and require valid shape geometry',()=>{
 const v=fixture(),parsed=parseMotionAssembly(v);v.layers[0].artwork[0].attrs.d='changed';
 assert.notEqual(parsed.layers[0].artwork[0].attrs.d,'changed');
 for(const node of [
  {tag:'rect',attrs:{x:0,y:0,width:0,height:1}},
  {tag:'circle',attrs:{cx:0,cy:0,r:-1}},
  {tag:'text',attrs:{x:0,y:0},text:''},
  {tag:'path',attrs:{}},
 ]){const v=fixture();v.layers[0].artwork=[node];assert.throws(()=>parseMotionAssembly(v),/motion_assembly/);}
 let node:any={tag:'rect',attrs:{width:1,height:1}};
 for(let i=0;i<18;i++)node={tag:'g',attrs:{},children:[node]};
 v.layers[0].artwork=[node];assert.throws(()=>parseMotionAssembly(v),/motion_assembly/);
});

test('offline assembly CLI freezes input and provenance without executing source or overwriting outputs',async()=>{
 const dir=await mkdtemp(path.join(os.tmpdir(),'motion-host-cli-'));
 try{
  const input=path.join(dir,'input.json'),output=path.join(dir,'output.json');
  await writeFile(input,JSON.stringify(fixture()));
  const args=['--import','tsx','scripts/assemble-motion-scene.ts',input,output];
  const result=JSON.parse(execFileSync(process.execPath,args,{encoding:'utf8'}));
  const artifact=parseArtifact(JSON.parse(await readFile(output,'utf8')));
  const provenance=JSON.parse(await readFile(output+'.assembly-provenance.json','utf8'));
  const retained=JSON.parse(await readFile(output+'.assembly-input.json','utf8'));
  assert.equal(provenance.sourceSha256,sourceHash(artifact));
  assert.equal(provenance.inputSha256,motionAssemblyHash(retained));
  assert.equal(result.executed,false);assert.equal(provenance.accepted,false);
  assert.equal((await readdir(dir)).some(name=>/\.mp4$|\.png$/.test(name)),false);
  const repeated=spawnSync(process.execPath,args,{encoding:'utf8'});
  assert.notEqual(repeated.status,0);assert.match(repeated.stderr,/output_exists/);
  assert.equal(sourceHash(parseArtifact(JSON.parse(await readFile(output,'utf8')))),sourceHash(artifact));
 }finally{await rm(dir,{recursive:true,force:true});}
});
