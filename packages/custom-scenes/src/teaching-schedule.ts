import {createHash} from 'node:crypto';
import type {SceneBrief} from './contract';
import type {Cue} from './design';
import {parseTeachingPlan,teachingPlanHash,type TeachingPlan} from './teaching-plan';
import {teachingComponents} from './teaching-capabilities';
import {teachingAsset,teachingComponentVersion} from './teaching-components';

export const teachingSchedulerVersion='teaching-scheduler:1' as const;
export class TeachingScheduleError extends Error{
 constructor(readonly code:'unsupported'|'timing'|'ownership'|'capacity',message:string){super('teaching_schedule: '+code+'; '+message);}
}
const fail=(code:TeachingScheduleError['code'],message:string):never=>{throw new TeachingScheduleError(code,message);};
const digest=(value:unknown)=>createHash('sha256').update(JSON.stringify(value)).digest('hex');
type EventBody={kind:'transport'|'highlight'|'hold'|'select'|'transition';objectId:string;
 fromId?:string;targetId?:string;reason?:'flow'|'loop'|'select'|'discard'|'combine';candidateIds?:string[];fromState?:string;toState?:string};
export type TeachingScheduledEvent=EventBody&{id:string;cueId:string;actionIndex:number;startFrame:number;endFrame:number};
type Draft={body:EventBody;minimum:number;actionIndex:number};

function topology(plan:TeachingPlan){
 const actions=plan.beats.flatMap(b=>b.actions);
 const allowed:Record<TeachingPlan['structure'],string[]>={
  flow:['transfer','highlight','hold','transition'],loop:['transfer','highlight','hold','transition'],
  comparison:['highlight','hold','transition'],filter:['select','discard','highlight','hold','transition'],
  composition:['combine','highlight','hold','transition'],'state-change':['transition','highlight','hold'],
 };
 if(actions.some(a=>!allowed[plan.structure].includes(a.kind)))fail('unsupported','Mixed structure actions require a future explicit protocol');
 const relationKind={flow:'flow',loop:'flow',comparison:'compare',filter:'branch',composition:null,'state-change':null}[plan.structure];
 if(plan.relations.some(r=>r.kind!==relationKind))fail('unsupported','Unrelated relationship kinds cannot be silently dropped');
 let groups:string[][]=[],closed=false;
 switch(plan.structure){
  case 'flow':case 'loop':{
   const edges=plan.relations,ids=[...new Set(edges.flatMap(r=>[r.from,r.to]))].sort();
   if(ids.some(id=>edges.filter(r=>r.from===id).length>1||edges.filter(r=>r.to===id).length>1))fail('unsupported','A single chain or cycle is required');
   const starts=ids.filter(id=>!edges.some(r=>r.to===id));
   if(plan.structure==='flow'&&starts.length!==1)fail('unsupported','Flow requires one connected chain');
   const start=plan.structure==='loop'?ids[0]:starts[0],order:string[]=[];
   let cursor:string|undefined=start;
   while(cursor!==undefined&&!order.includes(cursor)){order.push(cursor);cursor=edges.find(r=>r.from===cursor)?.to;}
   if(order.length!==ids.length||(plan.structure==='loop'&&cursor!==start)||(plan.structure==='flow'&&cursor!==undefined))fail('unsupported','Disconnected chain or cycle');
   groups=[order];closed=plan.structure==='loop';break;
  }
  case 'comparison':
   if(plan.relations.length!==1)fail('unsupported','Comparison v1 requires exactly one pair');
   groups=[[plan.relations[0].from,plan.relations[0].to]];break;
  case 'filter':{
   const keep=plan.relations.find(r=>r.kind==='branch'&&r.outcome==='keep')!;
   const discard=plan.relations.find(r=>r.kind==='branch'&&r.outcome==='discard')!;
   const select=actions.find(a=>a.kind==='select')!;
   if(select.kind!=='select')return fail('unsupported','Missing filter selection');
   groups=[[keep.from,keep.to,discard.to],[...select.candidateIds]];break;
  }
  case 'composition':{
   const batches=actions.filter(a=>a.kind==='combine');
   if(batches.length!==1)fail('unsupported','Composition v1 requires one batch; inputs cannot be combined repeatedly');
   groups=[[...batches[0].objectIds,batches[0].targetId]];break;
  }
  case 'state-change':{
   const ids=[...new Set(actions.filter(a=>a.kind==='transition').map(a=>a.objectId))];
   if(ids.length!==1)fail('unsupported','State-change v1 follows one object identity');
   groups=[ids];break;
  }
 }
 const grouped=new Set(groups.flat());
 return {structure:plan.structure,groups,annotations:plan.objects.map(o=>o.id).filter(id=>!grouped.has(id)).sort(),closed};
}
function freeze<T>(value:T):T{
 if(value&&typeof value==='object'){for(const child of Object.values(value))freeze(child);Object.freeze(value);}
 return value;
}

