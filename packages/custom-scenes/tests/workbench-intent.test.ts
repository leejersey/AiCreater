import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,readFile,writeFile,rm,unlink,symlink} from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import Ajv from 'ajv';
import {parseDesign,designHash} from '../src/design';
import {generateWorkbench} from '../src/workbench';
import {buildIntentOutputSchema,buildIntentPrompt,parseIntentAssembly,intentHash} from '../src/motion-intent-output';
import {designInputHash} from '../src/design-content';
import {buildObjectMotionSchema,storedIntentHash} from '../src/object-motion-output';

const brief={schemaVersion:'custom-scene-brief:1',id:'intent-test',title:'Intent',narration:'Move.',visualGoal:'Show movement',facts:[],materials:[],width:1920,height:1080,fps:30,durationInFrames:60};
const cues=[{id:'cue',text:'Move.',startFrame:6,endFrame:54}];
const rawDesign={schemaVersion:'visual-design:1',brief,cues,thesis:'Move',metaphor:'Object',objects:[{id:'object',meaning:'thing',appearance:'circle',x:100,y:100,width:100,height:100,kind:'solid',states:[{id:'shown',appearance:'visible'}]}],beats:[{cueId:'cue',focus:'object',action:'move',changes:[{objectId:'object',from:'left',to:'right',fromState:'shown',toState:'shown'}]}],composition:'Open',palette:'blueprint',avoid:['cards'],acceptance:['visible'],overlaps:[]};
const {brief:hostBrief,cues:hostCues,schemaVersion:fullVersion,...visual}=rawDesign;
const providerDesign={...visual,schemaVersion:'visual-design-content:1',inputSha256:designInputHash(brief as any,cues)};
const design=parseDesign(rawDesign);
const pose=(x:number)=>({x,y:100,scale:1,opacity:1});
const legacyResponse=()=>({schemaVersion:'motion-intent-assembly:1',brief,intent:{schemaVersion:'motion-intent:1',durationInFrames:60,anchors:[{id:'home',pose:pose(100)},{id:'end',pose:pose(300)}],objects:[{id:'object',initialAnchor:'home',actions:[{kind:'move',startFrame:6,endFrame:54,targetAnchor:'end'}]}]},layers:[{id:'object',artwork:[{tag:'circle',attrs:{r:30,fill:'accent'}}]}],audit:{routes:[],obstacles:[]}});
const response=()=>{const v=legacyResponse();return {schemaVersion:'object-motion-data:1',designSha256:designHash(design),anchors:v.intent.anchors,objects:v.intent.objects.map((o,i)=>({...o,artwork:v.layers[i].artwork})),audit:v.audit};};
async function fixture(fn:(root:string)=>Promise<void>){const root=await mkdtemp(path.join(os.tmpdir(),'workbench-intent-'));try{await fn(root);}finally{await rm(root,{recursive:true,force:true});}}
const read=async(root:string,name:string)=>JSON.parse(await readFile(path.join(root,name),'utf8'));

test('intent schema and prompt use action events, frozen identities and bounded drawing data',()=>{
 const schema=buildIntentOutputSchema(design),check=new Ajv({strict:false}).compile(schema.schema);
 assert.equal(schema.name,'motion_intent_assembly_v1');assert.equal(check(legacyResponse()),true,JSON.stringify(check.errors));
 for(const mutate of [
  (v:any)=>v.intent.objects[0].id='other',
  (v:any)=>v.intent.objects[0].actions[0].endFrame=60,
  (v:any)=>v.layers[0].parentId='object',
  (v:any)=>v.intent.objects[0].keys=[],
  (v:any)=>v.source='code',
  (v:any)=>v.layers[0].artwork[0].attrs.transform='translate(1)',
 ]){const v=legacyResponse();mutate(v);assert.equal(check(v),false);}
 const prompt=buildIntentPrompt(design,'REFERENCE');
 assert.match(prompt,/HOST_INTENT_DATA/);assert.match(prompt,/host computes.*offset/i);assert.match(prompt,/0\.\.59/);
 assert.doesNotMatch(prompt,/STRUCTURE_EXAMPLE|"keys"|PREVIOUS_ASSEMBLY/);
});

