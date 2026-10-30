// The agent loop: one provider, one workspace, bounded by turns and output tokens.
import {appendFile,readFile,writeFile} from 'node:fs/promises';
import path from 'node:path';
import {ProviderError,type Message,type Provider,type ToolCall,type ToolMessage,type Usage} from './provider/types';
import type {Budget} from './provider/registry';
import type {StillRenderer} from './render/stills';
import {sourceSha256} from './render/stills';
import {initialMessage,systemPrompt} from './prompt';
import {finishTool,type FinishRecord} from './tools/finish';
import {buildTools,executeTool,toolSpecs} from './tools/index';
import type {Tool,ToolContext} from './tools/types';
import {SCENE_FILE,type Workspace} from './workspace';
import {runGates} from './gates';

export type StopReason='budget_turns'|'budget_tokens'|'stalled'|'no_finish'|'max_tokens'|'refusal'|'provider_auth'|'provider_unavailable'|'aborted';
export type RunResult={
 status:'passed'|'stopped'|'failed';
 reason?:StopReason|string;
 model:string;
 turns:number;
 usage:Usage;
 sceneSha256?:string;
 finish?:FinishRecord;
 cleanCheckpoint?:{sourceSha256:string;file:string}; // last gate-clean version seen, if the run did not pass
};

export type LoopOptions={
 provider:Provider;
 workspace:Workspace;
 renderer:StillRenderer;
 budget:Budget;
 signal?:AbortSignal;
 onTurn?:(event:{turn:number;stop:string;toolCalls:string[];usage:Usage})=>void;
};

// Stop when the scene file has not changed for this many turns after it was first written.
const STALL_TURNS=6;
const FALLBACK_REASONS=new Set(['budget_turns','budget_tokens','stalled','no_finish','max_tokens']);
const CLEAN_STREAK_NUDGE=2;
const NUDGE_LIMIT=2;

