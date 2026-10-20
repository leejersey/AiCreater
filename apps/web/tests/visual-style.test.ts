import {test} from 'node:test';
import assert from 'node:assert/strict';
import React from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
import demo from '../../../examples/demo.json';
import {readyVideo,type Project} from '../lib/editor';
import {parseProject} from '../../../packages/video-schema/src/validate';
import {visualStyles,type VisualStyleSnapshot} from '../../../packages/video-components/src/theme';
import {draftKey,writeDraft,readDraft} from '../lib/drafts';
import {exportIssues} from '../lib/course';
const snapshot:VisualStyleSnapshot={id:'whiteboard',tokens:structuredClone(visualStyles.whiteboard)};
const document=parseProject(demo);
const project:Project={id:'p',title:'示例',revision:2,source_text:'示例',config:{...document,visual_style:snapshot},scenes:document.scenes.map(s=>({id:s.id,revision:1,state:'ready',scene:s}))};

test('render-only style metadata never leaks into the DSL and source stays intact',()=>{
  const before=structuredClone(project),video=readyVideo(project)!;
  assert.ok(video);assert.equal(Object.hasOwn(video,'visual_style'),false);assert.deepEqual(project,before);
});
test('saved style metadata does not block export or hide genuine unsaved/state blockers',()=>{
  assert.deepEqual(exportIssues(project,false),[]);
  assert.ok(exportIssues(project,true).some(x=>x.code==='unsaved'));
  const pending=structuredClone(project);pending.scenes[0].state='needs_timing';assert.ok(exportIssues(pending,false).some(x=>x.code==='needs_timing'));
});
test('style drafts round trip by project, retain choice and reject extra fields',()=>{
  const scope={kind:'visual-style' as const,projectId:'p',sceneId:''};
  const rows=new Map<string,string>(),storage={getItem:(k:string)=>rows.get(k)??null,setItem:(k:string,v:string)=>{rows.set(k,v);},removeItem:(k:string)=>{rows.delete(k);}};
  writeDraft(storage,scope,2,{visual_style:'minimal'},null);
  assert.equal(readDraft(storage.getItem(draftKey(scope)),scope)?.data.visual_style,'minimal');
  assert.notEqual(draftKey(scope),draftKey({...scope,projectId:'other'}));
  const bad=JSON.parse(storage.getItem(draftKey(scope))!);bad.data.extra='invalid';assert.equal(readDraft(JSON.stringify(bad),scope),null);
});
test('workbench offers independent shape styles, save-only action and old API safe notice',async()=>{
  const module=await import('../app/VisualStyleSettings').catch(()=>({VisualStyleSettings:undefined}));
  assert.equal(typeof module.VisualStyleSettings,'function');if(!module.VisualStyleSettings)return;
  const props={project:{...project,visual_style:snapshot},dirty:false,busy:false,formEditing:false,onDirty:()=>{},onSave:async()=>{},act:async(fn:()=>Promise<unknown>)=>{await fn();}};
  const html=renderToStaticMarkup(React.createElement(module.VisualStyleSettings,props));
  assert.match(html,/视觉风格/);assert.match(html,/白板线稿/);assert.match(html,/现代极简/);assert.match(html,/保存风格/);assert.match(html,/不重新配音/);
  const missing=renderToStaticMarkup(React.createElement(module.VisualStyleSettings,{...props,project}));
  assert.match(missing,/尚未启用/);assert.doesNotMatch(missing,/<select/);
  const locked=renderToStaticMarkup(React.createElement(module.VisualStyleSettings,{...props,dirty:true}));
  assert.match(locked,/<fieldset disabled/);
});
