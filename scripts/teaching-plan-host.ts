import {createHash} from 'node:crypto';
import {parseBrief} from '../packages/custom-scenes/src/contract';
import {parseCues} from '../packages/custom-scenes/src/design';
import {designInputHash} from '../packages/custom-scenes/src/design-content';
import {buildTeachingPlanPrompt,buildTeachingPlanSchema,TeachingPlanError} from '../packages/custom-scenes/src/teaching-plan';
import {prepareTeachingCompilation,buildTeachingRevisionPrompt,validateTeachingRevision} from '../packages/custom-scenes/src/teaching-repair';
import {freezeTeachingScene,validateTeachingArtifact} from '../packages/custom-scenes/src/teaching-artifact';
import {prepareTeachingRenderRevision,buildTeachingRenderRevisionPrompt,validateTeachingRenderRevision} from '../packages/custom-scenes/src/teaching-render-revision';
import {retimeTeachingScene} from '../packages/custom-scenes/src/teaching-retime';
import {freezeTeachingAudiovisual} from '../packages/custom-scenes/src/teaching-audiovisual';

async function main(){
 const [operation,...extra]=process.argv.slice(2);
 if(extra.length||!['request','check','revision','artifact','render-revision','retime','audiovisual'].includes(operation))throw Error('teaching_host: invalid operation');
 const chunks:Buffer[]=[];let bytes=0;
 for await(const chunk of process.stdin){const b=Buffer.from(chunk);bytes+=b.length;if(bytes>16*1024*1024)throw Error('teaching_host: input too large');chunks.push(b);}
 const input=JSON.parse(Buffer.concat(chunks).toString()) as Record<string,any>;
 if(!input||typeof input!=='object'||Array.isArray(input))throw Error('teaching_host: expected object');
 const exact=(keys:string[])=>{if(Object.keys(input).sort().join(',')!==keys.sort().join(','))throw Error('teaching_host: invalid fields');};
 if(operation==='audiovisual')return {status:'audiovisual-frozen',audiovisual:await freezeTeachingAudiovisual(input),accepted:false,execution:'not-run'};
 if(operation==='retime'){
  exact(['artifact','expectedSha256','brief','cues']);
  return retimeTeachingScene(input.artifact,input.expectedSha256,input.brief,input.cues);
 }
 if(operation==='artifact'){
  exact(['artifact','expectedSha256']);const a=await validateTeachingArtifact(input.artifact,input.expectedSha256);
  return {status:'verified',artifactSha256:a.artifactSha256,accepted:false,execution:'not-run'};
 }
 if(operation==='render-revision'){
  exact(['artifact','expectedSha256','reportJson','reportSha256']);
  return prepareTeachingRenderRevision(input.artifact,input.expectedSha256,input.reportJson,input.reportSha256);
 }
 exact(operation==='request'?['brief','cues']:operation==='revision'?['brief','cues','request','expectedSha256']:['brief','cues','plan',...(Object.hasOwn(input,'revision')?['revision']:[])]);
 const brief=parseBrief(input.brief),cues=parseCues(input.cues,brief);
 if(operation==='request'||operation==='revision'){
  const prompt=operation==='request'?buildTeachingPlanPrompt(brief,cues):input.request?.schemaVersion==='teaching-render-revision:1'
   ?buildTeachingRenderRevisionPrompt(input.request,brief,cues,input.expectedSha256):buildTeachingRevisionPrompt(input.request,brief,cues,input.expectedSha256);
  const body={schemaVersion:'teaching-host-request:1',stage:operation==='request'?'plan':'revision',inputSha256:designInputHash(brief,cues),prompt,outputSchema:buildTeachingPlanSchema(brief,cues)};
  return {...body,requestSha256:createHash('sha256').update(JSON.stringify(body)).digest('hex')};
 }
 if(Object.hasOwn(input,'revision')){
  if(!input.revision||typeof input.revision!=='object'||Array.isArray(input.revision))throw Error('teaching_host: invalid revision binding');
  if(Object.keys(input.revision).sort().join(',')!=='expectedSha256,request')throw Error('teaching_host: invalid revision binding');
  if(input.revision.request?.schemaVersion==='teaching-render-revision:1')validateTeachingRenderRevision(input.revision.request,input.plan,brief,cues,input.revision.expectedSha256);
  else validateTeachingRevision(input.revision.request,input.plan,brief,cues,input.revision.expectedSha256);
 }
 const result=prepareTeachingCompilation(input.plan,brief,cues);
 if(result.status==='compiled')return {status:'compiled',artifact:await freezeTeachingScene(input.plan,brief,cues),accepted:false,execution:'not-run'};
 return result;
}
main().then(result=>process.stdout.write(JSON.stringify(result))).catch(error=>{
 if(error instanceof TeachingPlanError||error instanceof Error&&(error.message.startsWith('teaching_repair:')||error.message.startsWith('teaching_render_revision:'))){
  process.stdout.write(JSON.stringify({status:'rejected',detail:error.message.slice(0,1000),accepted:false,execution:'not-run'}));
 }else {console.error('teaching_host: offline host command failed');process.exitCode=1;}
});