test('adapter compiles into the old strict assembly and rejects unknown or mismatched data',()=>{
 const input=legacyResponse(),original=JSON.stringify(input),assembly=parseIntentAssembly(input,design);
 assert.equal(assembly.schemaVersion,'motion-assembly:2');assert.equal(assembly.plan.tracks[0].keys.at(-1)!.x,300);
 assert.equal(JSON.stringify(input),original);assert.match(intentHash(input,design),/^[a-f0-9]{64}$/);
 for(const mutate of [
  (v:any)=>v.brief={...v.brief,title:'changed'},
  (v:any)=>v.intent.objects[0].id='other',
  (v:any)=>v.layers[0].id='other',
  (v:any)=>v.extra=true,
  (v:any)=>v.intent.objects[0].actions[0].targetAnchor='missing',
 ]){const v=legacyResponse();mutate(v);assert.throws(()=>parseIntentAssembly(v,design));}
});

test('host-intent freezes intent and compiled provenance; one-request repairs inherit mode',()=>fixture(async root=>{
 const first=path.join(root,'first');let calls=0;
 const generated=await generateWorkbench({brief,cues,generation_mode:'host-intent'},first,{request:async(prompt,options)=>{
  calls++;if(calls===1){await options.onResponse?.({content:JSON.stringify(providerDesign),finishReason:'stop'});return providerDesign;}
  assert.match(prompt,/HOST_OBJECT_MOTION_DATA/);assert.equal(options.outputSchema?.name,'object_motion_data_v1');return response();
 }});
 assert.equal(calls,2);assert.equal(generated.generation_mode,'host-intent');assert.equal(generated.intent_sha256,storedIntentHash(response(),design));
 assert.deepEqual(await read(first,'frozen-intent.json'),response());assert.equal((await read(first,'frozen-assembly.json')).schemaVersion,'motion-assembly:2');
 let repairs=0;
 const repaired=await generateWorkbench({previous_directory:first,feedback:'Keep the same object'},path.join(root,'repair'),{request:async(prompt)=>{
  repairs++;assert.match(prompt,/PREVIOUS_INTENT/);assert.match(prompt,/Keep the same object/);assert.doesNotMatch(prompt,/PREVIOUS_ASSEMBLY/);return response();
 }});
 assert.equal(repairs,1);assert.equal(repaired.generation_mode,'host-intent');assert.equal(repaired.requests_dispatched,1);
 for(const mode of ['source','host-motion']){
  await writeFile(path.join(root,'repair/generation-mode.json'),JSON.stringify({generation_mode:mode}));
  await assert.rejects(generateWorkbench({previous_directory:path.join(root,'repair'),feedback:'fix'},path.join(root,`repair-${mode}`),{request:async()=>{throw Error('must not dispatch');}}),/mode.*conflict/);
 }
 await writeFile(path.join(root,'repair/generation-mode.json'),JSON.stringify({generation_mode:'host-intent'}));
 await writeFile(path.join(first,'request-count.json'),JSON.stringify({requests_dispatched:1}));
 await assert.rejects(generateWorkbench({previous_directory:first,feedback:'fix'},path.join(root,'changed-count'),{request:async()=>{throw Error('must not dispatch');}}),/design origin.*count/);
 await writeFile(path.join(first,'request-count.json'),JSON.stringify({requests_dispatched:2}));
 const originalDesign=await read(first,'frozen-design.json');
 const savedArtifact=await readFile(path.join(first,'artifact.json'),'utf8'),savedResult=await readFile(path.join(first,'result.json'),'utf8');
 await unlink(path.join(first,'artifact.json'));await unlink(path.join(first,'result.json'));
 await writeFile(path.join(first,'failure.json'),JSON.stringify({failed:true,requests_dispatched:2}));
 await writeFile(path.join(first,'provider-2.json'),JSON.stringify({content:JSON.stringify(response()),finishReason:'stop'}));
 await writeFile(path.join(first,'frozen-design.json'),JSON.stringify({...originalDesign,thesis:'tampered'}));
 await assert.rejects(generateWorkbench({previous_directory:first,feedback:'fix'},path.join(root,'changed-design'),{request:async()=>{throw Error('must not dispatch');}}),/design hash mismatch/);
 await writeFile(path.join(first,'frozen-design.json'),JSON.stringify(originalDesign));
 const originalInput=await readFile(path.join(first,'design-input.json'),'utf8');await writeFile(path.join(first,'design-input.json'),JSON.stringify({schemaVersion:'visual-design-input:1',brief:{...brief,title:'changed'},cues}));
 await assert.rejects(generateWorkbench({previous_directory:first,feedback:'fix'},path.join(root,'changed-input'),{request:async()=>{throw Error('must not dispatch');}}),/design.*(input|binding|mismatch)/);
 await writeFile(path.join(first,'design-input.json'),originalInput);
 const originalResponse=await readFile(path.join(first,'provider-1.json'),'utf8');await writeFile(path.join(first,'provider-1.json'),JSON.stringify({content:JSON.stringify({...providerDesign,thesis:'changed'}),finishReason:'stop'}));
 await assert.rejects(generateWorkbench({previous_directory:first,feedback:'fix'},path.join(root,'changed-response'),{request:async()=>{throw Error('must not dispatch');}}),/design.*(response|hash|mismatch)/);
 await writeFile(path.join(first,'provider-1.json'),originalResponse);await writeFile(path.join(first,'artifact.json'),savedArtifact);await writeFile(path.join(first,'result.json'),savedResult);await unlink(path.join(first,'failure.json'));
 const external=path.join(root,'external-intent.json');await writeFile(external,JSON.stringify(response()));
 await unlink(path.join(first,'frozen-intent.json'));await symlink(external,path.join(first,'frozen-intent.json'));
 await assert.rejects(generateWorkbench({previous_directory:first,feedback:'fix'},path.join(root,'symlink'),{request:async()=>{throw Error('must not dispatch');}}),/invalid retained file/);
 await unlink(path.join(first,'frozen-intent.json'));await writeFile(path.join(first,'frozen-intent.json'),JSON.stringify(response()));
 // An unused anchor changes intent provenance without changing the compiled plan.
 const changed=response();changed.anchors.push({id:'unused',pose:pose(999)});
 await writeFile(path.join(first,'frozen-intent.json'),JSON.stringify(changed));
 await assert.rejects(generateWorkbench({previous_directory:first,feedback:'fix'},path.join(root,'tampered'),{request:async()=>{throw Error('must not dispatch');}}),/intent.*hash/);
 await writeFile(path.join(first,'frozen-intent.json'),JSON.stringify(response()));
 await unlink(path.join(first,'frozen-assembly.json'));
 await unlink(path.join(first,'generation-mode.json'));
 await assert.rejects(generateWorkbench({previous_directory:first,feedback:'fix'},path.join(root,'missing-mode'),{request:async()=>{throw Error('must not dispatch');}}),/generation mode missing/);
}));

