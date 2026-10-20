import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createElement} from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
import {DraftNotice, useLocalDraft} from '../app/LocalDraft';

test('SSR draft hook never touches browser storage or applies recovered fields',()=>{
  let accesses=0;
  const old=Object.getOwnPropertyDescriptor(globalThis,'window');
  Object.defineProperty(globalThis,'window',{configurable:true,get(){accesses++;throw new Error('SSR browser access');}});
  try {
    function Form(){
      const draft=useLocalDraft({kind:'course',projectId:'',sceneId:''},0,{title:'原始标题',source:''});
      return createElement('span',null,draft.value.title);
    }
    assert.equal(renderToStaticMarkup(createElement(Form)),'<span>原始标题</span>');
    assert.equal(accesses,0);
  } finally {if(old)Object.defineProperty(globalThis,'window',old);else Reflect.deleteProperty(globalThis,'window');}
});
test('matching draft requires explicit restore and offers readonly copy, never raw HTML',()=>{
  const record={version:1 as const,revision:2,updatedAt:1,label:'x',data:{text:'<script>bad()</script>'}};
  const html=renderToStaticMarkup(createElement(DraftNotice,{pending:JSON.stringify(record),record,revision:2,ready:true,error:'',saved:false,restore:()=>{},discard:()=>{},disabled:false}));
  assert.match(html,/恢复到表单/); assert.match(html,/丢弃本机草稿/);
  assert.match(html,/readOnly=""/); assert.doesNotMatch(html,/<script>/);
  assert.match(html,/不自动保存到服务器/);
});
test('different revisions and malformed records cannot restore but remain copyable',()=>{
  const base={ready:true,error:'',saved:false,restore:()=>{},discard:()=>{},disabled:false};
  for(const record of [null,{version:1 as const,revision:1,updatedAt:1,label:'x',data:{text:'旧输入'}}]){
    const html=renderToStaticMarkup(createElement(DraftNotice,{...base,pending:'{raw',record,revision:2}));
    assert.match(html,/复制/); assert.match(html,/丢弃本机草稿/); assert.doesNotMatch(html,/恢复到表单/);
  }
});
test('unfinished raw cues remain explicit copyable draft text, never auto-restored',()=>{
  const record={version:1 as const,revision:2,updatedAt:1,label:'scene',data:{text:'甲😀乙',code:'',steps:'[]',edges:[],rawStates:{},rawCues:{a:{text_start:'',text_end:'1.5'}}}};
  const html=renderToStaticMarkup(createElement(DraftNotice,{pending:JSON.stringify(record),record,revision:2,ready:true,error:'',saved:false,restore:()=>{},discard:()=>{},disabled:false}));
  assert.match(html,/rawCues/);assert.match(html,/1.5/);assert.match(html,/恢复到表单/);assert.match(html,/不自动保存到服务器/);
});
test('storage errors warn without claiming data is saved',()=>{
  const html=renderToStaticMarkup(createElement(DraftNotice,{pending:null,record:null,revision:1,ready:true,error:'无法暂存，请复制输入',saved:false,restore:()=>{},discard:()=>{},disabled:false}));
  assert.match(html,/role="alert"/); assert.match(html,/请复制输入/); assert.doesNotMatch(html,/已暂存/);
});
