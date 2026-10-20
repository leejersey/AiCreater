import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createElement} from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
import {SceneEditor} from '../app/SceneEditor';
import * as editor from '../lib/editor';
import type {Scene} from '../../../packages/video-schema/src/types';

const elements=[{id:'constructor',content:'主题',role:'topic' as const,cue:{text_start:0,text_end:1}},
  {id:'b',content:'第二步',cue:{text_start:3,text_end:4},output:'保留'}];
const steps=JSON.stringify(elements),text='甲😀 乙';

test('cue merge uses codepoints and retains identity, role, snapshots and caller data',()=>{
  assert.equal(typeof editor.cueSteps,'function');
  const raw={constructor:{text_start:'1',text_end:'2'}};
  const next=JSON.parse(editor.cueSteps(steps,text,'card_sequence',raw));
  assert.deepEqual(next,[{...elements[0],cue:{text_start:1,text_end:2}},elements[1]]);
  assert.equal(editor.cuePreview(text,next[0].cue),'😀');
  assert.equal(steps,JSON.stringify(elements));assert.deepEqual(raw.constructor,{text_start:'1',text_end:'2'});
});
test('cue merge reads own IDs only, including names inherited by ordinary objects',()=>{
  assert.equal(typeof editor.cueSteps,'function');
  assert.deepEqual(JSON.parse(editor.cueSteps(steps,text,'card_sequence',{})),elements);
  assert.throws(()=>editor.cueSteps(steps,text,'card_sequence',{missing:{text_start:'0',text_end:'1'}}),/步骤/);
});
test('blank decimal negative nonnumeric and out of range cue text never becomes zero',()=>{
  assert.equal(typeof editor.cueSteps,'function');
  for(const value of ['', ' ', '-1','1.5','NaN','Infinity','1e0','9007199254740993','9999']){
    const raw={b:{text_start:value,text_end:'4'}};
    assert.throws(()=>editor.cueSteps(steps,text,'card_sequence',raw));
    assert.equal(raw.b.text_start,value);
  }
});
test('cue bounds reject empty, reversed, whitespace-only ranges and invalid advanced JSON',()=>{
  assert.equal(typeof editor.cueSteps,'function');
  for(const cue of [{text_start:2,text_end:2},{text_start:3,text_end:1},{text_start:2,text_end:3},{text_start:0,text_end:5},{text_start:-1,text_end:1}]){
    assert.throws(()=>editor.cueSteps(JSON.stringify([{...elements[0],cue}]),text,'title_reveal',{}));
  }
  assert.throws(()=>editor.cueSteps('{',text,'title_reveal',{}));
});
test('spoken-order scene types require increasing starts but not non-overlapping ranges',()=>{
  assert.equal(typeof editor.cueSteps,'function');
  const reversed=JSON.stringify([{...elements[0],cue:{text_start:3,text_end:4}},{...elements[1],cue:{text_start:0,text_end:1}}]);
  for(const type of ['code_walkthrough','state_diagram','execution_timeline','data_chart'] as const){assert.throws(()=>editor.cueSteps(reversed,text,type,{}),/递增/);}
  for(const type of ['title_reveal','card_sequence','flow_diagram','comparison_panel'] as const){assert.doesNotThrow(()=>editor.cueSteps(reversed,text,type,{}));}
  const overlapping=JSON.stringify([{...elements[0],cue:{text_start:0,text_end:4}},elements[1]]);
  assert.doesNotThrow(()=>editor.cueSteps(overlapping,text,'code_walkthrough',{}));
});
test('cue preview is verbatim and current narration determines all bounds',()=>{
  assert.equal(typeof editor.cuePreview,'function');
  assert.equal(editor.cuePreview('<>&😀',{text_start:0,text_end:4}),'<>&😀');
  assert.throws(()=>editor.cueSteps(steps,'甲','card_sequence',{}));
});
test('code snapshot defaults use own raw state only for a constructor step ID',()=>{
  const scene:editor.DraftScene={id:'s',type:'code_walkthrough',narration:{text:'甲乙'},code:{language:'python',source:'nums = [1]',array_name:'nums'},elements:[{...elements[0],cue:{text_start:0,text_end:1},array_items:[],pointers:[],loop:null,input:''}]};
  const html=renderToStaticMarkup(createElement(SceneEditor,{projectId:'p',row:{id:'row',revision:1,state:'needs_voice',scene},disabled:false,onDirty:()=>{},save:async()=>{},act:async()=>{}}));
  const snapshot=[...html.matchAll(/<textarea\b[^>]*>([\s\S]*?)<\/textarea>/g)].map(m=>m[1]).find(v=>v.includes('array_items'))||'';
  assert.match(snapshot,/&quot;array_items&quot;/);assert.match(snapshot,/&quot;pointers&quot;/);
});
test('scene form renders labeled editable cue fields and escaped selected original text',()=>{
  const scene={id:'s',type:'title_reveal',narration:{text:'<😀>'},elements:[{...elements[0],cue:{text_start:0,text_end:3}}]} as Scene;
  const html=renderToStaticMarkup(createElement(SceneEditor,{projectId:'p',row:{id:'row',revision:1,state:'ready',scene},disabled:false,onDirty:()=>{},save:async()=>{},act:async()=>{}}));
  assert.match(html,/步骤 1 触发起点/);assert.match(html,/步骤 1 触发终点/);
  assert.match(html,/Unicode码点/);assert.match(html,/<mark>.*&lt;😀&gt;.*<\/mark>/);
  assert.match(html,/提前显示/);assert.match(html,/待对齐/);assert.doesNotMatch(html,/cue与主题标记只读/);
});