test('schema-shaped but cyclic intent fails locally without source publication or fallback',()=>fixture(async root=>{
 const invalid=response() as any;invalid.anchors[0].objectId='object';let calls=0;
 const check=new Ajv({strict:false}).compile(buildObjectMotionSchema(design).schema);
 assert.equal(check(invalid),true);
 const first=path.join(root,'bad');
 await assert.rejects(generateWorkbench({brief,cues,generation_mode:'host-intent'},first,{request:async()=>++calls===1?providerDesign:invalid}),/cyclic object dependencies/);
 assert.equal(calls,2);assert.equal((await read(first,'failure.json')).automaticRetries,0);
 await assert.rejects(read(first,'artifact.json'),/ENOENT/);
}));

test('invalid intent stops at two requests and can reuse only the verified design for one repair',()=>fixture(async root=>{
 const first=path.join(root,'first');let calls=0;
 await assert.rejects(generateWorkbench({brief,cues,generation_mode:'host-intent'},first,{request:async(_p,options)=>{
  calls++;await options.onResponse?.({content:calls===1?JSON.stringify(providerDesign):'{bad',finishReason:'stop'});
  if(calls===1)return providerDesign;throw Error('invalid data');
 }}),/invalid data/);
 assert.equal(calls,2);await assert.rejects(read(first,'result.json'),/ENOENT/);
 let repairs=0;const result=await generateWorkbench({previous_directory:first,feedback:'Use valid events'},path.join(root,'repair'),{request:async(prompt)=>{
  repairs++;assert.match(prompt,/Use valid events/);assert.doesNotMatch(prompt,/PREVIOUS_INTENT/);return response();
 }});
 assert.equal(repairs,1);assert.equal(result.generation_mode,'host-intent');
}));

