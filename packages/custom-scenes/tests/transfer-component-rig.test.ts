import test from 'node:test';
import assert from 'node:assert/strict';
import {parseDesign,designHash} from '../src/design';
import {bindTransferComponents,transferAsset} from '../src/transfer-component-rig';
import {evaluateMotion} from '../src/motion-plan';
import {parseMotionAssembly} from '../src/motion-assembly';
import {prepareTransferCandidate,verifyTransferCandidate} from '../src/transfer-candidate';
import {mkdtemp,readFile,writeFile,rm,stat,realpath} from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import {sourceHash,parseArtifact} from '../src/contract';
import {spawnSync} from 'node:child_process';
import {randomUUID,createHash} from 'node:crypto';
import {repositoryRoot} from '../src/files';
import {parseVisualJobs,visualGenerationActions} from '../../../apps/web/lib/visual-workbench';
import {previewTransferWorkbench} from '../src/workbench';
import {mkdir} from 'node:fs/promises';

function fixture(){
 const cues=[{id:'pick-a',text:'A',startFrame:6,endFrame:50},{id:'drop-a',text:'B',startFrame:60,endFrame:120},
  {id:'pick-b',text:'C',startFrame:130,endFrame:170},{id:'drop-b',text:'D',startFrame:180,endFrame:230},{id:'feed',text:'E',startFrame:243,endFrame:424}];
 const objects=[
  {id:'beam',meaning:'横梁',appearance:'fixed beam',x:100,y:50,width:1600,height:40},
  {id:'head',meaning:'夹爪',appearance:'independent pickup head',x:482,y:210,width:120,height:100},
  {id:'paper-a',meaning:'相关代码',appearance:'paper',x:500,y:470,width:84,height:80},
  {id:'paper-b',meaning:'当前任务',appearance:'paper',x:616,y:470,width:84,height:80},
  {id:'sleeve',meaning:'提示袋',appearance:'sleeve',x:900,y:500,width:300,height:280},
  {id:'engine',meaning:'生成器',appearance:'open inlet processor',x:1550,y:400,width:350,height:500},
 ];
 const design=parseDesign({schemaVersion:'visual-design:1',brief:{schemaVersion:'custom-scene-brief:1',id:'rig-test',title:'Transfer',narration:'ABCDE',visualGoal:'Separate beam and head',facts:[],materials:[],width:1920,height:1080,fps:30,durationInFrames:500},
  cues,objects,beats:cues.map(c=>({cueId:c.id,focus:'head',action:'transfer',changes:[{objectId:'head',from:'waiting',to:'moving'}]})),thesis:'Transfer evidence',metaphor:'Machine',composition:'Open',palette:'blueprint',avoid:['cards'],acceptance:['distinct identity']});
 const roles={beamId:'beam',carrierId:'head',sleeveId:'sleeve',receiverId:'engine',payloadIds:['paper-a','paper-b'],
  stages:{transfers:[{payloadId:'paper-a',pickup:'pick-a',handoff:'drop-a'},{payloadId:'paper-b',pickup:'pick-b',handoff:'drop-b'}],feed:'feed'}};
 return {design,roles};
}

test('host artwork and ports share dimensions including strokes and a real open inlet',()=>{
 const head=transferAsset('head',120,100,'夹爪');
 assert.equal(head.contact!.x,60);assert.equal(head.contact!.y,98);assert.equal(head.jawWidth,84);
 assert.deepEqual(head.bounds,{x:0,y:0,width:120,height:100});
 assert.ok(head.artwork.every(n=>n.tag!=='text'));
 const sleeve=transferAsset('sleeve',300,280,'提示袋');assert.ok(sleeve.pocket!.height<280*.78);
 assert.throws(()=>transferAsset('head',10,100,'夹爪'),/dimensions/);
 assert.throws(()=>transferAsset('document',84,80,'WWWWWWWWWW'),/label does not fit/);
 assert.throws(()=>transferAsset('document',84,80,'a\u0301'),/label/);
});

test('binds every frozen object to actual host artwork, conservative geometry and original measured cues',()=>{
 const {design,roles}=fixture(),before=JSON.stringify(design),result=bindTransferComponents(design,roles);
 assert.equal(result.designSha256,designHash(design));assert.equal(JSON.stringify(design),before);
 assert.equal(result.accepted,false);assert.equal(result.rig.schemaVersion,'host-transfer:2');
 assert.deepEqual(result.rig.cues,design.cues.map(({id,startFrame,endFrame})=>({id,startFrame,endFrame})));
 assert.deepEqual(parseMotionAssembly(result.assembly),result.assembly);
 assert.deepEqual(new Set(result.assembly.layers.map(l=>l.id)),new Set(design.objects.map(o=>o.id)));
 const start=evaluateMotion(result.assembly.plan,0),end=evaluateMotion(result.assembly.plan,423);
 assert.equal(start.head.x,482);assert.equal(start.head.y,210);
 assert.deepEqual(start.beam,end.beam);assert.equal(end.sleeve.x,1550);
 assert.equal(end['paper-b'].x-end['paper-a'].x,116);
 const walls=result.assembly.layers.find(l=>l.id==='engine')!.artwork.filter(n=>n.tag==='rect');
 const channel=result.rig.receiver.channel;
 for(const wall of walls){
  const a=wall.attrs,y=400+Number(a.y),bottom=y+Number(a.height);
  assert.ok(bottom+Number(a.strokeWidth)/2<=channel.y||y-Number(a.strokeWidth)/2>=channel.y+channel.height);
 }
 assert.ok(result.assembly.audit!.obstacles.some(o=>o.layerId==='beam'));
});

