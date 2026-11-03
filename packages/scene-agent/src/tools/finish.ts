import {runGates,type GateResult} from '../gates';
import {failure,text,type Tool} from './types';

export type FinishRecord={by:'model'|'harness';summary:string;selfReview:{item:string;pass:boolean;evidence:string}[];gates:GateResult};

// The self-review is recorded for humans and evals; only the objective gates decide the outcome.
export function finishTool(onPassed:(record:FinishRecord)=>void):Tool{
 return{
  readOnly:false,
  spec:{name:'finish',description:'Declare the scene complete. Re-runs the final gates (contract, typecheck, full default render, no [high] geometry findings). Include an honest self-review against the skill checklist.',
   inputSchema:{type:'object',properties:{
    summary:{type:'string',minLength:1,maxLength:2000},
    selfReview:{type:'array',minItems:1,maxItems:20,items:{type:'object',properties:{item:{type:'string',minLength:1},pass:{type:'boolean'},evidence:{type:'string',minLength:1}},required:['item','pass','evidence'],additionalProperties:false}},
   },required:['summary','selfReview'],additionalProperties:false}},
  async run(input,context){
   const gates=await runGates(context);
   // A model that can see is expected to have looked at what it ships; the gates alone cannot judge the picture.
   if(gates.passed&&context.capabilities.vision&&context.viewedSha256!==gates.sourceSha256)
    return failure('finish rejected: look at the frames of this version with view_frames first, and fix anything that fails the visual-review checklist.');
   const lines=gates.checks.map(c=>`${c.passed?'✓':'✗'} ${c.gate}: ${c.detail}`);
   if(!gates.passed)return failure(['finish rejected; fix these and call finish again:',...lines.filter(l=>l.startsWith('✗'))].join('\n'));
   onPassed({by:'model',summary:input.summary,selfReview:input.selfReview,gates});
   return text(['finish accepted.',...lines].join('\n'));
  },
 };
}
