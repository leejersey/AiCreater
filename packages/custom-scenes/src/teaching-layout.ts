import {createHash} from 'node:crypto';
import type {SceneBrief} from './contract';
import type {Cue} from './design';
import {parseTeachingPlan} from './teaching-plan';
import {buildTeachingSchedule} from './teaching-schedule';
import {teachingAsset,teachingConnector,teachingPayloadBounds} from './teaching-components';
import {compileMotionIntent} from './motion-intent';
import {evaluateMotion} from './motion-plan';

type Point={x:number;y:number};
type Box=Point&{width:number;height:number};
export const teachingLayoutVariants=['default','upper','lower'] as const;
export type TeachingLayoutVariant=typeof teachingLayoutVariants[number];
export class TeachingGeometryError extends Error{
 constructor(readonly code:'layout'|'route',message:string){super('teaching_geometry: '+code+'; '+message);}
}
const fail=(code:TeachingGeometryError['code'],message:string):never=>{throw new TeachingGeometryError(code,message);};
const hash=(value:unknown)=>createHash('sha256').update(JSON.stringify(value)).digest('hex');
const overlap=(a:Box,b:Box)=>a.x<b.x+b.width&&a.x+a.width>b.x&&a.y<b.y+b.height&&a.y+a.height>b.y;
const contains=(a:Box,b:Box)=>b.x>=a.x&&b.y>=a.y&&b.x+b.width<=a.x+a.width&&b.y+b.height<=a.y+a.height;
const world=(b:Box,p:Point):Box=>({...b,x:b.x+p.x,y:b.y+p.y});
function freeze<T>(value:T):T{if(value&&typeof value==='object'){Object.values(value).forEach(freeze);Object.freeze(value);}return value;}