test('never silently splits old objects, moves the frozen initial head, drops extras or accepts role aliases',()=>{
 const {design,roles}=fixture();
 assert.throws(()=>bindTransferComponents(design,{...roles,beamId:'head'}),/role/);
 assert.throws(()=>bindTransferComponents({...design,objects:design.objects.map(o=>o.id==='head'?{...o,x:o.x+1}:o)},roles),/initial head/);
 assert.throws(()=>bindTransferComponents({...design,objects:[...design.objects,{...design.objects[0],id:'extra'}]},roles),/unbound/);
 assert.throws(()=>bindTransferComponents(design,{...roles,carrierId:'retriever-arm'}),/role/);
 assert.throws(()=>bindTransferComponents(design,{...roles,source:'bad'} as any),/role/);
});

test('offline candidate preserves source/design binding and cannot overwrite an existing directory',async()=>{
 const root=await mkdtemp(path.join(os.tmpdir(),'transfer-candidate-'));
 try{
  let directory=path.join(root,'candidate');
  const input=fixture(),result=await prepareTransferCandidate(input,directory);
  assert.equal(result.accepted,false);assert.equal(result.requests_dispatched,0);assert.equal(result.execution,'not_run');
  const artifact=parseArtifact(JSON.parse(await readFile(path.join(directory,'candidate.json'),'utf8')));
  assert.equal(sourceHash(artifact),result.source_sha256);assert.equal(designHash(input.design),result.design_sha256);
  const jobFile=path.join(root,'job.json');await writeFile(jobFile,JSON.stringify({id:'j',project_id:'p',scene_id:'s',kind:'prepare-transfer',state:'succeeded',stage:'done',error:null,input:{brief:input.design.brief,design:input.design}}));
  const code='import json,sys;from pathlib import Path;from services.visual.worker import publishable_result;from services.visual.store import VisualJobs;job=json.loads(Path(sys.argv[2]).read_text());result=publishable_result(job,Path(sys.argv[1]));print(json.dumps({"jobs":[VisualJobs._public({**job,"result":result})]}))';
  const publish=()=>spawnSync(path.join(repositoryRoot,'.venv/bin/python'),['-c',code,directory,jobFile],{cwd:repositoryRoot,env:{PATH:path.dirname(process.execPath)+':'+process.env.PATH,HOME:process.env.HOME,NODE_ENV:'test'},encoding:'utf8',timeout:30000});
  directory=await realpath(directory);
  const publication=publish();
  assert.ifError(publication.error);assert.equal(publication.status,0,publication.stderr);
  const [publicJob]=parseVisualJobs(JSON.parse(publication.stdout),'p');
  assert.equal(publicJob.result?.sha256,result.source_sha256);assert.equal(publicJob.result?.requests_dispatched,0);
  assert.deepEqual(visualGenerationActions(publicJob),{review:false,repair:false});
  for(const key of ['design_sha256','assembly_sha256','binding_sha256']){
   await writeFile(path.join(directory,'result.json'),JSON.stringify({...result,[key]:'0'.repeat(64)}));
   await assert.rejects(verifyTransferCandidate(directory),/binding mismatch/);
  }
  assert.notEqual(publish().status,0);
  await writeFile(path.join(directory,'result.json'),JSON.stringify(result));
  assert.equal((await verifyTransferCandidate(directory)).source_sha256,result.source_sha256);
  assert.match(artifact.source,/data-object="beam"/);assert.match(artifact.source,/data-object="head"/);
  await assert.rejects(prepareTransferCandidate(input,directory),/EEXIST/);
  assert.equal(sourceHash(parseArtifact(JSON.parse(await readFile(path.join(directory,'candidate.json'),'utf8')))),result.source_sha256);
  await assert.rejects(stat(path.join(directory,'artifact.json')),/ENOENT/);
  await assert.rejects(prepareTransferCandidate({...input,execute:true} as any,path.join(root,'bad')),/unexpected input/);
  await assert.rejects(stat(path.join(root,'bad')),/ENOENT/);
 }finally{await rm(root,{recursive:true,force:true});}
});

