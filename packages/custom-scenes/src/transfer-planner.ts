import Ajv from 'ajv';
import {compileMotionIntent} from './motion-intent';
import {evaluateMotion,type MotionPose} from './motion-plan';

type Point={x:number;y:number};
type Box=Point&{width:number;height:number};
type Cue={id:string;startFrame:number;endFrame:number};
type Rig={schemaVersion:'host-transfer:1'|'host-transfer:2';durationInFrames:number;cues:Cue[];stages:{pickup:string;handoff:string;feed:string}|{transfers:{payloadId:string;pickup:string;handoff:string;retreatEndFrame?:number}[];feed:string};
 carrier:{id:string;bounds:Box;contact:Point;jawWidth:number;contactDepth:number};
 payloads:({id:string}&Box)[];
 sleeve:{id:string;origin:Point;width:number;height:number;bounds:Box;pocket:Box;deposit:Point};
 receiver:{id:string;bounds:Box;channel:Box};obstacles:{id:string;bounds:Box}[]};
type Action={kind:'move';startFrame:number;endFrame:number;targetAnchor:string}|{kind:'attach';frame:number;parentId:string}|{kind:'release';frame:number};
const EPS=1e-6,CLEARANCE=12;
const fail=(reason:string):never=>{throw Error('host_transfer: '+reason);};
const object=(properties:Record<string,unknown>,optional:string[]=[])=>({type:'object',properties,required:Object.keys(properties).filter(k=>!optional.includes(k)),additionalProperties:false});
const number={type:'number',minimum:-10000,maximum:10000};
const id={type:'string',pattern:'^[a-z][a-z0-9-]{0,63}$'};
const dimension={type:'number',minimum:0.001,maximum:1920};
const point=object({x:number,y:number}),box=object({x:number,y:number,width:dimension,height:dimension});
const rigProperties={
 durationInFrames:{type:'integer',minimum:1,maximum:3600},
 cues:{type:'array',minItems:3,maxItems:30,items:object({id,startFrame:{type:'integer',minimum:0,maximum:3599},endFrame:{type:'integer',minimum:1,maximum:3600}})},
 carrier:object({id,bounds:box,contact:point,jawWidth:dimension,contactDepth:{type:'number',minimum:0,maximum:12}}),
 payloads:{type:'array',minItems:1,maxItems:4,items:object({id,x:number,y:number,width:dimension,height:dimension})},
 sleeve:object({id,origin:point,width:dimension,height:dimension,bounds:box,pocket:box,deposit:point}),
 receiver:object({id,bounds:box,channel:box}),obstacles:{type:'array',maxItems:20,items:object({id,bounds:box})},
};
const validate=new Ajv({strict:false,allErrors:false}).compile({anyOf:[
 object({...rigProperties,schemaVersion:{const:'host-transfer:1'},stages:object({pickup:id,handoff:id,feed:id})}),
 object({...rigProperties,schemaVersion:{const:'host-transfer:2'},stages:object({transfers:{type:'array',minItems:1,maxItems:4,items:object({payloadId:id,pickup:id,handoff:id,retreatEndFrame:{type:'integer',minimum:1,maximum:3600}},['retreatEndFrame'])},feed:id})}),
]});
const contains=(a:Box,b:Box)=>b.x>=a.x-EPS&&b.y>=a.y-EPS&&b.x+b.width<=a.x+a.width+EPS&&b.y+b.height<=a.y+a.height+EPS;
function intersection(a:Box,b:Box):Box|undefined{
 const x=Math.max(a.x,b.x),y=Math.max(a.y,b.y),width=Math.min(a.x+a.width,b.x+b.width)-x,height=Math.min(a.y+a.height,b.y+b.height)-y;
 return width>EPS&&height>EPS?{x,y,width,height}:undefined;
}
const inflate=(b:Box,pad=CLEARANCE):Box=>({x:b.x-pad,y:b.y-pad,width:b.width+2*pad,height:b.height+2*pad});
const sweep=(a:Box,b:Box):Box=>({x:Math.min(a.x,b.x),y:Math.min(a.y,b.y),width:a.width+Math.abs(a.x-b.x),height:a.height+Math.abs(a.y-b.y)});
const pose=(p:Point):MotionPose=>({x:p.x,y:p.y,scale:1,opacity:1});
const translated=(b:Box,p:Point):Box=>({...b,x:b.x+p.x,y:b.y+p.y});

