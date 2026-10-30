import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,mkdir,readFile,writeFile,rm} from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {parseBrief} from '../src/contract';
import {generateWorkbench} from '../src/workbench';
import {designInputHash} from '../src/design-content';

const brief=parseBrief({schemaVersion:'custom-scene-brief:1',id:'compact',title:'Flow',narration:'Move.',visualGoal:'Move a file',facts:[],materials:[],width:1920,height:1080,fps:30,durationInFrames:60});
const cues=[{id:'cue',text:'Move.',startFrame:6,endFrame:54}];
const content=()=>({schemaVersion:'visual-design-content:1',inputSha256:designInputHash(brief,cues),thesis:'Move',metaphor:'File',objects:[{id:'file',meaning:'input',appearance:'paper',x:100,y:100,width:100,height:100,kind:'solid',states:[{id:'shown',appearance:'visible'}]}],beats:[{cueId:'cue',focus:'file',action:'move',changes:[{objectId:'file',from:'left',to:'right',fromState:'shown',toState:'shown'}]}],composition:'Open',palette:'blueprint',avoid:['cards'],acceptance:['same file'],overlaps:[]});
async function fixture(fn:(root:string)=>Promise<void>){const root=await mkdtemp(path.join(os.tmpdir(),'compact-design-'));try{await fn(root);}finally{await rm(root,{recursive:true,force:true});}}
const read=async(root:string,name:string)=>JSON.parse(await readFile(path.join(root,name),'utf8'));

test('host-intent requests compact design and recovers its bound frozen design after a data failure',()=>fixture(async root=>{
 const first=path.join(root,'first');let calls=0;
 await assert.rejects(generateWorkbench({brief,cues,generation_mode:'host-intent'},first,{request:async(prompt,options)=>{
  calls++;
  if(calls===1){assert.equal(options.outputSchema?.name,'visual_design_content_v1');assert.match(prompt,/HOST_OWNED_DESIGN_INPUT/);await options.onResponse?.({content:JSON.stringify(content()),finishReason:'stop'});return content();}
  assert.equal(options.outputSchema?.name,'object_motion_data_v1');throw Error('OFFLINE_DATA_STOP');
 }}),/OFFLINE_DATA_STOP/);
 assert.equal(calls,2);
 const frozen=await read(first,'frozen-design.json');assert.deepEqual(frozen.brief,brief);assert.deepEqual(frozen.cues,cues);
 assert.equal(frozen.schemaVersion,'visual-design:1');assert.equal(Object.hasOwn(frozen,'inputSha256'),false);
 assert.deepEqual(await read(first,'design-input.json'),{schemaVersion:'visual-design-input:1',brief,cues});
 let repairs=0;
 await assert.rejects(generateWorkbench({previous_directory:first,feedback:'Fix data'},path.join(root,'repair'),{request:async()=>{repairs++;throw Error('OFFLINE_REPAIR_STOP');}}),/OFFLINE_REPAIR_STOP/);
 assert.equal(repairs,1);
 await assert.rejects(generateWorkbench({previous_directory:path.join(root,'repair'),feedback:'Fix again'},path.join(root,'repair-again'),{request:async()=>{repairs++;throw Error('OFFLINE_SECOND_REPAIR_STOP');}}),/OFFLINE_SECOND_REPAIR_STOP/);
 assert.equal(repairs,2);assert.equal((await read(path.join(root,'repair-again'),'request-count.json')).requests_dispatched,1);
 const input=await read(first,'design-input.json');input.brief.title='tampered';await writeFile(path.join(first,'design-input.json'),JSON.stringify(input));
 await assert.rejects(generateWorkbench({previous_directory:first,feedback:'Fix data'},path.join(root,'tampered'),{request:async()=>{throw Error('must not dispatch');}}),/design input mismatch/);
}));

test('missing compact visual data stops at one request with no automatic defaults or fallback',()=>fixture(async root=>{
 const first=path.join(root,'first');let calls=0;const invalid:any=content();delete invalid.overlaps;
 await assert.rejects(generateWorkbench({brief,cues,generation_mode:'host-intent'},first,{request:async()=>{calls++;return invalid;}}),/visual_design_content/);
 assert.equal(calls,1);assert.equal((await read(first,'failure.json')).requests_dispatched,1);
 await assert.rejects(read(first,'frozen-design.json'),/ENOENT/);await assert.rejects(read(first,'provider-2.request.json'),/ENOENT/);
}));

test('historical full host-intent design responses remain recoverable without a compact input record',()=>fixture(async root=>{
 const first=path.join(root,'legacy');await mkdir(first);
 const {inputSha256,schemaVersion,...visual}=content();const legacy={...visual,schemaVersion:'visual-design:1',brief,cues};
 for(const [name,value] of Object.entries({'generation-mode.json':{generation_mode:'host-intent'},'failure.json':{failed:true,requests_dispatched:2},'request-count.json':{requests_dispatched:2},'provider-1.json':{content:JSON.stringify(legacy),finishReason:'stop'},'frozen-design.json':legacy}))await writeFile(path.join(first,name),JSON.stringify(value));
 let calls=0;await assert.rejects(generateWorkbench({previous_directory:first,feedback:'Fix motion'},path.join(root,'repair'),{request:async()=>{calls++;throw Error('LEGACY_DATA_STOP');}}),/LEGACY_DATA_STOP/);assert.equal(calls,1);
}));

test('a compact retained design can reach the normal revision path without leaking host fields into its output contract',()=>fixture(async root=>{
 const previous=content();previous.beats[0].changes[0].fromState='unknown';let calls=0;
 await assert.rejects(generateWorkbench({brief,cues,generation_mode:'host-intent',previous_design:previous,feedback:'Fix state',diagnostic:'unknown state'},path.join(root,'revision'),{request:async(prompt,options)=>{
  calls++;assert.equal(options.outputSchema?.name,'visual_design_content_v1');assert.match(prompt,/RETAINED_DESIGN_REVISION/);assert.match(prompt,/"fromState":"unknown"/);
  throw Error('OFFLINE_REVISION_STOP');
 }}),/OFFLINE_REVISION_STOP/);assert.equal(calls,1);
}));
