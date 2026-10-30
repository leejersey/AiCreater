import test from 'node:test';
import assert from 'node:assert/strict';
import {teachingStructures} from '../src/teaching-plan';
import {buildTeachingLayout,routeTeachingBody,compileTeachingBodyRoute,TeachingGeometryError} from '../src/teaching-layout';
import {evaluateMotion} from '../src/motion-plan';
import {teachingBrief as brief,teachingCues as cues,teachingExample} from './fixtures/teaching-examples';

const overlaps=(a:{x:number;y:number;width:number;height:number},b:typeof a)=>a.x<b.x+b.width&&a.x+a.width>b.x&&a.y<b.y+b.height&&a.y+a.height>b.y;
test('six structure layouts preserve every identity at full readable scale inside the safe stage',()=>{
 for(const kind of teachingStructures){
  const plan=teachingExample(kind),layout=buildTeachingLayout(plan,brief,cues);
  assert.deepEqual(layout,buildTeachingLayout(plan,brief,cues));
  assert.deepEqual(layout.objects.map(o=>o.id).sort(),plan.objects.map(o=>o.id).sort());
  assert.equal(layout.renderable,false);assert.equal(layout.accepted,false);
  assert.ok(Object.isFrozen(layout.objects));assert.match(layout.layoutSha256,/^[a-f0-9]{64}$/);
  for(const o of layout.objects){
   assert.equal(o.scale,1);assert.ok(Object.values(o.bounds).every(Number.isFinite));
   assert.ok(o.bounds.x>=layout.stage.x&&o.bounds.y>=layout.stage.y);
   assert.ok(o.bounds.x+o.bounds.width<=layout.stage.x+layout.stage.width);
   assert.ok(o.bounds.y+o.bounds.height<=layout.stage.y+layout.stage.height);
   for(const other of layout.objects)if(o.id!==other.id)assert.equal(overlaps(o.bounds,other.bounds),false,kind+' '+o.id+'/'+other.id);
   for(const [name,p] of Object.entries(o.ports)){
    const local=o.asset.ports[name];assert.deepEqual(p,{x:o.bounds.x+local.x,y:o.bounds.y+local.y});
   }
  }
 }
});

test('object array order cannot move layouts and changes to text still rebind the layout hash',()=>{
 const plan=teachingExample('loop'),first=buildTeachingLayout(plan,brief,cues);
 plan.objects.reverse();const reversed=buildTeachingLayout(plan,brief,cues);
 assert.deepEqual(reversed.objects,first.objects);
 assert.notEqual(reversed.layoutSha256,first.layoutSha256);
 plan.objects[0].label='New';assert.notEqual(buildTeachingLayout(plan,brief,cues).layoutSha256,reversed.layoutSha256);
});

test('unplaceable annotations fail rather than shrink labels or drop objects',()=>{
 const plan=teachingExample('state-change');
 for(let i=0;i<5;i++)plan.objects.push({id:'extra-'+i,component:'document',meaning:'extra',label:'extra',ownerId:null,initialState:'waiting'});
 assert.throws(()=>buildTeachingLayout(plan,brief,cues),(e:unknown)=>e instanceof TeachingGeometryError&&e.code==='layout');
});

const stage={x:0,y:0,width:700,height:500};
test('body routing uses full cargo dimensions, stable orthogonal turns and actual swept clearance',()=>{
 const obstacles=[{x:260,y:100,width:130,height:250}],body={width:80,height:60};
 const args={stage,body,start:{x:40,y:180},end:{x:530,y:180},obstacles,clearance:12};
 const route=routeTeachingBody(args);assert.deepEqual(route,routeTeachingBody(args));
 assert.deepEqual(route.points[0],args.start);assert.deepEqual(route.points.at(-1),args.end);assert.ok(route.points.length>=4);
 for(let i=1;i<route.points.length;i++){
  const a=route.points[i-1],b=route.points[i];assert.ok(a.x===b.x||a.y===b.y);
  const sweep={x:Math.min(a.x,b.x)-12,y:Math.min(a.y,b.y)-12,width:body.width+Math.abs(a.x-b.x)+24,height:body.height+Math.abs(a.y-b.y)+24};
  for(const obstacle of obstacles)assert.equal(overlaps(sweep,obstacle),false);
  assert.ok(sweep.x>=stage.x&&sweep.y>=stage.y&&sweep.x+sweep.width<=stage.width&&sweep.y+sweep.height<=stage.height);
 }
});

test('routing refuses a body-width bottleneck even when a point could pass',()=>{
 const args={stage,body:{width:80,height:60},start:{x:40,y:180},end:{x:530,y:180},obstacles:[{x:260,y:0,width:130,height:400}],clearance:12};
 assert.ok(routeTeachingBody(args).points.length>2);
 assert.throws(()=>routeTeachingBody({...args,body:{width:80,height:90}}),(e:unknown)=>e instanceof TeachingGeometryError&&e.code==='route');
});

