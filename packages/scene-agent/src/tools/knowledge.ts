import {readdir,readFile} from 'node:fs/promises';
import path from 'node:path';
import {failure,text,type Tool} from './types';

async function topics(skillRoot:string):Promise<string[]>{
 try{return (await readdir(skillRoot)).filter(f=>f.endsWith('.md')).map(f=>f.slice(0,-3)).sort();}
 catch{return [];}
}

export const readSkill:Tool={
 readOnly:true,
 spec:{name:'read_skill',description:'Read a skill guide by topic (method, scene contract, anti-patterns, components, theme). Call with topic "index" to list topics.',
  inputSchema:{type:'object',properties:{topic:{type:'string',pattern:'^[a-z0-9-]+$'}},required:['topic'],additionalProperties:false}},
 async run(input,{workspace}){
  const {absolute:skillRoot}=await workspace.resolve('skill','read');
  const available=await topics(skillRoot);
  if(!available.includes(input.topic))return failure(`unknown topic "${input.topic}". Available: ${available.join(', ')||'(none)'}`);
  return text(await readFile(path.join(skillRoot,input.topic+'.md'),'utf8'));
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
   lines.push('cues (startFrame–endFrame, end exclusive):');
   for(const cue of cues)lines.push(`- ${cue.id} ${cue.startFrame}–${cue.endFrame} (${((cue.endFrame-cue.startFrame)/brief.fps).toFixed(1)}s): ${cue.text}`);
  }else lines.push('cues: none measured; pace the visuals evenly across the narration','narration: '+brief.narration);
  return text(lines.join('\n'));
 },
};
