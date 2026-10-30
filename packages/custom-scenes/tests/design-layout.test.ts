import test from 'node:test';
import assert from 'node:assert/strict';
import {parseDesign,designHash,buildDesignPrompt,buildScenePrompt} from '../src/design';
import {designLayoutFindings,assertDesignLayout} from '../src/design-layout';
import {mkdtemp,writeFile,rm} from 'node:fs/promises';
import {spawnSync} from 'node:child_process';
import path from 'node:path';
import os from 'node:os';
import {repositoryRoot} from '../src/files';

const brief={schemaVersion:'custom-scene-brief:1',id:'layout',title:'流程',narration:'检索。',visualGoal:'说明机制',facts:[],materials:[],width:1920,height:1080,fps:30,durationInFrames:90};
const object=(id:string,x:number,y:number,width:number,height:number)=>({id,meaning:id,appearance:'轮廓',x,y,width,height});
const design=(extra={})=>parseDesign({schemaVersion:'visual-design:1',brief,cues:[{id:'retrieve',text:'检索。',startFrame:0,endFrame:90}],thesis:'连续流程',metaphor:'传送',objects:[object('gantry',560,420,420,320),object('sleeve',760,560,300,260)],beats:[{cueId:'retrieve',focus:'gantry',action:'移动',changes:[{objectId:'sleeve',from:'打开',to:'装入'}]}],composition:'分区布局',palette:'blueprint',avoid:['卡片'],acceptance:['对象清楚'],...extra});

