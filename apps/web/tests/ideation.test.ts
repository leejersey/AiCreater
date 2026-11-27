import test from 'node:test';
import assert from 'node:assert/strict';
import {addBatch,addExtra,addSection,angleTags,choose,emptyIdeation,isIdeationDraft,moveSection,outlineProblems,outlineWarnings,
  removeSection,setOutline,shownTitles,lastStructures,targetSeconds,toOrigin,toPlan,undo,updateSection,type Angle,type Outline} from '../lib/ideation';
import {readDraft,writeDraft} from '../lib/drafts';

const angle=(structure:Angle['structure'],title:string=structure):Angle=>({title,hook:'开场',audience:'开发者',takeaway:'收获',structure,depth:'intro',duration_min:3,chapters:['一','二','三'],scope:'single'});
const outline=(...seconds:number[]):Outline=>({sections:seconds.map((s,i)=>({title:`第${i+1}章`,points:['要点'],picture:'答案被划掉',seconds:s}))});

test('batches and own cards accumulate, and everything shown is avoided next time',()=>{
 let s=addBatch(emptyIdeation(),[angle('problem'),angle('journey')]);
 s=addBatch(s,[angle('myth')]);s=addExtra(s,angle('howto','我的方向'));
 assert.deepEqual(shownTitles(s),['problem','journey','myth','我的方向']);
 assert.deepEqual(lastStructures(s),['myth']);  // the latest batch only; own cards do not count
 assert.equal(angleTags(angle('myth')),'误区纠正 · 入门 · 约 3 分钟 · 3 章');
});

test('choosing an angle starts its outline afresh; model revisions can be undone',()=>{
 let s=choose(addBatch(emptyIdeation(),[angle('problem')]),angle('problem'));
 s=setOutline(s,outline(40,50));assert.equal(s.history.length,0);
 s=setOutline(s,outline(40,60));assert.deepEqual(s.history,[outline(40,50)]);
 s=undo(s);assert.deepEqual(s.outline,outline(40,50));assert.equal(s.history.length,0);
 assert.equal(undo(s),s);
 s=choose(s,angle('journey'));assert.equal(s.outline,null);
});

test('the outline is edited in place without a model call',()=>{
 let o=outline(40,50,60);
 o=updateSection(o,1,{title:'改过'});assert.equal(o.sections[1].title,'改过');
 o=moveSection(o,1,-1);assert.deepEqual(o.sections.map(s=>s.title),['改过','第1章','第3章']);
 assert.equal(moveSection(o,0,-1),o);
 o=removeSection(o,2);assert.equal(o.sections.length,2);assert.equal(removeSection(outline(40),0).sections.length,1);
 assert.equal(addSection(o).sections.length,3);
});

test('length advice follows the hint and the per-chapter Agent limit',()=>{
 assert.equal(targetSeconds('3分钟'),180);assert.equal(targetSeconds('90秒'),90);assert.equal(targetSeconds('2 min'),120);assert.equal(targetSeconds(''),undefined);
 assert.deepEqual(outlineWarnings(outline(60,60,60),'3分钟'),[]);
 assert.match(outlineWarnings(outline(100,100,100),'3分钟')[0],/超过建议时长/);
 assert.match(outlineWarnings(outline(120),'')[0],/建议拆成两章/);
});

test('an outline drives the manuscript only within the API limits',()=>{
 assert.deepEqual(outlineProblems(outline(40,50)),[]);
 assert.match(outlineProblems(outline(5)).join(),/秒数/);
 assert.match(outlineProblems(updateSection(outline(40),0,{points:['  ']})).join(),/要点/);
 assert.match(outlineProblems(updateSection(outline(40),0,{picture:''})).join(),/画面构想/);
 assert.match(outlineProblems(outline(...Array(8).fill(110))).join(),/合计最多/);
 let s=choose(emptyIdeation(),angle('problem'));
 assert.equal(toPlan(s),null);
 s=setOutline(s,updateSection(outline(40),0,{points:[' 要点 ','',' 第二点']}));
 assert.deepEqual(toPlan(s)!.outline.sections[0].points,['要点','第二点']);
 assert.deepEqual(toOrigin(' RAG ',' 想法 ',s),{topic:'RAG',notes:'想法',...toPlan(s)!,scope:'single',series_id:null});
 assert.equal(toOrigin('',  '',s),undefined);
});

test('the ideation state survives the local draft, and malformed state is refused',()=>{
 const s=setOutline(choose(addBatch(emptyIdeation(),[angle('problem')]),angle('problem')),outline(40));
 assert.ok(isIdeationDraft(s));
 assert.ok(!isIdeationDraft({...s,chosen:{...angle('problem'),structure:'poem'}}));
 assert.ok(!isIdeationDraft({...s,chosen:{...angle('problem'),scope:'series'}}));
 const store=new Map<string,string>(),storage={getItem:(k:string)=>store.get(k)??null,setItem:(k:string,v:string)=>{store.set(k,v);},removeItem:(k:string)=>{store.delete(k);}};
 const scope={kind:'course' as const,projectId:'',sceneId:''};
 const raw=writeDraft(storage,scope,0,{title:'t',source:'',topic:'RAG',notes:'n',ideation:s},null);
 assert.deepEqual(readDraft(raw,scope)!.data.ideation,s);
 assert.equal(readDraft(raw.replace('"scope":"single"','"scope":"series"'),scope),null);
});

test('each chapter shows its formula step; drift from the formula is pointed out',async()=>{
 const {formulaFit}=await import('../lib/ideation');
 const sec=(seconds:number)=>({title:'章',points:['点'],picture:'图',seconds});
 const f={name:'三段式',steps:[{role:'钩子',seconds:5},{role:'机制',seconds:40},{role:'总结',seconds:10}]};
 assert.deepEqual(formulaFit({sections:[sec(5),sec(40),sec(10)]},f),{steps:['钩子','机制','总结'],warnings:[]});
 const four=formulaFit({sections:[sec(5),sec(20),sec(20),sec(10)]},f);
 assert.deepEqual(four.steps,['钩子','机制','机制','总结']);assert.match(four.warnings[0],/3 步，大纲是 4 章/);
 assert.ok(formulaFit({sections:[sec(50),sec(60),sec(60)]},f).warnings.some(w=>/节奏可能和公式不同/.test(w)));
 assert.ok(formulaFit({sections:[sec(45),sec(10)]},f).warnings.some(w=>/没有对应的章节/.test(w)));
});
