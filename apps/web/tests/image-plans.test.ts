import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createElement} from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
import {TeachingImagePlan} from '../app/TeachingImagePlan';
import {readyVideo,draftPreviewVideo,type Project,type TeachingImagePlanEntry} from '../lib/editor';
import {validProject} from '../../../packages/video-schema/tests/fixture';
import {parseProject} from '../../../packages/video-schema/src/validate';

const entry:TeachingImagePlanEntry={status:'planned',scene_fingerprint:'x',plan:{needed:true,reason:'用工具箱解释依赖隔离',requirements:[
  {id:'img_a',element_id:'a',purpose:'metaphor',description:'一个独立工具箱',composition:'主体完整，留出标签空间',alt:'工具箱',quote:'各自管理依赖'}]}};

test('planning is explicit, accessible, escaped, and cannot silently generate images',()=>{
  const html=renderToStaticMarkup(createElement(TeachingImagePlan,{entry}));
  for(const text of ['概念类比','用工具箱解释依赖隔离','对应口播','各自管理依赖','主体完整','尚未生成图片'])assert.ok(html.includes(text));
  assert.ok(!html.includes('<button'));
  const unsafe=structuredClone(entry);unsafe.plan.reason='<script>alert(1)</script>';
  assert.ok(!renderToStaticMarkup(createElement(TeachingImagePlan,{entry:unsafe})).includes('<script>'));
  assert.equal(renderToStaticMarkup(createElement(TeachingImagePlan,{entry:undefined})),'');
});

test('no-image and stale plans are distinct; neither implies an image exists',()=>{
  assert.match(renderToStaticMarkup(createElement(TeachingImagePlan,{entry:{...entry,status:'needs_review'}})),/不能直接用于生图/);
  assert.match(renderToStaticMarkup(createElement(TeachingImagePlan,{entry:{...entry,plan:{needed:false,reason:'代码组件更准确',requirements:[]}}})),/无需图片/);
});

test('planning metadata never enters ready, draft or single-scene video DSL',()=>{
  const dsl=parseProject(validProject());const {scenes,...config}=dsl;
  const project:Project={id:'p',title:'教学图片计划',revision:1,source_text:'原文',config:{...config,image_plans:{[scenes[0].id]:entry}},
    scenes:scenes.map((scene,i)=>({id:'row'+i,revision:1,state:'ready',scene}))};
  for(const video of [readyVideo(project),draftPreviewVideo({...project,scenes:project.scenes.map(r=>({...r,state:'needs_voice'}))},project.scenes[0].id)]){
    assert.ok(video);assert.ok(!('image_plans' in video));assert.ok(!JSON.stringify(video).includes('用工具箱解释依赖隔离'));
  }
  const row=project.scenes[0];
  assert.ok(!('image_plans' in readyVideo({...project,scenes:[row]})!));
});
