import {readFile,mkdir} from 'node:fs/promises';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {parseBrief,parseArtifact,requestModelJson,sourceHash,buildArtifactOutputSchema,type ModelOptions} from '../packages/custom-scenes/src/contract';
import {parseCues,parseDesign,buildDesignPrompt,buildScenePrompt,reviewScene,cuesFromManifest,designHash,assertDesignBinding,geometryFeedback} from '../packages/custom-scenes/src/design';
import {assertDesignLayout} from '../packages/custom-scenes/src/design-layout';
import {buildDesignOutputSchema} from '../packages/custom-scenes/src/design-schema';
import {readSourceArtReferences} from '../packages/custom-scenes/src/source-art-direction';
import {proposeLabelLayout} from '../packages/custom-scenes/src/label-layout';
import {proposeSourceRecovery} from '../packages/custom-scenes/src/source-recovery';
import {reviewSourceMotion,motionQualityFeedback} from '../packages/custom-scenes/src/source-motion-review';
import {readJson,readArtifact,publishText,ensureOutputAbsent,saveGeneratedCandidate,typecheckSource,readBoundedJsonBytes} from '../packages/custom-scenes/src/files';
import type {GeometryAudit} from '../packages/custom-scenes/src/geometry-audit';

async function requestStage(prompt:string,out:string,options:ModelOptions){
 for(const suffix of ['.provider-response.json','.failure.json'])await ensureOutputAbsent(out+suffix);
 try{
  return await requestModelJson(prompt,{...options,onResponse:response=>publishText(out+'.provider-response.json',JSON.stringify(response,null,2))});
 }catch(error){
  await publishText(out+'.failure.json',JSON.stringify({error:error instanceof Error?error.message:String(error),model:options.model??'deepseek-flash',maxTokens:options.maxTokens??8192,automaticRetries:0},null,2));
  throw error;
 }
}

