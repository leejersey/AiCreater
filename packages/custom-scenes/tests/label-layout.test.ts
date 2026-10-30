import test from 'node:test';
import assert from 'node:assert/strict';
import {parseDesign,designHash} from '../src/design';
import {proposeLabelLayout} from '../src/label-layout';
import {mkdtemp,writeFile,readFile,rm} from 'node:fs/promises';
import {spawnSync} from 'node:child_process';
import path from 'node:path';
import os from 'node:os';
import {repositoryRoot} from '../src/files';

const object=(id:string,x:number,y:number,width:number,height:number,kind:'solid'|'label'|'path'='solid')=>({id,meaning:id,appearance:'outline',x,y,width,height,kind});
const design=(objects=[object('generator',1470,300,300,470),object('answer',1650,300,150,200),object('step',1535,255,170,52,'label')])=>parseDesign({schemaVersion:'visual-design:1',brief:{schemaVersion:'custom-scene-brief:1',id:'label-test',title:'Test',narration:'Show.',visualGoal:'Show mechanism',facts:[],materials:[],width:1920,height:1080,fps:30,durationInFrames:60},cues:[{id:'cue',text:'Show.',startFrame:0,endFrame:60}],thesis:'Mechanism',metaphor:'Machine',objects,beats:[{cueId:'cue',focus:objects[0].id,action:'hold',changes:[{objectId:objects[0].id,from:'shown',to:'shown'}]}],composition:'Separated',palette:'blueprint',overlaps:objects.some(o=>o.id==='answer')?[{a:'generator',b:'answer',reason:'Answer emerges from the machine'}]:[],avoid:['cards'],acceptance:['readable']});

test('proposal solves the real 7px label intrusion with 12px clearance without editing input or entities',()=>{
 const input=design(),before=JSON.stringify(input),result=proposeLabelLayout(input);
 assert.equal(result.status,'proposal');assert.equal(result.accepted,false);
 assert.equal(result.layoutPreflight,'passed');assert.equal(result.moves.length,1);
 assert.deepEqual(result.moves[0],{objectId:'step',from:{x:1535,y:255},to:{x:1535,y:236}});
 assert.equal(JSON.stringify(input),before);assert.equal(result.originalDesignSha256,designHash(input));
 assert.notEqual(result.proposedDesignSha256,result.originalDesignSha256);
 assert.deepEqual(result.design.objects.filter(o=>o.kind!=='label'),input.objects.filter(o=>o.kind!=='label'));
 assert.deepEqual(result.design.beats,input.beats);assert.deepEqual(result.design.overlaps,input.overlaps);
 assert.deepEqual(proposeLabelLayout(input),result);
});
test('offline CLI writes a separate proposal and design, never overwrites input or existing output',async()=>{
 const root=await mkdtemp(path.join(os.tmpdir(),'label-proposal-'));
 try{
  const input=path.join(root,'input.json'),out=path.join(root,'proposal.json'),original=JSON.stringify(design());await writeFile(input,original);
  const run=()=>spawnSync(process.execPath,['--import','tsx','scripts/visual-agent.ts','propose-label-layout',input,out],{cwd:repositoryRoot,env:{PATH:process.env.PATH,HOME:process.env.HOME},encoding:'utf8',timeout:30000});
  const result=run();assert.ifError(result.error);assert.equal(result.status,0,result.stderr);
  const proposal=JSON.parse(await readFile(out,'utf8'));assert.equal(proposal.accepted,false);assert.equal(proposal.layoutPreflight,'passed');
  assert.deepEqual(JSON.parse(await readFile(out+'.design.json','utf8')),proposal.design);
  assert.equal(await readFile(input,'utf8'),original);
  assert.notEqual(run().status,0);assert.equal(await readFile(input,'utf8'),original);
 }finally{await rm(root,{recursive:true,force:true});}
});
test('no available bounded vertical position leaves the label unchanged and reports failure',()=>{
 const input=design(),result=proposeLabelLayout(input,{maxDistance:5});
 assert.equal(result.layoutPreflight,'failed');assert.equal(result.moves.length,0);
 assert.equal(result.design.objects.at(-1)!.y,255);assert.ok(result.unresolved.some(f=>f.kind==='label-overlap'));
});
test('solver never repairs solid collisions, edits paths, or moves clean labels',()=>{
 const input=design([object('a',100,200,200,200),object('b',150,250,200,200),object('path',500,200,200,100,'path'),object('label',520,220,100,40,'label')]);
 const result=proposeLabelLayout(input);
 assert.equal(result.moves.length,0);assert.equal(result.layoutPreflight,'failed');assert.equal(result.unresolved[0].kind,'object-overlap');
 assert.deepEqual(result.design,input);
});
test('caption bounds, other labels and displacement limits remain hard constraints',()=>{
 const input=design([object('machine',500,300,300,300),object('label-a',520,280,100,40,'label'),object('label-b',520,236,100,32,'label')]);
 const result=proposeLabelLayout(input);assert.equal(result.layoutPreflight,'passed');
 for(const move of result.moves)assert.ok(Math.abs(move.to.y-move.from.y)<=96);
 const bottom=proposeLabelLayout(design([object('machine',100,200,200,200),object('label',500,950,100,40,'label')]));
 assert.equal(bottom.layoutPreflight,'passed');assert.ok(bottom.design.objects[1].y+40<=980);
 for(const options of [{clearance:-1},{clearance:33},{maxDistance:241},{maxDistance:1.5}])assert.throws(()=>proposeLabelLayout(input,options),/options/);
});
