import test from 'node:test';
import assert from 'node:assert/strict';
import Ajv from 'ajv';
import {parseBrief} from '../src/contract';
import {designInputHash} from '../src/design-content';
import {buildTeachingPlanSchema,parseTeachingPlan,teachingPlanHash,buildTeachingPlanPrompt,TeachingPlanError,teachingComponents} from '../src/teaching-plan';
import {generateWorkbench} from '../src/workbench';
import {stat} from 'node:fs/promises';
import {randomUUID} from 'node:crypto';
import os from 'node:os';
import path from 'node:path';

const brief=parseBrief({schemaVersion:'custom-scene-brief:1',id:'semantic-test',title:'Test',narration:'First.Second.',visualGoal:'Explain a mechanism',facts:['Example only'],materials:[],width:1920,height:1080,fps:30,durationInFrames:120});
const cues=[{id:'first',text:'First.',startFrame:6,endFrame:54},{id:'second',text:'Second.',startFrame:60,endFrame:114}];
const object=(id:string,component='document',initialState='waiting',ownerId:string|null=null)=>({id,component,meaning:id,label:id,ownerId,initialState});
const action=(kind:string,objectId='paper',targetId='machine')=>({kind,objectId,targetId});
function plan(structure='flow'):any{
 return {schemaVersion:'teaching-scene-plan:1',inputSha256:designInputHash(brief,cues),structure,
  objects:[object('paper'),object('machine','classifier','idle')],relations:[{kind:'flow',from:'paper',to:'machine',label:''}],
  beats:[{cueId:'first',actions:[action('transfer')]},{cueId:'second',actions:[{kind:'highlight',objectId:'machine'}]}]};
}
const parse=(value:unknown)=>parseTeachingPlan(value,brief,cues);
const rejects=(value:unknown,code:string)=>assert.throws(()=>parse(value),(e:unknown)=>e instanceof TeachingPlanError&&e.code===code);
function filterPlan():any{
 const value=plan('filter');value.objects.push(object('other'),object('keep','container','empty'),object('bin','container','empty'));
 value.relations=[{kind:'branch',from:'machine',to:'keep',label:'keep',outcome:'keep'},{kind:'branch',from:'machine',to:'bin',label:'discard',outcome:'discard'}];
 value.beats=[{cueId:'first',actions:[{kind:'select',objectId:'paper',candidateIds:['paper','other']}]},{cueId:'second',actions:[action('discard','other','bin')]}];
 return value;
}

test('semantic plan is bound, canonical, copied and not declared renderable',()=>{
 const input=plan(),before=JSON.stringify(input),parsed=parse(input);
 assert.equal(JSON.stringify(input),before);assert.deepEqual(parsed,input);
 const reordered=JSON.parse(JSON.stringify(input));reordered.objects[0]={label:'paper',initialState:'waiting',component:'document',id:'paper',ownerId:null,meaning:'paper'};
 assert.equal(teachingPlanHash(parsed,brief,cues),teachingPlanHash(reordered,brief,cues));
 input.objects[0].label='changed';assert.equal(parsed.objects[0].label,'paper');
 assert.ok(!Object.hasOwn(parsed,'source'));assert.ok(!Object.hasOwn(parsed,'accepted'));
});

test('all six structures have valid semantic-only examples',()=>{
 const examples:any[]=[plan()];
 const loop=plan('loop');loop.objects=[object('paper'),object('a','loop-node','idle'),object('b','loop-node','idle')];
 loop.relations=[{kind:'flow',from:'a',to:'b',label:''},{kind:'flow',from:'b',to:'a',label:''}];
 loop.beats=[{cueId:'first',actions:[action('transfer','paper','a'),action('transfer','paper','b')]},{cueId:'second',actions:[action('transfer','paper','a')]}];examples.push(loop);
 const comparison=plan('comparison');comparison.objects=[object('left'),object('right')];comparison.relations=[{kind:'compare',from:'left',to:'right',label:'versus'}];
 comparison.beats=[{cueId:'first',actions:[{kind:'highlight',objectId:'left'}]},{cueId:'second',actions:[{kind:'highlight',objectId:'right'}]}];examples.push(comparison);
 examples.push(filterPlan());
 const composition=plan('composition');composition.objects=[object('paper'),object('other'),object('bag','wallet','empty')];composition.relations=[];
 composition.beats=[{cueId:'first',actions:[{kind:'combine',objectIds:['paper','other'],targetId:'bag'}]},{cueId:'second',actions:[{kind:'highlight',objectId:'bag'}]}];examples.push(composition);
 const states=plan('state-change');states.objects=[object('machine','classifier','idle')];states.relations=[];
 states.beats=[{cueId:'first',actions:[{kind:'transition',objectId:'machine',fromState:'idle',toState:'processing'}]},{cueId:'second',actions:[{kind:'transition',objectId:'machine',fromState:'processing',toState:'emitting'}]}];examples.push(states);
 const schema=buildTeachingPlanSchema(brief,cues);
 const validate=new Ajv({strict:false}).compile(schema.schema);
 for(const value of examples){assert.equal(validate(value),true,JSON.stringify(validate.errors));assert.deepEqual(parse(value),value);}
 assert.equal(new Set(examples.map(p=>p.structure)).size,6);
});

