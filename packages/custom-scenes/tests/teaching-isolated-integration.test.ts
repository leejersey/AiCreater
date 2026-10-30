import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdir,mkdtemp,readFile,writeFile,stat} from 'node:fs/promises';
import path from 'node:path';
import {freezeTeachingScene} from '../src/teaching-artifact';
import {renderTeachingIsolated} from '../src/teaching-isolated-render';
import {repositoryRoot} from '../src/files';
import {teachingExample,teachingBrief,teachingCues} from './fixtures/teaching-examples';

test('real teaching container returns a checked frozen silent preview',{
 skip:process.env.RUN_TEACHING_ISOLATED_TEST!=='1',timeout:360000,
},async()=>{
 const output=path.join(repositoryRoot,'output');await mkdir(output,{recursive:true});
 const root=await mkdtemp(path.join(output,'teaching-container-'));
 try{
  const artifact=await freezeTeachingScene(teachingExample('state-change'),teachingBrief,teachingCues);
  const result=await renderTeachingIsolated(artifact,artifact.artifactSha256,path.join(root,'job'));
  assert.equal(result.status,'preview-ready');assert.equal(result.accepted,false);
  assert.equal(result.inputSha256,artifact.artifactSha256);
  const file=path.join(root,'job',result.previewFile);assert.ok((await stat(file)).size>1000);
  const report=JSON.parse(await readFile(path.join(path.dirname(file),'continuous-report.json'),'utf8'));
  assert.equal(report.status,'passed');assert.equal(report.requiredFrames.length,120);
  assert.deepEqual(report.failedFrames,[]);assert.deepEqual(report.missingFrames,[]);assert.deepEqual(report.coverageIssues,[]);
  await assert.rejects(renderTeachingIsolated(artifact,artifact.artifactSha256,path.join(root,'job')),/EEXIST/);
  await writeFile(path.join(root,'integration.json'),JSON.stringify({status:'preview-ready',accepted:false,blindTest:false,modelCalls:0,ttsCalls:0,result},null,2));
  console.log(JSON.stringify({output:root,video:file,status:'preview-ready',accepted:false}));
 }catch(error){await writeFile(path.join(root,'integration-failure.json'),JSON.stringify({status:'failed',accepted:false,error:error instanceof Error?error.message:String(error)},null,2));throw error;}
});
