import {parseBrief} from '../../src/contract';
import {designInputHash} from '../../src/design-content';
import type {TeachingPlan} from '../../src/teaching-plan';
export const teachingBrief=parseBrief({schemaVersion:'custom-scene-brief:1',id:'schedule-test',title:'Example',narration:'First.Second.',visualGoal:'Explain a mechanism',facts:['Example only'],materials:[],width:1920,height:1080,fps:30,durationInFrames:120});
export const teachingCues=[{id:'first',text:'First.',startFrame:6,endFrame:54},{id:'second',text:'Second.',startFrame:60,endFrame:114}];
const object=(id:string,component:TeachingPlan['objects'][number]['component']='document',initialState='waiting')=>({id,component,meaning:id,label:id,ownerId:null,initialState});
export function teachingExample(structure:TeachingPlan['structure']):TeachingPlan{
 const base:TeachingPlan={schemaVersion:'teaching-scene-plan:1',inputSha256:designInputHash(teachingBrief,teachingCues),structure,objects:[],relations:[],beats:[]};
 switch(structure){
  case 'flow':return {...base,objects:[object('paper'),object('machine','classifier','idle')],relations:[{kind:'flow',from:'paper',to:'machine',label:''}],beats:[{cueId:'first',actions:[{kind:'transfer',objectId:'paper',targetId:'machine'}]},{cueId:'second',actions:[{kind:'hold',objectId:'machine'}]}]};
  case 'loop':return {...base,objects:[object('paper'),object('a','loop-node','idle'),object('b','loop-node','idle')],relations:[{kind:'flow',from:'a',to:'b',label:''},{kind:'flow',from:'b',to:'a',label:''}],beats:[{cueId:'first',actions:[{kind:'transfer',objectId:'paper',targetId:'a'},{kind:'transfer',objectId:'paper',targetId:'b'}]},{cueId:'second',actions:[{kind:'transfer',objectId:'paper',targetId:'a'}]}]};
  case 'comparison':return {...base,objects:[object('left'),object('right')],relations:[{kind:'compare',from:'left',to:'right',label:'versus'}],beats:[{cueId:'first',actions:[{kind:'highlight',objectId:'left'}]},{cueId:'second',actions:[{kind:'highlight',objectId:'right'}]}]};
  case 'filter':return {...base,objects:[object('paper'),object('other'),object('machine','classifier','idle'),object('keep','container','empty'),object('bin','container','empty')],relations:[{kind:'branch',from:'machine',to:'keep',label:'keep',outcome:'keep'},{kind:'branch',from:'machine',to:'bin',label:'discard',outcome:'discard'}],beats:[{cueId:'first',actions:[{kind:'select',objectId:'paper',candidateIds:['paper','other']}]},{cueId:'second',actions:[{kind:'discard',objectId:'other',targetId:'bin'}]}]};
  case 'composition':return {...base,objects:[object('paper'),object('other'),object('bag','wallet','empty')],beats:[{cueId:'first',actions:[{kind:'combine',objectIds:['paper','other'],targetId:'bag'}]},{cueId:'second',actions:[{kind:'hold',objectId:'bag'}]}]};
  case 'state-change':return {...base,objects:[object('machine','classifier','idle')],beats:[{cueId:'first',actions:[{kind:'transition',objectId:'machine',fromState:'idle',toState:'processing'}]},{cueId:'second',actions:[{kind:'transition',objectId:'machine',fromState:'processing',toState:'emitting'}]}]};
 }
}
