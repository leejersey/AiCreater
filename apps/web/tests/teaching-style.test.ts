import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createElement} from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
import {outlinePlaceholder, isTeachingStyle, type TeachingStyle} from '../lib/teaching-style';
import {TeachingStyleSettings} from '../app/TeachingStyleSettings';
import {draftKey,readDraft,writeDraft,listDrafts} from '../lib/drafts';
import type {Project} from '../lib/editor';
import {parseProject} from '../../../packages/video-schema/src/validate';
import {validProject} from '../../../packages/video-schema/tests/fixture';

const project:Project={id:'p',title:'课程',revision:2,source_text:'文稿',teaching_style:'popular',config:parseProject(validProject()),scenes:[]};
const props={project,dirty:false,busy:false,formEditing:false,onDirty:()=>{},onSave:async()=>{},act:async(fn:()=>Promise<unknown>)=>{await fn();}};

test('outlinePlaceholder differs by style', () => {
  assert.match(outlinePlaceholder('technical'), /embedding/);
  assert.match(outlinePlaceholder('popular'), /生活例子/);
  assert.notEqual(outlinePlaceholder('popular'), outlinePlaceholder('technical'));
});

test('isTeachingStyle accepts only popular and technical', () => {
  const popular: unknown = 'popular';
  const technical: unknown = 'technical';
  assert.ok(isTeachingStyle(popular));
  assert.ok(isTeachingStyle(technical));
  if (isTeachingStyle(popular)) {
    const _: TeachingStyle = popular;
    assert.equal(_, 'popular');
  }
  for (const bad of ['nope', '', 'marketing', null, undefined, 1, true]) {
    assert.equal(isTeachingStyle(bad), false);
  }
});

test('teaching style settings copy, options and busy fieldset', () => {
  const html = renderToStaticMarkup(createElement(TeachingStyleSettings, props));
  assert.match(html, /仅影响之后新生成的分镜/);
  assert.match(html, /科普/);
  assert.match(html, /知识干货/);
  assert.match(html, /保存讲解风格/);
  assert.match(renderToStaticMarkup(createElement(TeachingStyleSettings, {...props, busy: true})), /<fieldset[^>]*disabled/);
});

test('teaching-style draft isolates project and validates enum', () => {
  const items = new Map<string, string>();
  const storage = {get length(){return items.size;}, key:(i:number)=>[...items.keys()][i]??null,
    getItem:(k:string)=>items.get(k)??null, setItem:(k:string,v:string)=>{items.set(k,v);}, removeItem:(k:string)=>{items.delete(k);}};
  const scope = {kind:'teaching-style' as const, projectId:'p', sceneId:'', label:'课程讲解风格'};
  const raw = writeDraft(storage, scope, 2, {teaching_style:'technical'}, null);
  assert.deepEqual(readDraft(raw, scope)?.data, {teaching_style:'technical'});
  assert.equal(listDrafts(storage).length, 1);
  assert.notEqual(draftKey(scope), draftKey({...scope, projectId:'p2'}));
  assert.throws(()=>draftKey({...scope, sceneId:'scene'}));
  assert.equal(readDraft(JSON.stringify({version:1,revision:0,updatedAt:1,label:'x',data:{teaching_style:'nope'}}), scope), null);
});

test('undefined project teaching_style defaults to popular in settings markup', () => {
  const html = renderToStaticMarkup(createElement(TeachingStyleSettings, props));
  assert.match(html, /value="popular"[^>]*selected/);
});
