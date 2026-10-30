import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,mkdir,writeFile,readFile,rm} from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import {prepareLayoutProposal,loadLayoutProposal} from '../src/layout-workbench';
import {generateWorkbench} from '../src/workbench';

const brief={schemaVersion:'custom-scene-brief:1',id:'example',title:'Example',narration:'Measured.',visualGoal:'Show change',facts:[],materials:[],width:1920,height:1080,fps:30,durationInFrames:60};
const design={schemaVersion:'visual-design:1',brief,cues:[{id:'one',text:'Measured.',startFrame:6,endFrame:54}],thesis:'Change',metaphor:'Paper',objects:[{id:'paper',meaning:'input',appearance:'paper',x:100,y:200,width:100,height:100,kind:'solid'},{id:'label',meaning:'name',appearance:'text',x:100,y:200,width:100,height:30,kind:'label'}],beats:[{cueId:'one',focus:'paper',action:'move',changes:[{objectId:'paper',from:'left',to:'right'}]}],composition:'Center',palette:'blueprint',avoid:['cards'],acceptance:['visible change'],overlaps:[]};
async function fixture(fn:(root:string,parent:string)=>Promise<void>){
 const root=await mkdtemp(path.join(os.tmpdir(),'layout-workbench-')),parent=path.join(root,'parent');await mkdir(parent);
 for(const [name,value] of Object.entries({'generation-mode.json':{generation_mode:'source'},'failure.json':{failed:true,requests_dispatched:1,code:'layout_preflight'},'request-count.json':{requests_dispatched:1},'frozen-design.json':design,'provider-1.json':{content:JSON.stringify(design),finishReason:'stop'}}))await writeFile(path.join(parent,name),JSON.stringify(value));
 try{await fn(root,parent);}finally{await rm(root,{recursive:true,force:true});}
}
test('layout proposal moves only label and explicit adoption requests code once without execution',()=>fixture(async(root,parent)=>{
 const directory=path.join(root,'proposal');const result=await prepareLayoutProposal({generation_directory:parent,brief,cues:design.cues},directory);
 assert.equal(result.layout_preflight,'passed');assert.equal(result.moves.length,1);assert.equal(result.moves[0].objectId,'label');assert.equal(result.requests_dispatched,0);
 const binding={generation_directory:parent,design_sha256:result.design_sha256,layout_sha256:result.layout_sha256};
 const loaded=await loadLayoutProposal(directory,binding);assert.deepEqual(loaded.objects[0],design.objects[0]);
 let calls=0;const out=path.join(root,'code');
 const generated=await generateWorkbench({layout_directory:directory,layout:binding},out,{request:async(_prompt,options)=>{calls++;assert.equal(options.outputSchema?.name,'scene_artifact_v1');return {schemaVersion:'custom-scene:1',brief,rationale:'Draw',source:'export default function Scene(){return <svg/>}'};}});
 assert.equal(calls,1);assert.equal(generated.requests_dispatched,1);
 await assert.rejects(readFile(path.join(out,'provider-2.request.json')),/ENOENT/);
 await assert.rejects(loadLayoutProposal(directory,{...binding,layout_sha256:'a'.repeat(64)}),/mismatch/);
 await writeFile(path.join(parent,'provider-1.json'),'{}');await assert.rejects(loadLayoutProposal(directory,binding));
}));
test('unresolved solid overlap is retained and cannot be adopted',()=>fixture(async(root,parent)=>{
 const bad={...design,objects:[design.objects[0],{...design.objects[0],id:'other'}]};
 await writeFile(path.join(parent,'frozen-design.json'),JSON.stringify(bad));await writeFile(path.join(parent,'provider-1.json'),JSON.stringify({content:JSON.stringify(bad),finishReason:'stop'}));
 const out=path.join(root,'proposal');const result=await prepareLayoutProposal({generation_directory:parent,brief,cues:design.cues},out);
 assert.equal(result.layout_preflight,'failed');assert.equal(result.moves.length,0);assert.ok(result.unresolved.length);
 await assert.rejects(loadLayoutProposal(out,{generation_directory:parent,design_sha256:result.design_sha256,layout_sha256:result.layout_sha256}),/unresolved/);
}));