/** Readable static layouts only; no payload docking, transport or render approval. */
export function buildTeachingLayout(value:unknown,brief:SceneBrief,cues:Cue[],variant:TeachingLayoutVariant='default'){
 if(!teachingLayoutVariants.includes(variant))fail('layout','Unknown host layout variant');
 const plan=parseTeachingPlan(value,brief,cues),schedule=buildTeachingSchedule(plan,brief,cues);
 if(brief.width!==1920||brief.height!==1080)fail('layout','Only the 1920x1080 host stage is supported');
 const stage={x:80,y:160,width:1760,height:800},centers=new Map<string,Point>();
 const place=(id:string,x:number,y:number)=>{if(centers.has(id))fail('layout','An identity cannot occupy two structure roles');centers.set(id,{x,y});};
 const [main,secondary=[]]=schedule.topology.groups;
 switch(plan.structure){
  case 'flow':{
   if(main.length>6)fail('layout','The full-size chain exceeds the stage capacity');
   const columns=Math.min(3,main.length),rows=Math.ceil(main.length/columns);
   main.forEach((id,i)=>{const row=Math.floor(i/columns),col=row%2?columns-1-i%columns:i%columns;place(id,stage.x+(col+.5)*stage.width/columns,rows===2?[430,800][row]:560);});break;
  }
  case 'loop':{
   const slots:Record<number,Point[]>={2:[{x:600,y:500},{x:1320,y:500}],3:[{x:960,y:330},{x:1420,y:740},{x:500,y:740}],4:[{x:600,y:330},{x:1320,y:330},{x:1320,y:740},{x:600,y:740}]};
   const selected=slots[main.length];if(!selected)fail('layout','Full-size loop supports two to four stations');
   main.forEach((id,i)=>place(id,selected[i].x,selected[i].y));break;
  }
  case 'comparison':place(main[0],500,540);place(main[1],1420,540);break;
  case 'filter':{
   const height=(id:string)=>{const o=plan.objects.find(o=>o.id===id)!;return teachingAsset(o.component,o.initialState,o.label).bounds.height;};
   const firstHeight=height(main[1]),secondHeight=height(main[2]),lane=teachingPayloadBounds.height+24,spare=stage.height-lane*2-firstHeight-secondHeight;
   if(spare<0)fail('layout','Receiving bodies leave no full-cargo ingress lane');
   const firstTop=stage.y+lane+spare/3,secondTop=firstTop+firstHeight+lane;
   place(main[0],780,520);place(main[1],1440,firstTop+firstHeight/2);place(main[2],1440,secondTop+secondHeight/2);
   if(secondary.length>6)fail('layout','Too many filter candidates');
   const rows=Math.ceil(secondary.length/2);
   secondary.forEach((id,i)=>place(id,i%2?400:170,stage.y+(Math.floor(i/2)+.5)*stage.height/rows));break;
  }
  case 'composition':{
   const inputs=main.slice(0,-1),rows=Math.ceil(inputs.length/2);
   inputs.forEach((id,i)=>place(id,i%2?700:350,stage.y+(Math.floor(i/2)+.5)*stage.height/rows));
   place(main.at(-1)!,1400,540);break;
  }
  case 'state-change':place(main[0],960,540);break;
 }
 const annotationSlots=[{x:290,y:330},{x:290,y:750},{x:1630,y:330},{x:1630,y:750}];
 if(schedule.topology.annotations.length>annotationSlots.length)fail('layout','Annotations exceed the readable stage capacity');
 const annotations=schedule.topology.annotations;
 const bodyAt=(id:string,center:Point)=>{
  const o=plan.objects.find(o=>o.id===id)!,b=teachingAsset(o.component,o.initialState,o.label).bounds;
  return {...b,x:Math.round(center.x-b.width/2),y:Math.round(center.y-b.height/2)};
 };
 const occupied=[...centers].map(([id,p])=>bodyAt(id,p));
 const free=(b:Box)=>contains(stage,b)&&!occupied.some(o=>overlap({x:b.x-12,y:b.y-12,width:b.width+24,height:b.height+24},o));
 const grid=Array.from({length:24},(_,i)=>({x:stage.x+(i%6+.5)*stage.width/6,y:stage.y+(Math.floor(i/6)+.5)*stage.height/4}));
 let visited=0;
 const pack=(index:number):boolean=>{
  if(index===annotations.length)return true;
  const ordering=variant==='upper'?[2,0,3,1]:variant==='lower'?[1,3,0,2]:[0,1,2,3];
  const id=annotations[index],preferred=annotationSlots[ordering[index]];
  for(const p of [preferred,...annotationSlots.filter(s=>s!==preferred),...grid]){
   if(++visited>20000)return false;
   const b=bodyAt(id,p);if(!free(b))continue;
   centers.set(id,p);occupied.push(b);
   if(pack(index+1))return true;
   centers.delete(id);occupied.pop();
  }
  return false;
 };
 if(!pack(0))fail('layout','No bounded annotation layout preserves all readable bodies');
 const adjustments=annotations.flatMap((id,i)=>{
  const actual=centers.get(id)!,preferred=annotationSlots[i];
  return actual.x===preferred.x&&actual.y===preferred.y?[]:[{kind:'annotation-placement' as const,objectId:id,from:{...preferred},to:{...actual}}];
 });
 const objects=[...plan.objects].sort((a,b)=>a.id<b.id?-1:a.id>b.id?1:0).map(o=>{
  const center=centers.get(o.id);if(!center)return fail('layout','Unplaced identity '+o.id);
  const asset=teachingAsset(o.component,o.initialState,o.label),origin={x:Math.round(center.x-asset.bounds.width/2),y:Math.round(center.y-asset.bounds.height/2)},bounds=world(asset.bounds,origin);
  if(!contains(stage,bounds))fail('layout','Component exceeds safe stage: '+o.id);
  return {id:o.id,component:o.component,scale:1 as const,bounds,asset,textBounds:world(asset.text.box,origin),obstacles:asset.obstacles.map(b=>world(b,origin)),
   ports:Object.fromEntries(Object.entries(asset.ports).map(([name,p])=>[name,{x:origin.x+p.x,y:origin.y+p.y}])),...(asset.receiving?{receiving:world(asset.receiving,origin)}:{})};
 });
 for(let i=0;i<objects.length;i++)for(const other of objects.slice(i+1)){
  const body=objects[i].bounds,padded={x:body.x-12,y:body.y-12,width:body.width+24,height:body.height+24};
  if(overlap(padded,other.bounds))fail('layout','Insufficient component separation: '+objects[i].id+'/'+other.id);
 }
 const result={schemaVersion:'teaching-layout:1' as const,layoutVersion:'teaching-layout-engine:3',variant,adjustments,scheduleSha256:schedule.scheduleSha256,
  planSha256:schedule.planSha256,assetSha256:schedule.assetSha256,stage,objects,renderable:false as const,accepted:false as const,
  pending:['payload-docks','transport-routes','motion','render-review'] as const};
 return freeze({...result,layoutSha256:hash(result)});
}