test('workbench CLI exposes preparation only and keeps existing preview from adopting the candidate',async()=>{
 const root=await mkdtemp(path.join(os.tmpdir(),'transfer-cli-')),directory=path.join(repositoryRoot,'output/visual-workbench',randomUUID());
 try{
  const input=path.join(root,'input.json');await writeFile(input,JSON.stringify(fixture()));
  const run=(command:string,input:string,output:string)=>spawnSync(process.execPath,[path.join(repositoryRoot,'node_modules/tsx/dist/cli.mjs'),path.join(repositoryRoot,'scripts/visual-workbench.ts'),command,input,output],{cwd:repositoryRoot,env:{PATH:process.env.PATH,HOME:process.env.HOME,NODE_ENV:'test'},encoding:'utf8',timeout:30000});
  const child=run('prepare-transfer',input,directory);assert.ifError(child.error);assert.equal(child.status,0,child.stderr);
  assert.deepEqual(JSON.parse(child.stdout),{status:'prepared',execution:'not_run'});
  const record=JSON.parse(await readFile(path.join(directory,'result.json'),'utf8'));
  assert.equal(record.requests_dispatched,0);assert.equal(record.production_adopted,false);
  const previewInput=path.join(root,'preview.json'),previewOutput=path.join(repositoryRoot,'output/visual-workbench',randomUUID());
  await writeFile(previewInput,JSON.stringify({generation_directory:directory,sha256:record.source_sha256,scene:{},audio_file:'absent'}));
  const preview=run('preview',previewInput,previewOutput);assert.equal(preview.status,1);assert.doesNotMatch(preview.stdout,/succeeded/);
  await assert.rejects(stat(path.join(previewOutput,'video.mp4')),/ENOENT/);
  await rm(previewOutput,{recursive:true,force:true});
 }finally{await rm(root,{recursive:true,force:true});await rm(directory,{recursive:true,force:true});}
});

test('transfer diagnostic approval gates all execution callbacks and keeps provenance without production adoption',async()=>{
 const root=await mkdtemp(path.join(os.tmpdir(),'transfer-preview-'));
 try{
  const input=fixture(),generation=path.join(root,'generation'),record=await prepareTransferCandidate(input,generation);
  const audio=path.join(root,'voice.wav');await writeFile(audio,'fixture bytes; no audio is decoded');
  const chapter={generation_directory:await realpath(generation),sha256:record.source_sha256,audio_file:audio,
   design_sha256:record.design_sha256,assembly_sha256:record.assembly_sha256,binding_sha256:record.binding_sha256,
   audio_sha256:createHash('sha256').update(await readFile(audio)).digest('hex'),
   scene:{duration_frames:500,narration:{text:'ABCDE',audio_start_frame:6},captions:input.design.cues.map(c=>({text:c.text,start_frame:c.startFrame,end_frame:c.endFrame}))}};
  let stills=0,renders=0,passed=false;
  const deps={stills:async(_artifact:string,output:string,sha:string)=>{
   stills++;await mkdir(output);await writeFile(path.join(output,'frame-0.png'),'mock still, not a rendered scene');
   await writeFile(path.join(output,'report.json'),JSON.stringify({sha256:sha,designSha256:record.design_sha256,geometry:{status:passed?'passed':'failed'},frames:['frame-0.png']}));
  },render:async(_manifest:unknown,output:string)=>{renders++;await writeFile(path.join(output,'video.mp4'),'mock media, not a rendered scene');}};
  await assert.rejects(previewTransferWorkbench({...chapter,sha256:'0'.repeat(64)},path.join(root,'bad'),deps),/approval_required/);
  assert.equal(stills,0);assert.equal(renders,0);await assert.rejects(stat(path.join(root,'bad')),/ENOENT/);
  const changed=path.join(root,'changed');
  const changedRecord=await prepareTransferCandidate({...input,design:{...input.design,thesis:'Changed thesis, identical scene source'}},changed);
  assert.equal(changedRecord.source_sha256,record.source_sha256);assert.notEqual(changedRecord.design_sha256,record.design_sha256);
  await assert.rejects(previewTransferWorkbench({...chapter,generation_directory:await realpath(changed)},path.join(root,'stale'),deps),/snapshot mismatch/);
  assert.equal(stills,0);assert.equal(renders,0);
  const output=path.join(root,'preview'),result=await previewTransferWorkbench(chapter,output,deps);
  assert.equal(stills,1);assert.equal(renders,0);assert.equal(result.geometry.status,'failed');
  assert.equal(result.diagnostic,true);assert.equal(result.production_adopted,false);assert.equal(result.requests_dispatched,0);
  assert.equal(result.binding_sha256,record.binding_sha256);assert.equal(result.video,undefined);
  const approval=JSON.parse(await readFile(path.join(output,'approval.json'),'utf8'));
  assert.equal(approval.sha256,record.source_sha256);assert.equal(approval.scope,'diagnostic-preview-only');
  passed=true;
  const success=await previewTransferWorkbench(chapter,path.join(root,'passed'),deps);
  assert.equal(stills,2);assert.equal(renders,1);assert.equal(success.video,'video.mp4');assert.equal(success.srt,'video.srt');
  assert.equal(success.diagnostic,true);assert.equal(success.production_adopted,false);
  await writeFile(audio,'replaced audio');
  await assert.rejects(previewTransferWorkbench(chapter,path.join(root,'audio-changed'),deps),/audio checksum mismatch/);
  assert.equal(stills,2);assert.equal(renders,1);
 }finally{await rm(root,{recursive:true,force:true});}
});
