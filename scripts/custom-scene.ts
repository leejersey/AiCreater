import {readFile} from 'node:fs/promises';
import {parseBrief,parseArtifact,sourceHash,buildPrompt,generateArtifact} from '../packages/custom-scenes/src/contract';
import {readJson,readArtifact,publishText,typecheckSource,ensureOutputAbsent,saveGeneratedCandidate} from '../packages/custom-scenes/src/files';

async function main(){
  const [command,...args]=process.argv.slice(2);
  if(command==='prepare'&&args.length===2){
    await publishText(args[1],buildPrompt(parseBrief(await readJson(args[0]))));return;
  }
  if(command==='pack'&&args.length===3){
    const artifact=parseArtifact({schemaVersion:'custom-scene:1',brief:parseBrief(await readJson(args[0])),rationale:'由外部 Agent 提供的定制场景，执行前需要人工视觉审核。',source:await readFile(args[1],'utf8')});
    await typecheckSource(artifact.source);await publishText(args[2],JSON.stringify(artifact,null,2)+'\n');
    console.log(JSON.stringify({artifact:args[2],sha256:sourceHash(artifact)},null,2));return;
  }
  if(command==='check'&&args.length===1){
    const artifact=await readArtifact(args[0]);await typecheckSource(artifact.source);
    console.log(JSON.stringify({id:artifact.brief.id,sha256:sourceHash(artifact),technical:'passed',visual:'pending',trust:'Local reviewed source only; not a sandbox'},null,2));return;
  }
  if(command==='revise'&&args.length===3){
    const artifact=await readArtifact(args[0]);const feedback=await readFile(args[1],'utf8');
    if(!feedback.trim()||feedback.length>8000)throw Error('custom_scene: feedback must be 1–8000 characters');
    await publishText(args[2],buildPrompt(artifact.brief,artifact,feedback));return;
  }
  if(command==='generate'&&(args.length===2||(args.length===3&&args[2]==='--confirm-cost'))){
    await ensureOutputAbsent(args[1]);
    await ensureOutputAbsent(args[1]+'.check.json');
    const artifact=await generateArtifact(parseBrief(await readJson(args[0])),{apiKey:process.env.DEEPSEEK_API_KEY,model:process.env.DEEPSEEK_MODEL,confirmCost:args[2]==='--confirm-cost'});
    await saveGeneratedCandidate(artifact,args[1]);
    console.log(JSON.stringify({artifact:args[1],sha256:sourceHash(artifact),visual:'pending'},null,2));return;
  }
  throw Error('Usage: custom:scene prepare brief.json prompt.txt | pack brief.json Scene.tsx artifact.json | check artifact.json | revise artifact.json feedback.txt revision.txt | generate brief.json artifact.json --confirm-cost');
}
main().catch(error=>{console.error(error instanceof Error?error.message:String(error));process.exitCode=1;});
