import type {MotionPlan} from './motion-plan';
import type {SvgNode} from './motion-assembly';
type Ref={layerId:string;nodePath:number[]};
type Follower={objectId:string;startFrame:number;endFrame:number};
export type MotionAudit={routes:(Ref&{id:string;followers:Follower[]})[];obstacles:Ref[]};
export const motionAuditRules=Object.freeze([
 'AUDIT_ROUTE_CONTRACT: audit references actual painted nodes by layerId and zero-based nodePath. A route must be static and visible for the entire composition: its owning object has no parent/attachment, invariant x/y/scale and opacity=1 throughout. A moving gripper, sleeve or payload cannot own an audited route.',
 'The route node itself must be a path, line, polyline or polygon with fill:none and a visible foreground/muted/accent/secondary stroke (strokeOpacity at least 0.2). Reference the painted leaf, not a g group or an invisible proxy; a path inside a group needs its full nested nodePath.',
 'Transport and parent/attachment relationships are not routes. Use motion ownership data for carrying. followers describe objects following an actual static stroke during half-open [startFrame,endFrame) windows, not children being carried by the route owner.',
 'Obstacle references must name actual non-text painted silhouettes. Keep audit at its declared schema location. Empty lists are allowed but do not prove geometry coverage; do not delete required painted routes, invent proxy strokes or relabel moving groups merely to pass checks.',
]);
function record(value:unknown,keys:string[]):Record<string,unknown>{
 if(!value||typeof value!=='object'||Array.isArray(value)||Object.keys(value).some(k=>!keys.includes(k))||keys.some(k=>!Object.hasOwn(value,k)))throw Error('motion_audit: invalid fields');
 return value as Record<string,unknown>;
}
function list(value:unknown,max:number):unknown[]{if(!Array.isArray(value)||value.length>max)throw Error('motion_audit: invalid list');return value;}
function frame(value:unknown,min:number,max:number):number{if(!Number.isInteger(value)||Number(value)<min||Number(value)>max)throw Error('motion_audit: invalid frame');return Number(value);}
export function motionNodeKey(ref:Ref):string{return ref.layerId+':'+ref.nodePath.join('.');}
export function parseMotionAudit(value:unknown,plan:MotionPlan,layers:{id:string;artwork:SvgNode[]}[]):MotionAudit{
 const r=record(value,['routes','obstacles']),tracks=new Map(plan.tracks.map(t=>[t.id,t]));
 const artwork=new Map(layers.map(l=>[l.id,l.artwork])),used=new Set<string>(),ids=new Set<string>();
 const windows=new Map<string,{startFrame:number;endFrame:number}[]>();
 function ref(r:Record<string,unknown>):{ref:Ref;node:SvgNode}{
  if(typeof r.layerId!=='string'||!artwork.has(r.layerId)||!Array.isArray(r.nodePath)||!r.nodePath.length||r.nodePath.length>13||r.nodePath.some(n=>!Number.isInteger(n)||n<0||n>=200))throw Error('motion_audit: invalid node reference');
  const result={layerId:r.layerId,nodePath:[...r.nodePath] as number[]};
  let children=artwork.get(result.layerId)!,node:SvgNode|undefined;
  for(const index of result.nodePath){node=children[index];if(!node)throw Error('motion_audit: missing painted node');children=node.children??[];}
  const key=motionNodeKey(result);if(used.has(key))throw Error('motion_audit: duplicate painted node annotation');used.add(key);
  return {ref:result,node:node!};
 }
 const routes=list(r.routes,16).map(value=>{
  const r=record(value,['id','layerId','nodePath','followers']),target=ref(r),track=tracks.get(target.ref.layerId)!;
  if(typeof r.id!=='string'||! /^[a-z][a-z0-9-]{0,63}$/.test(r.id)||ids.has(r.id))throw Error('motion_audit: invalid route id');ids.add(r.id);
  const first=track.keys[0];
  if(track.parentId||track.attachments||track.keys.some(k=>k.x!==first.x||k.y!==first.y||k.scale!==first.scale||k.opacity!==1))throw Error('motion_audit: route must be static and visible');
  const a=target.node.attrs;
  if(!['path','line','polyline','polygon'].includes(target.node.tag)||!['foreground','muted','accent','secondary'].includes(String(a.stroke))||Number(a.strokeOpacity??1)<0.2||a.fill!=='none')throw Error('motion_audit: route must be painted stroke geometry');
  const values=list(r.followers,20);if(!values.length)throw Error('motion_audit: missing follower');
  const followers=values.map(value=>{
   const f=record(value,['objectId','startFrame','endFrame']);
   if(typeof f.objectId!=='string'||!tracks.has(f.objectId)||f.objectId===target.ref.layerId)throw Error('motion_audit: invalid follower');
   const startFrame=frame(f.startFrame,0,plan.durationInFrames-1),endFrame=frame(f.endFrame,1,plan.durationInFrames);
   if(endFrame<=startFrame)throw Error('motion_audit: empty follow window');
   const previous=windows.get(f.objectId)??[];
   if(previous.some(p=>p.startFrame<endFrame&&startFrame<p.endFrame))throw Error('motion_audit: overlapping follow windows');
   previous.push({startFrame,endFrame});windows.set(f.objectId,previous);
   return {objectId:f.objectId,startFrame,endFrame};
  });
  return {...target.ref,id:r.id,followers};
 });
 const obstacles=list(r.obstacles,80).map(value=>{
  const target=ref(record(value,['layerId','nodePath']));
  if(target.node.tag==='text')throw Error('motion_audit: text is not an obstacle silhouette');
  return target.ref;
 });
 return {routes,obstacles};
}
export function motionAuditAttributes(audit?:MotionAudit):Record<string,Record<string,string>>{
 return Object.fromEntries([
  ...(audit?.routes??[]).map(r=>[motionNodeKey(r),{id:r.id,'data-route':'true'}]),
  ...(audit?.obstacles??[]).map(r=>[motionNodeKey(r),{'data-obstacle':'true'}]),
 ]);
}