type RouteRequest={stage:Box;body:{width:number;height:number};start:Point;end:Point;obstacles:Box[];clearance?:number};
/** Configuration-space orthogonal routing for a fixed-size body, not just its center. */
export function routeTeachingBody(request:RouteRequest){
 const finite=(v:unknown)=>typeof v==='number'&&Number.isFinite(v)&&Math.abs(v)<=10000;
 const validBox=(b:Box)=>b&&[b.x,b.y,b.width,b.height].every(finite)&&b.width>0&&b.height>0&&b.x+b.width<=10000&&b.y+b.height<=10000;
 if(!request||!validBox(request.stage)||!request.body||![request.body.width,request.body.height].every(v=>finite(v)&&v>0)||
  !request.start||!request.end||![request.start.x,request.start.y,request.end.x,request.end.y].every(finite)||
  !Array.isArray(request.obstacles)||request.obstacles.length>24||request.obstacles.some(b=>!validBox(b)))fail('route','Invalid bounded route request');
 const {stage,body,start,end}=request,clearance=request.clearance??12;
 if(clearance!==12)fail('route','The v1 clearance policy is fixed at 12 pixels');
 if(start.x===end.x&&start.y===end.y)fail('route','Stationary bodies do not need a transport route');
 const limits={left:stage.x+clearance,top:stage.y+clearance,right:stage.x+stage.width-body.width-clearance,bottom:stage.y+stage.height-body.height-clearance};
 if(limits.left>limits.right||limits.top>limits.bottom)fail('route','Body does not fit the safe stage');
 const blocked=request.obstacles.map(b=>({left:b.x-body.width-clearance,right:b.x+b.width+clearance,top:b.y-body.height-clearance,bottom:b.y+b.height+clearance}));
 const allowed=(p:Point)=>p.x>=limits.left&&p.x<=limits.right&&p.y>=limits.top&&p.y<=limits.bottom&&!blocked.some(b=>p.x>b.left&&p.x<b.right&&p.y>b.top&&p.y<b.bottom);
 if(!allowed(start)||!allowed(end))fail('route','Endpoint is outside the stage or inside body-expanded obstacles');
 const xs=[...new Set([limits.left,limits.right,start.x,end.x,...blocked.flatMap(b=>[b.left,b.right]).filter(x=>x>=limits.left&&x<=limits.right)])].sort((a,b)=>a-b);
 const ys=[...new Set([limits.top,limits.bottom,start.y,end.y,...blocked.flatMap(b=>[b.top,b.bottom]).filter(y=>y>=limits.top&&y<=limits.bottom)])].sort((a,b)=>a-b);
 const nodes=ys.flatMap(y=>xs.map(x=>({x,y}))),valid=nodes.map(allowed);
 const segmentFree=(a:Point,b:Point)=>!blocked.some(r=>a.y===b.y?
  a.y>r.top&&a.y<r.bottom&&Math.max(a.x,b.x)>r.left&&Math.min(a.x,b.x)<r.right:
  a.x>r.left&&a.x<r.right&&Math.max(a.y,b.y)>r.top&&Math.min(a.y,b.y)<r.bottom);
 const first=ys.indexOf(start.y)*xs.length+xs.indexOf(start.x),last=ys.indexOf(end.y)*xs.length+xs.indexOf(end.x);
 const distance=nodes.map(()=>Infinity),previous=nodes.map(()=>-1),open=[{id:first,cost:0}];distance[first]=0;
 while(open.length){
  open.sort((a,b)=>a.cost-b.cost||a.id-b.id);const current=open.shift()!;
  if(current.cost!==distance[current.id])continue;if(current.id===last)break;
  const col=current.id%xs.length,row=Math.floor(current.id/xs.length);
  const adjacent=[col>0?current.id-1:-1,col+1<xs.length?current.id+1:-1,row>0?current.id-xs.length:-1,row+1<ys.length?current.id+xs.length:-1];
  for(const next of adjacent){
   if(next<0||!valid[next]||!segmentFree(nodes[current.id],nodes[next]))continue;
   const a=nodes[current.id],b=nodes[next],cost=current.cost+Math.abs(a.x-b.x)+Math.abs(a.y-b.y);
   if(cost>=distance[next])continue;distance[next]=cost;previous[next]=current.id;open.push({id:next,cost});
  }
 }
 if(!Number.isFinite(distance[last]))fail('route','No body-clear route exists under the fixed clearance policy');
 const reverse:Point[]=[];for(let cursor=last;cursor!==-1;cursor=previous[cursor])reverse.push({...nodes[cursor]});
 const points:Point[]=[];
 for(const p of reverse.reverse()){
  if(points.length>=2){const a=points.at(-2)!,b=points.at(-1)!;if((a.x===b.x&&b.x===p.x)||(a.y===b.y&&b.y===p.y))points.pop();}
  points.push(p);
 }
 if(points.length>12)fail('route','A body-clear route exceeds the supported connector turn budget');
 const connector=teachingConnector(points);
 return freeze({points:connector.points,d:connector.d,distance:distance[last],clearance,accepted:false as const});
}

