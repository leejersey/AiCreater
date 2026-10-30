import test from 'node:test';
import assert from 'node:assert/strict';
import {buildTeachingLayout} from '../src/teaching-layout';
import {compileTeachingMotion} from '../src/teaching-motion';
import {teachingExample,teachingBrief as brief,teachingCues as cues} from './fixtures/teaching-examples';
import {prepareTeachingCompilation,validateTeachingRevision,buildTeachingRevisionPrompt} from '../src/teaching-repair';
import {designInputHash} from '../src/design-content';

test('crowded annotation slots are repaired by host placement without touching the semantic plan',()=>{
 const plan=teachingExample('comparison');
 plan.objects.push({id:'note',component:'wallet',meaning:'context note',label:'上下文',ownerId:null,initialState:'empty'});
 const original=structuredClone(plan),layout=buildTeachingLayout(plan,brief,cues);
 assert.deepEqual(plan,original);assert.equal(layout.objects.length,3);
 assert.equal(layout.adjustments.length,1);assert.equal(layout.adjustments[0].objectId,'note');
 assert.equal(layout.adjustments[0].kind,'annotation-placement');
 assert.deepEqual(layout,buildTeachingLayout(plan,brief,cues));
 for(const a of layout.objects)for(const b of layout.objects)if(a.id!==b.id)assert.ok(a.bounds.x+a.bounds.width+12<=b.bounds.x||b.bounds.x+b.bounds.width+12<=a.bounds.x||a.bounds.y+a.bounds.height+12<=b.bounds.y||b.bounds.y+b.bounds.height+12<=a.bounds.y);
 const compiled=compileTeachingMotion(plan,brief,cues);
 assert.equal(compiled.layoutAdjustments.length,1);
 assert.equal(compiled.objects.find(o=>o.id==='note')!.asset.text.lines.join(''),'上下文');
 assert.equal(compiled.accepted,false);
});

test('all six valid examples compile without provider dispatch or a video success claim',()=>{
 for(const kind of ['flow','loop','comparison','filter','composition','state-change'] as const){
  const result=prepareTeachingCompilation(teachingExample(kind),brief,cues);
  assert.equal(result.status,'compiled');assert.equal(result.accepted,false);assert.equal(result.modelCalls,0);
 }
});

test('unresolved capacity becomes a bound data-only revision request without losing the original failure',()=>{
 const plan=teachingExample('composition');
 for(let i=0;i<2;i++)plan.objects.push({id:'paper-'+i,component:'document',meaning:'evidence',label:'证据'+i,ownerId:null,initialState:'waiting'});
 const combine=plan.beats[0].actions[0];assert.equal(combine.kind,'combine');if(combine.kind==='combine')combine.objectIds.push('paper-0','paper-1');
 const result=prepareTeachingCompilation(plan,brief,cues);
 assert.equal(result.status,'revision-required');
 if(result.status!=='revision-required')return;
 assert.equal(result.diagnostic.stage,'motion');assert.equal(result.diagnostic.code,'capacity');
 assert.match(result.request.requestSha256,/^[a-f0-9]{64}$/);assert.ok(Object.isFrozen(result.request.plan.objects));
 assert.deepEqual(result,prepareTeachingCompilation(plan,brief,cues));
 const candidate=structuredClone(plan);candidate.objects.find(o=>o.id==='bag')!.component='container';
 candidate.objects.find(o=>o.id==='bag')!.initialState='empty';
 const expected=result.request.requestSha256;
 assert.deepEqual(validateTeachingRevision(result.request,candidate,brief,cues,expected),candidate);
 assert.equal(prepareTeachingCompilation(candidate,brief,cues).status,'revision-required','Valid repair syntax alone cannot claim a solved capacity');
 const prompt=buildTeachingRevisionPrompt(result.request,brief,cues,expected);
 assert.ok(prompt.includes(result.request.requestSha256));assert.match(prompt,/Never shorten text/);
 for(const mutate of [
  (p:typeof candidate)=>{p.objects[0].label='short';},
  (p:typeof candidate)=>{p.objects[0].meaning='changed';},
  (p:typeof candidate)=>{p.beats[1].actions=[];},
  (p:typeof candidate)=>{p.objects.pop();},
 ]){const copy=structuredClone(candidate);mutate(copy);assert.throws(()=>validateTeachingRevision(result.request,copy,brief,cues,expected));}
 assert.throws(()=>validateTeachingRevision({...result.request,requestSha256:'0'.repeat(64)},candidate,brief,cues,expected),/binding/);
 assert.throws(()=>validateTeachingRevision(result.request,candidate,{...brief,title:'Changed input'},cues,expected),/binding|match/);
 const changed=structuredClone(plan);changed.objects[0].meaning='replacement baseline';
 const forged=prepareTeachingCompilation(changed,brief,cues);assert.equal(forged.status,'revision-required');
 if(forged.status==='revision-required'){
  assert.throws(()=>validateTeachingRevision(forged.request,changed,brief,cues,expected),/binding/);
  assert.throws(()=>buildTeachingRevisionPrompt(forged.request,brief,cues,expected),/binding/);
 }
});

