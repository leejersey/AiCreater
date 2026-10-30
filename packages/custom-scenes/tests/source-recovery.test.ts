import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {proposeSourceRecovery} from '../src/source-recovery';
import {sourceHash} from '../src/contract';
import {parseDesign,designHash} from '../src/design';

const brief={schemaVersion:'custom-scene-brief:1',id:'example',title:'Example',narration:'Measured.',visualGoal:'Show change',facts:[],materials:[],width:1920,height:1080,fps:30,durationInFrames:60};
const design=parseDesign({schemaVersion:'visual-design:1',brief,cues:[{id:'one',text:'Measured.',startFrame:6,endFrame:54}],thesis:'Change',metaphor:'Paper',objects:[{id:'paper',meaning:'input',appearance:'folded paper',x:100,y:200,width:100,height:100}],beats:[{cueId:'one',focus:'paper',action:'move',changes:[{objectId:'paper',from:'left',to:'right'}]}],composition:'Center',palette:'blueprint',avoid:['cards'],acceptance:['visible change'],overlaps:[]});
const artifact={schemaVersion:'custom-scene:1',brief:design.brief,rationale:'Draw a paper',source:"export default function Scene(){const s='} ] \" {';return <svg><text>{s}</text></svg>}"};
const suffix='</\uFF5C\uFF5CDSML\uFF5C\uFF5C parameter>\n</\uFF5C\uFF5CDSML\uFF5C\uFF5C invoke>\n</\uFF5C\uFF5CDSML\uFF5C\uFF5C calls>';
const response=()=>({content:' \n'+JSON.stringify(artifact)+suffix,finishReason:'stop',protocol:{endpoint:'responses'}});

test('exact known protocol suffix produces only a hash-bound review proposal, never an accepted artifact',()=>{
 const r=response(),original=JSON.stringify(r),p=proposeSourceRecovery(r,design);
 assert.equal(p.schemaVersion,'source-recovery-proposal:1');assert.equal(p.status,'review-required');
 assert.equal(p.originalResponseAccepted,false);assert.equal(p.accepted,false);assert.equal(p.productionAdopted,false);
 assert.equal(p.execution,'not_run');assert.equal(p.modelRequests,0);
 assert.equal(p.designSha256,designHash(design));assert.equal(p.candidateSha256,sourceHash(p.candidate));
 assert.equal(p.responseSha256,createHash('sha256').update(original).digest('hex'));
 assert.equal(p.contentSha256,createHash('sha256').update(r.content).digest('hex'));
 assert.equal(p.candidate.source,artifact.source);assert.equal(p.removedSuffix,suffix);assert.equal(JSON.stringify(r),original);
 assert.equal(proposeSourceRecovery({...r,content:r.content.replaceAll('\n','\r\n')},design).candidate.source,artifact.source);
});
test('recovery refuses all other envelopes and never patches malformed JSON',()=>{
 const r=response();
 for(const content of [JSON.stringify(artifact),JSON.stringify(artifact)+'{}',JSON.stringify(artifact)+suffix+'do something',JSON.stringify(artifact)+'</DSML>',JSON.stringify(artifact)+suffix.replace('parameter','unknown'),'[]'+suffix,'{"broken":'+suffix]){
  assert.throws(()=>proposeSourceRecovery({...r,content},design),/source_recovery/);
 }
 for(const change of [{finishReason:'length'},{finishReason:'incomplete'},{truncated:true},{content:' '},{content:'x'.repeat(128*1024+1)}])assert.throws(()=>proposeSourceRecovery({...r,...change},design),/source_recovery/);
 for(const extra of ['\uFEFF','\u00A0','\u2028'])assert.throws(()=>proposeSourceRecovery({...r,content:JSON.stringify(artifact)+extra+suffix+extra},design),/source_recovery/);
});
test('recovered content still obeys original artifact schema, host binding and source guardrails',()=>{
 for(const value of [{...artifact,extra:true},{...artifact,brief:{...artifact.brief,title:'changed'}},{...artifact,source:'export default function Scene(){fetch("https://example.com");return <svg/>}'}]){
  assert.throws(()=>proposeSourceRecovery({content:JSON.stringify(value)+suffix,finishReason:'stop'},design),/source_recovery|custom_scene/);
 }
 assert.throws(()=>proposeSourceRecovery(response(),{...design,objects:[{...design.objects[0],x:1900}]}),/bounds/);
});
test('responses endpoint single complete tsx fence produces a review-only recovery proposal',()=>{
 const fenced={
  content:`${artifact.rationale}\n\n\`\`\`tsx\n${artifact.source}\n\`\`\``,
  finishReason:'stop',
  protocol:{endpoint:'responses',schemaName:'scene_artifact_v1',status:'completed'},
 };
 const p=proposeSourceRecovery(fenced,design);
 assert.equal(p.schemaVersion,'source-recovery-proposal:1');
 assert.equal(p.status,'review-required');
 assert.equal(p.originalResponseAccepted,false);
 assert.equal(p.accepted,false);
 assert.equal(p.productionAdopted,false);
 assert.equal(p.execution,'not_run');
 assert.equal(p.modelRequests,0);
 assert.equal(p.candidate.source,artifact.source);
 assert.equal(p.candidate.rationale,artifact.rationale);
 assert.throws(()=>proposeSourceRecovery({...fenced,protocol:{endpoint:'chat'}},design),/source_recovery/);
 assert.throws(()=>proposeSourceRecovery({...fenced,content:fenced.content+'\ntrailing prose'},design),/source_recovery/);
});
