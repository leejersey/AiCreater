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

export const editFileTool:Tool={
 readOnly:false,
 spec:{name:'edit_file',description:'Replace an exact string in scene/Scene.tsx. `old` must match exactly once (including whitespace) unless replaceAll is true.',
  inputSchema:{type:'object',properties:{path:{type:'string',enum:['scene/Scene.tsx']},old:{type:'string',minLength:1},new:{type:'string'},replaceAll:{type:'boolean'}},required:['path','old','new'],additionalProperties:false}},
 async run(input,{workspace}){
  const {absolute,relative}=await workspace.resolve(input.path,'write');
  let content:string;
  try{content=await readFile(absolute,'utf8');}
  catch(error){if((error as NodeJS.ErrnoException).code==='ENOENT')return failure(`${relative} does not exist yet; create it with write_file`);throw error;}
  const count=content.split(input.old).length-1;
  if(count===0)return failure(`old string not found in ${relative}. Re-read the file with read_file and copy the exact text, including indentation.`);
  if(count>1&&!input.replaceAll)return failure(`old string matches ${count} times in ${relative}; add surrounding context to make it unique, or set replaceAll`);
  const next=input.replaceAll?content.split(input.old).join(input.new):content.replace(input.old,()=>input.new);
  if(Buffer.byteLength(next)>MAX_WRITE_BYTES)throw new ToolInputError(`result would exceed ${MAX_WRITE_BYTES} bytes`);
  await writeFile(absolute,next);
  const line=content.slice(0,content.indexOf(input.old)).split('\n').length;
  return text(`edited ${relative}: ${count>1?`${count} replacements`:`1 replacement at line ${line}`}`);
 },
};