/** Trusted host rig in, existing motion intent out. No network, drawing, source execution or fallback. */
export function compileTransferPlan(value:unknown){
 if(!validate(value))fail('schema mismatch; '+JSON.stringify(validate.errors?.slice(0,3)));
 const rig=value as Rig,{carrier,sleeve,receiver}=rig;
 const cargo=[...rig.payloads].sort((a,b)=>a.x-b.x);
 const ids=[carrier.id,sleeve.id,receiver.id,...cargo.map(p=>p.id),...rig.obstacles.map(o=>o.id)];
 if(new Set(ids).size!==ids.length)fail('ambiguous identity');
 let end=0;const cueIds=new Set<string>();
 for(const cue of rig.cues){
  if(cueIds.has(cue.id)||cue.startFrame<end||cue.endFrame<=cue.startFrame||cue.endFrame>rig.durationInFrames)fail('invalid cue clock');
  cueIds.add(cue.id);end=cue.endFrame;
 }
 const stage=(name:string)=>rig.cues.find(c=>c.id===name)??fail('unknown stage cue');
 const sequential='transfers' in rig.stages;
 const schedule='transfers' in rig.stages?rig.stages.transfers:[{payloadId:'',pickup:rig.stages.pickup,handoff:rig.stages.handoff}];
 if(sequential&&(schedule.length!==cargo.length||new Set(schedule.map(s=>s.payloadId)).size!==cargo.length||schedule.some(s=>!cargo.some(p=>p.id===s.payloadId))))fail('invalid payload schedule');
 const cycles=schedule.map(s=>({pickup:stage(s.pickup),handoff:stage(s.handoff),cargo:sequential?cargo.filter(p=>p.id===s.payloadId):cargo,retreatEndFrame:'retreatEndFrame' in s?s.retreatEndFrame:undefined}));
 const feed=stage(rig.stages.feed),pickup=cycles[0].pickup,handoff=cycles.at(-1)!.handoff;
 const used=cycles.flatMap(c=>[c.pickup.id,c.handoff.id]).concat(feed.id);
 if(new Set(used).size!==used.length||feed.endFrame-feed.startFrame<2)fail('unordered stage cues or insufficient stage window');
 cycles.forEach((c,i)=>{
  if(c.pickup.endFrame>c.handoff.startFrame||c.handoff.endFrame>(cycles[i+1]?.pickup.startFrame??feed.startFrame))fail('unordered stage cues');
  if(c.pickup.endFrame-c.pickup.startFrame<4||c.handoff.endFrame-c.handoff.startFrame<4)fail('insufficient stage window');
  const next=cycles[i+1]?.pickup.startFrame??feed.startFrame,retreat=c.retreatEndFrame??next;
  if(retreat>next||retreat-c.handoff.endFrame<3)fail('insufficient retreat window');
 });
 for(let i=0;i<cargo.length;i++){
  if(Math.abs(cargo[i].y-cargo[0].y)>EPS||(i&&cargo[i].x-cargo[i-1].x-cargo[i-1].width<CLEARANCE-EPS))fail('unsupported pickup formation');
 }
 const left=cargo[0].x,bundleWidth=cargo.at(-1)!.x+cargo.at(-1)!.width-left,bundleHeight=Math.max(...cargo.map(p=>p.height));
 if((sequential?Math.max(...cargo.map(p=>p.width)):bundleWidth)>carrier.jawWidth+EPS)fail('bundle wider than jaw capacity');
 if(carrier.contact.x<carrier.bounds.x||carrier.contact.x>carrier.bounds.x+carrier.bounds.width||
  carrier.contact.y<carrier.bounds.y||carrier.contact.y>carrier.bounds.y+carrier.bounds.height||
  carrier.bounds.y+carrier.bounds.height>carrier.contact.y+carrier.contactDepth+EPS)fail('invalid carrier contact geometry');
 const sleeveExtent={x:0,y:0,width:sleeve.width,height:sleeve.height};
 if(!contains(sleeveExtent,sleeve.bounds)||!contains(sleeveExtent,sleeve.pocket))fail('invalid sleeve bounds or pocket');
 const localDeposit={x:sleeve.deposit.x-bundleWidth/2,y:sleeve.deposit.y,width:bundleWidth,height:bundleHeight};
 if(!contains(sleeve.pocket,localDeposit))fail('payload does not fit pocket');
 if(!contains(receiver.bounds,receiver.channel)||receiver.channel.width<sleeve.width+CLEARANCE||receiver.channel.height<sleeve.height+2*CLEARANCE)fail('receiver channel too small');
 const feedEnd={x:receiver.channel.x,y:receiver.channel.y+(receiver.channel.height-sleeve.height)/2};
 if(Math.abs(feedEnd.y-sleeve.origin.y)>EPS||feedEnd.x<=sleeve.origin.x)fail('feed lane is not horizontally aligned');
 const paths=cycles.map(c=>{
  const center=(c.cargo[0].x+c.cargo.at(-1)!.x+c.cargo.at(-1)!.width)/2;
  return {...c,pick:{x:center-carrier.contact.x,y:cargo[0].y-carrier.contact.y},
   drop:{x:sleeve.origin.x+sleeve.deposit.x-bundleWidth/2+center-left-carrier.contact.x,y:sleeve.origin.y+sleeve.deposit.y-carrier.contact.y}};
 });
 const {pick,drop}=paths[0];
 const bottom=Math.max(carrier.bounds.y+carrier.bounds.height,carrier.contact.y+bundleHeight);
 const barrierTop=Math.min(receiver.bounds.y,sleeve.origin.y+sleeve.bounds.y);
 let transitY=Math.min(...paths.flatMap(p=>[p.pick.y,p.drop.y]),barrierTop-CLEARANCE-bottom);
 // Overhead structure can stay above the lane; all obstacles still undergo swept checks.
 for(const obstacle of rig.obstacles)if(obstacle.bounds.y+obstacle.bounds.height+CLEARANCE>transitY+carrier.bounds.y)
  transitY=Math.min(transitY,obstacle.bounds.y-CLEARANCE-bottom);
 const park={x:pick.x,y:transitY};
 const anchors:{id:string;pose:MotionPose}[]=[],objects:{id:string;initialAnchor:string;actions:Action[]}[]=[];
 const anchor=(p:Point)=>{const id='host-anchor-'+anchors.length;anchors.push({id,pose:pose(p)});return id;};
 const add=(id:string,p:Point)=>{const object={id,initialAnchor:anchor(p),actions:[] as Action[]};objects.push(object);return object;};
 const robot=add(carrier.id,park),papers=cargo.map(p=>add(p.id,p)),bag=add(sleeve.id,sleeve.origin);
 add(receiver.id,{x:receiver.bounds.x,y:receiver.bounds.y});rig.obstacles.forEach(o=>add(o.id,o.bounds));
 const moves=(object:typeof robot,from:number,to:number,points:Point[])=>{
  if(to-from<points.length)fail('insufficient move window');
  const times=Array.from({length:points.length+1},(_,i)=>from+Math.floor((to-from)*i/points.length));
  points.forEach((p,i)=>object.actions.push({kind:'move',startFrame:times[i],endFrame:times[i+1],targetAnchor:anchor(p)}));
 };
 const pickupAt=pickup.endFrame-1,handoffAt=handoff.endFrame-1;
 paths.forEach((c,i)=>{
  const selected=papers.filter(p=>c.cargo.some(item=>item.id===p.id));
  moves(robot,c.pickup.startFrame,c.pickup.endFrame-1,[park,{x:c.pick.x,y:transitY},c.pick]);
  selected.forEach(p=>p.actions.push({kind:'attach',frame:c.pickup.endFrame-1,parentId:carrier.id}));
  moves(robot,c.handoff.startFrame,c.handoff.endFrame-1,[{x:c.pick.x,y:transitY},{x:c.drop.x,y:transitY},c.drop]);
  selected.forEach(p=>p.actions.push({kind:'release',frame:c.handoff.endFrame-1},{kind:'attach',frame:c.handoff.endFrame-1,parentId:sleeve.id}));
  moves(robot,c.handoff.endFrame,(c.retreatEndFrame??paths[i+1]?.pickup.startFrame??feed.startFrame)-1,[{x:c.drop.x,y:transitY},park]);
 });
 moves(bag,feed.startFrame,feed.endFrame-1,[feedEnd]);
 const intent={schemaVersion:'motion-intent:1' as const,durationInFrames:rig.durationInFrames,anchors,objects};
 const plan=compileMotionIntent(intent);
 const bodies=[{id:carrier.id,local:carrier.bounds},...cargo.map(p=>({id:p.id,local:{x:0,y:0,width:p.width,height:p.height}})),{id:sleeve.id,local:sleeve.bounds}];
 const payloadIds=new Set(cargo.map(p=>p.id)),viewport={x:0,y:0,width:1920,height:980};
 if(!contains(viewport,receiver.bounds)||rig.obstacles.some(o=>!contains(viewport,o.bounds)))fail('static body outside viewport');
 let previous=evaluateMotion(plan,0);
 for(let frame=0;frame<rig.durationInFrames;frame++){
  const current=evaluateMotion(plan,frame);
  const boxAt=(body:typeof bodies[number],poses:typeof current)=>translated(body.local,poses[body.id]);
  for(const body of bodies){
   const swept=sweep(boxAt(body,previous),boxAt(body,current));
   if(!contains(viewport,swept))fail(`viewport violation ${body.id} at ${frame}`);
   for(const obstacle of [...rig.obstacles,receiver]){
    const hit=intersection(inflate(swept),obstacle.bounds);if(!hit)continue;
    const feeding=frame>=feed.startFrame&&(body.id===sleeve.id||payloadIds.has(body.id));
    if(obstacle.id===receiver.id&&feeding&&contains(receiver.channel,hit))continue;
    fail(`blocked clearance ${body.id}/${obstacle.id} at ${frame}`);
   }
  }
  // Relative sweeps avoid false collisions between co-moving, separated cargo.
  for(let i=0;i<bodies.length;i++)for(const other of bodies.slice(i+1)){
   const body=bodies[i];
   const relative=(poses:typeof current)=>{const a=boxAt(body,poses),b=poses[other.id];return {...a,x:a.x-b.x,y:a.y-b.y};};
   const swept=sweep(relative(previous),relative(current));
   const contactCycle=cycles.find((c,i)=>c.cargo.some(p=>p.id===other.id)&&frame>=c.pickup.startFrame&&frame<(cycles[i+1]?.pickup.startFrame??feed.startFrame));
   if(body.id===carrier.id&&contactCycle&&swept.y<0&&swept.y+swept.height<=carrier.contactDepth+EPS)continue;
   const hit=intersection(inflate(swept),other.local);if(!hit)continue;
   if(payloadIds.has(body.id)&&other.id===sleeve.id&&frame>=cycles.find(c=>c.cargo.some(p=>p.id===body.id))!.handoff.startFrame&&contains(sleeve.pocket,hit))continue;
   fail(`blocked pair clearance ${body.id}/${other.id} at ${frame}`);
  }
  previous=current;
 }
 return {schemaVersion:'host-transfer-result:1' as const,intent,plan,events:{pickup:pickupAt,handoff:handoffAt,feedStart:feed.startFrame,feedEnd:feed.endFrame-1,
  ...(sequential?{transfers:paths.map(c=>({payloadId:c.cargo[0].id,pickup:c.pickup.endFrame-1,handoff:c.handoff.endFrame-1}))}:{})},
  computed:{pick,drop,park,feedEnd,bundleWidth},verification:{frames:rig.durationInFrames,clearance:CLEARANCE,scope:'Declared host AABB rig and adjacent swept bounds only; not rendered geometry, labels or rigid-body physics'},accepted:false as const};
}
