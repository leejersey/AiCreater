import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,readFile,rm,writeFile,unlink} from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import Ajv from 'ajv';
import {generateWorkbench} from '../src/workbench';
import {buildMotionOutputSchema,buildMotionPrompt} from '../src/motion-output';
import {motionAssemblyHash} from '../src/motion-assembly';
import {parseDesign} from '../src/design';
import {buildPaintSafeRagAssembly} from '../../../examples/custom-scenes/motion-rag-paint/fixture';
import type {SceneBrief} from '../src/contract';

const brief:SceneBrief={schemaVersion:'custom-scene-brief:1',id:'motion-test',title:'Motion',narration:'Move.',visualGoal:'Show movement',facts:[],materials:[],width:1920,height:1080,fps:30,durationInFrames:60};
const cues=[{id:'cue',text:'Move.',startFrame:6,endFrame:54}];
const design={schemaVersion:'visual-design:1',brief,cues,thesis:'Move',metaphor:'Object',objects:[{id:'object',meaning:'thing',appearance:'circle',x:100,y:100,width:100,height:100}],beats:[{cueId:'cue',focus:'object',action:'move',changes:[{objectId:'object',from:'left',to:'right'}]}],composition:'Open',palette:'blueprint',avoid:['cards'],acceptance:['visible']};
const assembly={schemaVersion:'motion-assembly:2',brief,plan:{schemaVersion:'motion-plan:2',durationInFrames:60,tracks:[{id:'object',keys:[{frame:0,x:100,y:100,scale:1,opacity:1},{frame:54,x:200,y:100,scale:1,opacity:1}]}]},layers:[{id:'object',artwork:[{tag:'circle',attrs:{r:30,fill:'accent'}}]}],audit:{routes:[],obstacles:[]}};
async function fixture(fn:(root:string)=>Promise<void>){const root=await mkdtemp(path.join(os.tmpdir(),'workbench-motion-'));try{await fn(root);}finally{await rm(root,{recursive:true,force:true});}}
const read=async(root:string,name:string)=>JSON.parse(await readFile(path.join(root,name),'utf8'));

