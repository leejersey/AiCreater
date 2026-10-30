import test from 'node:test';
import assert from 'node:assert/strict';
import {reviewGeometryDiagnostics,type GeometryReviewRule} from '../src/geometry-review';

const sha256='a'.repeat(64);
const issue={kind:'label-obstacle',target:'question-mark',detail:'Overlaps obstacle sleeve.'};
const report={sha256,durationInFrames:938,geometry:{status:'failed',frames:{'663':{issues:[issue]},'703':{issues:[{...issue,detail:'Overlaps obstacle generator.'}]}}}};
const rules:GeometryReviewRule[]=[
 {id:'container',fromFrame:0,toFrame:937,issue,relationship:'containment',reason:'The question mark belongs to the sleeve assembly.'},
 {id:'generation',fromFrame:673,toFrame:937,issue:{...issue,detail:'Overlaps obstacle generator.'},relationship:'occlusion',reason:'The payload enters the generator only in the generation cue.'},
];
test('diagnostic classification preserves original failures and never grants acceptance',()=>{
 const before=JSON.stringify(report),review=reviewGeometryDiagnostics(report,{sha256,rules});
 assert.equal(review.expectedRelationships,2);assert.equal(review.unclassified,0);
 assert.equal(review.status,'diagnostic-only');assert.equal(review.originalGeometryStatus,'failed');
 assert.equal(review.accepted,false);assert.equal(JSON.stringify(report),before);
 assert.deepEqual(review.issues.map(i=>i.ruleId),['container','generation']);
});
test('early occlusion, other labels and all non-overlap errors remain unclassified',()=>{
 const early={...report,geometry:{status:'failed',frames:{'663':{issues:[
  {...issue,detail:'Overlaps obstacle generator.'},
  {...issue,target:'step-1-label'},
  {...issue,kind:'label-out-of-bounds'},
 ]}}}};
 const review=reviewGeometryDiagnostics(early,{sha256,rules});
 assert.equal(review.unclassified,3);assert.equal(review.expectedRelationships,0);assert.equal(review.accepted,false);
});
test('source mismatch, invalid windows, unsafe issue kinds and ambiguous rules are refused',()=>{
 assert.throws(()=>reviewGeometryDiagnostics(report,{sha256:'b'.repeat(64),rules}),/source hash/);
 for(const change of [{fromFrame:-1},{toFrame:938},{fromFrame:700,toFrame:600},{issue:{...issue,kind:'label-out-of-bounds'}},{reason:''}]){
  assert.throws(()=>reviewGeometryDiagnostics(report,{sha256,rules:[{...rules[0],...change} as GeometryReviewRule]}),/rule/);
 }
 assert.throws(()=>reviewGeometryDiagnostics(report,{sha256,rules:[rules[0],{...rules[0],id:'duplicate-selector'}]}),/ambiguous/);
});
test('malformed or excessive report data fails closed',()=>{
 assert.throws(()=>reviewGeometryDiagnostics({...report,geometry:{status:'failed',frames:{'-1':{issues:[issue]}}}},{sha256,rules}),/frame/);
 assert.throws(()=>reviewGeometryDiagnostics({...report,geometry:{status:'failed',frames:{'0':{issues:Array.from({length:202},()=>issue)}}}},{sha256,rules}),/issues/);
 assert.throws(()=>reviewGeometryDiagnostics({...report,durationInFrames:0},{sha256,rules}),/duration/);
});
