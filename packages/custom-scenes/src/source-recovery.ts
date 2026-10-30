import {createHash} from 'node:crypto';
import Ajv from 'ajv';
import {buildArtifactOutputSchema,parseArtifact,sourceHash} from './contract';
import {parseDesign,designHash} from './design';
import {assertDesignLayout} from './design-layout';

const knownSuffix='</\uFF5C\uFF5CDSML\uFF5C\uFF5C parameter>\n</\uFF5C\uFF5CDSML\uFF5C\uFF5C invoke>\n</\uFF5C\uFF5CDSML\uFF5C\uFF5C calls>';
const hash=(value:string)=>createHash('sha256').update(value).digest('hex');

function objectEnd(content:string):number{
 const start=content.search(/\S/);
 if(start<0||content[start]!=='{')throw Error('source_recovery: expected leading JSON object');
 const stack:string[]=[];let quoted=false,escaped=false;
 // Find a structural boundary only; JSON.parse still validates the complete prefix.
 for(let i=start;i<content.length;i++){
  const c=content[i];
  if(quoted){if(escaped)escaped=false;else if(c==='\\')escaped=true;else if(c==='"')quoted=false;continue;}
  if(c==='"'){quoted=true;continue;}
  if(c==='{'||c==='[')stack.push(c);
  else if(c==='}'||c===']'){
   if(stack.pop()!==(c==='}'?'{':'['))throw Error('source_recovery: malformed JSON boundary');
   if(!stack.length)return i+1;
  }
 }
 throw Error('source_recovery: incomplete JSON object');
}

function extractFencedArtifact(row:Record<string,unknown>,content:string,brief:ReturnType<typeof parseDesign>['brief']){
 const protocol=row.protocol as Record<string,unknown>|undefined;
 if(!protocol||typeof protocol!=='object'||Array.isArray(protocol)||protocol.endpoint!=='responses'||protocol.schemaName!=='scene_artifact_v1'||protocol.status!=='completed')throw Error('source_recovery: expected leading JSON object');
 const normalized=content.replace(/\r\n/g,'\n');
 if(/DSML/.test(normalized))throw Error('source_recovery: protocol markup inside fenced response');
 const match=/^\s*([^\n`]+)\n\n```tsx\n([\s\S]+?)\n```\s*$/.exec(normalized);
 if(!match||match[2].includes('```'))throw Error('source_recovery: expected single complete tsx fence');
 const suffixIndex=content.lastIndexOf('```');
 return {
  raw:{schemaVersion:'custom-scene:1',brief,rationale:match[1].trim(),source:match[2]},
  end:suffixIndex,
  removedSuffix:content.slice(suffixIndex),
 };
}

/** Read-only evidence proposal. Never called by the production success parser. */
export function proposeSourceRecovery(response:unknown,designValue:unknown){
 if(!response||typeof response!=='object'||Array.isArray(response))throw Error('source_recovery: invalid response record');
 const row=response as Record<string,unknown>,content=row.content;
 if(row.finishReason!=='stop'||(row.truncated!==undefined&&row.truncated!==false)||typeof content!=='string'||!content.trim()||Buffer.byteLength(content)>128*1024)throw Error('source_recovery: complete bounded response required');
 const design=parseDesign(designValue);assertDesignLayout(design);
 const first=content.search(/\S/);
 let raw:unknown,end:number,removedSuffix:string;
 if(first>=0&&content[first]==='{'){
  end=objectEnd(content);removedSuffix=content.slice(end);
  if(removedSuffix.replace(/^[ \t\r\n]+|[ \t\r\n]+$/g,'').replace(/\r\n/g,'\n')!==knownSuffix)throw Error('source_recovery: no exact known protocol suffix; original response unchanged');
  try{raw=JSON.parse(content.slice(0,end));}catch{throw Error('source_recovery: invalid JSON prefix; no repair attempted');}
 }else{
  ({raw,end,removedSuffix}=extractFencedArtifact(row,content,design.brief));
 }
 const validate=new Ajv({allErrors:true,strict:false}).compile(buildArtifactOutputSchema(design.brief).schema);
 if(!validate(raw))throw Error('source_recovery: artifact schema or host binding mismatch');
 const candidate=parseArtifact(raw,design.brief);
 return {
  schemaVersion:'source-recovery-proposal:1' as const,status:'review-required' as const,
  originalResponseAccepted:false as const,accepted:false as const,productionAdopted:false as const,
  execution:'not_run' as const,modelRequests:0 as const,
  responseSha256:hash(JSON.stringify(response)),contentSha256:hash(content),
  designSha256:designHash(design),candidateSha256:sourceHash(candidate),
  extractedCharacters:end,removedSuffix,candidate,
 };
}