test('schema refuses code, coordinates, timing, audit and missing protocol fields at every level',()=>{
 const validate=new Ajv({strict:false}).compile(buildTeachingPlanSchema(brief,cues).schema);
 for(const key of ['source','brief','cues','frames','audit','svg','accepted']){const value={...plan(),[key]:'not allowed'};assert.equal(validate(value),false);rejects(value,'schema');}
 for(const key of ['x','y','width','height','artwork','transform','parentId']){const value=plan();value.objects[0][key]=1;assert.equal(validate(value),false);rejects(value,'schema');}
 for(const key of ['frame','startFrame','endFrame','expression','data-follow-path']){const value=plan();value.beats[0].actions[0][key]=1;assert.equal(validate(value),false);rejects(value,'schema');}
 for(const key of ['schemaVersion','inputSha256','structure','objects','relations','beats']){const value=plan();delete value[key];rejects(value,'schema');}
});

test('input, cue inventory, ownership, references and action identities are validated',()=>{
 rejects({...plan(),inputSha256:'f'.repeat(64)},'binding');
 for(const beats of [[plan().beats[0]], [plan().beats[0],plan().beats[0]], [...plan().beats].reverse()])rejects({...plan(),beats},'coverage');
 const badCue=plan();badCue.beats[0].cueId='missing';rejects(badCue,'schema');
 const duplicate=plan();duplicate.objects.push({...duplicate.objects[0]});rejects(duplicate,'reference');
 const missing=plan();missing.beats[0].actions[0].targetId='missing';rejects(missing,'reference');
 const cycle=plan();cycle.objects[0].ownerId='machine';cycle.objects[1].ownerId='paper';rejects(cycle,'ownership');
 const unknownOwner=plan();unknownOwner.objects[0].ownerId='missing';rejects(unknownOwner,'ownership');
 const owned=plan();owned.objects[0].ownerId='machine';rejects(owned,'ownership');
 const same=plan();same.beats[0].actions[0].targetId='paper';rejects(same,'reference');
});

test('unsupported structures, components, invalid states and broken transition chains stop locally',()=>{
 rejects({...plan(),structure:'arbitrary-source'},'unsupported_structure');
 const component=plan();component.objects[0].component='remote-svg';rejects(component,'schema');
 const connector=plan();connector.objects[0].component='connector';rejects(connector,'schema');
 const initial=plan();initial.objects[0].initialState='processing';rejects(initial,'state');
 const states=plan('state-change');states.objects=[object('machine','classifier','idle')];states.relations=[];
 states.beats=[{cueId:'first',actions:[{kind:'transition',objectId:'machine',fromState:'idle',toState:'processing'}]},{cueId:'second',actions:[{kind:'transition',objectId:'machine',fromState:'idle',toState:'emitting'}]}];rejects(states,'state');
 for(const structure of ['loop','comparison','filter','composition','state-change'])rejects({...plan(),structure},'structure');
 const noActions=plan();noActions.beats[0].actions=[];rejects(noActions,'schema');
});

test('structure-specific actions must actually explain the declared relation',()=>{
 const flow=plan();flow.relations=[{kind:'flow',from:'machine',to:'paper',label:''}];rejects(flow,'structure');
 const comparison=plan('comparison');comparison.objects.push(object('other'));
 comparison.relations=[{kind:'compare',from:'paper',to:'other',label:''}];comparison.beats.forEach((b:any)=>b.actions=[{kind:'highlight',objectId:'machine'}]);rejects(comparison,'structure');
 const loop=plan('loop');loop.objects=[object('paper'),object('a','loop-node','idle'),object('b','loop-node','idle')];
 loop.relations=[{kind:'flow',from:'a',to:'b',label:''},{kind:'flow',from:'b',to:'a',label:''}];
 loop.beats=[{cueId:'first',actions:[action('transfer','paper','a')]},{cueId:'second',actions:[action('transfer','paper','b')]}];rejects(loop,'structure');
});

test('every loop payload follows declared edges, not only the payload that closes the cycle',()=>{
 const value=plan('loop');value.objects=[object('paper'),object('other'),...['a','b','c','d'].map(id=>object(id,'loop-node','idle'))];
 value.relations=[{kind:'flow',from:'a',to:'b',label:''},{kind:'flow',from:'b',to:'a',label:''}];
 value.beats=[{cueId:'first',actions:[action('transfer','paper','a'),action('transfer','paper','b')]},{cueId:'second',actions:[action('transfer','paper','a'),action('transfer','other','c'),action('transfer','other','d')]}];
 rejects(value,'structure');
 value.beats[1].actions=[action('transfer','paper','a'),action('transfer','other','a'),action('transfer','other','b')];
 assert.deepEqual(parse(value),value);
 value.beats[1].actions=[action('transfer','paper','a'),action('transfer','other','c')];rejects(value,'structure');
});