test('blocked endpoints, nonfinite geometry and overloaded route requests reject locally',()=>{
 const args={stage,body:{width:80,height:60},start:{x:40,y:180},end:{x:530,y:180},obstacles:[],clearance:12};
 for(const bad of [
  {...args,start:{x:NaN,y:0}}, {...args,body:{width:0,height:60}}, {...args,clearance:-1},
  {...args,end:{x:690,y:180}}, {...args,end:args.start},
  {...args,obstacles:[{x:0,y:0,width:200,height:500}]},
  {...args,obstacles:Array.from({length:25},()=>({x:260,y:100,width:10,height:10}))},
 ])assert.throws(()=>routeTeachingBody(bad),/teaching_geometry/);
});

test('100 body sizes preserve finite route points and the requested endpoint identity',()=>{
 for(let i=0;i<100;i++){
  const route=routeTeachingBody({stage,body:{width:30+i%50,height:30+i%40},start:{x:30,y:200},end:{x:550,y:200},obstacles:[{x:260,y:100,width:100,height:250}],clearance:12});
  assert.deepEqual(route.points[0],{x:30,y:200});assert.deepEqual(route.points.at(-1),{x:550,y:200});
  assert.ok(route.points.every(p=>Number.isFinite(p.x)&&Number.isFinite(p.y)));
 }
});

test('safe body routes compile through existing motion intent and hold exact endpoints without jumps',()=>{
 const request={stage,body:{width:80,height:60},start:{x:40,y:180},end:{x:530,y:180},obstacles:[{x:260,y:100,width:130,height:250}],clearance:12};
 const compiled=compileTeachingBodyRoute(request,{objectId:'paper',startFrame:10,endFrame:100,durationInFrames:120});
 assert.equal(compiled.renderable,false);assert.equal(compiled.accepted,false);
 assert.equal(compiled.verification.frames,120);assert.equal(compiled.verification.clearance,12);
 assert.deepEqual(evaluateMotion(compiled.motion,9).paper,{...request.start,scale:1,opacity:1});
 assert.deepEqual(evaluateMotion(compiled.motion,99).paper,{...request.end,scale:1,opacity:1});
 assert.deepEqual(evaluateMotion(compiled.motion,119).paper,{...request.end,scale:1,opacity:1});
 for(let frame=0;frame<120;frame++){
  const p=evaluateMotion(compiled.motion,frame).paper;
  assert.equal(p.scale,1);assert.equal(p.opacity,1);assert.ok(Number.isFinite(p.x)&&Number.isFinite(p.y));
  assert.equal(overlaps({x:p.x-12,y:p.y-12,width:104,height:84},request.obstacles[0]),false);
 }
});

test('route compilation rejects insufficient clock windows, invalid identity and weakened clearance',()=>{
 const request={stage,body:{width:80,height:60},start:{x:40,y:180},end:{x:530,y:180},obstacles:[{x:260,y:100,width:130,height:250}],clearance:12};
 const clock={objectId:'paper',startFrame:10,endFrame:100,durationInFrames:120};
 for(const bad of [{...clock,endFrame:12},{...clock,startFrame:-1},{...clock,endFrame:121},{...clock,objectId:'../paper'},{...clock,durationInFrames:Infinity}])assert.throws(()=>compileTeachingBodyRoute(request,bad),/teaching_geometry/);
 assert.throws(()=>routeTeachingBody({...request,clearance:0}),/fixed/);
});

test('motion proof binds body dimensions and obstacle geometry, not only the same center path',()=>{
 const request={stage,body:{width:80,height:60},start:{x:40,y:180},end:{x:530,y:180},obstacles:[],clearance:12};
 const clock={objectId:'paper',startFrame:10,endFrame:100,durationInFrames:120};
 const first=compileTeachingBodyRoute(request,clock),second=compileTeachingBodyRoute({...request,body:{width:60,height:50}},clock);
 assert.deepEqual(first.route.points,second.route.points);
 assert.notEqual(first.geometrySha256,second.geometrySha256);assert.notEqual(first.motionSha256,second.motionSha256);
 request.stage.width=680;request.body.width=70;
 assert.equal(first.geometry.stage.width,700);assert.equal(first.geometry.body.width,80);
 assert.ok(Object.isFrozen(first.geometry.stage));
});

test('fractional body geometry remains finite and preserves its exact motion endpoint',()=>{
 const request={stage,body:{width:80.25,height:60.5},start:{x:40.25,y:180.75},end:{x:530.5,y:180.75},obstacles:[{x:260.25,y:100.5,width:130.25,height:250.25}],clearance:12};
 const compiled=compileTeachingBodyRoute(request,{objectId:'paper',startFrame:10,endFrame:100,durationInFrames:120});
 assert.deepEqual(evaluateMotion(compiled.motion,99).paper,{...request.end,scale:1,opacity:1});
});
