import {createHash} from 'node:crypto';
import type {SceneBrief} from './contract';
import type {Cue} from './design';
import {parseTeachingPlan} from './teaching-plan';
import {buildTeachingSchedule} from './teaching-schedule';
import {buildTeachingLayout,routeTeachingBody,type TeachingLayoutVariant} from './teaching-layout';
import {teachingAsset,teachingPayloadAsset,type TeachingAsset} from './teaching-components';
import {teachingComponents} from './teaching-capabilities';
import {compileMotionIntent} from './motion-intent';
import {evaluateMotion} from './motion-plan';

type Point={x:number;y:number};
type Box=Point&{width:number;height:number};
type Action={kind:'move';startFrame:number;endFrame:number;targetAnchor:string}|{kind:'attach';frame:number;parentId:string}|{kind:'release';frame:number};
const CLEARANCE=12,EPS=1e-7;
export class TeachingMotionError extends Error{
 constructor(readonly code:'payload'|'capacity'|'route'|'timing'|'clearance',message:string){super('teaching_motion: '+code+'; '+message);}
}
const fail=(code:TeachingMotionError['code'],message:string):never=>{throw new TeachingMotionError(code,message);};
const digest=(v:unknown)=>createHash('sha256').update(JSON.stringify(v)).digest('hex');
const translated=(b:Box,p:Point):Box=>({...b,x:b.x+p.x,y:b.y+p.y});
const padded=(b:Box):Box=>({x:b.x-CLEARANCE,y:b.y-CLEARANCE,width:b.width+2*CLEARANCE,height:b.height+2*CLEARANCE});
const contains=(a:Box,b:Box)=>b.x>=a.x-EPS&&b.y>=a.y-EPS&&b.x+b.width<=a.x+a.width+EPS&&b.y+b.height<=a.y+a.height+EPS;
function intersection(a:Box,b:Box):Box|undefined{
 const x=Math.max(a.x,b.x),y=Math.max(a.y,b.y),right=Math.min(a.x+a.width,b.x+b.width),bottom=Math.min(a.y+a.height,b.y+b.height);
 return right-x>EPS&&bottom-y>EPS?{x,y,width:right-x,height:bottom-y}:undefined;
}
function covered(rect:Box,regions:Box[]):boolean{
 let remaining=[rect];
 for(const region of regions)remaining=remaining.flatMap(b=>{
  const hit=intersection(b,region);if(!hit)return [b];
  return [{x:b.x,y:b.y,width:b.width,height:hit.y-b.y},{x:b.x,y:hit.y+hit.height,width:b.width,height:b.y+b.height-hit.y-hit.height},
   {x:b.x,y:hit.y,width:hit.x-b.x,height:hit.height},{x:hit.x+hit.width,y:hit.y,width:b.x+b.width-hit.x-hit.width,height:hit.height}].filter(p=>p.width>EPS&&p.height>EPS);
 });
 return remaining.length===0;
}
function freeze<T>(v:T):T{if(v&&typeof v==='object'){Object.values(v).forEach(freeze);Object.freeze(v);}return v;}

