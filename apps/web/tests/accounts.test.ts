import {test} from 'node:test';
import assert from 'node:assert/strict';
import * as drafts from '../lib/drafts';
import {readFileSync} from 'node:fs';

test('root cannot mount an anonymous editor when the auth endpoint is missing',()=>{
  const home=readFileSync(new URL('../app/page.tsx',import.meta.url),'utf8');
  const session=readFileSync(new URL('../app/AccountSession.tsx',import.meta.url),'utf8');
  assert.doesNotMatch(home,/\bWorkbench\b|\blegacy\b/,'Root must redirect through authentication, never render a legacy editor');
  assert.doesNotMatch(session,/setLegacy/,'A missing auth endpoint must fail closed, not enable anonymous mode');
});

test('per-user draft storage is isolated and does not adopt or delete anonymous drafts',()=>{
  assert.equal(typeof drafts.userDraftStorage,'function');
  const data=new Map<string,string>();
  const storage={get length(){return data.size;},key:(i:number)=>[...data.keys()][i]??null,getItem:(k:string)=>data.get(k)??null,setItem:(k:string,v:string)=>{data.set(k,v);},removeItem:(k:string)=>{data.delete(k);}};
  const scope={kind:'course' as const,projectId:'',sceneId:''};
  const old=drafts.writeDraft(storage,scope,0,{title:'原匿名稿',source:'旧文稿'},null);
  const first=drafts.userDraftStorage(storage,'00000000-0000-0000-0000-000000000001');
  const second=drafts.userDraftStorage(storage,'00000000-0000-0000-0000-000000000002');
  assert.equal(drafts.listDrafts(first).length,0);assert.equal(drafts.listDrafts(second).length,0);
  const raw=drafts.writeDraft(first,scope,0,{title:'甲',source:'私有文稿'},null);
  assert.equal(drafts.listDrafts(first).length,1);assert.equal(drafts.listDrafts(second).length,0);
  assert.equal(second.getItem(drafts.draftKey(scope)),null);
  drafts.removeDraft(first,scope,raw);
  assert.equal(storage.getItem(drafts.draftKey(scope)),old);
});

test('expired cookie session signals reauthentication without retrying a mutation',async()=>{
  const {request}=await import('../lib/editor');const previous=globalThis.fetch;const descriptor=Object.getOwnPropertyDescriptor(globalThis,'window');
  let calls=0,signals=0;Object.defineProperty(globalThis,'window',{configurable:true,value:{dispatchEvent:()=>{signals++;}}});
  globalThis.fetch=async()=>{calls++;return new Response(JSON.stringify({message:'Login required'}),{status:401,headers:{'Content-Type':'application/json'}});};
  try{
    await assert.rejects(()=>request('/api/projects',{title:'测试'}));assert.equal(calls,1);assert.equal(signals,1);
    await assert.rejects(()=>request('/api/auth/login',{username:'test',password:'wrong'}));assert.equal(calls,2);assert.equal(signals,1);
  }finally{globalThis.fetch=previous;if(descriptor)Object.defineProperty(globalThis,'window',descriptor);else Reflect.deleteProperty(globalThis,'window');}
});

test('account and course summary responses are validated before entering UI state',async()=>{
  const {parseAccount}=await import('../lib/accounts');const {parseProjectSummaries}=await import('../lib/editor');
  const id='00000000-0000-0000-0000-000000000001';
  assert.deepEqual(parseAccount({id,username:'local_user',ignored:'not retained'}),{id,username:'local_user'});
  for(const value of [null,{},[],{id:'-'.repeat(36),username:'abc'},{id,username:'<bad>'}])assert.throws(()=>parseAccount(value));
  assert.equal(parseProjectSummaries([{id,title:'课程',revision:1,updated_at:null,scene_count:0,active_jobs:false}]).length,1);
  assert.equal(parseProjectSummaries([{id,title:'课程',active_jobs:true,active_job_kind:'generate',active_job_state:'queued'}]).length,1);
  for(const extra of [{scene_count:-1},{revision:0},{active_jobs:'yes'},{updated_at:'not a date'},{active_job_state:'succeeded'}])assert.throws(()=>parseProjectSummaries([{id,title:'课程',...extra}]));
  const {activeJobLabel}=await import('../lib/editor');
  assert.equal(activeJobLabel({active_jobs:true,active_job_kind:'generate',active_job_state:'queued'}),'教学分镜 · 排队中');
  assert.equal(activeJobLabel({active_jobs:false}),null);
});

test('login return paths allow only local course and account routes',async()=>{
  const accounts=await import('../lib/accounts').catch(()=>null);
  assert.ok(accounts,'account helpers must exist');
  const id='00000000-0000-0000-0000-000000000001';
  for(const path of ['/courses','/courses/new','/courses/'+id,'/courses/'+id+'?scene='+id,'/account'])assert.equal(accounts.safeReturn(path),path);
  for(const path of [null,'//evil.invalid','/\\evil.invalid','https://evil.invalid','javascript:alert(1)','/login','/courses/../../login','/courses/%2f%2fevil.invalid'])assert.equal(accounts.safeReturn(path),'/courses');
});
