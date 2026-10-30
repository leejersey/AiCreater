import {parseDesign,designHash,type VisualDesign} from './design';
import {compileTransferPlan} from './transfer-planner';
import {parseMotionAssembly,type SvgNode} from './motion-assembly';

type Box={x:number;y:number;width:number;height:number};
type Asset={bounds:Box;artwork:SvgNode[];obstaclePaths:number[][];contact?:{x:number;y:number};jawWidth?:number;contactDepth?:number;pocket?:Box;deposit?:{x:number;y:number}};
type Roles={beamId:string;carrierId:string;sleeveId:string;receiverId:string;payloadIds:string[];
 motionCues?:{id:string;sourceCueId:string;startFrame:number;endFrame:number}[];
 stages:{transfers:{payloadId:string;pickup:string;handoff:string;retreatEndFrame?:number}[];feed:string}};
const fail=(message:string):never=>{throw Error('transfer_components: '+message);};

/** The same dimensions define painted geometry (including strokes) and physical ports. */
export function transferAsset(kind:'beam'|'head'|'document'|'sleeve'|'receiver',w:number,h:number,label:string,channel?:Box):Asset{
 if(!['beam','head','document','sleeve','receiver'].includes(kind)||![w,h].every(v=>Number.isFinite(v)&&v>=40&&v<=1920))fail('unsupported asset dimensions');
 if(typeof label!=='string'||!label.trim()||label.length>24||!/^[-\x20-\x7e\u3000-\u303f\u3400-\u9fff\uff01-\uff60]+$/.test(label))fail('invalid asset label');
 const n=(tag:string,attrs:SvgNode['attrs'],text?:string):SvgNode=>({tag,attrs,...(text===undefined?{}:{text})});
 const rect=(x:number,y:number,width:number,height:number)=>n('rect',{x,y,width,height,fill:'background',stroke:'accent',strokeWidth:2,strokeLinejoin:'round'});
 const line=(x1:number,y1:number,x2:number,y2:number)=>n('line',{x1,y1,x2,y2,stroke:'accent',strokeWidth:2,strokeLinecap:'round'});
 const text=(y:number,maxSize:number)=>{
  // Conservative Latin/CJK allowance, not a substitute for rendered glyph-bounds QA.
  const units=Array.from(label).length*1.25,size=Math.min(24,maxSize,(w-12)/units);
  if(size<12||y-size<2||y>h-2)fail('asset label does not fit');
  return n('text',{x:6,y,fontSize:size,fill:'foreground'},label);
 };
 const bounds={x:0,y:0,width:w,height:h};
 if(kind==='beam')return {bounds,artwork:[rect(1,1,w-2,h-2),text(h*.65,h*.45)],obstaclePaths:[[0]]};
 if(kind==='head'){
  const jawWidth=w*.7,left=(w-jawWidth)/2,right=(w+jawWidth)/2;
  return {bounds,contact:{x:w/2,y:h-2},jawWidth,contactDepth:2,obstaclePaths:[[0],[1],[2],[3]],artwork:[
   rect(w*.35,1,w*.3,h*.25-1),line(w/2,h*.25,w/2,h*.55),
   line(left,h*.55,right,h*.55),n('path',{d:`M ${left} ${h-2} V ${h*.55} M ${right} ${h*.55} V ${h-2}`,fill:'none',stroke:'accent',strokeWidth:2,strokeLinecap:'round'}),
  ]};
 }
 if(kind==='document')return {bounds,obstaclePaths:[[0]],artwork:[
  n('path',{d:`M 1 1 H ${w*.75} L ${w-1} ${h*.2} V ${h-1} H 1 Z`,fill:'background',stroke:'accent',strokeWidth:2,strokeLinejoin:'round'}),
  n('path',{d:`M ${w*.75} 1 V ${h*.2} H ${w-1}`,fill:'none',stroke:'accent',strokeWidth:2,strokeLinejoin:'round'}),
  text(h*.32,h*.2),...[.52,.68,.84].map(y=>line(w*.12,h*y,w*.86,h*y)),
 ]};
 if(kind==='sleeve'){
  if(w<60||h<100)fail('unsupported sleeve dimensions');
  return {bounds:{x:0,y:h*.3,width:w,height:h*.7},pocket:{x:12,y:0,width:w-24,height:h*.65},deposit:{x:w/2,y:h*.2},obstaclePaths:[[0]],artwork:[
   rect(1,h*.3+1,w-2,h*.7-2),line(1,h*.3+1,w-1,h*.3+1),text(h*.85,h*.1),
  ]};
 }
 if(!channel)return fail('receiver channel required');
 if(![channel.x,channel.y,channel.width,channel.height].every(Number.isFinite)||channel.x!==0||channel.width!==w||channel.y<40||channel.height<=0||channel.y+channel.height>h-40)fail('unsupported receiver channel');
 const bottom=channel.y+channel.height;
 return {bounds,obstaclePaths:[[0],[1]],artwork:[rect(1,1,w-2,channel.y-2),rect(1,bottom+1,w-2,h-bottom-2),text(channel.y*.65,channel.y*.35)]};
}