test('motion response schema accepts data but rejects executable fields and SVG overrides',()=>{
 const schema=buildMotionOutputSchema(brief).schema,validate=new Ajv({strict:false}).compile(schema);
 assert.equal(validate(assembly),true,JSON.stringify(validate.errors));
 for(const bad of [{...assembly,source:'code'},{...assembly,brief:{...brief,title:'Changed'}},{...assembly,layers:[{id:'object',artwork:[{tag:'circle',attrs:{r:30,transform:'translate(1 1)'}}]}]}])assert.equal(validate(bad),false);
});
test('design-bound motion schema requires exactly one track and layer per frozen object',()=>{
 const frozen=parseDesign(design),validate=new Ajv({strict:false}).compile(buildMotionOutputSchema(brief,frozen).schema);
 assert.equal(validate(assembly),true,JSON.stringify(validate.errors));
 const renamed={...assembly,plan:{...assembly.plan,tracks:[{...assembly.plan.tracks[0],id:'t-object'}]},layers:[{...assembly.layers[0],id:'l-object'}]};
 assert.equal(validate(renamed),false);
 const two=parseDesign({...design,objects:[...design.objects,{...design.objects[0],id:'second',x:400}]});
 const checkTwo=new Ajv({strict:false}).compile(buildMotionOutputSchema(brief,two).schema);
 assert.equal(checkTwo(assembly),false);
 const duplicate={...assembly,plan:{...assembly.plan,tracks:[assembly.plan.tracks[0],assembly.plan.tracks[0]]},layers:[assembly.layers[0],assembly.layers[0]]};
 assert.equal(checkTwo(duplicate),false);
 const validTwo={...assembly,plan:{...assembly.plan,tracks:[assembly.plan.tracks[0],{...assembly.plan.tracks[0],id:'second'}]},layers:[{...assembly.layers[0],id:'second'},assembly.layers[0]]};
 assert.equal(checkTwo(validTwo),true,JSON.stringify(checkTwo.errors));
 for(const frame of [-1,60])assert.equal(validate({...assembly,plan:{...assembly.plan,tracks:[{...assembly.plan.tracks[0],keys:[{...assembly.plan.tracks[0].keys[0],frame}]}]}}),false);
 assert.equal(validate({...assembly,plan:{...assembly.plan,tracks:[{...assembly.plan.tracks[0],keys:[assembly.plan.tracks[0].keys[0],{...assembly.plan.tracks[0].keys[1],frame:59}]}]}}),true);
 const prompt=buildMotionPrompt(frozen,'');
 assert.match(prompt,/0\.\.59/);assert.match(prompt,/endFrame.*60/);assert.match(prompt,/OBJECT_IDS.*\["object"\]/);
});
test('motion contract locates parenting only on tracks, never on drawing layers',()=>{
 const frozen=parseDesign(design),schema=buildMotionOutputSchema(brief,frozen).schema as any;
 assert.match(schema.properties.plan.properties.tracks.items.description,/parentId.*attachments/);
 assert.match(schema.properties.layers.items.description,/only id and artwork/);
 const prompt=buildMotionPrompt(frozen,'');
 assert.match(prompt,/plan\.tracks\[\].*parentId.*attachments/);
 assert.match(prompt,/layers\[\].*only id and artwork/);
 assert.match(prompt,/Omit unused parentId and attachments; never emit null/);
 const example=JSON.parse(prompt.split('STRUCTURE_EXAMPLE\n')[1].split('\n\n')[0]);
 const validate=new Ajv({strict:false}).compile(schema);
 const checkTrack=new Ajv({strict:false}).compile(schema.properties.plan.properties.tracks.items);
 const checkLayer=new Ajv({strict:false}).compile({...schema.properties.layers.items,$defs:schema.$defs});
 assert.equal(checkTrack(example.plan.tracks[0]),true,JSON.stringify(checkTrack.errors));
 assert.equal(checkLayer(example.layers[0]),true,JSON.stringify(checkLayer.errors));
 assert.deepEqual(Object.keys(example.layers[0]),['id','artwork']);
 for(const fields of [{parentId:'object'},{attachments:null},{parentId:null,attachments:null}]){
  assert.equal(validate({...assembly,layers:[{...assembly.layers[0],...fields}]}),false);
 }
});
test('opt-in generation freezes data provenance and repair stays in data mode with one request',()=>fixture(async root=>{
 let calls=0;const first=path.join(root,'first');
 const result=await generateWorkbench({brief,cues,generation_mode:'host-motion'},first,{request:async(prompt,options)=>{
  assert.doesNotMatch(prompt,/SOURCE_ART_DIRECTION|SOURCE_ART_CONSTRUCTION_ATLAS/);
  calls++;if(calls===1)return design;
  assert.equal(options.outputSchema?.name,'motion_assembly_v2');assert.match(prompt,/HOST_MOTION_DATA/);assert.doesNotMatch(prompt,/export default function/);
  const validate=new Ajv({strict:false}).compile(options.outputSchema!.schema);
  assert.equal(validate({...assembly,layers:[{...assembly.layers[0],id:'l-object'}]}),false);
  return assembly;
 }});
 assert.equal(calls,2);assert.equal(result.requests_dispatched,2);
 assert.equal(result.generation_mode,'host-motion');assert.equal(result.assembly_sha256,motionAssemblyHash(assembly));
 assert.match(result.source,/motionTransforms\(plan, props.frame\)/);
 assert.equal((await read(first,'frozen-assembly.json')).layers[0].id,'object');
 let repairs=0;
 const repaired=await generateWorkbench({previous_directory:first,feedback:'Keep the same object'},path.join(root,'repair'),{request:async(prompt,options)=>{
  repairs++;assert.equal(options.outputSchema?.name,'motion_assembly_v2');assert.match(prompt,/PREVIOUS_ASSEMBLY/);assert.match(prompt,/Keep the same object/);
  const validate=new Ajv({strict:false}).compile(options.outputSchema!.schema);
  assert.equal(validate({...assembly,layers:[{...assembly.layers[0],id:'l-object'}]}),false);
  return assembly;
 }});
 assert.equal(repairs,1);assert.equal(repaired.generation_mode,'host-motion');
 const changed=await read(first,'frozen-assembly.json');changed.layers[0].artwork[0].attrs.r=31;
 await writeFile(path.join(first,'frozen-assembly.json'),JSON.stringify(changed));
 await assert.rejects(generateWorkbench({previous_directory:first,feedback:'fix'},path.join(root,'tampered'),{request:async()=>{throw Error('must not dispatch');}}),/assembly.*hash/);
 await writeFile(path.join(first,'frozen-assembly.json'),JSON.stringify(assembly));
 await unlink(path.join(first,'generation-mode.json'));
 await assert.rejects(generateWorkbench({previous_directory:first,feedback:'fix'},path.join(root,'missing-mode'),{request:async()=>{throw Error('must not dispatch');}}),/assembly generation mode missing/);
}));
test('invalid data stops at two requests without publishing a source or falling back',()=>fixture(async root=>{
 let calls=0;const out=path.join(root,'bad');
 await assert.rejects(generateWorkbench({brief,cues,generation_mode:'host-motion'},out,{request:async()=>++calls===1?design:{...assembly,source:'ignored code'}}),/motion_assembly/);
 assert.equal(calls,2);assert.equal((await read(out,'failure.json')).requests_dispatched,2);
 await assert.rejects(read(out,'result.json'),/ENOENT/);
}));
test('invalid mode is rejected before any request',()=>fixture(async root=>{
 let calls=0;
 await assert.rejects(generateWorkbench({brief,cues,generation_mode:'invalid' as 'host-motion'},path.join(root,'bad'),{request:async()=>{calls++;return design;}}),/generation mode/);
 assert.equal(calls,0);
}));
test('schema supports the reviewed RAG primitives, nested art and timed handoff',async()=>{
 const d=parseDesign(JSON.parse(await readFile('examples/custom-scenes/motion-rag/design.json','utf8')));
 const input=buildPaintSafeRagAssembly(d),validate=new Ajv({strict:false}).compile(buildMotionOutputSchema(d.brief).schema);
 assert.equal(validate(input),true,JSON.stringify(validate.errors));
});
test('missing design identities fail before source publication',()=>fixture(async root=>{
 let calls=0;const renamed={...assembly,plan:{...assembly.plan,tracks:[{...assembly.plan.tracks[0],id:'other'}]},layers:[{...assembly.layers[0],id:'other'}]};
 await assert.rejects(generateWorkbench({brief,cues,generation_mode:'host-motion'},path.join(root,'bad'),{request:async()=>++calls===1?design:renamed}),/design identity/);
 assert.equal(calls,2);
}));
test('host-motion generation does not accept the old unaudited assembly format',()=>fixture(async root=>{
 const {audit:_audit,...old}=assembly;let calls=0;
 await assert.rejects(generateWorkbench({brief,cues,generation_mode:'host-motion'},path.join(root,'old'),{request:async()=>++calls===1?design:{...old,schemaVersion:'motion-assembly:1'}}),/assembly version/);
 assert.equal(calls,2);
}));
test('repair recovers complete retained motion data without requesting a new design',()=>fixture(async root=>{
 const first=path.join(root,'first');let calls=0;
 await generateWorkbench({brief,cues,generation_mode:'host-motion'},first,{request:async(_prompt,options)=>{
  const response=++calls===1?design:assembly;
  await options.onResponse?.({content:JSON.stringify(response),finishReason:'stop'});
  return response;
 }});
 await unlink(path.join(first,'artifact.json'));await unlink(path.join(first,'result.json'));
 await writeFile(path.join(first,'failure.json'),JSON.stringify({failed:true,requests_dispatched:2}));
 let repairs=0;
 const fixed=await generateWorkbench({previous_directory:first,feedback:'Use retained data'},path.join(root,'repair'),{request:async(_p,options)=>{
  repairs++;assert.equal(options.outputSchema?.name,'motion_assembly_v2');return assembly;
 }});
 assert.equal(repairs,1);assert.equal(fixed.generation_mode,'host-motion');
}));
test('data-only repair reuses a verified design even when retained motion JSON is invalid',()=>fixture(async root=>{
 const first=path.join(root,'first');let calls=0;
 await assert.rejects(generateWorkbench({brief,cues,generation_mode:'host-motion'},first,{request:async(_p,options)=>{
  calls++;
  await options.onResponse?.({content:calls===1?JSON.stringify(design):'{bad data',finishReason:'stop'});
  if(calls===1)return design;
  throw Error('invalid JSON');
 }}),/invalid JSON/);
 const before=await readFile(path.join(first,'provider-2.json'),'utf8');let repairs=0;
 const result=await generateWorkbench({previous_directory:first,feedback:'Preserve IDs and frame bounds'},path.join(root,'repair'),{request:async(prompt)=>{
  repairs++;assert.match(prompt,/Preserve IDs and frame bounds/);assert.doesNotMatch(prompt,/PREVIOUS_ASSEMBLY/);return assembly;
 }});
 assert.equal(repairs,1);assert.equal(result.generation_mode,'host-motion');assert.equal(result.requests_dispatched,1);
 assert.equal(await readFile(path.join(first,'provider-2.json'),'utf8'),before);
 await writeFile(path.join(first,'failure.json'),JSON.stringify({failed:true,requests_dispatched:1}));
 await assert.rejects(generateWorkbench({previous_directory:first,feedback:'fix'},path.join(root,'wrong-stage'),{request:async()=>{throw Error('must not dispatch');}}),/data-stage failure/);
 await writeFile(path.join(first,'failure.json'),JSON.stringify({failed:true,requests_dispatched:2}));
 const frozen=await read(first,'frozen-design.json');frozen.thesis='tampered';
 await writeFile(path.join(first,'frozen-design.json'),JSON.stringify(frozen));
 await assert.rejects(generateWorkbench({previous_directory:first,feedback:'fix'},path.join(root,'tampered'),{request:async()=>{throw Error('must not dispatch');}}),/retained design.*mismatch/);
}));
