import assert from 'node:assert/strict';
import {parseArtifact,assertApproval,sourceHash} from './contract';
import {parseDesign,designHash,reviewFrames} from './design';
import {assertDesignLayout} from './design-layout';
import {validateWorkbenchScene,workbenchSrt,type WorkbenchManifest} from './workbench';
import {summarizeGeometryCoverage,type GeometryAudit} from './geometry-audit';

function object(v:unknown):Record<string,unknown>{
 if(!v||typeof v!=='object'||Array.isArray(v))throw Error('reviewed_import: expected object');
 return v as Record<string,unknown>;
}
/** Verifies retained data only; this never imports Scene or dispatches a provider/render request. */
export function verifyReviewedImportData(value:unknown){
 const v=object(value),artifact=parseArtifact(v.artifact),design=parseDesign(v.design,artifact.brief);
 assertApproval(artifact,typeof v.approval==='string'?v.approval:undefined);assertDesignLayout(design);
 const provider=object(v.provider),dispatch=object(v.dispatch),measured=object(v.measured);
 if(provider.finishReason!=='stop'||provider.truncated||typeof provider.content!=='string'||Buffer.byteLength(provider.content)>128*1024)throw Error('reviewed_import: incomplete provider response');
 const parent=parseArtifact(JSON.parse(provider.content));
 const origin=v.sourceOrigin??'local-reviewed-model-execution';
 let dispatchedDesignHash=designHash(design);
 if(origin==='local-reviewed-offline-revision'){
  const revision=object(v.offlineRevision);
  if(revision.schemaVersion!=='reviewed-offline-revision:1'||revision.parentSha256!==sourceHash(parent)||
    revision.sha256!==sourceHash(artifact)||revision.designSha256!==designHash(design)||
    typeof revision.reason!=='string'||!revision.reason.trim()||revision.reason.length>2000)throw Error('reviewed_import: offline revision provenance mismatch');
  assert.deepEqual(parent.brief,artifact.brief,'reviewed_import: revision changed immutable brief');
  if(revision.parentDesignSha256!==undefined){
   const parentDesign=parseDesign(v.parentDesign,parent.brief);
   if(designHash(parentDesign)!==revision.parentDesignSha256)throw Error('reviewed_import: parent design provenance mismatch');
   assert.deepEqual(parentDesign.cues,design.cues,'reviewed_import: design revision changed measured cues');
   dispatchedDesignHash=designHash(parentDesign);
  }else if(v.parentDesign!==undefined)throw Error('reviewed_import: unbound parent design');
 }else{
  if(origin!=='local-reviewed-model-execution'||v.offlineRevision!==undefined)throw Error('reviewed_import: unsupported source origin');
  assert.deepEqual(parent,artifact,'reviewed_import: source differs from original model response');
 }
 if(dispatch.requestsDispatched!==1||dispatch.maximumRequests!==1||dispatch.automaticRetries!==0||dispatch.designSha256!==dispatchedDesignHash)throw Error('reviewed_import: historical request accounting mismatch');
 assert.deepEqual(measured.brief,artifact.brief,'reviewed_import: current brief changed');
 assert.deepEqual(measured.cues,design.cues,'reviewed_import: current cue track changed');
 const scene=validateWorkbenchScene(measured.scene as Parameters<typeof validateWorkbenchScene>[0],artifact,design);
 assert.deepEqual(parseArtifact(v.frozenArtifact),artifact,'reviewed_import: rendered source changed');
 assert.deepEqual(parseDesign(v.frozenDesign),design,'reviewed_import: rendered design changed');
 const composition=object(v.composition);
 const expected:WorkbenchManifest={durationInFrames:scene.duration_frames,chapters:[{artifact:'chapter-0/artifact.json',sha256:sourceHash(artifact),design_sha256:designHash(design),audio:'chapter-0/audio.wav',from:0,scene}]};
 assert.deepEqual(composition,expected,'reviewed_import: rendered composition changed');
 if(v.srt!==workbenchSrt(expected))throw Error('reviewed_import: subtitle output changed');
 const report=object(v.report),geometry=object(report.geometry);
 if(report.technical!=='passed'||report.sha256!==sourceHash(artifact)||report.designSha256!==designHash(design)||geometry.status!=='passed')throw Error('reviewed_import: geometry report binding failed');
 const frames=reviewFrames(design);
 assert.deepEqual(report.frames,frames.map(f=>`frame-${f}.png`),'reviewed_import: incomplete sampled frames');
 const rawAudits=object(geometry.frames),audits:Record<number,GeometryAudit&{unsupported?:boolean}>={};
 assert.deepEqual(Object.keys(rawAudits).sort(),frames.map(String).sort(),'reviewed_import: audit frame inventory changed');
 for(const frame of frames){
  const audit=object(rawAudits[frame]);
  if(!Array.isArray(audit.issues)||audit.issues.length||['labels','movers','routes','obstacles'].some(k=>!Number.isSafeInteger(audit[k])||Number(audit[k])<0)||
    (audit.unsupported!==undefined&&typeof audit.unsupported!=='boolean'))throw Error('reviewed_import: invalid sampled audit');
  audits[frame]=audit as GeometryAudit;
 }
 const summary=summarizeGeometryCoverage(audits);
 if(summary.status!=='passed'||summary.issueCount!==geometry.issueCount||summary.motionChecks!==geometry.motionChecks)throw Error('reviewed_import: incomplete geometry coverage');
 return {artifact,design,sha256:sourceHash(artifact),design_sha256:designHash(design),scene,geometry:report.geometry,frames:report.frames,
  requests_dispatched:1,new_requests:0,accepted:false,origin};
}