export async function runLoop(options:LoopOptions):Promise<RunResult>{
 const {provider,workspace,renderer,budget,signal}=options;
 const transcript=path.join(workspace.root,'transcript.jsonl');
 await writeFile(transcript,'');
 const log=(entry:unknown)=>appendFile(transcript,JSON.stringify(entry)+'\n');
 let finished:FinishRecord|undefined;
 const context:ToolContext={workspace,renderer,capabilities:provider.capabilities};
 const tools:Tool[]=[...buildTools(provider.capabilities),finishTool(record=>{finished=record;})];
 const specs=toolSpecs(tools);
 const system=systemPrompt(provider.capabilities);
 const messages:Message[]=[{role:'user',content:[{type:'text',text:initialMessage(workspace.brief)}]}];
 const usage:Usage={inputTokens:0,outputTokens:0,cachedInputTokens:0};
 let turns=0,nudges=0,truncations=0,unchangedTurns=0,cleanStreak=0;
 let lastScene:string|undefined=await sceneHash(workspace);

 const result=async(status:RunResult['status'],reason?:RunResult['reason']):Promise<RunResult>=>{
  if(status==='stopped'&&!finished&&context.cleanCheckpoint&&FALLBACK_REASONS.has(String(reason))){
   // The model reached a gate-clean version but never signed it off. Gates are objective, so re-check that version
   // as it stands on disk and accept it, marked as a harness decision with no self-review.
   const latest=await workspace.readScene();
   await writeFile(path.join(workspace.root,SCENE_FILE),await readFile(context.cleanCheckpoint.file,'utf8'));
   const gates=await runGates(context);
   await log({type:'checkpoint_fallback',reason,checkpoint:context.cleanCheckpoint.sourceSha256,passed:gates.passed});
   if(gates.passed){
    finished={by:'harness',summary:`Harness fallback after "${reason}": the model did not call finish; its last gate-clean version was re-checked and accepted.`,selfReview:[],gates};
    status='passed';reason='checkpoint';
   }else if(latest!==undefined)await writeFile(path.join(workspace.root,SCENE_FILE),latest);
  }
  const value:RunResult={status,...(reason?{reason}:{}),model:provider.name,turns,usage,sceneSha256:await sceneHash(workspace),...(finished?{finish:finished}:{}),...(!finished&&context.cleanCheckpoint?{cleanCheckpoint:context.cleanCheckpoint}:{})};
  await writeFile(path.join(workspace.root,'result.json'),JSON.stringify(value,null,2)+'\n');
  await log({type:'result',...value});
  return value;
 };

 await log({type:'start',model:provider.name,capabilities:provider.capabilities,budget,system,tools:specs.map(s=>s.name),message:messages[0]});
 while(true){
  if(signal?.aborted)return result('stopped','aborted');
  if(turns>=budget.maxTurns)return result('stopped','budget_turns');
  if(usage.outputTokens>=budget.maxOutputTokensTotal)return result('stopped','budget_tokens');
  turns++;
  let turn;
  try{turn=await provider.turn({system,messages,tools:specs,signal});}
  catch(error){
   await log({type:'provider_error',turn:turns,error:error instanceof Error?{name:error.name,message:error.message,...(error instanceof ProviderError?{code:error.code,status:error.status}:{})}:String(error)});
   if(error instanceof ProviderError){
    if(error.code==='auth')return result('stopped','provider_auth');
    if(error.code==='unavailable')return result('stopped','provider_unavailable');
    if(error.code==='aborted')return result('stopped','aborted');
    return result('failed',`provider_${error.code}: ${error.message}`);
   }
   return result('failed',`internal: ${error instanceof Error?error.message:String(error)}`);
  }
  for(const key of ['inputTokens','outputTokens','cachedInputTokens'] as const)usage[key]+=turn.usage[key];
  messages.push(turn.message);
  options.onTurn?.({turn:turns,stop:turn.stop,toolCalls:turn.message.toolCalls.map(c=>c.name),usage:turn.usage});
  await log({type:'turn',turn:turns,stop:turn.stop,usage:turn.usage,message:turn.message,raw:turn.raw});
  if(turn.stop==='refusal')return result('stopped','refusal');

  // Two truncated turns in a row means the model keeps trying to emit more than fits; stop instead of burning budget.
  if(turn.stop==='max_tokens'){if(++truncations>=2)return result('stopped','max_tokens');}
  else truncations=0;

  if(!turn.message.toolCalls.length){
   if(turn.stop!=='max_tokens'&&++nudges>NUDGE_LIMIT)return result('stopped','no_finish');
   const reminder=turn.stop==='max_tokens'
    ?'Your reply was cut off by the output limit. Make smaller changes with edit_file instead of rewriting the whole file.'
    :'Continue with tool calls. When the scene is done and the checks are clean, call finish.';
   messages.push({role:'user',content:[{type:'text',text:reminder}]});
   await log({type:'nudge',turn:turns,text:reminder});
   continue;
  }
  nudges=0;

  const results=await runCalls(tools,turn.message.toolCalls,context);
  for(const message of results)messages.push(message);
  await log({type:'tool_results',turn:turns,results:results.map(r=>({...r,content:r.content.map(p=>p.type==='image'?{type:'image',mediaType:p.mediaType,bytes:p.data.length}:p)}))});
  if(finished)return result('passed');

  const scene=await sceneHash(workspace);
  // Every change gets feedback in the same turn: models skip checks on their own and then edit blind.
  if(scene&&scene!==lastScene&&context.lastRender?.sourceSha256!==scene){
   const check=await executeTool(tools,{id:`auto-check-${turns}`,name:'render_stills',arguments:{}},context);
   const report=check.content.map(p=>p.type==='text'?p.text:'').join('\n');
   const message:Message={role:'user',content:[{type:'text',text:`Automatic check of your changes (render_stills):\n${report}`}]};
   messages.push(message);
   await log({type:'auto_check',turn:turns,isError:!!check.isError,text:report});
  }
  if(scene&&scene===lastScene){if(++unchangedTurns>=STALL_TURNS)return result('stopped','stalled');}
  else unchangedTurns=0;
  lastScene=scene;

  // Models keep polishing optional findings long after the scene is clean, then run out of turns.
  if(scene&&context.cleanCheckpoint?.sourceSha256===scene){
   if(++cleanStreak>=CLEAN_STREAK_NUDGE){
    const push=`The scene has passed the final gates on ${cleanStreak} checks in a row. Call finish in your next reply with your self-review; no further changes are needed.`;
    messages.push({role:'user',content:[{type:'text',text:push}]});
    await log({type:'nudge',turn:turns,text:push});
   }
  }else cleanStreak=0;

  const left=budget.maxTurns-turns;
  if(left===2){
   const warning='2 turns left. Fix any remaining [high] findings and call finish.';
   messages.push({role:'user',content:[{type:'text',text:warning}]});
   await log({type:'nudge',turn:turns,text:warning});
  }
 }
}

/** Consecutive read-only calls run in parallel; anything that writes or renders runs alone, in order. */
async function runCalls(tools:Tool[],calls:ToolCall[],context:ToolContext):Promise<ToolMessage[]>{
 const out:ToolMessage[]=[];
 let batch:ToolCall[]=[];
 const isReadOnly=(call:ToolCall)=>tools.find(t=>t.spec.name===call.name)?.readOnly??true;
 const flush=async()=>{
  const outputs=await Promise.all(batch.map(call=>executeTool(tools,call,context)));
  batch.forEach((call,i)=>out.push({role:'tool',toolCallId:call.id,content:outputs[i].content,...(outputs[i].isError?{isError:true}:{})}));
  batch=[];
 };
 for(const call of calls){
  if(isReadOnly(call)){batch.push(call);continue;}
  await flush();
  const output=await executeTool(tools,call,context);
  out.push({role:'tool',toolCallId:call.id,content:output.content,...(output.isError?{isError:true}:{})});
 }
 await flush();
 return out;
}

async function sceneHash(workspace:Workspace){
 const source=await workspace.readScene();
 return source===undefined?undefined:sourceSha256(source);
}
