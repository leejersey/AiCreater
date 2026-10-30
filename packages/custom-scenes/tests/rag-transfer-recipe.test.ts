import test from 'node:test';
import assert from 'node:assert/strict';
import {buildRagTransferDesign} from '../src/rag-transfer-recipe';
import {bindTransferComponents} from '../src/transfer-component-rig';
import {evaluateMotion} from '../src/motion-plan';
import {prepareAutomaticTransferCandidate,verifyTransferCandidate} from '../src/transfer-candidate';
import {mkdtemp,readFile,writeFile,realpath,rm} from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import {spawnSync} from 'node:child_process';
import {repositoryRoot} from '../src/files';
import {parseVisualJobs} from '../../../apps/web/lib/visual-workbench';

export function ragInput(){
 const texts=['让我们详细看一下RAG的工作流程。','整个过程可以分为三个主要步骤：检索、增强和生成。',
  '首先，用户输入一个问题，系统使用检索器从文档库中找到最相关的文档片段。',
  '然后，这些片段被增强到提示中，形成一个新的提示，包含原始问题和检索到的上下文。',
  '最后，生成器（通常是一个大语言模型）基于这个增强的提示生成最终答案。','这三个步骤环环相扣，缺一不可。'];
 const windows=[[6,83],[94,230],[243,424],[447,664],[673,842],[852,932]];
 const cues=texts.map((text,i)=>({id:'cue-'+(i+1),text,startFrame:windows[i][0],endFrame:windows[i][1]}));
 return {preset:'rag-augmentation:1' as const,brief:{schemaVersion:'custom-scene-brief:1',id:'rag-recipe',title:'RAG的工作流程',narration:texts.join(''),visualGoal:'演示增强提示',facts:texts,materials:[],width:1920,height:1080,fps:30,durationInFrames:938},cues};
}
test('RAG host recipe preserves measured narration and puts all individual transports inside augmentation',()=>{
 const input=ragInput(),before=JSON.stringify(input),result=buildRagTransferDesign(input);
 assert.deepEqual(result.design.brief,input.brief);assert.deepEqual(result.design.cues,input.cues);assert.equal(JSON.stringify(input),before);
 assert.equal(result.roles.motionCues!.length,4);
 for(const c of result.roles.motionCues!){assert.equal(c.sourceCueId,'cue-4');assert.ok(c.startFrame>=447&&c.endFrame<=664);}
 assert.equal(result.roles.stages.feed,'cue-5');assert.deepEqual(buildRagTransferDesign(input),result);
 const binding=bindTransferComponents(result.design,result.roles),retrieval=evaluateMotion(binding.assembly.plan,424),final=evaluateMotion(binding.assembly.plan,841);
 assert.equal(retrieval['rag-fragment-a'].x,500);assert.equal(retrieval['rag-fragment-b'].x,616);
 assert.equal(final['rag-prompt'].x,1550);assert.equal(binding.accepted,false);
 assert.deepEqual(evaluateMotion(binding.assembly.plan,664)['rag-head'],evaluateMotion(binding.assembly.plan,672)['rag-head']);
 assert.equal(evaluateMotion(binding.assembly.plan,664)['rag-head'].x,482);
 const gap=ragInput();gap.cues[4].startFrame=720;
 const longer=buildRagTransferDesign(gap),longBinding=bindTransferComponents(longer.design,longer.roles);
 assert.deepEqual(evaluateMotion(longBinding.assembly.plan,664)['rag-head'],evaluateMotion(longBinding.assembly.plan,719)['rag-head']);
 assert.deepEqual(result.origin.limitations,['retrieval-static','answer-not-animated','visual-unreviewed']);
});
test('recipe does not guess unsupported, ambiguous or too short phase timings',()=>{
 const wrong=ragInput();wrong.preset='anything' as any;assert.throws(()=>buildRagTransferDesign(wrong),/preset/);
 const short=ragInput();short.cues[3].endFrame=470;assert.throws(()=>buildRagTransferDesign(short),/augmentation window/);
 const unrelated=ragInput();unrelated.cues[3].text='然后，我们解释另一种系统。';unrelated.brief.narration=unrelated.cues.map(c=>c.text).join('');assert.throws(()=>buildRagTransferDesign(unrelated),/phase/);
});
test('automatic candidate records recipe provenance and rejects an altered origin',async()=>{
 const root=await mkdtemp(path.join(os.tmpdir(),'rag-auto-'));
 try{
  const directory=path.join(root,'candidate'),result=await prepareAutomaticTransferCandidate(ragInput(),directory),actual=await realpath(directory);
  assert.equal(result.preset,'rag-augmentation:1');assert.equal(result.requests_dispatched,0);assert.equal(result.execution,'not_run');
  assert.equal((await verifyTransferCandidate(actual)).origin_sha256,result.origin_sha256);
  const jobFile=path.join(root,'job.json');await writeFile(jobFile,JSON.stringify({id:'j',project_id:'p',scene_id:'s',kind:'prepare-transfer',state:'succeeded',stage:'done',error:null,input:ragInput()}));
  const code='import json,sys;from pathlib import Path;from services.visual.worker import publishable_result;from services.visual.store import VisualJobs;j=json.loads(Path(sys.argv[2]).read_text());r=publishable_result(j,Path(sys.argv[1]));print(json.dumps({"jobs":[VisualJobs._public({**j,"result":r})]}))';
  const child=spawnSync(path.join(repositoryRoot,'.venv/bin/python'),['-c',code,actual,jobFile],{cwd:repositoryRoot,env:{PATH:path.dirname(process.execPath)+':'+process.env.PATH,HOME:process.env.HOME,NODE_ENV:'test'},encoding:'utf8',timeout:30000});
  assert.ifError(child.error);assert.equal(child.status,0,child.stderr);
  const [job]=parseVisualJobs(JSON.parse(child.stdout),'p');assert.equal(job.result?.origin_sha256,result.origin_sha256);assert.equal(job.result?.preset,'rag-augmentation:1');
  const origin=JSON.parse(await readFile(path.join(actual,'origin.json'),'utf8'));origin.phases.retrieval='cue-1';
  await writeFile(path.join(actual,'origin.json'),JSON.stringify(origin));
  await assert.rejects(verifyTransferCandidate(actual),/recipe origin mismatch/);
 }finally{await rm(root,{recursive:true,force:true});}
});
test('motion subwindows cannot leave measured cues, overlap or silently add unreferenced operations',()=>{
 const built=buildRagTransferDesign(ragInput());
 for(const mutate of [(r:typeof built.roles)=>r.motionCues[0].startFrame=446,(r:typeof built.roles)=>r.motionCues[1].startFrame=448,
  (r:typeof built.roles)=>r.motionCues[0].sourceCueId='unknown',(r:typeof built.roles)=>r.motionCues[0].id='unreferenced',
  (r:typeof built.roles)=>r.stages.transfers[1].retreatEndFrame=665]){
  const roles=structuredClone(built.roles);mutate(roles);assert.throws(()=>bindTransferComponents(built.design,roles));
 }
});
