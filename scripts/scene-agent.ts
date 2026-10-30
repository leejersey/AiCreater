// npm run scene-agent -- run <brief.json> --model=<name> --confirm-paid [--cues=cues.json] [--initial=Scene.tsx] [--out=dir] [--max-turns=n]
// Calls a paid model API. Without --confirm-paid it only prepares the workspace and prints the plan.
import {readFile} from 'node:fs/promises';
import path from 'node:path';
import {repositoryRoot} from '../packages/custom-scenes/src/files';
import {runLoop} from '../packages/scene-agent/src/loop';
import {createProvider,loadModels} from '../packages/scene-agent/src/provider/registry';
import {RemotionStillRenderer} from '../packages/scene-agent/src/render/stills';
import {createWorkspace} from '../packages/scene-agent/src/workspace';

const USAGE='Usage: npm run scene-agent -- run <brief.json> --model=<name> [--confirm-paid] [--cues=cues.json] [--initial=Scene.tsx] [--out=dir] [--max-turns=n]';

function parseArgs(argv:string[]){
 const [command,brief,...rest]=argv;
 if(command!=='run'||!brief)throw Error(USAGE);
 const flags:Record<string,string|true>={};
 for(const arg of rest){
  const match=/^--([a-z-]+)(?:=(.+))?$/.exec(arg);
  if(!match||!['model','confirm-paid','cues','initial','out','max-turns'].includes(match[1]))throw Error(`unknown argument ${arg}\n${USAGE}`);
  flags[match[1]]=match[2]??true;
 }
 if(typeof flags.model!=='string')throw Error(`--model is required\n${USAGE}`);
 return{brief,flags,model:flags.model};
}

async function main(){
 const {brief:briefFile,flags,model}=parseArgs(process.argv.slice(2));
 const models=loadModels();
 const entry=models[model];
 if(!entry)throw Error(`unknown model "${model}"; configured: ${Object.keys(models).join(', ')}`);
 const maxTurns=flags['max-turns']===undefined?entry.budget.maxTurns:Number(flags['max-turns']);
 if(!Number.isInteger(maxTurns)||maxTurns<1||maxTurns>entry.budget.maxTurns)throw Error(`--max-turns must be 1..${entry.budget.maxTurns} (models.json budget)`);
 const budget={...entry.budget,maxTurns};

 const brief=JSON.parse(await readFile(briefFile,'utf8'));
 const cues=typeof flags.cues==='string'?JSON.parse(await readFile(flags.cues,'utf8')):undefined;
 const initialSource=typeof flags.initial==='string'?await readFile(flags.initial,'utf8'):undefined;
 const out=typeof flags.out==='string'?path.resolve(flags.out):path.join(repositoryRoot,'output/scene-agent',`${brief.id}-${model}-${new Date().toISOString().replace(/[:.]/g,'-')}`);

 console.log(`model ${model} (${entry.model}), budget ${budget.maxTurns} turns / ${budget.maxOutputTokensTotal} output tokens`);
 if(flags['confirm-paid']!==true){
  console.log('Dry run: no model call. Re-run with --confirm-paid to call the provider API (this costs money).');
  return;
 }
 const provider=createProvider(model,models); // fails fast on a missing key, before creating the workspace
 const workspace=await createWorkspace(out,{brief,cues,skillDir:path.join(repositoryRoot,'packages/scene-agent/skill'),initialSource});
 console.log(`workspace ${workspace.root}`);
 const renderer=new RemotionStillRenderer(workspace.brief);
 const controller=new AbortController();
 const stop=()=>controller.abort();
 process.once('SIGINT',stop);process.once('SIGTERM',stop);
 try{
  const result=await runLoop({provider,workspace,renderer,budget,signal:controller.signal,
   onTurn:e=>console.log(`turn ${e.turn}: ${e.stop} ${e.toolCalls.join(', ')||'(no tools)'} · in ${e.usage.inputTokens} (cached ${e.usage.cachedInputTokens}) out ${e.usage.outputTokens}`)});
  console.log(JSON.stringify({status:result.status,reason:result.reason,turns:result.turns,usage:result.usage,result:path.join(workspace.root,'result.json')},null,2));
  if(result.status!=='passed')process.exitCode=2;
 }finally{
  process.off('SIGINT',stop);process.off('SIGTERM',stop);
  await renderer.close();
 }
}
main().catch(error=>{console.error(error instanceof Error?error.message:String(error));process.exitCode=1;});
