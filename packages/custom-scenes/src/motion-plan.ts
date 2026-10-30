export type MotionPose=Readonly<{x:number;y:number;scale:number;opacity:number}>;
type MotionKey=MotionPose&Readonly<{frame:number}>;
type MotionAttachment=Readonly<{startFrame:number;endFrame:number;parentId:string;offset:MotionPose}>;
type MotionTrack=Readonly<{id:string;parentId?:string;keys:readonly MotionKey[];attachments?:readonly MotionAttachment[]}>;
export type MotionPlan=Readonly<{schemaVersion:'motion-plan:1'|'motion-plan:2';durationInFrames:number;tracks:readonly MotionTrack[]}>;

function fields(value:unknown,required:string[],optional:string[]=[]):Record<string,unknown>{
 if(!value||typeof value!=='object'||Array.isArray(value))throw Error('motion_plan: expected object');
 const r=value as Record<string,unknown>;
 if(required.some(k=>!Object.hasOwn(r,k))||Object.keys(r).some(k=>!required.includes(k)&&!optional.includes(k)))throw Error('motion_plan: unexpected fields');
 return r;
}
function finite(value:unknown,min:number,max:number):number{
 if(typeof value!=='number'||!Number.isFinite(value)||value<min||value>max)throw Error('motion_plan: invalid number');
 return value;
}
function id(value:unknown):string{
 if(typeof value!=='string'||! /^[a-z][a-z0-9-]{0,63}$/.test(value))throw Error('motion_plan: invalid id');
 return value;
}
export function parseMotionPlan(value:unknown):MotionPlan{
 const r=fields(value,['schemaVersion','durationInFrames','tracks']);
 const durationInFrames=finite(r.durationInFrames,1,3600);
 if((r.schemaVersion!=='motion-plan:1'&&r.schemaVersion!=='motion-plan:2')||!Number.isInteger(durationInFrames)||!Array.isArray(r.tracks)||r.tracks.length<1||r.tracks.length>60)throw Error('motion_plan: invalid version, duration or tracks');
 const tracks=r.tracks.map(value=>{
  const t=fields(value,['id','keys'],r.schemaVersion==='motion-plan:2'?['parentId','attachments']:['parentId']);
  if(!Array.isArray(t.keys)||!t.keys.length||t.keys.length>120)throw Error('motion_plan: invalid keys');
  let previous=-1;
  const keys=t.keys.map(value=>{
   const k=fields(value,['frame','x','y','scale','opacity']);
   const frame=finite(k.frame,0,durationInFrames-1);
   if(!Number.isInteger(frame)||frame<=previous||(previous===-1&&frame!==0))throw Error('motion_plan: invalid key frame');
   previous=frame;
   return Object.freeze({frame,x:finite(k.x,-10000,10000),y:finite(k.y,-10000,10000),scale:finite(k.scale,0.001,100),opacity:finite(k.opacity,0,1)});
  });
  let attachments:readonly MotionAttachment[]|undefined;
  if(Object.hasOwn(t,'attachments')){
   if(Object.hasOwn(t,'parentId')||!Array.isArray(t.attachments)||!t.attachments.length||t.attachments.length>16)throw Error('motion_plan: invalid attachments');
   let lastEnd=-1;
   attachments=Object.freeze(t.attachments.map(value=>{
    const a=fields(value,['startFrame','endFrame','parentId','offset']);
    const startFrame=finite(a.startFrame,0,durationInFrames-1),endFrame=finite(a.endFrame,1,durationInFrames);
    if(!Number.isInteger(startFrame)||!Number.isInteger(endFrame)||endFrame<=startFrame||startFrame<lastEnd)throw Error('motion_plan: overlapping or invalid attachment window');
    lastEnd=endFrame;
    const o=fields(a.offset,['x','y','scale','opacity']);
    const offset=Object.freeze({x:finite(o.x,-10000,10000),y:finite(o.y,-10000,10000),scale:finite(o.scale,0.001,100),opacity:finite(o.opacity,0,1)});
    return Object.freeze({startFrame,endFrame,parentId:id(a.parentId),offset});
   }));
  }
  return Object.freeze({id:id(t.id),...(Object.hasOwn(t,'parentId')?{parentId:id(t.parentId)}:{}),keys:Object.freeze(keys),...(attachments?{attachments}:{})});
 });
 const byId=new Map(tracks.map(t=>[t.id,t]));
 if(byId.size!==tracks.length)throw Error('motion_plan: duplicate id');
 const done=new Set<string>(),visiting=new Set<string>();
 const visit=(track:MotionTrack)=>{
  if(visiting.has(track.id))throw Error('motion_plan: missing parent or cycle');
  if(done.has(track.id))return;
  visiting.add(track.id);
  for(const parentId of [...(track.parentId?[track.parentId]:[]),...(track.attachments??[]).map(a=>a.parentId)]){
   const parent=byId.get(parentId);if(!parent)throw Error('motion_plan: missing parent or cycle');visit(parent);
  }
  visiting.delete(track.id);done.add(track.id);
 };
 for(const track of tracks)visit(track);
 const plan:MotionPlan=Object.freeze({schemaVersion:r.schemaVersion,durationInFrames,tracks:Object.freeze(tracks)});
 for(const track of tracks)for(const attachment of track.attachments??[]){
  for(const frame of [attachment.startFrame,attachment.endFrame]){
   if(frame===durationInFrames)continue;
   const free=motionPoses(plan,frame,track.id)[track.id];
   const parent=evaluateMotion(plan,frame)[attachment.parentId],o=attachment.offset;
   const attached={x:parent.x+o.x*parent.scale,y:parent.y+o.y*parent.scale,scale:parent.scale*o.scale,opacity:parent.opacity*o.opacity};
   if((['x','y','scale','opacity'] as const).some(key=>Math.abs(free[key]-attached[key])>1e-7))throw Error(`motion_plan: discontinuous handoff ${track.id} at ${frame}`);
  }
 }
 return plan;
}

