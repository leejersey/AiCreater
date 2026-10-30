import test from 'node:test';
import assert from 'node:assert/strict';
import {compileTransferPlan} from '../src/transfer-planner';
import {evaluateMotion} from '../src/motion-plan';

function rig(){return {schemaVersion:'host-transfer:1',durationInFrames:500,
 cues:[{id:'pickup',startFrame:6,endFrame:83},{id:'handoff',startFrame:94,endFrame:230},{id:'feed',startFrame:243,endFrame:424}],
 stages:{pickup:'pickup',handoff:'handoff',feed:'feed'},
 carrier:{id:'claw',bounds:{x:0,y:0,width:850,height:100},contact:{x:425,y:95},jawWidth:136,contactDepth:5},
 payloads:[{id:'paper-a',x:500,y:470,width:62,height:80},{id:'paper-b',x:574,y:470,width:62,height:80}],
 sleeve:{id:'sleeve',origin:{x:900,y:500},width:300,height:280,bounds:{x:0,y:84,width:300,height:196},pocket:{x:0,y:0,width:300,height:280},deposit:{x:150,y:60}},
 receiver:{id:'engine',bounds:{x:1550,y:400,width:350,height:500},channel:{x:1550,y:488,width:350,height:304}},obstacles:[] as {id:string;bounds:{x:number;y:number;width:number;height:number}}[]};}

test('host plans contact, distinct cargo, atomic handoff and horizontal feed through existing compiler',()=>{
 const input=rig(),before=JSON.stringify(input),result=compileTransferPlan(input),plan=result.plan;
 assert.equal(JSON.stringify(input),before);assert.equal(result.accepted,false);
 const pickup=evaluateMotion(plan,result.events.pickup),claw=pickup.claw;
 assert.equal((pickup['paper-a'].x+pickup['paper-b'].x+62)/2,claw.x+425);
 assert.equal(pickup['paper-a'].y,claw.y+95);
 assert.equal(pickup['paper-b'].x-pickup['paper-a'].x-62,12);
 assert.equal(evaluateMotion(plan,5)['paper-a'].x,500);
 for(const id of ['paper-a','paper-b']){
  const track=plan.tracks.find(t=>t.id===id)!;
  assert.equal(track.attachments![0].parentId,'claw');
  assert.equal(track.attachments![0].endFrame,result.events.handoff);
  assert.equal(track.attachments![1].parentId,'sleeve');
  assert.equal(track.attachments![1].startFrame,result.events.handoff);
 }
 const start=evaluateMotion(plan,243),end=evaluateMotion(plan,423);
 assert.equal(end.sleeve.x,1550);assert.equal(end.sleeve.y,500);
 assert.equal(end['paper-a'].x-start['paper-a'].x,end.sleeve.x-start.sleeve.x);
 assert.equal(end['paper-b'].y-start['paper-b'].y,0);
 assert.equal(result.verification.frames,500);
 assert.deepEqual(compileTransferPlan(input),result);
});

test('rejects overlap, unaligned staged papers and a bundle wider than the trusted jaws',()=>{
 for(const mutate of [(r:ReturnType<typeof rig>)=>r.payloads[1].x=550,(r:ReturnType<typeof rig>)=>r.payloads[1].y=480,(r:ReturnType<typeof rig>)=>r.carrier.jawWidth=100]){
  const input=rig();mutate(input);assert.throws(()=>compileTransferPlan(input),/formation|jaw/);
 }
});

test('refuses to change cue times or manufacture a missing retreat interval',()=>{
 const missing=rig();missing.stages.pickup='unknown';assert.throws(()=>compileTransferPlan(missing),/cue/);
 const overlap=rig();overlap.cues[1].startFrame=70;assert.throws(()=>compileTransferPlan(overlap),/cue/);
 const short=rig();short.cues[0].endFrame=8;assert.throws(()=>compileTransferPlan(short),/window/);
 const gap=rig();gap.cues[2].startFrame=230;assert.throws(()=>compileTransferPlan(gap),/retreat/);
});

test('blocks out-of-viewport bodies, obstructed corridors and unsupported inlet alignment',()=>{
 const outside=rig();outside.payloads.forEach(p=>p.x-=450);assert.throws(()=>compileTransferPlan(outside),/viewport/);
 const blocked=rig();blocked.obstacles.push({id:'pillar',bounds:{x:1000,y:300,width:200,height:400}});assert.throws(()=>compileTransferPlan(blocked),/clearance|blocked/);
 const inlet=rig();inlet.receiver.channel.y=510;assert.throws(()=>compileTransferPlan(inlet),/feed.*align/);
 const aperture=rig();aperture.receiver.channel.height=100;assert.throws(()=>compileTransferPlan(aperture),/channel/);
});