/** Offline binding only: no remapping of an existing combined beam or unbound design objects. */
export function bindTransferComponents(value:VisualDesign,roles:Roles){
 const design=parseDesign(value);
 const required=['beamId','carrierId','payloadIds','receiverId','sleeveId','stages'];
 if(!roles||required.some(k=>!Object.hasOwn(roles,k))||Object.keys(roles).some(k=>!required.includes(k)&&k!=='motionCues')||!Array.isArray(roles.payloadIds)||roles.payloadIds.length<1||roles.payloadIds.length>4)fail('invalid roles');
 const ids=[roles.beamId,roles.carrierId,roles.sleeveId,roles.receiverId,...roles.payloadIds];
 if(new Set(ids).size!==ids.length||ids.some(id=>!design.objects.some(o=>o.id===id)))fail('invalid role identity');
 if(ids.length!==design.objects.length)fail('unbound design object');
 if(design.objects.some(o=>o.parentId!==undefined||o.kind==='path'||o.kind==='label'||o.states!==undefined))fail('unsupported role hierarchy or states');
 const get=(id:string)=>design.objects.find(o=>o.id===id)!;
 const beam=get(roles.beamId),head=get(roles.carrierId),bag=get(roles.sleeveId),receiver=get(roles.receiverId);
 const beamAsset=transferAsset('beam',beam.width,beam.height,beam.meaning),headAsset=transferAsset('head',head.width,head.height,head.meaning),bagAsset=transferAsset('sleeve',bag.width,bag.height,bag.meaning);
 const channel={x:0,y:bag.y-receiver.y-12,width:receiver.width,height:bag.height+24};
 const receiverAsset=transferAsset('receiver',receiver.width,receiver.height,receiver.meaning,channel);
 const payloads=roles.payloadIds.map(id=>get(id));
 let clock=design.cues.map(({id,startFrame,endFrame})=>({id,startFrame,endFrame}));
 if(roles.motionCues!==undefined){
  if(!Array.isArray(roles.motionCues)||!roles.motionCues.length||roles.motionCues.length>8||!Array.isArray(roles.stages?.transfers))fail('invalid motion cue bindings');
  const ids=new Set(clock.map(c=>c.id)),used=new Set(roles.stages.transfers.flatMap(t=>[t.pickup,t.handoff]).concat(roles.stages.feed));
  for(const c of roles.motionCues){
   const source=c&&design.cues.find(p=>p.id===c.sourceCueId);
   if(!source||Object.keys(c).sort().join(',')!=='endFrame,id,sourceCueId,startFrame'||!used.has(c.id)||ids.has(c.id)||! /^[a-z][a-z0-9-]{0,63}$/.test(c.id)||
    !Number.isInteger(c.startFrame)||!Number.isInteger(c.endFrame)||c.startFrame<source.startFrame||c.endFrame>source.endFrame||c.startFrame>=c.endFrame)fail('invalid motion cue binding');
   ids.add(c.id);
  }
  for(const transfer of roles.stages.transfers){
   const child=roles.motionCues.find(c=>c.id===transfer.handoff),source=child&&design.cues.find(c=>c.id===child.sourceCueId);
   if(source&&transfer.retreatEndFrame!==undefined&&transfer.retreatEndFrame>source.endFrame)fail('retreat leaves motion source cue');
  }
  const parents=new Set(roles.motionCues.map(c=>c.sourceCueId));
  clock=clock.filter(c=>!parents.has(c.id)).concat(roles.motionCues.map(({id,startFrame,endFrame})=>({id,startFrame,endFrame}))).sort((a,b)=>a.startFrame-b.startFrame);
 }
 const rig={schemaVersion:'host-transfer:2' as const,durationInFrames:design.brief.durationInFrames,cues:clock,stages:structuredClone(roles.stages),
  carrier:{id:head.id,bounds:headAsset.bounds,contact:headAsset.contact!,jawWidth:headAsset.jawWidth!,contactDepth:headAsset.contactDepth!},
  payloads:payloads.map(({id,x,y,width,height})=>({id,x,y,width,height})),
  sleeve:{id:bag.id,origin:{x:bag.x,y:bag.y},width:bag.width,height:bag.height,bounds:bagAsset.bounds,pocket:bagAsset.pocket!,deposit:bagAsset.deposit!},
  receiver:{id:receiver.id,bounds:{x:receiver.x,y:receiver.y,width:receiver.width,height:receiver.height},channel:{...channel,x:receiver.x,y:receiver.y+channel.y}},
  obstacles:[{id:beam.id,bounds:{...beamAsset.bounds,x:beam.x,y:beam.y}}]};
 const compiled=compileTransferPlan(rig);
 if(Math.abs(compiled.computed.park.x-head.x)>1e-6||Math.abs(compiled.computed.park.y-head.y)>1e-6)fail('initial head differs from frozen design');
 const assets=[{id:beam.id,asset:beamAsset},{id:receiver.id,asset:receiverAsset},{id:bag.id,asset:bagAsset},
  ...payloads.map(p=>({id:p.id,asset:transferAsset('document',p.width,p.height,p.meaning)})),{id:head.id,asset:headAsset}];
 const assembly=parseMotionAssembly({schemaVersion:'motion-assembly:2',brief:design.brief,plan:compiled.plan,layers:assets.map(({id,asset})=>({id,artwork:asset.artwork})),
  audit:{routes:[],obstacles:assets.flatMap(({id,asset})=>asset.obstaclePaths.map(nodePath=>({layerId:id,nodePath})))}});
 return {schemaVersion:'host-transfer-binding:1' as const,designSha256:designHash(design),roles:structuredClone(roles),rig,assembly,verification:compiled.verification,accepted:false as const};
}