test('real RAG partial intersection is rejected before code generation',()=>{
 const d=design();assert.equal(designLayoutFindings(d)[0].kind,'object-overlap');
 assert.throws(()=>assertDesignLayout(d),/layout.*gantry.*sleeve/);
});
test('intentional overlap needs a named pair and explanation; caption area remains protected',()=>{
 const d=design({overlaps:[{a:'gantry',b:'sleeve',reason:'支架与承载套筒装配'}]});
 assert.doesNotThrow(()=>assertDesignLayout(d));
 assert.throws(()=>design({overlaps:[{a:'missing',b:'sleeve',reason:'装配'}]}),/overlap/);
 assert.throws(()=>design({overlaps:[{a:'gantry',b:'gantry',reason:'装配'}]}),/overlap/);
 assert.throws(()=>design({overlaps:[{a:'gantry',b:'sleeve',reason:' ' }]}),/text/);
 assert.throws(()=>design({overlaps:[{a:'gantry',b:'sleeve',reason:'装配'},{a:'sleeve',b:'gantry',reason:'重复'}]}),/overlap/);
 const bottom=design({objects:[object('gantry',100,900,200,120),object('sleeve',500,500,100,100)]});
 assert.throws(()=>assertDesignLayout(bottom),/caption/);
});
test('touching boundaries and explicit depth overlap are supported without silently inferring intent',()=>{
 const touching=design({objects:[object('gantry',100,200,200,200),object('sleeve',300,200,200,200)]});
 assert.deepEqual(designLayoutFindings(touching),[]);
 const nested=design({objects:[object('gantry',100,200,500,500),object('sleeve',200,300,100,100)]});
 assert.throws(()=>assertDesignLayout(nested),/overlap/);
});
test('independent labels cannot use overlap declarations to cover solid artwork',()=>{
 const d=design({objects:[object('gantry',700,300,330,420),{...object('sleeve',760,600,70,70),kind:'label'}],overlaps:[{a:'gantry',b:'sleeve',reason:'附在机器上'}]});
 assert.equal(designLayoutFindings(d)[0].kind,'label-overlap');
 assert.throws(()=>assertDesignLayout(d),/label/);
});
test('label bounds are protected even at small intersections but may touch edges',()=>{
 const make=(x:number)=>design({objects:[object('gantry',100,200,100,100),{...object('sleeve',x,220,70,70),kind:'label'}]});
 assert.equal(designLayoutFindings(make(199))[0].kind,'label-overlap');
 assert.deepEqual(designLayoutFindings(make(200)),[]);
 const bottom=design({objects:[object('gantry',100,200,100,100),{...object('sleeve',500,950,70,70),kind:'label'}]});
 assert.equal(designLayoutFindings(bottom)[0].kind,'caption-area');
});
test('independent labels cannot masquerade as physical assembly parts or parents',()=>{
 assert.throws(()=>design({objects:[object('gantry',100,200,300,300),{...object('sleeve',120,220,70,70),kind:'label',parentId:'gantry'}]}),/parent/);
 assert.throws(()=>design({objects:[{...object('gantry',100,200,300,300),kind:'label'},{...object('sleeve',120,220,70,70),parentId:'gantry'}]}),/parent/);
});
test('explicit paths do not act as filled obstacles, but solid intersections still fail',()=>{
 const d=design({objects:[object('gantry',520,260,260,300),{...object('route',560,300,320,260),kind:'path'},object('sleeve',820,330,300,200)]});
 assert.deepEqual(designLayoutFindings(d),[]);
 const solids=design({objects:[{...object('gantry',100,200,500,500),kind:'solid'},object('sleeve',200,300,100,100)]});
 assert.throws(()=>assertDesignLayout(solids),/overlap/);
});
test('paths still respect caption bounds and classification is explicit, not inferred from names',()=>{
 const bottom=design({objects:[object('gantry',100,200,100,100),{...object('sleeve',500,900,100,100),kind:'path'}]});
 assert.deepEqual(designLayoutFindings(bottom).map(f=>f.kind),['caption-area']);
 const legacy=design({objects:[object('gantry',520,260,260,300),object('route-retrieve',560,300,320,260)],beats:[{cueId:'retrieve',focus:'gantry',action:'移动',changes:[{objectId:'route-retrieve',from:'隐藏',to:'可见'}]}]});
 assert.throws(()=>assertDesignLayout(legacy),/overlap/);
});
test('object kind is strictly validated, preserved in hashes, and requested by both prompts',()=>{
 const old=design(),raw=JSON.parse(JSON.stringify(old));
 assert.equal(Object.hasOwn(old.objects[0],'kind'),false);
 raw.objects[0].kind='path';const next=parseDesign(raw);
 assert.equal(next.objects[0].kind,'path');assert.notEqual(designHash(next),designHash(old));
 for(const kind of ['route',null,1]){raw.objects[0].kind=kind;assert.throws(()=>parseDesign(raw),/kind/);}
 assert.match(buildDesignPrompt(old.brief,old.cues),/kind.*solid.*path/);
 assert.match(buildScenePrompt(next),/path.*stroke-only/);
});
test('explicit assembly ownership permits only the direct parent pair, not sibling collisions',()=>{
 const objects=[object('gantry',760,300,300,420),{...object('sleeve',830,380,160,90),parentId:'gantry'}];
 assert.deepEqual(designLayoutFindings(design({objects})),[]);
 const siblings=design({objects:[...objects,{...object('latch',850,400,100,40),parentId:'gantry'}]});
 assert.deepEqual(designLayoutFindings(siblings).map(f=>f.objects),[['sleeve','latch']]);
 const bottom=design({objects:[object('gantry',100,800,300,180),{...object('sleeve',120,940,100,60),parentId:'gantry'}]});
 assert.deepEqual(designLayoutFindings(bottom).map(f=>f.kind),['caption-area']);
});
test('assembly parents must exist, be solid, and form an acyclic ownership forest',()=>{
 for(const parentId of ['missing','sleeve','',false,12]){
  assert.throws(()=>design({objects:[object('gantry',100,200,300,300),{...object('sleeve',120,220,100,100),parentId}]}),/parent|id|text/);
 }
 assert.throws(()=>design({objects:[{...object('gantry',100,200,300,300),kind:'path'},{...object('sleeve',120,220,100,100),parentId:'gantry'}]}),/parent/);
 assert.throws(()=>design({objects:[{...object('gantry',100,200,300,300),parentId:'sleeve'},{...object('sleeve',120,220,100,100),parentId:'gantry'}]}),/parent/);
});
test('ownership binds hashes without adding fields to legacy objects and reaches both prompts',()=>{
 const legacy=design(),raw=JSON.parse(JSON.stringify(legacy));
 assert.equal(Object.hasOwn(legacy.objects[1],'parentId'),false);
 raw.objects[1].parentId='gantry';const next=parseDesign(raw);
 assert.equal(next.objects[1].parentId,'gantry');assert.notEqual(designHash(next),designHash(legacy));
 assert.match(buildDesignPrompt(legacy.brief,legacy.cues),/parentId/);
 assert.match(buildScenePrompt(next),/parentId.*world-space/);
});
test('historical designs retain their original canonical hash while declarations bind new hashes',()=>{
 const d=design();assert.equal(Object.hasOwn(d,'overlaps'),false);
 assert.equal(designHash(d),designHash(JSON.parse(JSON.stringify(d))));
 assert.notEqual(designHash(d),designHash(design({overlaps:[{a:'gantry',b:'sleeve',reason:'装配'}]})));
});
test('both generation and repair prompts receive findings and concrete atomic-motion rules',()=>{
 const d=design(),prompt=buildScenePrompt(d,undefined,undefined,'Fix layout');
 assert.match(buildDesignPrompt(d.brief,d.cues),/overlaps/);
 assert.match(prompt,/LAYOUT_PREFLIGHT/);assert.match(prompt,/gantry/);
 assert.match(prompt,/shared parent/);assert.match(prompt,/local \(0,0\)/);
 assert.match(prompt,/boundary - 1/);assert.match(prompt,/snapshot.*world/i);
});
test('CLI code preparation refuses a colliding plan before any provider request',async()=>{
 const dir=await mkdtemp(path.join(os.tmpdir(),'layout-gate-'));
 try{
  const file=path.join(dir,'design.json');await writeFile(file,JSON.stringify(design()));
  const result=spawnSync(process.execPath,[path.join(repositoryRoot,'node_modules/tsx/dist/cli.mjs'),path.join(repositoryRoot,'scripts/visual-agent.ts'),'prepare-code',file,path.join(dir,'prompt.txt')],{cwd:repositoryRoot,env:{NODE_ENV:'test',PATH:process.env.PATH,HOME:process.env.HOME},encoding:'utf8',timeout:15000});
  assert.notEqual(result.status,0);assert.match(result.stderr,/layout preflight/);
 }finally{await rm(dir,{recursive:true,force:true});}
});
