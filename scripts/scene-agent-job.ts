// Worker entry for a visual job of kind "agent": tsx scripts/scene-agent-job.ts <input.json> <new output dir>
// Input: {brief, cues, scene, audio_file, model, max_turns}. Runs the scene-agent loop in <out>/workspace and,
// if the scene passes the gates, renders the voiced chapter video. Calls a paid model API; the worker only
// launches this for a job the user confirmed with a turn limit.
import {copyFile,mkdir,readdir,readFile,writeFile} from 'node:fs/promises';
import path from 'node:path';
import {parseBrief} from '../packages/custom-scenes/src/contract';
import {parseCues} from '../packages/custom-scenes/src/cues';
import {repositoryRoot} from '../packages/custom-scenes/src/files';
import {runLoop} from '../packages/scene-agent/src/loop';
import {createProvider,loadModels} from '../packages/scene-agent/src/provider/registry';
import {ProviderError} from '../packages/scene-agent/src/provider/types';
import {defaultFrames} from '../packages/scene-agent/src/tools/checks';
import {RemotionStillRenderer,sourceSha256} from '../packages/scene-agent/src/render/stills';
import {agentChapter,renderAgentVideo} from '../packages/scene-agent/src/render/video';
import {createWorkspace} from '../packages/scene-agent/src/workspace';

async function main(){
 const [inputFile,outArg]=process.argv.slice(2);
 if(!inputFile||!outArg)throw Error('Usage: scene-agent-job <input.json> <new output dir>');
 const input=JSON.parse(await readFile(inputFile,'utf8'));
 const out=path.resolve(outArg);
 await mkdir(out); // a new directory per attempt; never reuse another job's output
 const brief=parseBrief(input.brief),cues=parseCues(input.cues,brief);
 const models=loadModels(),entry=models[input.model];
 if(!entry)throw Error(`unknown model ${input.model}`);
 if(!Number.isInteger(input.max_turns)||input.max_turns<1||input.max_turns>entry.budget.maxTurns)throw Error('invalid turn limit');
 // Fail before any model call if the measured audio and captions cannot make a video.
 agentChapter({source:'',brief,cues,scene:input.scene,audioFile:input.audio_file});
 let provider;
 try{provider=createProvider(input.model,models);}
 catch(error){
  // No usable key: report it like a rejected key, with nothing spent.
  if(!(error instanceof ProviderError))throw error;
  await writeFile(path.join(out,'result.json'),JSON.stringify({status:'stopped',reason:'provider_auth',model:input.model,turns:0,usage:{inputTokens:0,outputTokens:0,cachedInputTokens:0},requests_dispatched:0},null,2));
  console.log(JSON.stringify({status:'stopped',reason:'provider_auth',turns:0}));
  return;
 }
 const workspace=await createWorkspace(path.join(out,'workspace'),{brief,cues,skillDir:path.join(repositoryRoot,'packages/scene-agent/skill')});
 const renderer=new RemotionStillRenderer(workspace.brief);
 let run;
 try{run=await runLoop({provider,workspace,renderer,budget:{...entry.budget,maxTurns:input.max_turns}});}
 finally{await renderer.close();}
 const result:Record<string,unknown>={status:run.status,...(run.reason?{reason:run.reason}:{}),model:input.model,turns:run.turns,usage:run.usage,requests_dispatched:run.turns};
 if(run.status==='passed'&&run.finish){
  const source=await readFile(path.join(workspace.root,'scene/Scene.tsx'),'utf8');
  if(sourceSha256(source)!==run.finish.gates.sourceSha256)throw Error('gated source changed before publishing');
  await writeFile(path.join(out,'source.txt'),source);
  // Publish the stills the gates judged, under the public frame naming.
  const frames:string[]=[];
  await mkdir(path.join(out,'stills'));
  const stills=path.join(workspace.stillsDir,run.finish.gates.sourceSha256!.slice(0,12));
  // Exactly the sample the gates judged, in frame order; extra frames the model rendered are not review evidence.
  const available=new Set((await readdir(stills)).filter(n=>/^frame-\d+\.png$/.test(n)));
  for(const frame of defaultFrames(brief.durationInFrames,cues)){
   const name=`frame-${String(frame).padStart(4,'0')}.png`;
   if(!available.has(name))throw Error(`gated frame ${frame} is missing`);
   await copyFile(path.join(stills,name),path.join(out,'stills',`frame-${frame}.png`));
   frames.push(`stills/frame-${frame}.png`);
  }
  Object.assign(result,{sha256:run.finish.gates.sourceSha256,finish_by:run.finish.by,frames},await renderAgentVideo({source,brief,cues,scene:input.scene,audioFile:input.audio_file},out));
 }
 await writeFile(path.join(out,'result.json'),JSON.stringify(result,null,2));
 console.log(JSON.stringify({status:run.status,reason:run.reason,turns:run.turns}));
}
main().catch(error=>{console.error(error instanceof Error?error.message:String(error));process.exitCode=1;});
