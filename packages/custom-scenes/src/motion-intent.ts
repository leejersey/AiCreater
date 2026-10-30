import {evaluateMotion,parseMotionPlan,type MotionPlan,type MotionPose} from './motion-plan';

type Action={kind:'move';startFrame:number;endFrame:number;targetAnchor:string}
 |{kind:'attach';frame:number;parentId:string}|{kind:'release';frame:number};
type Anchor={id:string;pose:MotionPose;objectId?:string};
type IntentObject={id:string;initialAnchor:string;actions:Action[]};
type Track=MotionPlan['tracks'][number];
type Attachment=NonNullable<Track['attachments']>[number];

function fail(reason:string):never{throw Error('motion_intent: '+reason);}
function fields(value:unknown,required:string[],optional:string[]=[]):Record<string,unknown>{
 if(!value||typeof value!=='object'||Array.isArray(value))return fail('expected object');
 const r=value as Record<string,unknown>;
 if(required.some(k=>!Object.hasOwn(r,k))||Object.keys(r).some(k=>!required.includes(k)&&!optional.includes(k)))return fail('unexpected fields');
 return r;
}
function number(value:unknown,min:number,max:number,integer=false):number{
 if(typeof value!=='number'||!Number.isFinite(value)||value<min||value>max||(integer&&!Number.isInteger(value)))return fail('invalid number or frame');
 return value;
}
function id(value:unknown):string{
 if(typeof value!=='string'||! /^[a-z][a-z0-9-]{0,63}$/.test(value))return fail('invalid id');
 return value;
}
function list(value:unknown,max:number,min=0):unknown[]{
 if(!Array.isArray(value)||value.length<min||value.length>max)return fail('invalid list budget');
 return value;
}
function pose(value:unknown):MotionPose{
 const r=fields(value,['x','y','scale','opacity']);
 return {x:number(r.x,-10000,10000),y:number(r.y,-10000,10000),scale:number(r.scale,0.001,100),opacity:number(r.opacity,0,1)};
}
function compose(parent:MotionPose,local:MotionPose):MotionPose{
 return {x:parent.x+local.x*parent.scale,y:parent.y+local.y*parent.scale,scale:parent.scale*local.scale,opacity:parent.opacity*local.opacity};
}
function relative(world:MotionPose,parent:MotionPose):MotionPose{
 if(parent.opacity===0)return fail('cannot attach to an invisible parent');
 return pose({x:(world.x-parent.x)/parent.scale,y:(world.y-parent.y)/parent.scale,scale:world.scale/parent.scale,opacity:world.opacity/parent.opacity});
}

