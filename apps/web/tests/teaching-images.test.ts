import assert from 'node:assert/strict';
import {test} from 'node:test';
import {readyVideo,previewVideo,canRetime,type Project} from '../lib/editor';
import {parseProject} from '../../../packages/video-schema/src/validate';
import {imageProject} from '../../../packages/video-schema/tests/images-fixture';

test('saved image bindings and private assets survive workbench ready/scene preview projection',()=>{
  const {scenes,...config}=parseProject(imageProject());
  const project:Project={id:'lesson',title:'图片',revision:1,source_text:scenes[0].narration.text,config,
    scenes:scenes.map(scene=>({id:scene.id,revision:1,state:'ready',scene}))};
  assert.deepEqual(readyVideo(project)?.assets,config.assets);
  assert.deepEqual(previewVideo(project,'scene1')?.scenes[0].images,scenes[0].images);
  assert.equal(canRetime(project.scenes[0]),false,'unsupported local retiming must not be offered');
});
