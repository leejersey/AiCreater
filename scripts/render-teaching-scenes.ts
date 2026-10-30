import {mkdtemp,mkdir,writeFile} from 'node:fs/promises';
import path from 'node:path';
import {freezeTeachingScene} from '../packages/custom-scenes/src/teaching-artifact';
import {renderTeachingArtifact} from '../packages/custom-scenes/src/teaching-render';
import {teachingStructures} from '../packages/custom-scenes/src/teaching-plan';
import {designInputHash} from '../packages/custom-scenes/src/design-content';
import {teachingExample,teachingBrief,teachingCues} from '../packages/custom-scenes/tests/fixtures/teaching-examples';

const only=process.argv[2];if(only&&!teachingStructures.includes(only as typeof teachingStructures[number]))throw Error('Expected a supported structure');
const root=path.resolve('output');await mkdir(root,{recursive:true});const output=await mkdtemp(path.join(root,'teaching-scenes-'));
process.stdout.write(JSON.stringify({output,status:'running',modelCalls:0,ttsCalls:0})+'\n');
const names:Record<string,string>={paper:'\u4efb\u52a1',other:'\u8bc1\u636e',machine:'\u5904\u7406\u5668',a:'\u601d\u8003',b:'\u89c2\u5bdf',bag:'\u4e0a\u4e0b\u6587',keep:'\u4fdd\u7559',bin:'\u79fb\u51fa',left:'\u65b9\u6848\u7532',right:'\u65b9\u6848\u4e59'};
const reports=[];
try{
 for(const structure of teachingStructures.filter(s=>!only||s===only)){
  const plan=teachingExample(structure),brief={...teachingBrief,title:'\u6559\u5b66\u573a\u666f\u6f14\u793a / '+structure};
  plan.objects.forEach(o=>{o.label=names[o.id]??o.label;});plan.inputSha256=designInputHash(brief,teachingCues);
  const artifact=await freezeTeachingScene(plan,brief,teachingCues);
  const report=await renderTeachingArtifact(artifact,artifact.artifactSha256,path.join(output,structure));reports.push({structure,...report});
  await writeFile(path.join(output,'batch.json'),JSON.stringify({status:'running',accepted:false,reports},null,2));
 }
 await writeFile(path.join(output,'batch.json'),JSON.stringify({status:'preview-ready',accepted:false,blindTest:false,reports},null,2));
 process.stdout.write(JSON.stringify({output,status:'preview-ready',accepted:false,structures:reports.length})+'\n');
}catch(error){await writeFile(path.join(output,'batch.failure.json'),JSON.stringify({status:'failed',accepted:false,completed:reports.length,error:error instanceof Error?error.message:String(error)},null,2));throw error;}