function motionPoses(plan:MotionPlan,frame:number,ignoreAttachmentId?:string):Record<string,MotionPose>{
 if(!Number.isFinite(frame))throw Error('motion_plan: invalid frame');
 const f=Math.max(0,Math.min(plan.durationInFrames-1,frame));
 const local=Object.fromEntries(plan.tracks.map(track=>{
  let a=track.keys[0],b=a;
  for(const key of track.keys){if(key.frame<=f){a=key;b=key;}else{b=key;break;}}
  const t=a===b?0:(f-a.frame)/(b.frame-a.frame),s=t*t*(3-2*t);
  const mix=(x:number,y:number)=>x+(y-x)*s;
  return [track.id,{x:mix(a.x,b.x),y:mix(a.y,b.y),scale:mix(a.scale,b.scale),opacity:mix(a.opacity,b.opacity)}];
 }));
 const byId=Object.fromEntries(plan.tracks.map(t=>[t.id,t]));
 const result:Record<string,MotionPose>={};
 const resolve=(track:MotionTrack):MotionPose=>{
  if(Object.hasOwn(result,track.id))return result[track.id];
  const attachment=track.id===ignoreAttachmentId?undefined:track.attachments?.find(a=>f>=a.startFrame&&f<a.endFrame);
  const own=attachment?.offset??local[track.id],parentId=attachment?.parentId??track.parentId;
  if(!parentId)return result[track.id]=own;
  const parent=resolve(byId[parentId]);
  return result[track.id]={x:parent.x+own.x*parent.scale,y:parent.y+own.y*parent.scale,scale:parent.scale*own.scale,opacity:parent.opacity*own.opacity};
 };
 for(const track of plan.tracks)resolve(track);
 return result;
}

// Every output is world-space and must be rendered as a sibling, including attached objects.
export function evaluateMotion(plan:MotionPlan,frame:number):Record<string,MotionPose>{return motionPoses(plan,frame);}

export function motionTransforms(plan:MotionPlan,frame:number):Record<string,{transform:string;opacity:number}>{
 return Object.fromEntries(Object.entries(evaluateMotion(plan,frame)).map(([id,p])=>[id,{transform:`translate(${p.x} ${p.y}) scale(${p.scale})`,opacity:p.opacity}]));
}
