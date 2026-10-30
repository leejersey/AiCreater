import path from 'node:path';
import {readFile} from 'node:fs/promises';
import {readBoundedJsonBytes,typecheckSource} from '../packages/custom-scenes/src/files';
import {verifyReviewedImportData} from '../packages/custom-scenes/src/reviewed-import';

async function main(){
 const [file,...extra]=process.argv.slice(2);if(!file||extra.length)throw Error('reviewed_import: expected verification input');
 const input=JSON.parse((await readBoundedJsonBytes(file)).toString('utf8'));
 const load=async(p:string)=>JSON.parse((await readBoundedJsonBytes(p)).toString('utf8'));
 const s=input.source_directory,p=input.preview_directory,t=input.stills_directory;
 const offlineRevision=input.source_origin==='local-reviewed-offline-revision'?await load(path.join(s,'offline-revision.json')):undefined;
 const result=verifyReviewedImportData({approval:input.sha256,measured:input.measured,sourceOrigin:input.source_origin,
  ...(offlineRevision?{offlineRevision,...(offlineRevision.parentDesignSha256!==undefined?{parentDesign:await load(path.join(s,'parent-design.json'))}:{})}:{}),
  artifact:await load(path.join(s,'artifact.json')),design:await load(path.join(s,'artifact.json.design.json')),
  provider:await load(path.join(s,'provider-response.json')),dispatch:await load(path.join(s,'dispatch.json')),
  frozenArtifact:await load(path.join(p,'chapter-0/artifact.json')),frozenDesign:await load(path.join(p,'chapter-0/artifact.json.design.json')),
  composition:await load(path.join(p,'composition.json')),srt:await readFile(path.join(p,'video.srt'),'utf8'),report:await load(path.join(t,'report.json'))});
 await typecheckSource(result.artifact.source);
 console.log(JSON.stringify(result));
}
main().catch(()=>{console.error('reviewed_import: verification failed; no source execution or provider request');process.exitCode=1;});
