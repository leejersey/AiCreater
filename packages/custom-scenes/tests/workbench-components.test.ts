import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,readFile,writeFile,rm,mkdir,unlink} from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {generateWorkbench,previewWorkbench,exportWorkbench} from '../src/workbench';
import {parseDesign,designHash} from '../src/design';
import {designInputHash} from '../src/design-content';
import type {ModelOptions} from '../src/contract';

const brief={schemaVersion:'custom-scene-brief:1',id:'components-test',title:'Move',narration:'Move.',visualGoal:'Move a document',facts:[],materials:[],width:1920,height:1080,fps:30,durationInFrames:60};
const cues=[{id:'cue',text:'Move.',startFrame:6,endFrame:54}];
const raw={schemaVersion:'visual-design:1',brief,cues,thesis:'Move',metaphor:'Paper',objects:[{id:'file',meaning:'input',appearance:'document',x:100,y:100,width:100,height:140,kind:'solid',states:[{id:'shown',appearance:'visible'}]}],beats:[{cueId:'cue',focus:'file',action:'move',changes:[{objectId:'file',from:'left',to:'right',fromState:'shown',toState:'shown'}]}],composition:'Open',palette:'blueprint',avoid:['cards'],acceptance:['same object'],overlaps:[]};
const design=parseDesign(raw);
function content(d=design){const {schemaVersion,brief,cues,...visual}=d;return {...visual,schemaVersion:'visual-design-content:1',inputSha256:designInputHash(brief,cues)};}
const data=()=>({schemaVersion:'component-motion-data:1',designSha256:designHash(design),anchors:[{id:'home',pose:{x:100,y:100,scale:1,opacity:1}},{id:'end',pose:{x:300,y:100,scale:1,opacity:1}}],objects:[{id:'file',initialAnchor:'home',actions:[{kind:'move',startFrame:6,endFrame:54,targetAnchor:'end'}],component:'document',label:'代码'}],audit:{routes:[],obstacles:[]}});
const read=async(root:string,name:string)=>JSON.parse(await readFile(path.join(root,name),'utf8'));
async function fixture(fn:(root:string)=>Promise<void>){const root=await mkdtemp(path.join(os.tmpdir(),'workbench-components-'));try{await fn(root);}finally{await rm(root,{recursive:true,force:true});}}
async function recorded(value:unknown,options:ModelOptions){await options.onResponse?.({content:JSON.stringify(value),finishReason:'stop'});return value;}

test('optional component mode freezes raw provenance and repairs in one request without execution',()=>fixture(async root=>{
 let calls=0;const first=path.join(root,'first');
 const result=await generateWorkbench({brief,cues,generation_mode:'host-components'},first,{request:async(prompt,options)=>{
  assert.doesNotMatch(prompt,/SOURCE_ART_DIRECTION|SOURCE_ART_CONSTRUCTION_ATLAS/);
  if(++calls===1){assert.equal(options.outputSchema?.name,'visual_design_content_v1');assert.match(prompt,/HOST_COMPONENT_CATALOG/);return recorded(content(),options);}
  assert.equal(options.outputSchema?.name,'component_motion_data_v1');assert.equal(options.maxTokens,8192);
  assert.doesNotMatch(JSON.stringify(options.outputSchema),/\$ref|"artwork"/);
  assert.match(prompt,/host draws every component/i);assert.match(prompt,/COMPONENT_GEOMETRY/);assert.match(prompt,/0\.95\*h/);return recorded(data(),options);
 }});
 assert.equal(calls,2);assert.equal(result.generation_mode,'host-components');
 await assert.rejects(readFile(path.join(first,'art-direction.json')),/ENOENT/);
 assert.equal(result.intent_sha256,createHash('sha256').update(JSON.stringify(data())).digest('hex'));
 assert.deepEqual(await read(first,'frozen-intent.json'),data());
 assert.ok((await read(first,'frozen-assembly.json')).layers[0].artwork.length>=6);
 let repairs=0;const repaired=await generateWorkbench({previous_directory:first,feedback:'Keep the label readable'},path.join(root,'repair'),{request:async(prompt,options)=>{
  repairs++;assert.match(prompt,/PREVIOUS_COMPONENT_DATA/);assert.match(prompt,/Keep the label readable/);return recorded(data(),options);
 }});
 assert.equal(repairs,1);assert.equal(repaired.generation_mode,'host-components');
 const changed=data();changed.anchors.push({id:'unused',pose:{x:999,y:100,scale:1,opacity:1}});
 await writeFile(path.join(first,'frozen-intent.json'),JSON.stringify(changed));
 await assert.rejects(generateWorkbench({previous_directory:first,feedback:'fix'},path.join(root,'tamper'),{request:async()=>{throw Error('must not dispatch');}}),/intent hash mismatch/);
}));

