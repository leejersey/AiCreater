import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {clearProjectDrafts, draftKey, writeDraft, type DraftScope} from '../lib/drafts';

class MemoryStorage {
  items = new Map<string, string>();
  get length() {return this.items.size;}
  key(i: number) {return [...this.items.keys()][i] ?? null;}
  getItem(k: string) {return this.items.get(k) ?? null;}
  setItem(k: string, v: string) {this.items.set(k,v);}
  removeItem(k: string) {this.items.delete(k);}
}

test('courses page exposes per-card delete control',()=>{
  const src=readFileSync(new URL('../app/courses/page.tsx',import.meta.url),'utf8');
  assert.match(src,/Trash2/);
  assert.match(src,/deleteProject/);
  assert.match(src,/confirmed:\s*true/);
});

test('clearProjectDrafts removes scopes for one project only',()=>{
  const store=new MemoryStorage();
  const a: DraftScope={kind:'scene',projectId:'keep',sceneId:'s1'};
  const b: DraftScope={kind:'append',projectId:'gone',sceneId:''};
  const c: DraftScope={kind:'voice',projectId:'gone',sceneId:''};
  writeDraft(store,a,1,{text:'',code:'',steps:'[]',edges:[],rawStates:{}},null);
  writeDraft(store,b,1,{content:'x',narration:'y'},null);
  writeDraft(store,c,1,{speaker:'spk'},null);
  clearProjectDrafts(store,'gone');
  assert.notEqual(store.getItem(draftKey(a)),null);
  assert.equal(store.getItem(draftKey(b)),null);
  assert.equal(store.getItem(draftKey(c)),null);
});