test('filter binds one binary branch group to one selection and every rejected candidate',()=>{
 assert.deepEqual(parse(filterPlan()),filterPlan());
 const variants:Array<(value:any)=>void>=[
  v=>{v.beats[1].actions[0].objectId='paper';},
  v=>{v.beats[1].actions[0].targetId='keep';},
  v=>{v.objects.push(object('foreign'));v.beats[1].actions[0].objectId='foreign';},
  v=>{v.objects.push(object('third'));v.beats[0].actions[0].candidateIds.push('third');},
  v=>{v.beats[1].actions.push({...v.beats[1].actions[0]});},
  v=>{v.beats[0].actions.push({...v.beats[0].actions[0]});},
  v=>{v.relations[1].from='keep';},
  v=>{v.relations[1].outcome='keep';},
  v=>{v.relations[0].to='paper';},
  v=>{[v.beats[0].actions,v.beats[1].actions]=[v.beats[1].actions,v.beats[0].actions];},
  v=>{v.beats[1].actions.push(action('transfer','paper','bin'));},
  v=>{v.beats[0].actions[0].candidateIds=['paper','machine'];},
 ];
 for(const mutate of variants){const value=filterPlan();mutate(value);rejects(value,'structure');}
 const missing=filterPlan();delete missing.relations[0].outcome;rejects(missing,'schema');
 const misplaced=plan();misplaced.relations[0].outcome='keep';rejects(misplaced,'schema');
});

test('flow and loop cannot hide untracked transport behind discard or combine actions',()=>{
 for(const structure of ['flow','loop'])for(const extra of [action('discard','paper','bin'),{kind:'combine',objectIds:['paper','other'],targetId:'bin'},{kind:'select',objectId:'paper',candidateIds:['paper','other']}]){
  const value=plan(structure);value.objects.push(object('other'),object('bin','container','empty'));
  if(structure==='loop'){
   value.objects.push(object('a','loop-node','idle'),object('b','loop-node','idle'));
   value.relations=[{kind:'flow',from:'a',to:'b',label:''},{kind:'flow',from:'b',to:'a',label:''}];
   value.beats=[{cueId:'first',actions:[action('transfer','paper','a'),action('transfer','paper','b')]},{cueId:'second',actions:[extra,action('transfer','paper','a')]}];
  }else value.beats[1].actions.push(extra);
  rejects(value,'structure');
 }
});

test('different facts or cue timing invalidate input binding without silently rewriting the plan',()=>{
 const bindingError=(e:unknown)=>e instanceof TeachingPlanError&&e.code==='binding';
 assert.throws(()=>parseTeachingPlan(plan(),{...brief,facts:['Changed fact']},cues),bindingError);
 assert.throws(()=>parseTeachingPlan(plan(),brief,[{...cues[0],endFrame:53},cues[1]]),bindingError);
});

test('100 generated flow examples keep identities and binding across bounded variable-sized inputs',()=>{
 for(let seed=0;seed<100;seed++){
  const count=2+seed%5,value=plan();
  value.objects=[object('paper'),...Array.from({length:count},(_,i)=>object('stage-'+i,'container','empty'))];
  value.objects.forEach((o:any,i:number)=>{o.label='Example '+seed+' item '+i;});
  value.relations=Array.from({length:count},(_,i)=>({kind:'flow',from:i===0?'paper':'stage-'+(i-1),to:'stage-'+i,label:''}));
  value.beats=[{cueId:'first',actions:[action('transfer','paper','stage-0')]},{cueId:'second',actions:Array.from({length:count-1},(_,i)=>action('transfer','paper','stage-'+(i+1)))}];
  assert.deepEqual(parse(value),value);assert.match(teachingPlanHash(value,brief,cues),/^[a-f0-9]{64}$/);
 }
});

test('protocol-only teaching-plan cannot dispatch through the production generator yet',async()=>{
 const output=path.join(os.tmpdir(),'teaching-plan-stage-'+randomUUID());let calls=0;
 await assert.rejects(generateWorkbench({brief,cues,generation_mode:'teaching-plan' as never},output,{request:async()=>{calls++;throw Error('must not dispatch');}}),/invalid generation mode/);
 assert.equal(calls,0);await assert.rejects(stat(output),/ENOENT/);
});

test('instruction-like labels stay inert text, Unicode labels survive, and prompts contain no executable stage',()=>{
 const value=plan();value.objects[0].label='fetch() / \u4e2d\u6587';assert.equal(parse(value).objects[0].label,value.objects[0].label);
 const prompt=buildTeachingPlanPrompt(brief,cues);
 assert.match(prompt,/TEACHING_PLAN_HOST_BOUNDARY/);assert.match(prompt,/no TSX, SVG, expressions, coordinates/);
 assert.match(prompt,/untrusted reference data/);assert.match(prompt,/teaching-scene-plan:1/);
 assert.ok(teachingComponents.document.states.includes('waiting'));
 rejects(null,'schema');rejects({...plan(),objects:Array.from({length:13},(_,i)=>object('p-'+i))},'schema');
 const oversized=plan();oversized.objects[0].meaning='x'.repeat(70000);rejects(oversized,'schema');
});