/** Semantic scheduling only. Geometry, routes and existing motion compilation are still required. */
export function buildTeachingSchedule(value:unknown,brief:SceneBrief,cues:Cue[]){
 const plan=parseTeachingPlan(value,brief,cues);
 if(plan.objects.some(o=>o.ownerId!==null))fail('ownership','Permanent child placement is not supported by scheduler v1');
 const graph=topology(plan);
 const assets=[...plan.objects].sort((a,b)=>a.id<b.id?-1:a.id>b.id?1:0).map(o=>({id:o.id,
  states:teachingComponents[o.component].states.map(state=>teachingAsset(o.component,state,o.label))}));
 const events:TeachingScheduledEvent[]=[],locations=new Map<string,string>();
 for(const [beatIndex,beat] of plan.beats.entries()){
  const cue=cues[beatIndex],drafts:Draft[]=[];
  const transport=(objectId:string,targetId:string,reason:NonNullable<EventBody['reason']>,actionIndex:number)=>{
   drafts.push({body:{kind:'transport',objectId,fromId:locations.get(objectId)??objectId,targetId,reason},minimum:12,actionIndex});
   locations.set(objectId,targetId);
  };
  for(const [actionIndex,action] of beat.actions.entries()){
   switch(action.kind){
    case 'transfer':transport(action.objectId,action.targetId,plan.structure==='loop'?'loop':'flow',actionIndex);break;
    case 'discard':transport(action.objectId,action.targetId,'discard',actionIndex);break;
    case 'combine':for(const id of action.objectIds)transport(id,action.targetId,'combine',actionIndex);break;
    case 'select':{
     drafts.push({body:{kind:'select',objectId:action.objectId,candidateIds:[...action.candidateIds]},minimum:6,actionIndex});
     const keep=plan.relations.find(r=>r.kind==='branch'&&r.outcome==='keep')!;
     transport(action.objectId,keep.to,'select',actionIndex);break;
    }
    case 'highlight':case 'hold':drafts.push({body:{kind:action.kind,objectId:action.objectId},minimum:6,actionIndex});break;
    case 'transition':drafts.push({body:{kind:'transition',objectId:action.objectId,fromState:action.fromState,toState:action.toState},minimum:6,actionIndex});break;
   }
  }
  const minimum=drafts.reduce((n,e)=>n+e.minimum,0),available=cue.endFrame-cue.startFrame;
  if(available<minimum)fail('timing',`Cue ${cue.id} needs at least ${minimum} frames for its semantic actions; has ${available}`);
  let cursor=cue.startFrame,usedMinimum=0;
  for(const [index,draft] of drafts.entries()){
   const slack=available-minimum,extra=Math.floor(slack*(usedMinimum+draft.minimum)/minimum)-Math.floor(slack*usedMinimum/minimum);
   const endFrame=cursor+draft.minimum+extra;
   events.push({id:`event-${beatIndex}-${index}`,cueId:cue.id,actionIndex:draft.actionIndex,startFrame:cursor,endFrame,...draft.body});
   cursor=endFrame;usedMinimum+=draft.minimum;
  }
 }
 if(events.length>128)fail('capacity','Schedule exceeds 128 host events');
 const holds:{startFrame:number;endFrame:number}[]=[];let previous=0;
 for(const cue of cues){if(cue.startFrame>previous)holds.push({startFrame:previous,endFrame:cue.startFrame});previous=cue.endFrame;}
 if(previous<brief.durationInFrames)holds.push({startFrame:previous,endFrame:brief.durationInFrames});
 const result={schemaVersion:'teaching-schedule:1' as const,schedulerVersion:teachingSchedulerVersion,
  componentVersion:teachingComponentVersion,planSha256:teachingPlanHash(plan,brief,cues),inputSha256:plan.inputSha256,
  assetSha256:digest(assets),durationInFrames:brief.durationInFrames,objectIds:plan.objects.map(o=>o.id).sort(),topology:graph,events,holds,
  renderable:false as const,accepted:false as const,pending:['layout','routes','motion','render-review'] as const};
 return freeze({...result,scheduleSha256:digest(result)});
}
