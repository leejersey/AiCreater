import {readdir,readFile} from 'node:fs/promises';
import path from 'node:path';
import {failure,text,type Tool} from './types';

async function topics(skillRoot:string):Promise<string[]>{
 try{return (await readdir(skillRoot)).filter(f=>f.endsWith('.md')).map(f=>f.slice(0,-3)).sort();}
 catch{return [];}
}

/** The topics to read before the first draft, in one read_skill call (reading them two per turn cost 4 turns). */
export const FIRST_DRAFT_TOPICS=['scene-contract','motion','kit','craft','patterns','examples'];

export const readSkill:Tool={
 readOnly:true,
 spec:{name:'read_skill',description:`Read skill guides: one with topic, or several at once with topics (before the first draft: ${JSON.stringify(FIRST_DRAFT_TOPICS)}). Topic "index" lists them all.`,
  inputSchema:{type:'object',properties:{topic:{type:'string',pattern:'^[a-z0-9-]+$'},
   topics:{type:'array',items:{type:'string',pattern:'^[a-z0-9-]+$'},minItems:1,maxItems:10}},additionalProperties:false}},
 async run(input,{workspace}){
  const {absolute:skillRoot}=await workspace.resolve('skill','read');
  const available=await topics(skillRoot);
  const wanted:string[]=[...new Set([...(input.topic?[input.topic]:[]),...(input.topics??[])])];
  if(!wanted.length)return failure(`give topic or topics. Available: ${available.join(', ')||'(none)'}`);
  const unknown=wanted.filter(t=>!available.includes(t));
  if(unknown.length)return failure(`unknown topic ${unknown.map(t=>`"${t}"`).join(', ')}. Available: ${available.join(', ')||'(none)'}`);
  const docs=await Promise.all(wanted.map(t=>readFile(path.join(skillRoot,t+'.md'),'utf8')));
  return text(wanted.length===1?docs[0]:docs.map((d,i)=>`<<< skill: ${wanted[i]} >>>\n${d.trim()}`).join('\n\n'));
 },
};

export const getTiming:Tool={
 readOnly:true,
 spec:{name:'get_timing',description:'Return the scene duration, fps, narration and the measured narration cues (frame ranges) the visuals must follow.',
  inputSchema:{type:'object',properties:{},additionalProperties:false}},
 async run(_input,{workspace}){
  const {brief,cues}=workspace;
  const lines=[`duration: ${brief.durationInFrames} frames at ${brief.fps} fps (${(brief.durationInFrames/brief.fps).toFixed(2)}s); canvas ${brief.width}×${brief.height}`,`title: ${brief.title}`];
  if(cues.length){
   lines.push('cues (startFrame–endFrame, end exclusive). In the scene they are timing.cues[i] = {start, end}: time every change from those, never from these numbers, because a new voice-over moves them:');
   cues.forEach((cue,i)=>lines.push(`- timing.cues[${i}] (${cue.id}) ${cue.startFrame}–${cue.endFrame} (${((cue.endFrame-cue.startFrame)/brief.fps).toFixed(1)}s): ${cue.text}`));
  }else lines.push('cues: none measured; pace the visuals evenly across the narration','narration: '+brief.narration);
  return text(lines.join('\n'));
 },
};
