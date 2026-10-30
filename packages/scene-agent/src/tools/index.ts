// Tool registry and the single entry point that turns a model tool call into a tool result.
import Ajv,{type ValidateFunction} from 'ajv';
import type {Capabilities,ContentPart,ToolCall,ToolSpec} from '../provider/types';
import {WorkspaceError} from '../workspace';
import {auditScene,renderStills,typecheck,viewFrames} from './checks';
import {editFileTool,listFiles,readFileTool,writeFileTool} from './files';
import {getTiming,readSkill} from './knowledge';
import {failure,ToolInputError,type Tool,type ToolContext,type ToolOutput} from './types';

const MAX_TEXT=4000;
const UNBOUNDED=new Set(['read_file','read_skill']); // these already page or are bounded by the skill author

export function buildTools(capabilities:Capabilities):Tool[]{
 return [listFiles,readFileTool,writeFileTool,editFileTool,readSkill,getTiming,typecheck,renderStills,auditScene,...(capabilities.vision?[viewFrames]:[])];
}
export const toolSpecs=(tools:Tool[]):ToolSpec[]=>tools.map(t=>t.spec);

const ajv=new Ajv({allErrors:true,strict:false});
const validators=new WeakMap<Tool,ValidateFunction>();
function validator(tool:Tool){
 let fn=validators.get(tool);
 if(!fn){fn=ajv.compile(tool.spec.inputSchema);validators.set(tool,fn);}
 return fn;
}

function bound(output:ToolOutput,name:string):ToolOutput{
 if(UNBOUNDED.has(name))return output;
 return{...output,content:output.content.map((p):ContentPart=>p.type==='text'&&p.text.length>MAX_TEXT?{type:'text',text:p.text.slice(0,MAX_TEXT)+'\n… output truncated'}:p)};
}

/** Never throws for model mistakes: bad arguments, unknown tools and tool errors become error results. */
export async function executeTool(tools:Tool[],call:ToolCall,context:ToolContext):Promise<ToolOutput>{
 const tool=tools.find(t=>t.spec.name===call.name);
 if(!tool)return failure(`unknown tool "${call.name}". Available: ${tools.map(t=>t.spec.name).join(', ')}`);
 if(call.parseError)return failure(`${call.parseError}. Send the arguments again as one valid JSON object; for large changes prefer several edit_file calls.`);
 const validate=validator(tool);
 if(!validate(call.arguments)){
  const problems=(validate.errors??[]).map(e=>`${e.instancePath||'(root)'} ${e.message}${e.params&&'additionalProperty' in e.params?`: ${e.params.additionalProperty}`:''}`);
  return failure(`invalid arguments for ${call.name}: ${problems.join('; ')}`);
 }
 try{return bound(await tool.run(call.arguments,context),call.name);}
 catch(error){
  if(error instanceof ToolInputError||error instanceof WorkspaceError)return failure(error.message);
  return failure(`${call.name} failed: ${error instanceof Error?error.message.slice(0,1000):String(error)}`);
 }
}
