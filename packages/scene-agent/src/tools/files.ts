import {readdir,readFile,stat,writeFile} from 'node:fs/promises';
import path from 'node:path';
import {failure,text,ToolInputError,type Tool} from './types';

const MAX_WRITE_BYTES=64000; // matches the custom-scene source limit
const MAX_READ_CHARS=24000;

export const listFiles:Tool={
 readOnly:true,
 spec:{name:'list_files',description:'List files in the workspace (brief.json, cues.json, skill/, scene/). Paths are workspace-relative.',
  inputSchema:{type:'object',properties:{dir:{type:'string',description:'Directory to list, default "."'}},additionalProperties:false}},
 async run(input,{workspace}){
  const {absolute,relative}=await workspace.resolve(input.dir??'.','read');
  const out:string[]=[];
  async function walk(dir:string,prefix:string,depth:number){
   for(const entry of (await readdir(dir,{withFileTypes:true})).sort((a,b)=>a.name.localeCompare(b.name))){
    if(entry.isSymbolicLink())continue;
    const name=prefix?`${prefix}/${entry.name}`:entry.name;
    if(!prefix&&relative==='.'&&!/^(brief\.json|cues\.json|skill|scene)$/.test(entry.name))continue;
    if(entry.isDirectory()){out.push(name+'/');if(depth<3)await walk(path.join(dir,entry.name),name,depth+1);}
    else out.push(`${name} (${(await stat(path.join(dir,entry.name))).size} bytes)`);
   }
  }
  await walk(absolute,relative==='.'?'':relative,0);
  return text(out.join('\n')||'(empty)');
 },
};

export const readFileTool:Tool={
 readOnly:true,
 spec:{name:'read_file',description:'Read a workspace text file with line numbers. Use offset/limit (1-based lines) for long files.',
  inputSchema:{type:'object',properties:{path:{type:'string'},offset:{type:'integer',minimum:1},limit:{type:'integer',minimum:1,maximum:2000}},required:['path'],additionalProperties:false}},
 async run(input,{workspace}){
  const {absolute,relative}=await workspace.resolve(input.path,'read');
  let content:string;
  try{content=await readFile(absolute,'utf8');}
  catch(error){if((error as NodeJS.ErrnoException).code==='ENOENT')return failure(`file not found: ${relative}`);throw error;}
  const lines=content.split('\n');
  const start=(input.offset??1)-1,end=Math.min(lines.length,start+(input.limit??600));
  let body=lines.slice(start,end).map((line,i)=>`${String(start+i+1).padStart(5)}  ${line}`).join('\n');
  let note=end<lines.length?`\n… ${lines.length-end} more lines; continue with offset=${end+1}`:'';
  if(body.length>MAX_READ_CHARS){body=body.slice(0,MAX_READ_CHARS);note='\n… output truncated; use a smaller limit';}
  return text(`${relative} (${lines.length} lines)\n${body}${note}`);
 },
};

export const writeFileTool:Tool={
 readOnly:false,
 spec:{name:'write_file',description:'Create or replace scene/Scene.tsx with the full file content. Prefer edit_file for changes to an existing file.',
  inputSchema:{type:'object',properties:{path:{type:'string',enum:['scene/Scene.tsx']},content:{type:'string'}},required:['path','content'],additionalProperties:false}},
 async run(input,{workspace}){
  const {absolute,relative}=await workspace.resolve(input.path,'write');
  const bytes=Buffer.byteLength(input.content);
  if(bytes>MAX_WRITE_BYTES)throw new ToolInputError(`content is ${bytes} bytes; the limit is ${MAX_WRITE_BYTES}`);
  await writeFile(absolute,input.content);
  return text(`wrote ${relative} (${input.content.split('\n').length} lines, ${bytes} bytes)`);
 },
};

const indentOf=(line:string)=>/^[ \t]*/.exec(line)![0];
const significant=(text:string)=>{const lines=text.split('\n');while(lines.length&&!lines[0].trim())lines.shift();while(lines.length&&!lines.at(-1)!.trim())lines.pop();return lines;};