/** Whole-chapter motion and named gateway proof; drawing/occlusion acceptance remains separate. */
export function compileTeachingMotion(value:unknown,brief:SceneBrief,cues:Cue[],variant:TeachingLayoutVariant='default'){
 const plan=parseTeachingPlan(value,brief,cues),schedule=buildTeachingSchedule(plan,brief,cues),layout=buildTeachingLayout(plan,brief,cues,variant);
 const moving=new Set(schedule.events.filter(e=>e.kind==='transport').map(e=>e.objectId));
 const objects=layout.objects.map(seed=>{
  const source=plan.objects.find(o=>o.id===seed.id)!;
  let states:TeachingAsset[];
  try{states=teachingComponents[source.component].states.map(state=>moving.has(seed.id)?teachingPayloadAsset(state,source.label):teachingAsset(source.component,state,source.label));}
  catch(error){return fail('payload',source.id+': '+(error instanceof Error?error.message:'Invalid cargo label'));}
  const asset=states.find(a=>a.state===source.initialState)!;
  const initial={x:seed.bounds.x+(seed.bounds.width-asset.bounds.width)/2,y:seed.bounds.y+(seed.bounds.height-asset.bounds.height)/2};
  return {id:source.id,component:source.component,initial,asset,states};
 });
 type ObjectEntry=typeof objects[number];
 const byId=new Map(objects.map(o=>[o.id,o])),position=new Map(objects.map(o=>[o.id,{...o.initial}])),owners=new Map<string,string>();
 const statics=objects.filter(o=>!moving.has(o.id));
 const anchors:{id:string;pose:{x:number;y:number;scale:number;opacity:number}}[]=[];
 const anchor=(p:Point)=>{if(anchors.length>=120)fail('capacity','Motion anchor budget exhausted');const id='teaching-anchor-'+anchors.length;anchors.push({id,pose:{...p,scale:1,opacity:1}});return id;};
 const intentObjects=objects.map(o=>({id:o.id,initialAnchor:anchor(o.initial),actions:[] as Action[]}));
 const tracks=new Map(intentObjects.map(o=>[o.id,o]));
 const residencies:{objectId:string;receiverId:string;startFrame:number;endFrame:number;destination:Point}[]=[];
 const transports:{objectId:string;sourceId:string|null;targetId:string;startFrame:number;endFrame:number;destination:Point;points:Point[]}[]=[];
 const get=(id:string)=>byId.get(id)??fail('route','Unknown host identity '+id);
 const receiver=(id:string)=>{
  const o=get(id);if(moving.has(id)||!o.asset.receiving||!o.asset.gateway)fail('capacity','No fixed receiving gateway for '+id);return o;
 };
 const allowedRegions=(o:ObjectEntry)=>{
  const r=o.asset.receiving!,g=o.asset.gateway!;
  const tunnel=g.side==='top'?{x:g.spanStart,y:0,width:g.spanEnd-g.spanStart,height:r.y}:{x:0,y:g.spanStart,width:r.x,height:g.spanEnd-g.spanStart};
  return [r,tunnel].filter(b=>b.width>0&&b.height>0).map(b=>translated(b,o.initial));
 };
 const approach=(target:ObjectEntry,dock:Point,body:Box):Point=>target.asset.gateway!.side==='top'?{x:dock.x,y:target.initial.y-body.height-CLEARANCE}:{x:target.initial.x-body.width-CLEARANCE,y:dock.y};
 const chooseDock=(cargo:ObjectEntry,target:ObjectEntry):Point=>{
  const r=target.asset.receiving!,g=target.asset.gateway!,body=cargo.asset.bounds;
  const minX=Math.max(r.x+CLEARANCE,g.side==='top'?g.spanStart+CLEARANCE:-Infinity),minY=Math.max(r.y+CLEARANCE,g.side==='left'?g.spanStart+CLEARANCE:-Infinity);
  const maxX=Math.min(r.x+r.width-body.width-CLEARANCE,g.side==='top'?g.spanEnd-body.width-CLEARANCE:Infinity),maxY=Math.min(r.y+r.height-body.height-CLEARANCE,g.side==='left'?g.spanEnd-body.height-CLEARANCE:Infinity);
  const centerY=r.y+(r.height-body.height)/2;
  const rows=[centerY,...target.asset.solids.map(s=>s.y-body.height-CLEARANCE),minY,maxY].filter(y=>y>=minY&&y<=maxY);
  const ys=[...new Set(rows)].sort((a,b)=>variant==='upper'?a-b:variant==='lower'?b-a:Math.abs(a-centerY)-Math.abs(b-centerY)||a-b);
  const xs:number[]=[];
  if(variant==='lower'){for(let x=maxX;x>=minX;x-=body.width+CLEARANCE)xs.push(x);}
  else {for(let x=minX;x<=maxX;x+=body.width+CLEARANCE)xs.push(x);}
  if(variant==='lower'&&!xs.includes(minX))xs.push(minX);
  for(const y of ys)for(const x of xs){
   const local={x,y,width:body.width,height:body.height},world=translated(local,target.initial);
   if(target.asset.solids.some(s=>intersection(padded(local),s)))continue;
   if(objects.some(other=>other.id!==cargo.id&&owners.get(other.id)===target.id&&intersection(padded(world),translated(other.asset.bounds,position.get(other.id)!))))continue;
   return {x:world.x,y:world.y};
  }
  return fail('capacity','No readable, body-clear dock remains in '+target.id);
 };
 for(const event of schedule.events){
  if(event.kind!=='transport')continue;
  const cargo=get(event.objectId),target=receiver(event.targetId!),sourceId=owners.get(cargo.id)??null,start=position.get(cargo.id)!;
  if((sourceId??cargo.id)!==event.fromId)fail('route','Schedule and payload residence disagree');
  const destination=chooseDock(cargo,target),targetApproach=approach(target,destination,cargo.asset.bounds);
  const source=sourceId?receiver(sourceId):null,departure=source?approach(source,start,cargo.asset.bounds):start;
  const obstacles=objects.filter(o=>o.id!==cargo.id).map(o=>translated(o.asset.bounds,position.get(o.id)!));
  let external:Point[];
  try{external=departure.x===targetApproach.x&&departure.y===targetApproach.y?[{...departure}]:routeTeachingBody({stage:layout.stage,body:cargo.asset.bounds,start:departure,end:targetApproach,obstacles}).points.map(p=>({...p}));}
  catch(error){return fail('route',cargo.id+': '+(error instanceof Error?error.message:'No external route'));}
  const points:Point[]=[];
  for(const p of [start,...external,destination]){
   const b=points.at(-1);if(b&&b.x===p.x&&b.y===p.y)continue;
   if(points.length>=2){const a=points.at(-2)!;if(((a.x===b!.x&&b!.x===p.x)||(a.y===b!.y&&b!.y===p.y))&&((b!.x-a.x)*(p.x-b!.x)+(b!.y-a.y)*(p.y-b!.y)>=0))points.pop();}
   points.push({...p});
  }
  const segments=points.length-1,available=event.endFrame-1-event.startFrame;
  if(segments<1||points.length>12)fail('capacity','Transport route exceeds the supported path budget');
  if(available<segments*2)fail('timing','Cue window cannot preserve all gateway and route turns');
  const track=tracks.get(cargo.id)!;
  if(sourceId){
   track.actions.push({kind:'release',frame:event.startFrame});
   const old=[...residencies].reverse().find(r=>r.objectId===cargo.id)!;old.endFrame=event.startFrame;
  }
  const lengths=points.slice(1).map((p,i)=>Math.abs(p.x-points[i].x)+Math.abs(p.y-points[i].y)),total=lengths.reduce((a,b)=>a+b,0),slack=available-segments*2;
  let cursor=event.startFrame,walked=0;
  for(let i=1;i<points.length;i++){
   const extra=Math.floor(slack*(walked+lengths[i-1])/total)-Math.floor(slack*walked/total),end=cursor+2+extra;
   track.actions.push({kind:'move',startFrame:cursor,endFrame:end,targetAnchor:anchor(points[i])});cursor=end;walked+=lengths[i-1];
  }
  if(cursor!==event.endFrame-1)fail('timing','Lost the exact gateway handoff frame');
  track.actions.push({kind:'attach',frame:cursor,parentId:target.id});
  if(track.actions.length>60)fail('capacity','Object motion action budget exhausted');
  owners.set(cargo.id,target.id);position.set(cargo.id,{...destination});
  residencies.push({objectId:cargo.id,receiverId:target.id,startFrame:cursor,endFrame:brief.durationInFrames,destination:{...destination}});
  transports.push({objectId:cargo.id,sourceId,targetId:target.id,startFrame:event.startFrame,endFrame:event.endFrame,destination:{...destination},points});
 }
 const intent={schemaVersion:'motion-intent:1',durationInFrames:brief.durationInFrames,anchors,objects:intentObjects};
 const motion=compileMotionIntent(intent),cargoObjects=objects.filter(o=>moving.has(o.id));
 let previous=evaluateMotion(motion,0);
 for(let frame=0;frame<brief.durationInFrames;frame++){
  const current=evaluateMotion(motion,frame);
  for(const cargo of cargoObjects){
   const a=previous[cargo.id],b=current[cargo.id],bounds=cargo.asset.bounds;
   const swept=padded({x:Math.min(a.x,b.x),y:Math.min(a.y,b.y),width:bounds.width+Math.abs(a.x-b.x),height:bounds.height+Math.abs(a.y-b.y)});
   if(!contains(layout.stage,swept))fail('clearance','Cargo leaves the safe stage at '+frame);
   const permitted=new Set(transports.filter(t=>t.objectId===cargo.id&&frame>=t.startFrame&&frame<t.endFrame).flatMap(t=>[t.sourceId,t.targetId]).filter((s):s is string=>s!==null));
   residencies.filter(r=>r.objectId===cargo.id&&frame>=r.startFrame&&frame<r.endFrame).forEach(r=>permitted.add(r.receiverId));
   for(const obstacle of statics){
    const hit=intersection(swept,translated(obstacle.asset.bounds,obstacle.initial));if(!hit)continue;
    if(!permitted.has(obstacle.id)||!obstacle.asset.gateway||!covered(hit,allowedRegions(obstacle)))fail('clearance',cargo.id+' crosses an undeclared shell at '+frame);
    if(obstacle.asset.solids.some(s=>intersection(swept,translated(s,obstacle.initial))))fail('clearance',cargo.id+' crosses a receiver solid at '+frame);
   }
  }
  for(let i=0;i<cargoObjects.length;i++)for(const other of cargoObjects.slice(i+1)){
   const cargo=cargoObjects[i],a=previous[cargo.id],b=current[cargo.id],oa=previous[other.id],ob=current[other.id];
   const rx=a.x-oa.x,ry=a.y-oa.y,nx=b.x-ob.x,ny=b.y-ob.y;
   const swept=padded({x:Math.min(rx,nx),y:Math.min(ry,ny),width:cargo.asset.bounds.width+Math.abs(rx-nx),height:cargo.asset.bounds.height+Math.abs(ry-ny)});
   if(intersection(swept,other.asset.bounds))fail('clearance','Payloads collide at '+frame);
  }
  previous=current;
 }
 const result={schemaVersion:'teaching-scene-motion:1',compilerVersion:'teaching-motion-compiler:3',layoutVariant:variant,plan,schedule,layoutSeedSha256:layout.layoutSha256,layoutAdjustments:layout.adjustments,stage:layout.stage,objects,intent,motion,residencies,transports,
  geometrySha256:digest({stage:layout.stage,objects}),verification:{frames:brief.durationInFrames,clearance:CLEARANCE,scope:'Full host AABB cargo, named gateway coverage, intrinsic solids and relative adjacent sweeps; not rendered geometry'},
  renderable:false as const,accepted:false as const,pending:['scene-artwork','occlusion-review','render-review'] as const};
 return freeze({...result,motionSha256:digest(result)});
}
