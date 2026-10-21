import {test} from 'node:test';
import assert from 'node:assert/strict';
import {draftKey, readDraft, writeDraft, removeDraft, listDrafts, type DraftScope} from '../lib/drafts';

class MemoryStorage {
  items = new Map<string, string>();
  get length() {return this.items.size;}
  key(i: number) {return [...this.items.keys()][i] ?? null;}
  getItem(k: string) {return this.items.get(k) ?? null;}
  setItem(k: string, v: string) {this.items.set(k,v);}
  removeItem(k: string) {this.items.delete(k);}
}
const scope: DraftScope = {kind:'chart',projectId:'p',sceneId:'s',label:'课程 · 第一章图表'};

test('draft keys isolate form, project and scene, not revision',()=>{
  const key=draftKey(scope);
  assert.notEqual(key,draftKey({...scope,kind:'scene'}));
  assert.notEqual(key,draftKey({...scope,projectId:'p2'}));
  assert.notEqual(key,draftKey({...scope,sceneId:'s2'}));
  assert.equal(key,draftKey({...scope,label:'新标题'}));
});
test('invalid JSON text roundtrips without normalization and no read writes',()=>{
  const store=new MemoryStorage(), text=' { "图表": [\n坏JSON😀';
  const raw=writeDraft(store,scope,7,{text},null);
  assert.equal(store.getItem(draftKey(scope)),raw);
  const draft=readDraft(raw,scope);
  assert.equal(draft?.revision,7); assert.deepEqual(draft?.data,{text});
  assert.equal(store.length,1);
});
test('different revisions preserve one recoverable source instead of overwriting automatically',()=>{
  const store=new MemoryStorage();
  const raw=writeDraft(store,scope,2,{text:'旧稿'},null);
  assert.notEqual(readDraft(raw,scope)?.revision,3);
  assert.equal(store.getItem(draftKey(scope)),raw);
});
test('malformed, future and wrong payload records remain inspectable, never silently deleted',()=>{
  const store=new MemoryStorage();
  for(const raw of ['{',JSON.stringify({version:2}),JSON.stringify({version:1,revision:1,updatedAt:1,label:'x',data:{text:[]}})]){
    store.setItem(draftKey(scope),raw);
    assert.equal(readDraft(raw,scope),null);
    assert.equal(listDrafts(store)[0].raw,raw);
    assert.equal(store.getItem(draftKey(scope)),raw);
  }
});
test('writes and removal compare previous bytes to protect newer tab drafts',()=>{
  const store=new MemoryStorage(), first=writeDraft(store,scope,1,{text:'A'},null);
  const newer=writeDraft(store,scope,1,{text:'B'},first);
  assert.throws(()=>writeDraft(store,scope,1,{text:'C'},first),/其他页面/);
  assert.throws(()=>removeDraft(store,scope,first),/其他页面/);
  assert.equal(store.getItem(draftKey(scope)),newer);
  removeDraft(store,scope,newer); assert.equal(store.length,0);
});
test('only application draft keys are listed or removed',()=>{
  const store=new MemoryStorage(); store.setItem('unrelated','keep');
  writeDraft(store,scope,1,{text:'图表'},null);
  const course:DraftScope={kind:'course',projectId:'',sceneId:''};
  writeDraft(store,course,0,{title:'标题',source:'文稿'},null);
  assert.equal(listDrafts(store).length,2);
  removeDraft(store,scope,store.getItem(draftKey(scope)));
  assert.equal(store.getItem('unrelated'),'keep'); assert.equal(listDrafts(store).length,1);
});
test('append concept drafts retain incomplete excerpts and roles and restore older card drafts',()=>{
  const store=new MemoryStorage(),s={kind:'append' as const,projectId:'p',sceneId:''};
  const old={content:'卡片',narration:'口播'};
  const first=writeDraft(store,s,1,old,null);assert.deepEqual(readDraft(first,s)?.data,old);
  const data={...old,sceneType:'concept' as const,conceptSteps:[{content:'',concept_role:'definition' as const},{content:'还未匹配',concept_role:'example' as const}]};
  const raw=writeDraft(store,s,1,data,first);assert.deepEqual(readDraft(raw,s)?.data,data);
  for(const change of [{sceneType:'code_walkthrough'},{conceptSteps:[{content:'x',concept_role:'constructor'}]},{conceptSteps:Array(7).fill({content:'x',concept_role:'feature'})}]){
    assert.equal(readDraft(JSON.stringify({version:1,revision:1,updatedAt:1,label:'x',data:{...data,...change}}),s),null);
  }
});
test('scene record retains raw invalid nested state, edges and optional array mode',()=>{
  const store=new MemoryStorage(), s:DraftScope={...scope,kind:'scene'};
  const data={text:'口播',code:'x=1',steps:'[坏JSON',arrayName:'数组',edges:[{from:'a',to:''}],rawStates:{a:'{broken'}};
  const raw=writeDraft(store,s,1,data,null);
  assert.deepEqual(readDraft(raw,s)?.data,data);
});
test('optional raw cues preserve incomplete input while old scene v1 records still restore',()=>{
  const store=new MemoryStorage(),s={...scope,kind:'scene' as const};
  const old={text:'甲😀乙',code:'',steps:'[]',edges:[],rawStates:{}};
  const legacy=writeDraft(store,s,1,old,null);assert.deepEqual(readDraft(legacy,s)?.data,old);
  const data={...old,rawCues:{constructor:{text_start:'',text_end:'坏输入😀'}}};
  const raw=writeDraft(store,s,1,data,legacy);assert.deepEqual(readDraft(raw,s)?.data,data);
  assert.throws(()=>writeDraft(store,s,2,data,legacy),/其他页面/);assert.equal(store.getItem(draftKey(s)),raw);
});
test('malformed raw cue draft fields stay copyable instead of being silently normalized',()=>{
  const s={...scope,kind:'scene' as const};
  for(const rawCues of [[],null,{a:{text_start:0,text_end:'2'}},{a:{text_start:'0'}},{a:{text_start:'0',text_end:'2',extra:'x'}},Object.fromEntries(Array.from({length:7},(_,i)=>[i,{text_start:'0',text_end:'2'}]))]){
    const raw=JSON.stringify({version:1,revision:1,updatedAt:1,label:'x',data:{text:'甲乙',code:'',steps:'[]',edges:[],rawStates:{},rawCues}});
    assert.equal(readDraft(raw,s),null);
  }
});
test('storage denial, quota and excessive input fail visibly without clearing records',()=>{
  const store=new MemoryStorage(), raw=writeDraft(store,scope,1,{text:'existing'},null);
  assert.throws(()=>writeDraft(store,scope,1,{text:'x'.repeat(262145)},raw),/过大/);
  assert.equal(store.getItem(draftKey(scope)),raw);
  const denied={...store,getItem(){throw new Error('SecurityError');},setItem(){throw new Error('QuotaExceededError');},removeItem(){throw new Error('Denied');}};
  assert.throws(()=>writeDraft(denied,scope,1,{text:'new'},null));
  assert.throws(()=>removeDraft(denied,scope,raw));
  assert.equal(store.getItem(draftKey(scope)),raw);
});
test('course drafts accept optional manuscript hints and keep old title/source drafts valid', () => {
  const storage = new MemoryStorage();
  const scope: DraftScope = {kind: 'course', projectId: '', sceneId: ''};
  const raw = writeDraft(storage, scope, 0, {title: '蒸发', source: '旧稿', audience: '初中', duration_hint: '3分钟', outline: '定义'}, null);
  assert.ok(readDraft(raw, scope));
  assert.ok(readDraft(JSON.stringify({version:1,revision:0,updatedAt:1,label:'course',data:{title:'a',source:'b'}}), scope));
  assert.equal(readDraft(JSON.stringify({version:1,revision:0,updatedAt:1,label:'course',data:{title:'a',source:'b',audience:1}}), scope), null);
});
test('course drafts retain manuscript format and reject unsupported formats', () => {
  const scope: DraftScope = {kind:'course',projectId:'',sceneId:''};
  const data = {title:'a',source:'## [s1] 标题',manuscript_format:'markdown' as const};
  const raw = writeDraft(new MemoryStorage(),scope,0,data,null);
  assert.equal((readDraft(raw,scope)?.data as typeof data).manuscript_format,'markdown');
  assert.equal(readDraft(raw.replace('"markdown"','"html"'),scope),null);
});
test('course drafts accept optional teaching_style popular|technical', () => {
  const storage = new MemoryStorage();
  const scope: DraftScope = {kind: 'course', projectId: '', sceneId: ''};
  assert.ok(writeDraft(storage, scope, 0, {title: 'a', source: 'b', teaching_style: 'technical'}, null));
  assert.ok(readDraft(JSON.stringify({version:1,revision:0,updatedAt:1,label:'course',data:{title:'a',source:'b'}}), scope));
  assert.equal(readDraft(JSON.stringify({version:1,revision:0,updatedAt:1,label:'course',
    data:{title:'a',source:'b',teaching_style:'nope'}}), scope), null);
});
