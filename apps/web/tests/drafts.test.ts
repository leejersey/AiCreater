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
const scope: DraftScope = {kind:'voice',projectId:'p',sceneId:'',label:'课程 · 项目音色'};

test('draft keys isolate form and project, not revision or label',()=>{
  const key=draftKey(scope);
  assert.notEqual(key,draftKey({kind:'course',projectId:'',sceneId:''}));
  assert.notEqual(key,draftKey({...scope,projectId:'p2'}));
  assert.throws(()=>draftKey({...scope,sceneId:'s2'}),/不合法/);
  assert.equal(key,draftKey({...scope,label:'新标题'}));
});
test('arbitrary text roundtrips without normalization and no read writes',()=>{
  const store=new MemoryStorage(), speaker=' { "音色": [\n坏JSON😀';
  const raw=writeDraft(store,scope,7,{speaker},null);
  assert.equal(store.getItem(draftKey(scope)),raw);
  const draft=readDraft(raw,scope);
  assert.equal(draft?.revision,7); assert.deepEqual(draft?.data,{speaker});
  assert.equal(store.length,1);
});
test('different revisions preserve one recoverable source instead of overwriting automatically',()=>{
  const store=new MemoryStorage();
  const raw=writeDraft(store,scope,2,{speaker:'旧稿'},null);
  assert.notEqual(readDraft(raw,scope)?.revision,3);
  assert.equal(store.getItem(draftKey(scope)),raw);
});
test('malformed, future and wrong payload records remain inspectable, never silently deleted',()=>{
  const store=new MemoryStorage();
  for(const raw of ['{',JSON.stringify({version:2}),JSON.stringify({version:1,revision:1,updatedAt:1,label:'x',data:{speaker:[]}})]){
    store.setItem(draftKey(scope),raw);
    assert.equal(readDraft(raw,scope),null);
    assert.equal(listDrafts(store)[0].raw,raw);
    assert.equal(store.getItem(draftKey(scope)),raw);
  }
});
test('writes and removal compare previous bytes to protect newer tab drafts',()=>{
  const store=new MemoryStorage(), first=writeDraft(store,scope,1,{speaker:'A'},null);
  const newer=writeDraft(store,scope,1,{speaker:'B'},first);
  assert.throws(()=>writeDraft(store,scope,1,{speaker:'C'},first),/其他页面/);
  assert.throws(()=>removeDraft(store,scope,first),/其他页面/);
  assert.equal(store.getItem(draftKey(scope)),newer);
  removeDraft(store,scope,newer); assert.equal(store.length,0);
});
test('only application draft keys are listed or removed',()=>{
  const store=new MemoryStorage(); store.setItem('unrelated','keep');
  writeDraft(store,scope,1,{speaker:'图表'},null);
  const course:DraftScope={kind:'course',projectId:'',sceneId:''};
  writeDraft(store,course,0,{title:'标题',source:'文稿'},null);
  assert.equal(listDrafts(store).length,2);
  removeDraft(store,scope,store.getItem(draftKey(scope)));
  assert.equal(store.getItem('unrelated'),'keep'); assert.equal(listDrafts(store).length,1);
});
test('storage denial, quota and excessive input fail visibly without clearing records',()=>{
  const store=new MemoryStorage(), raw=writeDraft(store,scope,1,{speaker:'existing'},null);
  assert.throws(()=>writeDraft(store,scope,1,{speaker:'x'.repeat(262145)},raw),/过大/);
  assert.equal(store.getItem(draftKey(scope)),raw);
  const denied={...store,getItem(){throw new Error('SecurityError');},setItem(){throw new Error('QuotaExceededError');},removeItem(){throw new Error('Denied');}};
  assert.throws(()=>writeDraft(denied,scope,1,{speaker:'new'},null));
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