test('fixed transport text that cannot fit is unsupported, not a futile paid repair',()=>{
 const plan=teachingExample('flow');plan.objects.find(o=>o.id==='paper')!.label='这是十二个汉字测试文字呀';
 const result=prepareTeachingCompilation(plan,brief,cues);
 assert.equal(result.status,'unsupported');assert.equal('request' in result,false);
});

test('a component-only repair can solve capacity while retaining every ordered action and label',()=>{
 const plan=teachingExample('composition'),bag=plan.objects.find(o=>o.id==='bag')!;
 bag.component='classifier';bag.initialState='idle';
 const result=prepareTeachingCompilation(plan,brief,cues);assert.equal(result.status,'revision-required');
 if(result.status!=='revision-required')return;
 const candidate=structuredClone(plan),replacement=candidate.objects.find(o=>o.id==='bag')!;
 replacement.component='wallet';replacement.initialState='empty';
 const repaired=validateTeachingRevision(result.request,candidate,brief,cues,result.request.requestSha256);
 const compiled=prepareTeachingCompilation(repaired,brief,cues);
 assert.equal(compiled.status,'compiled');assert.equal(compiled.accepted,false);
 assert.deepEqual(repaired.beats,plan.beats);assert.deepEqual(repaired.objects.map(o=>o.label),plan.objects.map(o=>o.label));
});

test('invalid protocol or host context is not mislabeled as a successful repair',()=>{
 assert.throws(()=>prepareTeachingCompilation({...teachingExample('flow'),tsx:'bad'},brief,cues),/schema/);
 const badContext=structuredClone(brief);Object.assign(badContext,{width:NaN});
 assert.throws(()=>prepareTeachingCompilation(teachingExample('flow'),badContext,cues));
});

test('unsupported topologies and short host timing never request a paid plan retry',()=>{
 const plan=teachingExample('state-change');
 for(let i=0;i<5;i++)plan.objects.push({id:'extra-'+i,component:'document',meaning:'extra',label:'extra',ownerId:null,initialState:'waiting'});
 const result=prepareTeachingCompilation(plan,brief,cues);assert.equal(result.status,'unsupported');assert.equal('request' in result,false);
 const short=cues.map(c=>({...c,endFrame:c.startFrame+1}));
 const shortPlan=teachingExample('state-change');shortPlan.inputSha256=designInputHash(brief,short);
 assert.equal(prepareTeachingCompilation(shortPlan,brief,short).status,'unsupported');
});

test('packing preserves all objects and stays deterministic for bounded annotation permutations',()=>{
 for(let count=1;count<=4;count++){
  const plan=teachingExample('state-change');
  for(let i=0;i<count;i++)plan.objects.push({id:'note-'+i,component:'document',meaning:'note',label:'完整说明'+i,ownerId:null,initialState:'waiting'});
  const layout=buildTeachingLayout(plan,brief,cues);
  plan.objects.reverse();assert.deepEqual(buildTeachingLayout(plan,brief,cues).objects,layout.objects);
  assert.equal(layout.objects.length,count+1);
 }
});
