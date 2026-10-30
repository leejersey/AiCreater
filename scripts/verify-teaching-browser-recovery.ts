import {mkdtemp,mkdir,writeFile} from 'node:fs/promises';
import path from 'node:path';
import assert from 'node:assert/strict';
import {freezeTeachingScene} from '../packages/custom-scenes/src/teaching-artifact';
import {renderTeachingArtifactRecovering} from '../packages/custom-scenes/src/teaching-render';
import {designInputHash} from '../packages/custom-scenes/src/design-content';
import {teachingExample,teachingBrief,teachingCues} from '../packages/custom-scenes/tests/fixtures/teaching-examples';

const root=path.resolve('output');await mkdir(root,{recursive:true});
const output=await mkdtemp(path.join(root,'teaching-browser-recovery-'));
const mode=process.argv[2]??'nominal';if(!['nominal','long-title'].includes(mode))throw Error('Expected nominal or long-title');
const brief={...teachingBrief,title:mode==='long-title'?'知识'.repeat(40):'教学恢复验证 / 组合'},plan=teachingExample('composition');
plan.objects.forEach(o=>{o.label=o.id==='bag'?'上下文':o.id==='paper'?'任务':'证据';});
plan.inputSha256=designInputHash(brief,teachingCues);
// A supported host variant, not edited coordinates or an injected fake diagnostic.
const artifact=await freezeTeachingScene(plan,brief,teachingCues,'lower');
process.stdout.write(JSON.stringify({output,mode,status:'running',modelCalls:0,ttsCalls:0,blindTest:false})+'\n');
try{
 const result=await renderTeachingArtifactRecovering(artifact,artifact.artifactSha256,path.join(output,'recovery'));
 await writeFile(path.join(output,'validation.json'),JSON.stringify({scope:'Actual browser mechanism regression; not a new-topic blind test or visual acceptance',...result},null,2));
 assert.equal(result.status,'preview-ready','The verification case must produce a fully checked preview');
 assert.equal(result.history.length,1,'A valid title must not consume extra render rounds');
 process.stdout.write(JSON.stringify({output,status:result.status,rounds:result.history.map(h=>({variant:h.variant,audit:h.recovery.failure.status})),previewPath:result.previewPath,accepted:false})+'\n');
}catch(error){await writeFile(path.join(output,'validation.failure.json'),JSON.stringify({status:'failed',accepted:false,error:error instanceof Error?error.message:String(error)},null,2));throw error;}