/** Finds `old` line by line ignoring leading/trailing whitespace; returns the start line of each match. */
export function looseMatches(content:string,old:string):number[]{
 const want=significant(old).map(l=>l.trim());
 if(!want.length)return [];
 const lines=content.split('\n').map(l=>l.trim());
 const hits:number[]=[];
 for(let i=0;i+want.length<=lines.length;i++)if(want.every((w,j)=>lines[i+j]===w))hits.push(i);
 return hits;
}

/** Points the model at the lines that look most like the start of `old`, with their exact text. */
export function closestRegion(content:string,old:string):string{
 const first=significant(old)[0]?.trim();
 if(!first)return '';
 const lines=content.split('\n');
 const probes=[first,first.slice(0,40),first.slice(0,20)].filter(p=>p.length>=8);
 for(const probe of probes){
  const at=lines.findIndex(l=>l.includes(probe));
  if(at<0)continue;
  const from=Math.max(0,at-2),to=Math.min(lines.length,at+6);
  return `\nClosest text in the file (exact, with line numbers):\n${lines.slice(from,to).map((l,i)=>`${String(from+i+1).padStart(5)}  ${l}`).join('\n')}`;
 }
 return '\nNo similar line found; the text may have been changed by an earlier edit. Use read_file on the region before editing.';
}

export const editFileTool:Tool={
 readOnly:false,
 spec:{name:'edit_file',description:'Replace a string in scene/Scene.tsx. `old` should match exactly once; if it does not, a match that differs only in indentation is accepted. Set replaceAll to replace every exact match.',
  inputSchema:{type:'object',properties:{path:{type:'string',enum:['scene/Scene.tsx']},old:{type:'string',minLength:1},new:{type:'string'},replaceAll:{type:'boolean'}},required:['path','old','new'],additionalProperties:false}},
 async run(input,{workspace}){
  const {absolute,relative}=await workspace.resolve(input.path,'write');
  let content:string;
  try{content=await readFile(absolute,'utf8');}
  catch(error){if((error as NodeJS.ErrnoException).code==='ENOENT')return failure(`${relative} does not exist yet; create it with write_file`);throw error;}
  const count=content.split(input.old).length-1;
  if(count>1&&!input.replaceAll)return failure(`old string matches ${count} times in ${relative}; add surrounding context to make it unique, or set replaceAll`);
  let next:string,where:string;
  if(count>0){
   next=input.replaceAll?content.split(input.old).join(input.new):content.replace(input.old,()=>input.new);
   where=count>1?`${count} replacements`:`1 replacement at line ${content.slice(0,content.indexOf(input.old)).split('\n').length}`;
  }else{
   // Models often get indentation wrong when copying from read_file output; accept a unique whitespace-only difference.
   const hits=looseMatches(content,input.old);
   if(hits.length!==1)return failure(`old string not found in ${relative}${hits.length>1?` (it matches ${hits.length} places when indentation is ignored; add context)`:''}.${hits.length>1?'':closestRegion(content,input.old)}`);
   const lines=content.split('\n');
   const oldLines=significant(input.old);
   const shift=indentOf(lines[hits[0]]).length-indentOf(oldLines[0]).length;
   const reindent=(line:string)=>!line.trim()?line:shift>=0?' '.repeat(shift)+line:line.slice(Math.min(-shift,indentOf(line).length));
   lines.splice(hits[0],oldLines.length,...significant(input.new).map(reindent));
   next=lines.join('\n');
   where=`1 replacement at line ${hits[0]+1} (matched ignoring indentation)`;
  }
  if(Buffer.byteLength(next)>MAX_WRITE_BYTES)throw new ToolInputError(`result would exceed ${MAX_WRITE_BYTES} bytes`);
  await writeFile(absolute,next);
  return text(`edited ${relative}: ${where}`);
 },
};
