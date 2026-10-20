import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createElement} from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
import {VoiceSettings} from '../app/VoiceSettings';
import {draftKey,readDraft,writeDraft,listDrafts} from '../lib/drafts';
import type {Project,SceneRow,Job} from '../lib/editor';
import {currentVoiceJob} from '../lib/course';
const project={id:'p',title:'课程',revision:2,voice:{resource_id:'seed-tts-2.0',speaker:'existing_voice'},voice_configured:false} as Project;
const props={project,dirty:false,busy:false,formEditing:false,onDirty:()=>{},onSave:async()=>{},act:async(fn:()=>Promise<unknown>)=>{await fn();}};
test('project voice form states its free boundary, current voice and old-media preservation',()=>{
  const html=renderToStaticMarkup(createElement(VoiceSettings,props));
  assert.match(html,/existing_voice/);assert.match(html,/项目音色ID/);assert.match(html,/保存音色设置（不计费）/);
  assert.match(html,/已有音轨/);assert.match(html,/权限/);assert.doesNotMatch(html,/type="password"/);
});
test('old API cannot edit an invented voice and busy form has disabled fieldset',()=>{
  assert.match(renderToStaticMarkup(createElement(VoiceSettings,{...props,project:{...project,voice:undefined}})),/尚未启用/);
  assert.match(renderToStaticMarkup(createElement(VoiceSettings,{...props,busy:true})),/<fieldset[^>]*disabled/);
});
test('old voice jobs cannot block selecting chapters for new project voice',()=>{
  const row={id:'s',revision:2} as SceneRow;
  const old={job_id:'old',kind:'voice',scene_id:'s',base_revision:2,state:'queued',progress:0,voice_current:false} satisfies Job;
  assert.equal(currentVoiceJob(row,[old]),undefined);
  const current={...old,job_id:'current',voice_current:true};
  assert.equal(currentVoiceJob(row,[old,current]),current);
  assert.equal(currentVoiceJob(row,[{...old,voice_current:undefined}])?.job_id,'old');
});
test('voice draft isolates project and uses existing recovery, preserving invalid text until explicit save',()=>{
  const items=new Map<string,string>();const storage={get length(){return items.size;},key:(i:number)=>[...items.keys()][i]??null,getItem:(k:string)=>items.get(k)??null,setItem:(k:string,v:string)=>{items.set(k,v);},removeItem:(k:string)=>{items.delete(k);}};
  const scope={kind:'voice' as const,projectId:'p',sceneId:'',label:'课程音色'};
  const raw=writeDraft(storage,scope,2,{speaker:' 尚未有效😀\n'},null);
  assert.deepEqual(readDraft(raw,scope)?.data,{speaker:' 尚未有效😀\n'});
  assert.equal(listDrafts(storage).length,1);
  assert.notEqual(draftKey(scope),draftKey({...scope,projectId:'p2'}));
  assert.throws(()=>draftKey({...scope,sceneId:'scene'}));
});