test('strict input rejects unknown code fields, bad numbers and ambiguous identities',()=>{
 const extra:any=rig();extra.source='run()';assert.throws(()=>compileTransferPlan(extra),/schema/);
 const nan=rig();nan.carrier.contact.x=NaN;assert.throws(()=>compileTransferPlan(nan),/schema/);
 const ids=rig();ids.sleeve.id='paper-a';assert.throws(()=>compileTransferPlan(ids),/identity/);
});

test('swept feed blocks a thin obstacle even when both sampled endpoints clear it',()=>{
 const input=rig();input.cues[2].endFrame=input.cues[2].startFrame+2;
 input.obstacles.push({id:'thin-wall',bounds:{x:1300,y:700,width:0.1,height:20}});
 assert.throws(()=>compileTransferPlan(input),/blocked clearance sleeve\/thin-wall/);
});

test('rejects invalid host contact and containment ports rather than changing geometry',()=>{
 const contact=rig();contact.carrier.contact.y=80;assert.throws(()=>compileTransferPlan(contact),/contact geometry/);
 const pocket=rig();pocket.sleeve.pocket.x=-1;assert.throws(()=>compileTransferPlan(pocket),/sleeve bounds/);
 const deposit=rig();deposit.sleeve.deposit.x=10;assert.throws(()=>compileTransferPlan(deposit),/fit pocket/);
 const channel=rig();channel.receiver.channel.x=1540;assert.throws(()=>compileTransferPlan(channel),/channel/);
});

test('supports one or four staged papers and rejects the retained RAG bundle capacity mismatch',()=>{
 const single=rig();single.payloads=single.payloads.slice(0,1);
 assert.equal(compileTransferPlan(single).computed.bundleWidth,62);
 const four=rig();four.payloads=Array.from({length:4},(_,i)=>({id:'paper-'+i,x:500+37*i,y:470,width:25,height:80}));
 assert.equal(compileTransferPlan(four).computed.bundleWidth,136);
 const retained=rig();retained.payloads=[{id:'paper-a',x:170,y:470,width:84,height:104},{id:'paper-b',x:286,y:470,width:84,height:104}];
 retained.carrier.jawWidth=1100*0.16;
 assert.throws(()=>compileTransferPlan(retained),/bundle wider than jaw capacity/);
});

test('never attaches across a gap below the carrier or discards a positive thin obstacle',()=>{
 const detached=rig();detached.carrier.contact.y=300;
 assert.throws(()=>compileTransferPlan(detached),/contact geometry/);
 const thin=rig();thin.cues[2].endFrame=245;
 thin.obstacles.push({id:'tiny-wall',bounds:{x:1300,y:700,width:1e-7,height:20}});
 assert.throws(()=>compileTransferPlan(thin),/schema mismatch/);
});

function sequentialRig(){
 const input=rig();
 return {...input,schemaVersion:'host-transfer:2',carrier:{...input.carrier,bounds:{x:0,y:0,width:120,height:100},contact:{x:60,y:95},jawWidth:84},
  payloads:[{id:'paper-a',x:500,y:470,width:84,height:80},{id:'paper-b',x:616,y:470,width:84,height:80}],
  cues:[{id:'pick-a',startFrame:6,endFrame:50},{id:'drop-a',startFrame:60,endFrame:120},
   {id:'pick-b',startFrame:130,endFrame:170},{id:'drop-b',startFrame:180,endFrame:230},{id:'feed',startFrame:243,endFrame:424}],
  stages:{transfers:[{payloadId:'paper-a',pickup:'pick-a',handoff:'drop-a'},{payloadId:'paper-b',pickup:'pick-b',handoff:'drop-b'}],feed:'feed'}};
}