test('component mode rejects old envelopes and retains failed design for bounded repair',()=>fixture(async root=>{
 let calls=0;const first=path.join(root,'bad');
 await assert.rejects(generateWorkbench({brief,cues,generation_mode:'host-components'},first,{request:async(_p,options)=>recorded(++calls===1?content():{...data(),schemaVersion:'object-motion-data:1'},options)}),/component_motion/);
 assert.equal(calls,2);assert.equal((await read(first,'failure.json')).requests_dispatched,2);
 let repairs=0;const repaired=await generateWorkbench({previous_directory:first,feedback:'Use component envelope'},path.join(root,'fixed'),{request:async(_p,options)=>{repairs++;return recorded(data(),options);}});
 assert.equal(repairs,1);assert.equal(repaired.requests_dispatched,1);
 await writeFile(path.join(root,'fixed/generation-mode.json'),JSON.stringify({generation_mode:'host-intent'}));
 await assert.rejects(generateWorkbench({previous_directory:path.join(root,'fixed'),feedback:'fix'},path.join(root,'wrong-mode'),{request:async()=>{throw Error('must not dispatch');}}),/assembly generation mode mismatch/);
}));

test('route preflight blocks assembly source and does not dispatch automatic retry',()=>fixture(async root=>{
 const two=parseDesign({...raw,objects:[...raw.objects,{id:'road',meaning:'rail',appearance:'line',x:400,y:100,width:200,height:40,kind:'path',states:[{id:'shown',appearance:'visible'}]}]});
 const value:any=data();value.designSha256=designHash(two);value.objects.push({id:'road',component:'route',label:'',initialAnchor:'road-home',actions:[]});
 value.anchors.push({id:'road-home',pose:{x:450,y:500,scale:1,opacity:1}});
 value.audit.routes=[{id:'rail',layerId:'road',nodePath:[0],followers:[{objectId:'file',startFrame:6,endFrame:54}]}];
 let calls=0;const out=path.join(root,'off-route');
 await assert.rejects(generateWorkbench({brief,cues,generation_mode:'host-components'},out,{request:async(_p,options)=>recorded(++calls===1?content(two):value,options)}),/component_route_preflight/);
 assert.equal(calls,2);await assert.rejects(readFile(path.join(out,'artifact.json')),/ENOENT/);
 assert.deepEqual(JSON.parse((await read(out,'provider-2.json')).content),value);
}));

test('preview approval still precedes any source execution for component mode',()=>fixture(async root=>{
 let calls=0;const first=path.join(root,'first');
 await generateWorkbench({brief,cues,generation_mode:'host-components'},first,{request:async(_p,options)=>recorded(++calls===1?content():data(),options)});
 let executions=0;
 await assert.rejects(previewWorkbench({generation_directory:first,sha256:'0'.repeat(64),scene:{duration_frames:60,narration:{text:'Move.',audio_start_frame:6},captions:[{text:'Move.',start_frame:6,end_frame:54}]},audio_file:'unused'},path.join(root,'preview'),{stills:async()=>{executions++;},render:async()=>{executions++;}}),/approval_required/);
 assert.equal(executions,0);
}));

test('component preview and export preserve verified data binding with renderer stubs only',()=>fixture(async root=>{
 let calls=0;const first=path.join(root,'first');
 const generated=await generateWorkbench({brief,cues,generation_mode:'host-components'},first,{request:async(_p,options)=>recorded(++calls===1?content():data(),options)});
 const audio=path.join(root,'audio.wav');await writeFile(audio,'test audio bytes, not rendered');
 const chapter={generation_directory:first,sha256:generated.sha256,scene:{duration_frames:60,narration:{text:'Move.',audio_start_frame:6},captions:[{text:'Move.',start_frame:6,end_frame:54}]},audio_file:audio};
 let renders=0;
 const result=await previewWorkbench(chapter,path.join(root,'preview'),{
  stills:async(_artifact,out,hash)=>{await mkdir(out);await writeFile(path.join(out,'frame-0.png'),'stub');await writeFile(path.join(out,'report.json'),JSON.stringify({sha256:hash,designSha256:designHash(design),geometry:{status:'passed'},frames:['frame-0.png']}));},
  render:async manifest=>{renders++;assert.equal(manifest.chapters[0].sha256,generated.sha256);assert.equal(manifest.chapters[0].scene.narration.audio_start_frame,6);},
 });
 assert.equal(result.video,'video.mp4');assert.equal(renders,1);
 await exportWorkbench({chapters:[chapter]},path.join(root,'export'),{render:async()=>{renders++;}});
 assert.equal(renders,2);
 await unlink(path.join(first,'design-origin.json'));
 await assert.rejects(previewWorkbench(chapter,path.join(root,'missing-lineage'),{stills:async()=>{throw Error('must not render');}}),/design origin missing/);
}));