test('failed artifacts cannot downgrade mode or detach source from their frozen assembly',()=>fixture(async root=>{
 const first=path.join(root,'first');let calls=0;
 await generateWorkbench({brief,cues,generation_mode:'host-intent'},first,{request:async(_p,options)=>{const value=++calls===1?providerDesign:response();await options.onResponse?.({content:JSON.stringify(value),finishReason:'stop'});return value;}});
 await unlink(path.join(first,'result.json'));
 await writeFile(path.join(first,'failure.json'),JSON.stringify({failed:true,requests_dispatched:2}));
 for(const mode of ['source','host-motion']){
  await writeFile(path.join(first,'generation-mode.json'),JSON.stringify({generation_mode:mode}));
  await assert.rejects(generateWorkbench({previous_directory:first,feedback:'fix'},path.join(root,mode),{request:async()=>{throw Error('must not dispatch');}}),/mode.*conflict/);
 }
 await writeFile(path.join(first,'generation-mode.json'),JSON.stringify({generation_mode:'host-intent'}));
 const artifact=await read(first,'artifact.json');artifact.source+='\n// altered after failure';
 await writeFile(path.join(first,'artifact.json'),JSON.stringify(artifact));
 await assert.rejects(generateWorkbench({previous_directory:first,feedback:'fix'},path.join(root,'source-tamper'),{request:async()=>{throw Error('must not dispatch');}}),/assembly source hash mismatch/);
}));

test('artifact-free recovery cannot hide frozen intent or assembly corruption',()=>fixture(async root=>{
 const first=path.join(root,'first');let calls=0;
 await generateWorkbench({brief,cues,generation_mode:'host-intent'},first,{request:async(_p,options)=>{
  const value=++calls===1?providerDesign:response();await options.onResponse?.({content:JSON.stringify(value),finishReason:'stop'});return value;
 }});
 const frozenAssembly=await readFile(path.join(first,'frozen-assembly.json'),'utf8');
 await unlink(path.join(first,'artifact.json'));await unlink(path.join(first,'result.json'));
 await writeFile(path.join(first,'failure.json'),JSON.stringify({failed:true,requests_dispatched:2}));
 const changed=response();changed.anchors.push({id:'unused',pose:pose(999)});
 await writeFile(path.join(first,'frozen-intent.json'),JSON.stringify(changed));
 await assert.rejects(generateWorkbench({previous_directory:first,feedback:'fix'},path.join(root,'intent-tamper'),{request:async()=>{throw Error('must not dispatch');}}),/retained intent hash mismatch/);
 await writeFile(path.join(first,'frozen-intent.json'),JSON.stringify(response()));
 const changedAssembly=JSON.parse(frozenAssembly);changedAssembly.layers[0].artwork[0].attrs.r=31;
 await writeFile(path.join(first,'frozen-assembly.json'),JSON.stringify(changedAssembly));
 await assert.rejects(generateWorkbench({previous_directory:first,feedback:'fix'},path.join(root,'assembly-tamper'),{request:async()=>{throw Error('must not dispatch');}}),/retained assembly hash mismatch/);
 await writeFile(path.join(first,'frozen-assembly.json'),'{broken');
 await assert.rejects(generateWorkbench({previous_directory:first,feedback:'fix'},path.join(root,'broken'),{request:async()=>{throw Error('must not dispatch');}}),SyntaxError);
}));

test('unpublished artifacts still bind unchanged intent to the retained response',()=>fixture(async root=>{
 const first=path.join(root,'first');let calls=0;
 await generateWorkbench({brief,cues,generation_mode:'host-intent'},first,{request:async(_p,options)=>{
  const value=++calls===1?providerDesign:response();await options.onResponse?.({content:JSON.stringify(value),finishReason:'stop'});return value;
 }});
 await unlink(path.join(first,'result.json'));await writeFile(path.join(first,'failure.json'),JSON.stringify({failed:true,requests_dispatched:2}));
 let repairs=0;
 await generateWorkbench({previous_directory:first,feedback:'Keep it'},path.join(root,'valid'),{request:async()=>{repairs++;return response();}});
 assert.equal(repairs,1);
 const altered=response();altered.anchors.push({id:'unused',pose:pose(999)});
 await writeFile(path.join(first,'frozen-intent.json'),JSON.stringify(altered));
 await assert.rejects(generateWorkbench({previous_directory:first,feedback:'fix'},path.join(root,'tampered'),{request:async()=>{throw Error('must not dispatch');}}),/retained intent hash mismatch/);
}));