async function main(){
 const [command,...args]=process.argv.slice(2);
 const options={apiKey:process.env.DEEPSEEK_API_KEY,model:process.env.DEEPSEEK_MODEL,confirmCost:args.at(-1)==='--confirm-cost'};
 // References are read as text, never imported as executable modules.
 const reference=async()=>(await readSourceArtReferences()).code;
 if(command==='inspect-source-response'&&args.length===3){
  const [designFile,responseFile,out]=args;await ensureOutputAbsent(out);
  const bytes=await readBoundedJsonBytes(responseFile);
  const proposal=proposeSourceRecovery(JSON.parse(bytes.toString('utf8')),JSON.parse((await readBoundedJsonBytes(designFile)).toString('utf8')));
  await typecheckSource(proposal.candidate.source);
  await publishText(out,JSON.stringify({...proposal,responseFileSha256:createHash('sha256').update(bytes).digest('hex'),technical:'passed',staticReview:'pending'},null,2)+'\n');
  console.log(JSON.stringify({proposal:out,status:proposal.status,sha256:proposal.candidateSha256,accepted:false,execution:'not_run',modelRequests:0}));return;
 }
 if(command==='propose-label-layout'&&args.length===2){
  const [designFile,out]=args;await ensureOutputAbsent(out);await ensureOutputAbsent(out+'.design.json');
  const proposal=proposeLabelLayout(await readJson(designFile));
  await publishText(out,JSON.stringify(proposal,null,2)+'\n');
  await publishText(out+'.design.json',JSON.stringify(proposal.design,null,2)+'\n');
  console.log(JSON.stringify({proposal:out,design:out+'.design.json',status:proposal.status,layoutPreflight:proposal.layoutPreflight,moves:proposal.moves,accepted:false,modelRequests:0}));return;
 }
 if(command==='from-audio'&&args.length===4){
  const [manifest,chapter,seedFile,out]=args;await ensureOutputAbsent(out);
  const seed=parseBrief(await readJson(seedFile)),track=cuesFromManifest(await readJson(manifest),chapter);
  const brief=parseBrief({...seed,narration:track.narration,durationInFrames:track.durationInFrames});
  await mkdir(path.dirname(path.resolve(out)),{recursive:true});await mkdir(out);
  await publishText(path.join(out,'brief.json'),JSON.stringify(brief,null,2));
  await publishText(path.join(out,'cues.json'),JSON.stringify(track.cues,null,2));
  await publishText(path.join(out,'timing-source.json'),JSON.stringify({manifest:path.resolve(manifest),chapter,fps:30,timing:'measured segment timestamps; not word alignment'},null,2));return;
 }
 if((command==='prepare-design'&&args.length===3)||(command==='design'&&args.length===4&&options.confirmCost)){
  const [briefFile,cueFile,out]=args;await ensureOutputAbsent(out);
  const brief=parseBrief(await readJson(briefFile)),cues=parseCues(await readJson(cueFile),brief),prompt=buildDesignPrompt(brief,cues,(await readSourceArtReferences()).design);
  if(command==='prepare-design'){await publishText(out,prompt);return;}
  await ensureOutputAbsent(out+'.response.json');
  const raw=await requestStage(prompt,out,{...options,outputSchema:buildDesignOutputSchema(brief,cues)});await publishText(out+'.response.json',JSON.stringify(raw,null,2));
  const design=parseDesign(raw,brief,cues);assertDesignLayout(design);await publishText(out,JSON.stringify(design,null,2));
  console.log(JSON.stringify({design:out,next:'Review visual design before generating source'}));return;
 }
 if((command==='prepare-code'&&args.length===2)||(command==='code'&&args.length===3&&options.confirmCost)){
  const [designFile,out]=args;await ensureOutputAbsent(out);const design=parseDesign(await readJson(designFile));
  assertDesignLayout(design);
  const prompt=buildScenePrompt(design,await reference());
  if(command==='prepare-code'){await publishText(out,prompt);return;}
  await ensureOutputAbsent(out+'.check.json');await ensureOutputAbsent(out+'.response.json');await ensureOutputAbsent(out+'.design.json');
  const raw=await requestStage(prompt,out,{...options,maxTokens:16384,outputSchema:buildArtifactOutputSchema(design.brief)});await publishText(out+'.response.json',JSON.stringify(raw,null,2));
  const artifact=parseArtifact(raw,design.brief);
  await publishText(out+'.design.json',JSON.stringify(design,null,2));
  await saveGeneratedCandidate(artifact,out);
  console.log(JSON.stringify({artifact:out,sha256:sourceHash(artifact),visual:'pending',next:'Review source, approve exact hash, render stills; then review images'}));return;
 }
 if(command==='pack'&&args.length===3){
  const [designFile,sourceFile,out]=args;
  for(const file of [out,out+'.check.json',out+'.design.json'])await ensureOutputAbsent(file);
  const design=parseDesign(await readJson(designFile));
  const artifact=parseArtifact({schemaVersion:'custom-scene:1',brief:design.brief,rationale:'External agent implementation of frozen visual design; visual review pending.',source:await readFile(sourceFile,'utf8')},design.brief);
  await publishText(out+'.design.json',JSON.stringify(design,null,2));await saveGeneratedCandidate(artifact,out);
  console.log(JSON.stringify({artifact:out,sha256:sourceHash(artifact),visual:'pending'}));return;
 }
 if(command==='review'&&(args.length===4||(args.length===5&&args[4]==='--allow-partial-geometry'))){
  const [artifactFile,renderReportFile,reviewFile,out]=args;await ensureOutputAbsent(out);
  const artifact=await readArtifact(artifactFile);
  const frozen=parseDesign(await readJson(artifactFile+'.design.json'),artifact.brief);
  const review=reviewScene(await readJson(reviewFile),artifact,frozen);
  const report=await readJson(renderReportFile) as {sha256?:string;designSha256?:string;technical?:string;frames?:string[];frameHashes?:Record<string,string>;geometry?:{status?:string;frames?:Record<string,GeometryAudit&{unsupported?:true}>}};
  if(report.sha256!==sourceHash(artifact)||report.technical!=='passed'||!Array.isArray(report.frames))throw Error('visual_design: matching successful render report required');
  assertDesignBinding(frozen,String(report.designSha256));
  if(review.verdict==='pass'&&report.geometry?.status==='failed')throw Error('visual_design: geometry_failed; resolve automatic audit findings before visual pass');
  if(review.verdict==='pass'){
   const g=report.geometry;
   if(!g||(g.status!=='passed'&&g.status!=='partial')||!g.frames||Array.isArray(g.frames))throw Error('visual_design: geometry_required; render with geometry diagnostics before visual pass');
   let movers=0,unsupported=false;
   for(const name of report.frames){
    const match=typeof name==='string'?/^frame-(\d+)\.png$/.exec(name):null;
    const audit=match?g.frames[match[1]]:undefined;
    if(!audit||!Array.isArray(audit.issues)||['labels','movers','routes','obstacles'].some(key=>!Number.isInteger(audit[key as keyof GeometryAudit])||Number(audit[key as keyof GeometryAudit])<0))throw Error('visual_design: geometry_required; every rendered frame needs a valid audit');
    if(audit.issues.length)throw Error('visual_design: geometry_failed; frame findings cannot be overridden');
    movers+=audit.movers;unsupported ||= !!audit.unsupported;
   }
   if(g.status==='passed'&&(!movers||unsupported))throw Error('visual_design: partial_geometry; incomplete coverage cannot be called passed');
   if(g.status==='partial'&&args[4]!=='--allow-partial-geometry')throw Error('visual_design: partial_geometry; explicit --allow-partial-geometry requires full manual review');
  }
  for(const evidence of review.evidence){
   const file=`frame-${evidence.frame}.png`;
   if(!report.frames.includes(file))throw Error('visual_design: evidence frame was not rendered');
   const png=await readFile(path.join(path.dirname(renderReportFile),file));
   if(!png.subarray(0,8).equals(Buffer.from([137,80,78,71,13,10,26,10])))throw Error('visual_design: invalid evidence image');
   if(createHash('sha256').update(png).digest('hex')!==report.frameHashes?.[file])throw Error('visual_design: evidence image hash mismatch');
  }
  await publishText(out,JSON.stringify(review,null,2));console.log(JSON.stringify({visual:review.verdict,sha256:review.sha256}));return;
 }
 if(command==='prepare-revision'&&args.length===4){
  const [designFile,artifactFile,reviewFile,out]=args;await ensureOutputAbsent(out);
  const design=parseDesign(await readJson(designFile));const artifact=parseArtifact(await readJson(artifactFile),design.brief);
  const frozen=parseDesign(await readJson(artifactFile+'.design.json'),artifact.brief);assertDesignBinding(design,designHash(frozen));
  const review=reviewScene(await readJson(reviewFile),artifact,frozen);
  if(review.verdict!=='revise')throw Error('visual_design: revision requires revise verdict');
  await publishText(out,buildScenePrompt(design,await reference(),artifact,JSON.stringify(review)));return;
 }
 if(command==='review-source-motion'&&args.length===3){
  const [designFile,artifactFile,out]=args;await ensureOutputAbsent(out);
  const design=parseDesign(JSON.parse((await readBoundedJsonBytes(designFile)).toString('utf8')));
  const raw=JSON.parse((await readBoundedJsonBytes(artifactFile)).toString('utf8')) as {schemaVersion?:unknown;candidate?:unknown};
  const candidate=raw&&raw.schemaVersion==='source-recovery-proposal:1'?raw.candidate:raw;
  const review=reviewSourceMotion(candidate,design);
  await publishText(out,JSON.stringify(review,null,2)+'\n');
  console.log(JSON.stringify({review:out,status:review.status,coverage:review.coverage,findings:review.findings.length,accepted:false,visual:'pending',modelRequests:0}));return;
 }
 if(command==='prepare-geometry-revision'&&args.length===4){
  const [designFile,artifactFile,reportFile,out]=args;await ensureOutputAbsent(out);
  const design=parseDesign(await readJson(designFile)),artifact=parseArtifact(await readJson(artifactFile),design.brief);
  const frozen=parseDesign(await readJson(artifactFile+'.design.json'),artifact.brief);assertDesignBinding(design,designHash(frozen));
  const feedback=motionQualityFeedback(artifact,design,await readJson(reportFile));
  await publishText(out,buildScenePrompt(design,await reference(),artifact,JSON.stringify(feedback)));return;
 }
 throw Error('Usage: visual:agent inspect-source-response design.json provider-response.json proposal.json | review-source-motion design.json artifact-or-proposal.json review.json | propose-label-layout design.json proposal.json | from-audio manifest.json chapter seed-brief.json new-directory | prepare-design brief.json cues.json prompt.txt | design brief.json cues.json design.json --confirm-cost | prepare-code design.json prompt.txt | code design.json artifact.json --confirm-cost | pack design.json Scene.tsx artifact.json | review artifact.json render/report.json observations.json review.json [--allow-partial-geometry] | prepare-revision design.json artifact.json review.json prompt.txt | prepare-geometry-revision design.json artifact.json render/report.json prompt.txt');
}
main().catch(error=>{console.error(error instanceof Error?error.message:String(error));process.exitCode=1;});