test('sequential host pickup loads a wide bundle individually without resizing or moving unpicked cargo',()=>{
 const input=sequentialRig(),before=JSON.stringify(input),result=compileTransferPlan(input);
 assert.equal(JSON.stringify(input),before);
 const first=evaluateMotion(result.plan,119);
 assert.equal(first['paper-b'].x,616);assert.equal(first['paper-b'].y,470);
 assert.equal(first['paper-a'].x,950);assert.equal(first['paper-a'].y,560);
 assert.equal(evaluateMotion(result.plan,170)['paper-a'].x,950);
 for(const [id,at] of [['paper-a',119],['paper-b',229]] as const){
  const track=result.plan.tracks.find(t=>t.id===id)!;
  assert.equal(track.attachments![1].parentId,'sleeve');assert.equal(track.attachments![1].startFrame,at);
 }
 const final=evaluateMotion(result.plan,423);
 assert.equal(final['paper-b'].x-final['paper-a'].x,116);
 assert.equal(final['paper-a'].x,1600);
 assert.equal(final.sleeve.x,1550);assert.equal(result.computed.bundleWidth,200);
 assert.equal(result.accepted,false);assert.deepEqual(compileTransferPlan(input),result);
});

test('sequential mode rejects missing/duplicate payload schedules, undersized jaws and missing retreat time',()=>{
 const missing=sequentialRig();missing.stages.transfers.pop();assert.throws(()=>compileTransferPlan(missing),/payload schedule/);
 const duplicate=sequentialRig();duplicate.stages.transfers[1].payloadId='paper-a';assert.throws(()=>compileTransferPlan(duplicate),/payload schedule/);
 const jaw=sequentialRig();jaw.carrier.jawWidth=83;assert.throws(()=>compileTransferPlan(jaw),/jaw capacity/);
 const time=sequentialRig();time.cues[2].startFrame=121;assert.throws(()=>compileTransferPlan(time),/retreat/);
});

test('reversed pickup order preserves assigned slots and rejects the unsplit moving beam',()=>{
 const reversed=sequentialRig();reversed.stages.transfers[0].payloadId='paper-b';reversed.stages.transfers[1].payloadId='paper-a';
 const result=compileTransferPlan(reversed),first=evaluateMotion(result.plan,119),final=evaluateMotion(result.plan,423);
 assert.equal(first['paper-a'].x,500);assert.equal(final['paper-b'].x-final['paper-a'].x,116);
 assert.equal(result.events.transfers![0].payloadId,'paper-b');
 const beam=sequentialRig();beam.carrier.bounds.width=850;beam.carrier.contact.x=425;
 assert.throws(()=>compileTransferPlan(beam),/blocked pair clearance/);
});

test('four sequential transfers keep separate identities and all finish before common feed',()=>{
 const input=sequentialRig();input.carrier={...input.carrier,bounds:{x:0,y:0,width:25,height:100},contact:{x:12.5,y:95},jawWidth:25};
 input.payloads=Array.from({length:4},(_,i)=>({id:'paper-'+i,x:500+37*i,y:470,width:25,height:80}));
 input.cues=input.payloads.flatMap((p,i)=>[{id:'pick-'+i,startFrame:6+50*i,endFrame:26+50*i},{id:'drop-'+i,startFrame:31+50*i,endFrame:50+50*i}]).concat({id:'feed',startFrame:243,endFrame:424});
 input.stages.transfers=input.payloads.map((p,i)=>({payloadId:p.id,pickup:'pick-'+i,handoff:'drop-'+i}));
 const result=compileTransferPlan(input),final=evaluateMotion(result.plan,423);
 assert.equal(result.events.transfers!.length,4);
 input.payloads.forEach((p,i)=>{
  assert.equal(final[p.id].x-final['paper-0'].x,37*i);
  const attachments=result.plan.tracks.find(t=>t.id===p.id)!.attachments!;
  assert.equal(attachments[1].parentId,'sleeve');assert.ok(attachments[1].startFrame<243);
 });
});

test('contact allowance cannot cover an unpicked or already deposited neighbor',()=>{
 const input=sequentialRig();input.carrier.bounds.width=150;input.carrier.contact.x=75;
 assert.throws(()=>compileTransferPlan(input),/blocked pair clearance claw\/paper-b/);
 const deposited=sequentialRig();deposited.payloads[1].width=20;
 assert.throws(()=>compileTransferPlan(deposited),/blocked pair clearance claw\/paper-a/);
});

test('a fixed overhead beam does not force the transport corridor above the viewport',()=>{
 const input=sequentialRig();input.obstacles.push({id:'fixed-beam',bounds:{x:100,y:50,width:1600,height:40}});
 assert.equal(compileTransferPlan(input).computed.park.y,213);
});