/** Offline intent compilation only; never repairs an existing motion plan. */
export function compileMotionIntent(value:unknown):MotionPlan{
 const r=fields(value,['schemaVersion','durationInFrames','anchors','objects']);
 if(r.schemaVersion!=='motion-intent:1')return fail('unsupported version');
 const duration=number(r.durationInFrames,1,3600,true),frame=(v:unknown)=>number(v,0,duration-1,true);
 const anchors=new Map<string,Anchor>();
 for(const value of list(r.anchors,120,1)){
  const a=fields(value,['id','pose'],['objectId']),name=id(a.id);
  if(anchors.has(name))return fail('duplicate anchor');
  anchors.set(name,{id:name,pose:pose(a.pose),...(Object.hasOwn(a,'objectId')?{objectId:id(a.objectId)}:{})});
 }
 const objects=new Map<string,IntentObject>();
 for(const value of list(r.objects,60,1)){
  const o=fields(value,['id','initialAnchor','actions']),name=id(o.id);
  if(objects.has(name))return fail('duplicate object');
  const actions=list(o.actions,60).map((value):Action=>{
   if(!value||typeof value!=='object')return fail('invalid action');
   const kind=(value as Record<string,unknown>).kind;
   if(kind==='move'){
    const a=fields(value,['kind','startFrame','endFrame','targetAnchor']);
    return {kind,startFrame:frame(a.startFrame),endFrame:frame(a.endFrame),targetAnchor:id(a.targetAnchor)};
   }
   if(kind==='attach'){
    const a=fields(value,['kind','frame','parentId']);return {kind,frame:frame(a.frame),parentId:id(a.parentId)};
   }
   if(kind==='release'){
    const a=fields(value,['kind','frame']);return {kind,frame:frame(a.frame)};
   }
   return fail('unknown action');
  });
  objects.set(name,{id:name,initialAnchor:id(o.initialAnchor),actions});
 }
 for(const a of anchors.values())if(a.objectId&&!objects.has(a.objectId))return fail('missing anchor owner');
 const anchor=(name:string)=>anchors.get(name)??fail('missing anchor');
 const compiled=new Map<string,Track>(),visiting=new Set<string>();
 const parentPose=(name:string,at:number):MotionPose=>{
  if(!compiled.has(name))return fail('missing compiled parent');
  return evaluateMotion({schemaVersion:'motion-plan:2',durationInFrames:duration,tracks:[...compiled.values()]},at)[name];
 };
 const anchorPose=(name:string,at:number):MotionPose=>{
  const a=anchor(name);return a.objectId?compose(parentPose(a.objectId,at),a.pose):a.pose;
 };
 const visit=(name:string):void=>{
  if(compiled.has(name))return;
  if(visiting.has(name))return fail('cyclic object dependencies');
  const o=objects.get(name);if(!o)return fail('missing object');
  visiting.add(name);
  const dependencies=[anchor(o.initialAnchor).objectId,...o.actions.map(a=>a.kind==='move'?anchor(a.targetAnchor).objectId:a.kind==='attach'?a.parentId:undefined)];
  for(const dependency of dependencies)if(dependency)visit(dependency);
  let current=anchorPose(o.initialAnchor,0),cursor=0;
  const keys:({frame:number}&MotionPose)[]=[],attachments:Attachment[]=[];
  let active:{startFrame:number;parentId:string;offset:MotionPose}|undefined;
  const add=(at:number,p:MotionPose)=>{
   const checked=pose(p),last=keys.at(-1);
   if(last?.frame===at){
    if((['x','y','scale','opacity'] as const).some(k=>last[k]!==checked[k]))return fail('conflicting boundary poses');
    return;
   }
   keys.push({frame:at,...checked});
  };
  add(0,current);
  for(const action of o.actions){
   const at=action.kind==='move'?action.startFrame:action.frame;
   if(at<cursor)return fail('out-of-order or overlapping actions');
   if(action.kind==='move'){
    if(active)return fail('cannot move independently while attached');
    if(action.endFrame<=at)return fail('invalid move interval');
    add(at,current);current=anchorPose(action.targetAnchor,action.endFrame);add(action.endFrame,current);cursor=action.endFrame;
   }else if(action.kind==='attach'){
    if(active)return fail('already attached');
    add(at,current);active={startFrame:at,parentId:action.parentId,offset:relative(current,parentPose(action.parentId,at))};cursor=at;
   }else{
    if(!active||at<=active.startFrame)return fail('release requires a positive attachment interval');
    current=compose(parentPose(active.parentId,at),active.offset);add(at,current);
    attachments.push({...active,endFrame:at});active=undefined;cursor=at;
   }
  }
  if(active)attachments.push({...active,endFrame:duration});
  // Validate every compiled prefix with the unchanged legacy continuity guard.
  const next=parseMotionPlan({schemaVersion:'motion-plan:2',durationInFrames:duration,tracks:[...compiled.values(),{id:name,keys,...(attachments.length?{attachments}:{})}]});
  compiled.set(name,next.tracks.at(-1)!);visiting.delete(name);
 };
 try{
  for(const name of objects.keys())visit(name);
  return parseMotionPlan({schemaVersion:'motion-plan:2',durationInFrames:duration,tracks:[...compiled.values()]});
 }catch(error){
  if(error instanceof Error&&error.message.startsWith('motion_intent:'))throw error;
  return fail(error instanceof Error?error.message:'compilation failed');
 }
}
