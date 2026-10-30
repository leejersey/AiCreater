import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,mkdir,writeFile,readFile,rm} from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import {prepareSourceRecovery,loadSourceRecovery} from '../src/source-recovery-workbench';
import {parseDesign} from '../src/design';
import {generateWorkbench,previewWorkbench} from '../src/workbench';

const brief={schemaVersion:'custom-scene-brief:1',id:'example',title:'Example',narration:'Measured.',visualGoal:'Show change',facts:[],materials:[],width:1920,height:1080,fps:30,durationInFrames:60};
const design=parseDesign({schemaVersion:'visual-design:1',brief,cues:[{id:'one',text:'Measured.',startFrame:6,endFrame:54}],thesis:'Change',metaphor:'Paper',objects:[{id:'paper',meaning:'input',appearance:'folded paper',x:100,y:200,width:100,height:100}],beats:[{cueId:'one',focus:'paper',action:'move',changes:[{objectId:'paper',from:'left',to:'right'}]}],composition:'Center',palette:'blueprint',avoid:['cards'],acceptance:['visible change'],overlaps:[]});
const artifact={schemaVersion:'custom-scene:1',brief:design.brief,rationale:'Draw',source:'export default function Scene(){return <svg/>}'};
const suffix='</\uFF5C\uFF5CDSML\uFF5C\uFF5C parameter>\n</\uFF5C\uFF5CDSML\uFF5C\uFF5C invoke>\n</\uFF5C\uFF5CDSML\uFF5C\uFF5C calls>';
async function fixture(fn:(root:string,parent:string)=>Promise<void>){
 const root=await mkdtemp(path.join(os.tmpdir(),'recovery-workbench-')),parent=path.join(root,'parent');await mkdir(parent);
 for(const [name,value] of Object.entries({'generation-mode.json':{generation_mode:'source'},'failure.json':{failed:true,requests_dispatched:2},'request-count.json':{requests_dispatched:2},'frozen-design.json':design,'provider-2.json':{content:JSON.stringify(artifact)+suffix,finishReason:'stop'}}))await writeFile(path.join(parent,name),JSON.stringify(value));
 try{await fn(root,parent);}finally{await rm(root,{recursive:true,force:true});}
}
test('zero-request inspection freezes a non-executable proposal; repair reload verifies exact hashes and origin',()=>fixture(async(root,parent)=>{
 const out=path.join(root,'out'),result=await prepareSourceRecovery({generation_directory:parent,brief:design.brief,cues:design.cues},out);
 assert.equal(result.requests_dispatched,0);assert.equal(result.execution,'not_run');assert.equal(result.production_adopted,false);assert.equal(result.diagnostic,true);
 const binding={generation_directory:parent,sha256:result.sha256,recovery_sha256:result.recovery_sha256};
 const loaded=await loadSourceRecovery(out,binding);assert.equal(loaded.artifact.source,artifact.source);
 await assert.rejects(readFile(path.join(out,'artifact.json')),/ENOENT/);
 await assert.rejects(loadSourceRecovery(out,{...binding,sha256:'a'.repeat(64)}),/recovery.*mismatch/);
 await assert.rejects(loadSourceRecovery(out,{...binding,recovery_sha256:'a'.repeat(64)}),/recovery.*mismatch/);
 await writeFile(path.join(out,'source.txt'),'changed');await assert.rejects(loadSourceRecovery(out,binding),/recovery.*mismatch/);
}));
test('changed original response, successful parent, changed timing and non-source modes cannot recover',()=>fixture(async(root,parent)=>{
 const input={generation_directory:parent,brief:design.brief,cues:design.cues};
 const result=await prepareSourceRecovery(input,path.join(root,'out'));
 await writeFile(path.join(parent,'provider-2.json'),JSON.stringify({content:JSON.stringify({...artifact,rationale:'Changed'})+suffix,finishReason:'stop'}));
 await assert.rejects(loadSourceRecovery(path.join(root,'out'),{generation_directory:parent,sha256:result.sha256,recovery_sha256:result.recovery_sha256}),/recovery.*mismatch/);
 await assert.rejects(prepareSourceRecovery({...input,cues:[{...design.cues[0],startFrame:7}]},path.join(root,'bad-timing')),/cue_mismatch/);
 await writeFile(path.join(parent,'generation-mode.json'),JSON.stringify({generation_mode:'host-motion'}));
 await assert.rejects(prepareSourceRecovery(input,path.join(root,'bad-mode')),/source mode/);
 await writeFile(path.join(parent,'generation-mode.json'),JSON.stringify({generation_mode:'source'}));await writeFile(path.join(parent,'result.json'),'{}');
 await assert.rejects(prepareSourceRecovery(input,path.join(root,'succeeded')),/failed parent/);
}));
test('explicit recovery repair dispatches exactly one code request and cannot preview the diagnostic itself',()=>fixture(async(root,parent)=>{
 const recovery=path.join(root,'recovery'),result=await prepareSourceRecovery({generation_directory:parent,brief:design.brief,cues:design.cues},recovery);let calls=0;
 const binding={generation_directory:parent,sha256:result.sha256,recovery_sha256:result.recovery_sha256};
 const out=path.join(root,'repair');
 const repaired=await generateWorkbench({previous_directory:recovery,recovery:binding,feedback:'Fix the real motion'},out,{request:async(prompt,options)=>{
  calls++;assert.match(prompt,/Fix the real motion/);assert.ok(prompt.includes(artifact.source));assert.equal(options.outputSchema?.name,'scene_artifact_v1');return artifact;
 }});
 assert.equal(calls,1);assert.equal(repaired.requests_dispatched,1);
 assert.deepEqual(JSON.parse(await readFile(path.join(out,'recovery-input.json'),'utf8')),binding);
 await assert.rejects(readFile(path.join(out,'provider-2.request.json')),/ENOENT/);
 let renders=0;
 await assert.rejects(previewWorkbench({generation_directory:recovery,sha256:result.sha256,scene:{duration_frames:60,narration:{text:design.brief.narration,audio_start_frame:6},captions:[{text:design.brief.narration,start_frame:6,end_frame:54}]},audio_file:path.join(root,'none.wav')},path.join(root,'preview'),{stills:async()=>{renders++;}}));
 assert.equal(renders,0);
}));
