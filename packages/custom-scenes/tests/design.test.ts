import test from 'node:test';
import assert from 'node:assert/strict';
import {parseDesign,buildDesignPrompt,buildDesignRevisionPrompt,buildScenePrompt,reviewScene,parseCues,cuesFromManifest,reviewFrames,designHash,assertDesignBinding,geometryFeedback} from '../src/design';
import {parseBrief,parseArtifact,sourceHash} from '../src/contract';

const brief=parseBrief({schemaVersion:'custom-scene-brief:1',id:'budget',title:'上下文预算',narration:'信息进入。筛除无关。',visualGoal:'以钱包解释预算',facts:['预算有限'],materials:[],width:1920,height:1080,fps:30,durationInFrames:300});
const cues=[{id:'enter',text:'信息进入。',startFrame:0,endFrame:120},{id:'filter',text:'筛除无关。',startFrame:120,endFrame:300}];
test('design prompt distinguishes internal non-text pictograms from independent labels without weakening real text safety',()=>{
 const prompt=buildDesignPrompt(brief,cues);
 assert.match(prompt,/Internal pictograms, non-text silhouettes/);
 assert.match(prompt,/not be reclassified as solids to bypass safety/);
 assert.match(prompt,/Do not relocate an intentional internal detail outside its owner/);
});
const design=()=>({schemaVersion:'visual-design:1',brief,cues,thesis:'预算有限，先筛选再输入',metaphor:'钱包与文件',objects:[{id:'wallet',meaning:'有限预算',appearance:'大钱包轮廓',x:500,y:350,width:900,height:500},{id:'file',meaning:'任务信息',appearance:'带折角纸片',x:800,y:200,width:180,height:240}],beats:[{cueId:'enter',focus:'wallet',action:'文件进入钱包',changes:[{objectId:'file',from:'钱包上方',to:'钱包内部'}]},{cueId:'filter',focus:'file',action:'无关信息移出',changes:[{objectId:'file',from:'钱包内部',to:'右侧丢弃区'}]}],composition:'标题在上，钱包居中，右侧留移出区',palette:'blueprint',avoid:['文字卡片替代钱包'],acceptance:['能看见文件进入与筛除']});
test('visual design preserves exact brief and measured narration cues',()=>{
 assert.equal(parseDesign(design(),brief,cues).beats.length,2);
 assert.throws(()=>parseDesign({...design(),brief:{...brief,narration:'changed'}},brief,cues),/brief_mismatch/);
 assert.throws(()=>parseDesign({...design(),cues:[{...cues[0],endFrame:119},cues[1]]},brief,cues),/cue_mismatch/);
});
test('cue timing rejects invented text, overlaps, out of range, duplicate ids and missing narration',()=>{
 assert.equal(parseCues(cues,brief).length,2);
 for(const bad of [[{...cues[0],text:'虚构'},cues[1]],[cues[0],{...cues[1],startFrame:100}],[cues[0],{...cues[1],endFrame:301}],[cues[0],{...cues[1],id:'enter'}],[cues[0]]])assert.throws(()=>parseCues(bad,brief),/visual_design/);
});
test('design requires bounded objects, referenced transformations and one beat per cue',()=>{
 for(const bad of [{objects:[{...design().objects[0],x:1900}]},{beats:[{...design().beats[0],focus:'missing'},design().beats[1]]},{beats:[{...design().beats[0],changes:[]},design().beats[1]]},{beats:[design().beats[0]]}])assert.throws(()=>parseDesign({...design(),...bad},brief,cues),/visual_design/);
});
test('object budget is explicit in the prompt and reports the actual invalid count',()=>{
 const many=(count:number)=>({...design(),objects:Array.from({length:count},(_,i)=>({...design().objects[0],id:i===0?'wallet':i===1?'file':`part-${i}`}))});
 assert.equal(parseDesign(many(20)).objects.length,20);
 assert.throws(()=>parseDesign(many(31)),/objects.*1\.\.20.*31/);
 assert.match(buildDesignPrompt(brief,cues),/at most 20 objects/);
 assert.match(buildDesignPrompt(brief,cues),/labels.*count/i);
 assert.match(buildDesignPrompt(brief,cues),/dataRoute.*not.*JSON/);
 assert.match(buildDesignPrompt(brief,cues),/same object ID.*empty.*filled.*assembled/);
 assert.match(buildScenePrompt(parseDesign(design())),/transport group.*implementation-only/);
});
test('prompts separate visual design from code and bind every action to a measured cue',()=>{
 const d=parseDesign(design(),brief,cues);
 assert.match(buildDesignPrompt(brief,cues),/visual-design:1/);
 assert.match(buildDesignPrompt(brief,cues),/wallet/i);
 const prompt=buildScenePrompt(d,'reviewed reference');
 assert.match(prompt,/startFrame/);assert.match(prompt,/reviewed reference/);assert.match(prompt,/custom-scene:1/);
});
test('course failure lessons constrain schema, typed source and complete beat geometry',()=>{
 const designPrompt=buildDesignPrompt(brief,cues),codePrompt=buildScenePrompt(parseDesign(design()));
 for(const prompt of [designPrompt,codePrompt]){
  assert.match(prompt,/parking bounds/i);
  assert.match(prompt,/shared endpoint/i);
  assert.match(prompt,/before execution/i);
  assert.match(prompt,/every sub-phase/i);
 }
 assert.match(codePrompt,/explicit TypeScript types/i);
 assert.match(codePrompt,/no extra top-level keys/i);
});
test('user-approved RAG lessons constrain both design and source prompts without fixed topic coordinates',()=>{
 for(const prompt of [buildDesignPrompt(brief,cues),buildScenePrompt(parseDesign(design()))]){
  assert.match(prompt,/inletLeft - payloadWidth - clearance/);
  assert.match(prompt,/grip -> lift -> carry -> insert/);
  assert.match(prompt,/container-local clearance/);
  assert.match(prompt,/textAnchor/);
  assert.match(prompt,/review rules.*not.*acceptance/i);
  assert.doesNotMatch(prompt,/wait until frame 673|dock at x=940/);
 }
});
test('diagnostic pipeline fixes constrain gap holds, single handoff and initially hidden output',()=>{
 for(const prompt of [buildDesignPrompt(brief,cues),buildScenePrompt(parseDesign(design()))]){
  assert.match(prompt,/do not reset.*gap/i);
  assert.match(prompt,/one drawable representation.*handoff/i);
  assert.match(prompt,/hidden output.*all child/i);
  assert.match(prompt,/gripper and payload.*same.*anchor/i);
  assert.match(prompt,/entire swept payload/i);
  assert.match(prompt,/caption boundary/i);
 }
});
test('design reference is supplied to both fresh design and retained revision prompts without changing target timing',()=>{
 const reference='REVIEWED_DESIGN_STORYBOARD example reference';
 const candidate={...design(),overlaps:[],objects:design().objects.map(o=>({...o,kind:'solid',states:[{id:'shown',appearance:'shown'}]})),beats:design().beats.map(b=>({...b,changes:b.changes.map(c=>({...c,fromState:'shown',toState:'shown'}))}))};
 for(const prompt of [buildDesignPrompt(brief,cues,reference),buildDesignRevisionPrompt(brief,cues,candidate,'Fix the chain','continuity error',reference)]){
  assert.ok(prompt.includes(reference));assert.ok(prompt.includes('MEASURED_CUES='+JSON.stringify(cues)));
 }
});
test('visual review never accepts wrong source or missing evidence',()=>{
 const a=parseArtifact({schemaVersion:'custom-scene:1',brief,rationale:'按设计实现',source:'export default function Scene(){return <svg/>}'});
 const d=parseDesign(design());const r={schemaVersion:'visual-review:1',sha256:sourceHash(a),designSha256:designHash(d),verdict:'revise',evidence:[{frame:150,observation:'文件与钱包重叠'}],feedback:'文件错开'};
 assert.equal(reviewScene(r,a,d).verdict,'revise');
 assert.throws(()=>reviewScene({...r,sha256:'bad'},a,d),/source_mismatch/);
 assert.throws(()=>reviewScene({...r,designSha256:'bad'},a,d),/design_mismatch/);
 assert.throws(()=>reviewScene({...r,evidence:[]},a,d),/visual_design/);
 assert.throws(()=>reviewScene({...r,verdict:['pass']},a,d),/visual_design/);
});
test('design association rejects a new cue track even with identical narration and source',()=>{
 const d=parseDesign(design());const changed=parseDesign({...design(),cues:[{...cues[0],endFrame:110},cues[1]]});
 assert.doesNotThrow(()=>assertDesignBinding(d,designHash(d)));
 assert.throws(()=>assertDesignBinding(changed,designHash(d)),/design_mismatch/);
});
test('audio manifest is converted using measured absolute timestamps, including pauses',()=>{
 const result=cuesFromManifest({segments:[{chapter:'x',step:1,text:'甲。',start:20,duration:1,pauseAfter:.2},{chapter:'x',step:2,text:'乙。',start:21.2,duration:2,pauseAfter:1}]},'x');
 assert.equal(result.durationInFrames,126);assert.deepEqual(result.cues.map(c=>[c.startFrame,c.endFrame]),[[0,30],[36,96]]);
 assert.equal(result.narration,'甲。乙。');
 assert.throws(()=>cuesFromManifest({segments:[]},'missing'),/visual_design/);
});
test('review frame selection includes measured beat entries and settled states',()=>{
 const frames=reviewFrames(parseDesign(design()));assert.ok(frames.includes(120));assert.ok(frames.includes(119));assert.ok(frames.includes(299));assert.ok(frames.includes(60));assert.ok(frames.includes(254));
});
test('long tail pauses still render a global middle frame required by pass review',()=>{
 const d=parseDesign({...design(),brief:{...brief,durationInFrames:120},cues:[{id:'enter',text:brief.narration,startFrame:0,endFrame:30}],beats:[design().beats[0]]});
 assert.ok(reviewFrames(d).includes(60));
});
test('machine findings become source-bound, deduplicated revision feedback, never a visual pass',()=>{
 const d=parseDesign(design());const a=parseArtifact({schemaVersion:'custom-scene:1',brief,rationale:'audit',source:'export default function Scene(){return <svg/>}'});
 const problem={kind:'path-deviation',target:'payload',detail:'31px from route'};
 const report={technical:'passed',sha256:sourceHash(a),designSha256:designHash(d),frames:['frame-0.png','frame-120.png'],geometry:{status:'failed',frames:{0:{issues:[problem]},120:{issues:[problem]}}}};
 const result=geometryFeedback(report,a,d);assert.equal(result.findings.length,1);assert.deepEqual(result.findings[0].frames,[0,120]);assert.equal(result.visual,'pending');
 assert.throws(()=>geometryFeedback({...report,sha256:'bad'},a,d),/source_mismatch/);
 assert.throws(()=>geometryFeedback({...report,geometry:{status:'passed',frames:{}}},a,d),/no_geometry_findings/);
});
