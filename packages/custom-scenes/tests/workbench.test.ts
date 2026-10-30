import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,readFile,writeFile,mkdir,rm,stat,symlink} from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {repositoryRoot} from '../src/files';
import {randomUUID,createHash} from 'node:crypto';
import {generateWorkbench,previewWorkbench,exportWorkbench,validateOwnedDirectory,scrubRenderEnvironment,validateWorkbenchScene,runRenderChild} from '../src/workbench';
import {sourceHash,parseArtifact} from '../src/contract';
import {parseDesign} from '../src/design';

const brief={schemaVersion:'custom-scene-brief:1',id:'example',title:'Example',narration:'Measured.',visualGoal:'Show change',facts:[],materials:[],width:1920,height:1080,fps:30,durationInFrames:60} as const;
const cues=[{id:'cue',text:brief.narration,startFrame:6,endFrame:54}];
const design={schemaVersion:'visual-design:1',brief,cues,thesis:'Change',metaphor:'Movement',objects:[{id:'object',meaning:'thing',appearance:'circle',x:100,y:100,width:100,height:100}],beats:[{cueId:'cue',focus:'object',action:'move',changes:[{objectId:'object',from:'left',to:'right'}]}],composition:'Center',palette:'blueprint',avoid:['cards'],acceptance:['visible change']};
const artifact=parseArtifact({schemaVersion:'custom-scene:1',brief,rationale:'Measured movement',source:'export default function Scene(){return <svg width="1920" height="1080"><circle cx="100" cy="100" r="30"/></svg>}'});
const scene={duration_frames:60,narration:{text:brief.narration,audio_start_frame:6},captions:[{text:brief.narration,start_frame:6,end_frame:54}]};
async function fixture(fn:(root:string)=>Promise<void>){const root=await mkdtemp(path.join(os.tmpdir(),'workbench-'));try{await fn(root);}finally{await rm(root,{recursive:true,force:true});}}
const out=(root:string)=>path.join(root,randomUUID());
test('generated source with invalid self-moving audit route stops before success and retains diagnostics',()=>fixture(async root=>{
 const destination=out(root);let calls=0;
 const invalid={...artifact,source:'export default function Scene(){return <svg><g data-follow-path="travel" transform="translate(100 100)"><path id="travel" data-route="true" d="M100 100 L200 100"/><circle r="10"/></g></svg>}'};
 await assert.rejects(generateWorkbench({brief,cues},destination,{request:async()=>++calls===1?design:invalid}),/source motion review/);
 assert.equal(calls,2);
 const review=JSON.parse(await readFile(path.join(destination,'static-review.json'),'utf8'));
 assert.equal(review.status,'revise-required');
 assert.equal(review.sha256,sourceHash(parseArtifact(invalid)));
 await assert.rejects(stat(path.join(destination,'result.json')),/ENOENT/);
 assert.ok(await stat(path.join(destination,'artifact.json')));
 let repairs=0;
 await generateWorkbench({previous_directory:destination,feedback:'Repair the program-detected defect'},out(root),{request:async prompt=>{
  repairs++;assert.match(prompt,/STATIC_REPAIR_DIAGNOSTICS/);assert.match(prompt,/nested under its own transformed mover/);return artifact;
 }});
 assert.equal(repairs,1);
}));
test('source revision treats malformed retained JSON as evidence, not as an accepted design',()=>fixture(async root=>{
 const content='{"avoid":["cards"]","objects":[]}';
 const previous_design={schemaVersion:'invalid-design-json:1',content,sha256:createHash('sha256').update(content).digest('hex')};
 const destination=out(root);let calls=0;
 const result=await generateWorkbench({brief,cues,previous_design,feedback:'Fix JSON and keep answer inside canvas'},destination,{request:async(prompt)=>{
  calls++;
  if(calls===1){assert.match(prompt,/MALFORMED_DESIGN_REVISION/);assert.ok(prompt.includes(JSON.stringify(previous_design)));assert.match(prompt,/SOURCE_ART_DIRECTION/);return design;}
  return artifact;
 }});
 assert.equal(result.requests_dispatched,2);assert.equal(calls,2);
 for(const invalid of [{...previous_design,sha256:'a'.repeat(64)},{...previous_design,content:'{}',sha256:createHash('sha256').update('{}').digest('hex')}]){
  await assert.rejects(generateWorkbench({brief,cues,previous_design:invalid,feedback:'Fix'},out(root),{request:async()=>{calls++;return design;}}),/malformed design/);
 }
 assert.equal(calls,2);
}));
test('malformed source revision still stops after an invalid revised design',()=>fixture(async root=>{
 const content='{bad';let calls=0;const destination=out(root);
 const previous_design={schemaVersion:'invalid-design-json:1',content,sha256:createHash('sha256').update(content).digest('hex')};
 await assert.rejects(generateWorkbench({brief,cues,previous_design,feedback:'Fix'},destination,{request:async()=>{calls++;return {...design,objects:[{...design.objects[0],x:1900}]};}}),/bounds/);
 assert.equal(calls,1);await assert.rejects(stat(path.join(destination,'provider-2.request.json')),/ENOENT/);
}));
test('host modes reject malformed JSON evidence before any model request',()=>fixture(async root=>{
 const content='{bad',previous_design={schemaVersion:'invalid-design-json:1',content,sha256:createHash('sha256').update(content).digest('hex')};let calls=0;
 for(const generation_mode of ['host-motion','host-intent','host-components'] as const){
  await assert.rejects(generateWorkbench({brief,cues,generation_mode,previous_design,feedback:'Fix'},out(root),{request:async()=>{calls++;throw Error('dispatched');}}),/malformed design.*source/);
 }
 assert.equal(calls,0);
}));
test('explicit design revision carries raw design and feedback, then requests code only after validation',()=>fixture(async root=>{
 const candidate={...design,overlaps:[],objects:design.objects.map(o=>({...o,kind:'solid',states:[{id:'left',appearance:'left'},{id:'right',appearance:'right'}]})),beats:design.beats.map(b=>({...b,changes:b.changes.map(c=>({...c,fromState:'left',toState:'right'}))}))};
 const broken=JSON.parse(JSON.stringify(candidate));broken.beats[0].changes[0].toState='missing';
 const original=JSON.stringify(broken),destination=out(root);let calls=0;
 const result=await generateWorkbench({brief,cues,previous_design:broken,feedback:'Use declared right state',diagnostic:'unknown state reference'},destination,{request:async(prompt,options)=>{
  calls++;
  if(calls===1){assert.match(prompt,/RETAINED_DESIGN_REVISION/);assert.match(prompt,/SOURCE_ART_DIRECTION/);assert.ok(prompt.includes(original));assert.match(prompt,/Use declared right state/);assert.ok(prompt.includes('"layoutFindings":'));assert.ok(options.outputSchema);return candidate;}
  assert.equal(options.outputSchema?.name,'scene_artifact_v1');return artifact;
 }});
 assert.equal(result.requests_dispatched,2);assert.equal(calls,2);assert.equal(JSON.stringify(broken),original);
 assert.equal(JSON.parse(await readFile(path.join(destination,'revision-input.json'),'utf8')).diagnostic,'unknown state reference');
}));
test('source mode receives reviewed construction in both stages without another request or schema',()=>fixture(async root=>{
 const destination=out(root),prompts:string[]=[];
 const result=await generateWorkbench({brief,cues,generation_mode:'source'},destination,{request:async(prompt,options)=>{
  prompts.push(prompt);
  if(prompts.length===1){assert.match(prompt,/SOURCE_ART_DIRECTION/);assert.match(prompt,/REVIEWED_CONSTRUCTION_SUMMARIES/);assert.match(prompt,/beats.action/);assert.doesNotMatch(prompt,/prefer this topology/);assert.equal(options.outputSchema?.name,'visual_design_v1');return design;}
  assert.match(prompt,/SOURCE_ART_CONSTRUCTION_ATLAS/);assert.match(prompt,/data-wallet-assembly/);assert.match(prompt,/think-valve/);
  assert.equal(options.outputSchema?.name,'scene_artifact_v1');assert.ok(prompt.includes(JSON.stringify(cues[0])));return artifact;
 }});
 assert.equal(prompts.length,2);assert.equal(result.requests_dispatched,2);
 const manifest=JSON.parse(await readFile(path.join(destination,'art-direction.json'),'utf8'));
 assert.equal(manifest.automaticQualityVerified,false);assert.equal(manifest.examples.length,2);
 assert.equal(result.sha256,sourceHash(artifact));
}));
test('design revision rejects unusable raw input before dispatch and stops after a failed revision',()=>fixture(async root=>{
 let calls=0;
 await assert.rejects(generateWorkbench({brief,cues,previous_design:{},feedback:'fix'},out(root),{request:async()=>{calls++;return design;}}),/revision.*schema/);
 assert.equal(calls,0);
 const candidate={...design,overlaps:[],objects:design.objects.map(o=>({...o,kind:'solid',states:[{id:'left',appearance:'left'}]})),beats:design.beats.map(b=>({...b,changes:b.changes.map(c=>({...c,fromState:'left',toState:'missing'}))}))};
 const destination=out(root);
 await assert.rejects(generateWorkbench({brief,cues,previous_design:candidate,feedback:'fix references'},destination,{request:async()=>{calls++;return candidate;}}),/state/);
 assert.equal(calls,1);assert.equal(JSON.parse(await readFile(path.join(destination,'request-count.json'),'utf8')).requests_dispatched,1);
 await assert.rejects(stat(path.join(destination,'provider-2.request.json')),/ENOENT/);
}));
test('a colliding design consumes one request and never dispatches code automatically',()=>fixture(async root=>{
 const destination=out(root);let calls=0;
 const colliding={...design,objects:[...design.objects,{...design.objects[0],id:'other',x:110,y:110}]};
 await assert.rejects(generateWorkbench({brief,cues},destination,{request:async()=>{calls++;return colliding;}}),/layout/);
 assert.equal(calls,1);
 assert.equal(JSON.parse(await readFile(path.join(destination,'failure.json'),'utf8')).code,'layout_preflight');
 assert.equal(JSON.parse(await readFile(path.join(destination,'request-count.json'),'utf8')).requests_dispatched,1);
 assert.equal(JSON.parse(await readFile(path.join(destination,'frozen-design.json'),'utf8')).objects.length,2);
}));
test('nullable root is canonicalized but colliding design still stops before the second request',()=>fixture(async root=>{
 const destination=out(root);let calls=0;
 const raw={...design,objects:[{...design.objects[0],parentId:null},{...design.objects[0],id:'other',x:110,y:110}]};
 await assert.rejects(generateWorkbench({brief,cues},destination,{request:async(_prompt,options)=>{
  calls++;await options.onResponse?.({content:JSON.stringify(raw),finishReason:'stop'});return raw;
 }}),/layout/);
 assert.equal(calls,1);
 assert.equal((await readFile(path.join(destination,'provider-1.json'),'utf8')).includes('parentId'),true);
 assert.equal(Object.hasOwn(JSON.parse(await readFile(path.join(destination,'frozen-design.json'),'utf8')).objects[0],'parentId'),false);
 assert.equal(JSON.parse(await readFile(path.join(destination,'failure.json'),'utf8')).code,'layout_preflight');
}));
test('generate records count before each dispatch, freezes strict artifacts, and repair dispatches once',()=>fixture(async root=>{
 const destination=out(root);let calls=0;
 const request=async (_prompt:string,options:any)=>{calls++;assert.equal(JSON.parse(await readFile(path.join(destination,'request-count.json'),'utf8')).requests_dispatched,calls);assert.equal(JSON.parse(await readFile(path.join(destination,`provider-${calls}.request.json`),'utf8')).prompt,_prompt);await options.onResponse({content:JSON.stringify(calls===1?design:artifact),finishReason:'stop'});return calls===1?design:artifact;};
 const result=await generateWorkbench({brief,cues},destination,{request});
 const designRequest=JSON.parse(await readFile(path.join(destination,'provider-1.request.json'),'utf8'));
 const codeRequest=JSON.parse(await readFile(path.join(destination,'provider-2.request.json'),'utf8'));
 assert.equal(designRequest.protocol,'responses');assert.equal(designRequest.outputSchema.name,'visual_design_v1');
 assert.match(designRequest.prompt,/SOURCE_ART_DIRECTION/);
 assert.ok(designRequest.outputSchema.schema.properties.beats.items.properties.changes.items.required.includes('fromState'));
 assert.equal(codeRequest.protocol,'responses');assert.equal(codeRequest.outputSchema.name,'scene_artifact_v1');
 assert.deepEqual(codeRequest.outputSchema.schema.properties.brief.enum,[brief]);
 assert.match(codeRequest.prompt,/SOURCE_ART_CONSTRUCTION_ATLAS/);
 assert.match(codeRequest.prompt,/REVIEWED_CONSTRUCTION_EXCERPTS/);
 assert.doesNotMatch(codeRequest.prompt,/import React from|function pipelineMotion|function ragWorkflowMotion/);
 assert.match(codeRequest.prompt,/inletLeft - payloadWidth - clearance/);
 assert.equal(result.requests_dispatched,2);assert.equal(result.sha256,sourceHash(artifact));
 assert.equal((await stat(path.join(destination,'provider-1.json'))).mode&0o777,0o600);
 assert.deepEqual(JSON.parse(await readFile(path.join(destination,'artifact.json.design.json'),'utf8')),design);
 const repaired=out(root);let repairCalls=0;
 const revision=await generateWorkbench({previous_directory:destination,feedback:'Keep readable'},repaired,{request:async (_p,o)=>{repairCalls++;assert.match(_p,/SOURCE_ART_CONSTRUCTION_ATLAS/);assert.equal(o.outputSchema?.name,'scene_artifact_v1');assert.deepEqual(o.outputSchema?.schema.properties && (o.outputSchema.schema.properties as any).brief.enum,[brief]);await o.onResponse?.({content:JSON.stringify(artifact),finishReason:'stop'});return artifact;}});
 assert.equal(repairCalls,1);assert.equal(revision.requests_dispatched,1);
}));
test('invalid design/provider failure stops with durable count and no retries',()=>fixture(async root=>{
 for(const invalid of [true,false]){let calls=0;const destination=out(root);await assert.rejects(generateWorkbench({brief,cues},destination,{request:async()=>{calls++;if(invalid)return {};throw Error('offline');}}));assert.equal(calls,1);assert.equal(JSON.parse(await readFile(path.join(destination,'request-count.json'),'utf8')).requests_dispatched,1);const failure=JSON.parse(await readFile(path.join(destination,'provider-1.failure.json'),'utf8'));assert.equal(typeof failure.error,'string');if(!invalid)assert.equal(failure.error,'offline');}
}));
test('invalid code is retained privately after exactly two calls; failed repair never retries',()=>fixture(async root=>{
 const destination=out(root);let calls=0;await assert.rejects(generateWorkbench({brief,cues},destination,{request:async()=>++calls===1?design:{...artifact,source:'invalid'}}));
 assert.equal(calls,2);assert.ok(await stat(path.join(destination,'provider-2.json')));assert.ok(await stat(path.join(destination,'provider-2.failure.json')));
 const previous=await generation(root);let repairs=0;const revision=out(root);await assert.rejects(generateWorkbench({previous_directory:previous,feedback:'Fix'},revision,{request:async()=>{repairs++;throw Error('offline');}}));assert.equal(repairs,1);
}));
test('repair can fix a retained typecheck-failed candidate without executing it',()=>fixture(async root=>{
 const dir=out(root);const broken={...artifact,source:'export default function Scene(){return missingIdentifier}'};
 await assert.rejects(generateWorkbench({brief,cues},dir,{request:async prompt=>prompt.includes('Act as a teaching motion designer')?design:broken}),/typecheck/);
 const failure=JSON.parse(await readFile(path.join(dir,'failure.json'),'utf8'));
 assert.equal(failure.code,'source_typecheck');assert.ok(failure.diagnostics.some((d:{code:number})=>d.code===2304));
 const repaired=await generateWorkbench({previous_directory:dir,feedback:'Fix type error'},out(root),{request:async prompt=>{
  assert.match(prompt,/COMPILATION_DIAGNOSTICS/);assert.match(prompt,/missingIdentifier/);return artifact;
 }});assert.equal(repaired.requests_dispatched,1);
}));
test('repair reuses a complete retained code response when rejection preceded artifact saving',()=>fixture(async root=>{
 const previous=out(root);await mkdir(previous);
 const raw=JSON.stringify({content:JSON.stringify(artifact),finishReason:'stop'});
 await writeFile(path.join(previous,'provider-2.json'),raw);
 await writeFile(path.join(previous,'frozen-design.json'),JSON.stringify(design));
 await writeFile(path.join(previous,'failure.json'),JSON.stringify({failed:true,requests_dispatched:2}));
 await writeFile(path.join(previous,'request-count.json'),JSON.stringify({requests_dispatched:2}));
 let calls=0;
 const repaired=await generateWorkbench({previous_directory:previous,feedback:'Fix the retained geometry'},out(root),{request:async(prompt,options)=>{
  calls++;assert.equal(options.outputSchema?.name,'scene_artifact_v1');assert.ok(prompt.includes(JSON.stringify(artifact)));assert.match(prompt,/Fix the retained geometry/);return artifact;
 }});
 assert.equal(calls,1);assert.equal(repaired.requests_dispatched,1);
 assert.equal(await readFile(path.join(previous,'provider-2.json'),'utf8'),raw);
 await assert.rejects(stat(path.join(previous,'artifact.json')),/ENOENT/);
 for(const response of [
  {content:JSON.stringify(artifact),finishReason:'length'},
  {content:JSON.stringify({...artifact,brief:{...brief,title:'changed'}}),finishReason:'stop'},
  {content:JSON.stringify({...artifact,source:'export default function Scene(){fetch("https://example.com");return null}'}),finishReason:'stop'},
 ]){
  await writeFile(path.join(previous,'provider-2.json'),JSON.stringify(response));
  await assert.rejects(generateWorkbench({previous_directory:previous,feedback:'Fix'},out(root),{request:async()=>{calls++;return artifact;}}));
  assert.equal(calls,1);
 }
 await writeFile(path.join(previous,'provider-2.json'),raw);
 await writeFile(path.join(previous,'request-count.json'),JSON.stringify({requests_dispatched:1}));
 await assert.rejects(generateWorkbench({previous_directory:previous,feedback:'Fix'},out(root),{request:async()=>{calls++;return artifact;}}),/request record/);
 await writeFile(path.join(previous,'request-count.json'),JSON.stringify({requests_dispatched:2}));
 await writeFile(path.join(previous,'result.json'),'{}');
 await assert.rejects(generateWorkbench({previous_directory:previous,feedback:'Fix'},out(root),{request:async()=>{calls++;return artifact;}}),/published generation/);
 await rm(path.join(previous,'result.json'));
 await rm(path.join(previous,'provider-2.json'));
 await writeFile(path.join(root,'external-response.json'),raw);
 await symlink(path.join(root,'external-response.json'),path.join(previous,'provider-2.json'));
 await assert.rejects(generateWorkbench({previous_directory:previous,feedback:'Fix'},out(root),{request:async()=>{calls++;return artifact;}}),/retained file/);
 assert.equal(calls,1);
}));
async function generation(root:string){const dir=out(root);await generateWorkbench({brief,cues},dir,{request:async prompt=>prompt.includes('Act as a teaching motion designer')?design:artifact});return dir;}
test('preview rejects stale exact approval before rendering and blocks video on geometry failure',()=>fixture(async root=>{
 const dir=await generation(root),audio=path.join(root,'audio.wav');await writeFile(audio,'audio');let rendered=0;
 await assert.rejects(previewWorkbench({generation_directory:dir,sha256:'0'.repeat(64),scene,audio_file:audio},out(root),{stills:async()=>{rendered++;}}),/approval_required/);assert.equal(rendered,0);
 const destination=out(root);
 const result=await previewWorkbench({generation_directory:dir,sha256:sourceHash(artifact),scene,audio_file:audio},destination,{stills:async(_a,stills)=>{await mkdir(stills);await writeFile(path.join(stills,'frame-0.png'),'png');await writeFile(path.join(stills,'report.json'),JSON.stringify({sha256:sourceHash(artifact),designSha256:JSON.parse(await readFile(path.join(dir,'result.json'),'utf8')).design_sha256,geometry:{status:'failed'},frames:['frame-0.png']}));},render:async()=>{throw Error('must not render');}});
 assert.equal(result.geometry.status,'failed');assert.equal(result.video,undefined);assert.deepEqual(result.frames,['stills/frame-0.png']);
}));
test('export freezes sources and measured audio/captions into one render, not movie concat',()=>fixture(async root=>{
 const dir=await generation(root),audio=path.join(root,'audio.wav');await writeFile(audio,'audio');let renders=0;const destination=out(root);
 const result=await exportWorkbench({chapters:[{generation_directory:dir,sha256:sourceHash(artifact),scene,audio_file:audio},{generation_directory:dir,sha256:sourceHash(artifact),scene,audio_file:audio}]},destination,{render:async(manifest)=>{renders++;assert.deepEqual(manifest.chapters.map(c=>c.from),[0,60]);assert.equal(manifest.durationInFrames,120);assert.equal(manifest.chapters[0].sha256,sourceHash(artifact));}});
 assert.equal(renders,1);assert.equal(result.durationInFrames,120);assert.match(await readFile(path.join(destination,'video.srt'),'utf8'),/00:00:02,200 --> 00:00:03,800/);
}));
test('measured scene cannot change frozen narration, timing or cue track',()=>fixture(async root=>{
 const dir=await generation(root);for(const changed of [{...scene,duration_frames:61},{...scene,captions:[{...scene.captions[0],end_frame:53}]},{...scene,narration:{...scene.narration,text:'changed'}}])await assert.rejects(exportWorkbench({chapters:[{generation_directory:dir,sha256:sourceHash(artifact),scene:changed,audio_file:'unused'}]},out(root),{render:async()=>{}}),/workbench/);
}));
test('multiple original captions bind to one grouped design cue without removing display whitespace',()=>{
 const grouped={...scene,captions:[{text:' Mea\n',start_frame:6,end_frame:24},{text:'sured. ',start_frame:30,end_frame:54}]};
 assert.deepEqual(validateWorkbenchScene(grouped,artifact,parseDesign(design)).captions,grouped.captions);
 for(const captions of [[{...grouped.captions[0],start_frame:7},grouped.captions[1]],[grouped.captions[0],{...grouped.captions[1],end_frame:53}],[{...grouped.captions[0],end_frame:31},grouped.captions[1]],[grouped.captions[0],{...grouped.captions[1],text:'changed'}]])assert.throws(()=>validateWorkbenchScene({...scene,captions},artifact,parseDesign(design)),/workbench/);
});
test('grouped cue boundaries cannot split a measured original caption',()=>{
 const track=[{id:'first',text:'Mea',startFrame:6,endFrame:24},{id:'second',text:'sured.',startFrame:30,endFrame:54}];
 const groupedDesign=parseDesign({...design,cues:track,beats:track.map(c=>({...design.beats[0],cueId:c.id}))});
 assert.throws(()=>validateWorkbenchScene(scene,artifact,groupedDesign),/workbench/);
});
test('tampered frozen source or brief cannot pass the stored generation hash',()=>fixture(async root=>{
 const dir=await generation(root);await writeFile(path.join(dir,'artifact.json'),JSON.stringify({...artifact,brief:{...artifact.brief,title:'changed'}}));
 await assert.rejects(previewWorkbench({generation_directory:dir,sha256:sourceHash(artifact),scene,audio_file:'unused'},out(root)),/mismatch/);
}));
test('owned directories reject traversal, non UUID ownership and symlink escapes; render environment is allowlisted',()=>fixture(async root=>{
 const dir=out(root);await mkdir(dir);await validateOwnedDirectory(dir,root);
 await assert.rejects(validateOwnedDirectory(path.join(root,'arbitrary'),root));await assert.rejects(validateOwnedDirectory(root,root));
 const link=out(root);await symlink(os.tmpdir(),link);await assert.rejects(validateOwnedDirectory(link,root));
 await assert.rejects(validateOwnedDirectory(path.join(link,randomUUID()),link));
 const env=scrubRenderEnvironment({PATH:'/bin',HOME:'/home',NODE_ENV:'development',DEEPSEEK_API_KEY:'secret',AWS_SECRET_ACCESS_KEY:'secret',NODE_OPTIONS:'--require evil',CUSTOM_TOKEN:'secret'});assert.deepEqual(env,{PATH:'/bin',HOME:'/home'});
}));
test('render wrapper promptly kills a noisy child that ignores termination', {timeout:15000},()=>fixture(async root=>{
 const script=path.join(root,'noisy.mjs');await writeFile(script,"process.on('SIGTERM',()=>{});setInterval(()=>process.stdout.write('x'.repeat(65536)),10);");
 const started=Date.now();await assert.rejects(runRenderChild([script],5000),/output limit/);assert.ok(Date.now()-started<4500,'output overflow must not wait for the full render timeout');
}));
test('render child retains a private actionable failure record',()=>fixture(async root=>{
 await writeFile(path.join(root,'composition.json'),'{}');
 // This checks error diagnostics, not module startup speed during parallel compilation.
 await assert.rejects(runRenderChild([path.join(repositoryRoot,'packages/custom-scenes/src/workbench-render.ts'),root],30000),/render child failed \(1\)/);
 const failure=JSON.parse(await readFile(path.join(root,'render.failure.json'),'utf8'));assert.match(failure.error,/invalid render manifest/);assert.equal((await stat(path.join(root,'render.failure.json'))).mode&0o777,0o600);
}));