/** A single external transport primitive, never a receiver collision exemption. */
export function compileTeachingBodyRoute(request:RouteRequest,clock:{objectId:string;startFrame:number;endFrame:number;durationInFrames:number}){
 if(!clock||typeof clock.objectId!=='string'||!/^[a-z][a-z0-9-]{0,63}$/.test(clock.objectId)||
  ![clock.startFrame,clock.endFrame,clock.durationInFrames].every(Number.isInteger)||clock.durationInFrames<1||clock.durationInFrames>3600||
  clock.startFrame<0||clock.endFrame>clock.durationInFrames||clock.endFrame<=clock.startFrame)fail('route','Invalid route clock or identity');
 const route=routeTeachingBody(request),segments=route.points.length-1,lastFrame=clock.endFrame-1,available=lastFrame-clock.startFrame;
 if(available<segments*2)fail('route','Transport clock cannot accommodate all route turns');
 const anchors=route.points.map((p,i)=>({id:'route-anchor-'+i,pose:{...p,scale:1,opacity:1}}));
 const actions:{kind:'move';startFrame:number;endFrame:number;targetAnchor:string}[]=[];
 let cursor=clock.startFrame,walked=0;
 const slack=available-segments*2;
 for(let i=1;i<route.points.length;i++){
  const a=route.points[i-1],b=route.points[i],length=Math.abs(a.x-b.x)+Math.abs(a.y-b.y);
  const extra=Math.floor(slack*(walked+length)/route.distance)-Math.floor(slack*walked/route.distance),end=cursor+2+extra;
  actions.push({kind:'move',startFrame:cursor,endFrame:end,targetAnchor:anchors[i].id});cursor=end;walked+=length;
 }
 if(cursor!==lastFrame)fail('route','Transport allocation did not preserve the exact endpoint frame');
 const intent={schemaVersion:'motion-intent:1',durationInFrames:clock.durationInFrames,anchors,objects:[{id:clock.objectId,initialAnchor:anchors[0].id,actions}]};
 const motion=compileMotionIntent(intent);
 let previous=evaluateMotion(motion,0)[clock.objectId];
 for(let frame=0;frame<clock.durationInFrames;frame++){
  const current=evaluateMotion(motion,frame)[clock.objectId];
  const swept={x:Math.min(previous.x,current.x)-route.clearance,y:Math.min(previous.y,current.y)-route.clearance,
   width:request.body.width+Math.abs(previous.x-current.x)+route.clearance*2,height:request.body.height+Math.abs(previous.y-current.y)+route.clearance*2};
  if(!contains(request.stage,swept)||request.obstacles.some(b=>overlap(swept,b)))fail('route','Compiled motion failed adjacent swept body clearance at frame '+frame);
  previous=current;
 }
 const copyBox=(b:Box):Box=>({x:b.x,y:b.y,width:b.width,height:b.height});
 const geometry={stage:copyBox(request.stage),body:{width:request.body.width,height:request.body.height},obstacles:request.obstacles.map(copyBox)};
 const result={schemaVersion:'teaching-body-motion:1',motionVersion:'teaching-body-compiler:1',geometry,geometrySha256:hash(geometry),route,intent,motion,
  verification:{frames:clock.durationInFrames,clearance:route.clearance,scope:'One fixed-size external body; AABB and adjacent swept bounds, no docking or rendered geometry'},
  renderable:false as const,accepted:false as const,pending:['receiver-docks','scene-motion','occlusion','render-review'] as const};
 return freeze({...result,motionSha256:hash(result)});
}
