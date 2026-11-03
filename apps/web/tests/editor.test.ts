import {test} from 'node:test';
import assert from 'node:assert/strict';
import * as editor from '../lib/editor';
import {canRetime,parseJobs,parseSceneJob,type SceneRow} from '../lib/editor';

test('project list accepts valid summaries and empty lists without changing metadata, order or identity',()=>{
  assert.equal(typeof editor.parseProjectSummaries,'function');
  const projects=[{id:'b',title:'  数组🙂  ',revision:3},{id:'a',title:'<script>纯文本</script>',revision:1}],before=structuredClone(projects);
  assert.equal(editor.parseProjectSummaries(projects),projects);assert.deepEqual(projects,before);assert.deepEqual(editor.parseProjectSummaries([]),[]);
});

test('project list rejects nonarrays rather than treating them as an empty list',()=>{
  assert.equal(typeof editor.parseProjectSummaries,'function');
  for(const value of [null,undefined,{},'projects',42,{items:[]}])assert.throws(()=>editor.parseProjectSummaries(value),/项目列表格式错误/);
});

test('project list rejects missing, blank or wrongly typed IDs and titles before rendering',()=>{
  assert.equal(typeof editor.parseProjectSummaries,'function');
  for(const row of [null,[],42,{}, {id:'',title:'课'},{id:'  ',title:'课'},{id:1,title:'课'},{id:'p'},{id:'p',title:null},{id:'p',title:7},{id:'p',title:'  '}]){
    assert.throws(()=>editor.parseProjectSummaries([{id:'valid',title:'保留'},row]),/项目列表格式错误/);
  }
});

test('project list rejects duplicate IDs as a whole without dropping or rewriting entries',()=>{
  assert.equal(typeof editor.parseProjectSummaries,'function');
  const projects=[{id:'p',title:'第一份'},{id:'p',title:'第二份'}],before=structuredClone(projects);
  assert.throws(()=>editor.parseProjectSummaries(projects),/项目列表格式错误/);assert.deepEqual(projects,before);
});

test('project search matches Chinese and case-insensitive title substrings, ignoring query edge spaces',()=>{
  assert.equal(typeof editor.filterProjects,'function');
  const projects=[{id:'a',title:'Python 数组'},{id:'b',title:'物理🙂入门'},{id:'c',title:'python 复核'}];
  assert.deepEqual(editor.filterProjects(projects,' PYTHON ').map(p=>p.id),['a','c']);
  assert.deepEqual(editor.filterProjects(projects,'物理🙂').map(p=>p.id),['b']);
});

test('project search treats punctuation literally rather than as a regular expression',()=>{
  assert.equal(typeof editor.filterProjects,'function');
  const projects=[{id:'a',title:'A[1].*'},{id:'b',title:'A123'}];
  assert.deepEqual(editor.filterProjects(projects,'[1].*'),[projects[0]]);
});

test('empty project query preserves loaded order and object identity without changing titles',()=>{
  assert.equal(typeof editor.filterProjects,'function');
  const projects=[{id:'b',title:'  原标题  '},{id:'a',title:'第二课'}],before=structuredClone(projects);
  const result=editor.filterProjects(projects,'  ');assert.deepEqual(result,projects);assert.equal(result[0],projects[0]);assert.deepEqual(projects,before);
});

test('project search handles no match and empty loaded list without inventing results',()=>{
  assert.equal(typeof editor.filterProjects,'function');
  assert.deepEqual(editor.filterProjects([{id:'p',title:'数组'}],'不存在'),[]);
  assert.deepEqual(editor.filterProjects([],'数组'),[]);
});

test('job list accepts voice and timing jobs and rejects other kinds, foreign projects and duplicates',()=>{
  const voice={job_id:'j1',project_id:'p',kind:'voice',state:'queued',progress:0,scene_id:'s',base_revision:2,error:null,result:null};
  assert.deepEqual(parseJobs([voice],'p'),[voice]);
  for(const bad of [[{...voice,kind:'render'}],[{...voice,project_id:'q'}],[voice,voice],[{...voice,progress:101}],{}])
    assert.throws(()=>parseJobs(bad,'p'),/任务响应格式错误/);
  const row:SceneRow={id:'s',revision:2,state:'needs_voice',scene:{narration:{text:'口播'}}};
  assert.equal(parseSceneJob(voice,'p',row,'voice').job_id,'j1');
  assert.throws(()=>parseSceneJob(voice,'p',{...row,revision:3},'voice'),/不符/);
  assert.throws(()=>parseSceneJob(voice,'p',row,'timing'),/不符/);
});
test('free retiming needs saved audio',()=>{
  const row:SceneRow={id:'s',revision:1,state:'needs_timing',scene:{narration:{text:'口播',audio_asset_id:'a'}}};
  assert.ok(canRetime(row));
  assert.ok(!canRetime({...row,scene:{narration:{text:'口播'}}}));
  assert.ok(!canRetime({...row,state:'needs_voice'}));
});
