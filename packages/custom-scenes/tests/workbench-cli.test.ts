import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,writeFile,rm,stat} from 'node:fs/promises';
import {spawnSync} from 'node:child_process';
import {randomUUID} from 'node:crypto';
import os from 'node:os';
import path from 'node:path';
import {repositoryRoot} from '../src/files';

test('CLI forwards retained design revisions and rejects incomplete or extra fields before dispatch',async()=>{
 const root=await mkdtemp(path.join(os.tmpdir(),'workbench-cli-'));
 const brief={schemaVersion:'custom-scene-brief:1',id:'example',title:'Example',narration:'Measured.',visualGoal:'Show change',facts:[],materials:[],width:1920,height:1080,fps:30,durationInFrames:60};
 const base={brief,cues:[{id:'cue',text:'Measured.',startFrame:6,endFrame:54}]};
 const revision={...base,previous_design:{},feedback:'Reset the label',diagnostic:'state continuity mismatch'};
 const retained={schemaVersion:'visual-design:1',...base,thesis:'Change',metaphor:'Movement',objects:[{id:'object',meaning:'thing',appearance:'circle',x:100,y:100,width:100,height:100,kind:'solid',states:[{id:'shown',appearance:'visible'}]}],beats:[{cueId:'cue',focus:'object',action:'hold',changes:[{objectId:'object',from:'visible',to:'visible',fromState:'shown',toState:'shown'}]}],composition:'Center',palette:'blueprint',overlaps:[],avoid:['cards'],acceptance:['visible change']};
 try{
  const cases:[Record<string,unknown>,RegExp][]=[
   [revision,/revision.*schema/],
   [{...revision,generation_mode:'host-motion'},/revision.*schema/],
   [{...revision,generation_mode:'host-intent'},/revision.*schema/],
   [{...revision,generation_mode:'host-components'},/revision.*schema/],
   [{...base,brief:{...brief,durationInFrames:0},generation_mode:'host-components'},/invalid timing or version/],
   [{...base,generation_mode:'unknown'},/invalid generation mode/],
   [{...revision,previous_design:retained,feedback:''},/invalid revision feedback/],
   [{...revision,previous_design:retained,diagnostic:42},/invalid revision feedback/],
   [{...base,previous_design:{}},/unexpected input fields/],
   [{...base,feedback:'orphan feedback'},/unexpected input fields/],
   [{...revision,extra:true},/unexpected input fields/],
  ];
  for(const [input,expected] of cases){
   const inputFile=path.join(root,'input.json'),output=path.join(repositoryRoot,'output/visual-workbench',randomUUID());
   await writeFile(inputFile,JSON.stringify(input));
   const child=spawnSync(process.execPath,[path.join(repositoryRoot,'node_modules/tsx/dist/cli.mjs'),path.join(repositoryRoot,'scripts/visual-workbench.ts'),'generate',inputFile,output],{cwd:repositoryRoot,env:{PATH:process.env.PATH,HOME:process.env.HOME},encoding:'utf8',timeout:30000});
   assert.ifError(child.error);assert.equal(child.status,1);assert.match(child.stderr,expected);
   await assert.rejects(stat(output),/ENOENT/);
  }
 }finally{await rm(root,{recursive:true,force:true});}
});