test('all host-intent read paths reject missing, malformed or symlinked design origins before dispatch',()=>fixture(async root=>{
 const first=path.join(root,'first');let calls=0;
 await generateWorkbench({brief,cues,generation_mode:'host-intent'},first,{request:async(_p,options)=>{const value=++calls===1?providerDesign:response();await options.onResponse?.({content:JSON.stringify(value),finishReason:'stop'});return value;}});
 const artifact=await readFile(path.join(first,'artifact.json')),result=await readFile(path.join(first,'result.json')),origin=await readFile(path.join(first,'design-origin.json'));
 const external=path.join(root,'external-origin.json');await writeFile(external,origin);
 for(const entry of ['published','failed-artifact','artifact-free']){
  if(entry==='published'){await writeFile(path.join(first,'artifact.json'),artifact);await writeFile(path.join(first,'result.json'),result);}
  else{await rm(path.join(first,'result.json'),{force:true});await writeFile(path.join(first,'failure.json'),JSON.stringify({failed:true,requests_dispatched:2}));if(entry==='artifact-free')await unlink(path.join(first,'artifact.json'));}
  for(const fault of ['missing','malformed','symlink']){
   await rm(path.join(first,'design-origin.json'),{force:true});
   if(fault==='malformed')await writeFile(path.join(first,'design-origin.json'),'{broken');
   if(fault==='symlink')await symlink(external,path.join(first,'design-origin.json'));
   let dispatched=0;
   await assert.rejects(generateWorkbench({previous_directory:first,feedback:'fix'},path.join(root,`${entry}-${fault}`),{request:async()=>{dispatched++;throw Error('must not dispatch');}}));
   assert.equal(dispatched,0);
   await rm(path.join(first,'design-origin.json'),{force:true});await writeFile(path.join(first,'design-origin.json'),origin);
  }
 }
}));

test('historical intent envelopes repair through the new schema with published and artifact-free provenance',()=>fixture(async root=>{
 const first=path.join(root,'first');let calls=0;
 await generateWorkbench({brief,cues,generation_mode:'host-intent'},first,{request:async(_p,o)=>{const value=++calls===1?providerDesign:response();await o.onResponse?.({content:JSON.stringify(value),finishReason:'stop'});return value;}});
 const legacy=legacyResponse(),result=await read(first,'result.json');
 result.intent_sha256=intentHash(legacy,design);
 await writeFile(path.join(first,'frozen-intent.json'),JSON.stringify(legacy));await writeFile(path.join(first,'result.json'),JSON.stringify(result));
 await writeFile(path.join(first,'provider-2.json'),JSON.stringify({content:JSON.stringify(legacy),finishReason:'stop'}));
 let repairs=0;
 const request=async(prompt:string,options:any)=>{repairs++;assert.equal(options.outputSchema.name,'object_motion_data_v1');assert.match(prompt,/PREVIOUS_INTENT_REFERENCE/);assert.match(prompt,/motion-intent-assembly:1/);return response();};
 await generateWorkbench({previous_directory:first,feedback:'Keep legacy appearance'},path.join(root,'published-repair'),{request});assert.equal(repairs,1);
 await unlink(path.join(first,'artifact.json'));await unlink(path.join(first,'result.json'));await writeFile(path.join(first,'failure.json'),JSON.stringify({failed:true,requests_dispatched:2}));
 await generateWorkbench({previous_directory:first,feedback:'Keep legacy appearance'},path.join(root,'failed-repair'),{request});assert.equal(repairs,2);
}));

test('new generation never falls back to the legacy data envelope',()=>fixture(async root=>{
 const first=path.join(root,'first');let calls=0;
 await assert.rejects(generateWorkbench({brief,cues,generation_mode:'host-intent'},first,{request:async()=>++calls===1?providerDesign:legacyResponse()}),/object_motion_data/);
 assert.equal(calls,2);assert.equal((await read(first,'failure.json')).automaticRetries,0);await assert.rejects(read(first,'artifact.json'),/ENOENT/);
}));
