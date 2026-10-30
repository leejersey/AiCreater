import type {TeachingArtifact} from './teaching-artifact';
import type {measureTeachingScene} from './teaching-scene-audit';
import {expectedTeachingForeground} from './teaching-scene-audit';
export type TeachingFrameAudit=ReturnType<typeof measureTeachingScene>;
export function teachingSampledFrames(artifact:TeachingArtifact){
 return [...new Set([0,Math.floor((artifact.brief.durationInFrames-1)/2),artifact.brief.durationInFrames-1,...artifact.compiled.schedule.events.flatMap(e=>[e.startFrame,e.endFrame-1])])].sort((a,b)=>a-b);
}
export function recordTeachingAudit(frames:Record<number,TeachingFrameAudit>,audit:TeachingFrameAudit){
 const old=frames[audit.frame];
 if(old&&(old.status!=='passed'||old.issues.length))return;
 frames[audit.frame]=audit;
}
export function assertTeachingMedia(value:unknown,durationInFrames:number){
 const media=value as {format?:{duration?:unknown};streams?:{codec_type?:unknown;codec_name?:unknown;width?:unknown;height?:unknown;r_frame_rate?:unknown;nb_read_frames?:unknown;start_time?:unknown}[]};
 const videos=Array.isArray(media?.streams)?media.streams.filter(s=>s.codec_type==='video'):[],video=videos[0];
 const duration=Number(media?.format?.duration),start=Number(video?.start_time),frames=Number(video?.nb_read_frames);
 if(typeof media?.format?.duration!=='string'||!media.format.duration.trim()||typeof video?.start_time!=='string'||!video.start_time.trim()||!Number.isFinite(duration)||!Number.isFinite(start)||!Number.isFinite(frames)||videos.length!==1||media.streams!.some(s=>s.codec_type==='audio')||video.width!==1920||video.height!==1080||video.codec_name!=='h264'||video.r_frame_rate!=='30/1'||frames!==durationInFrames||Math.abs(duration-durationInFrames/30)>1/30||Math.abs(start)>1e-6)throw Error('teaching_render: preview media integrity mismatch');
}
export function summarizeTeachingRender(artifact:TeachingArtifact,frames:Record<number,TeachingFrameAudit>,required:number[]){
 const duration=artifact.brief.durationInFrames;
 if(!required.length||required.length>duration||new Set(required).size!==required.length||required.some(f=>!Number.isInteger(f)||f<0||f>=duration))throw Error('teaching_render: invalid required frame coverage');
 const missingFrames=required.filter(f=>!frames[f]),coverageIssues:{frame:number;detail:string}[]=[];
 const moving=new Set(artifact.compiled.transports.map(t=>t.objectId));
 const labels=artifact.compiled.objects.reduce((n,o)=>n+o.asset.text.lines.filter(t=>t.trim()).length,0);
 const solids=artifact.compiled.objects.filter(o=>!moving.has(o.id)).reduce((n,o)=>n+o.asset.solids.length,0);
 for(const [key,audit] of Object.entries(frames)){
  const frame=Number(key);
  if(!Number.isInteger(frame)||frame<0||frame>=duration||String(frame)!==key||audit?.frame!==frame||!Array.isArray(audit.issues))throw Error('teaching_render: malformed frame audit');
  const expected=artifact.compiled.transports.filter(t=>frame>=t.startFrame&&frame<t.endFrame).length;
  if(audit.movers!==expected||audit.routes!==expected||audit.labels!==labels||audit.solids!==solids||audit.foreground!==expectedTeachingForeground(artifact,frame).length)coverageIssues.push({frame,detail:'Measured foreground/label/solid/active-motion coverage differs from the frozen artifact'});
 }
 const failedFrames=Object.entries(frames).filter(([,a])=>a.status!=='passed'||a.issues.length).map(([f])=>Number(f));
 return {status:missingFrames.length||failedFrames.length||coverageIssues.length?'failed' as const:'passed' as const,
  artifactSha256:artifact.artifactSha256,accepted:false as const,visual:'pending' as const,requiredFrames:[...required],missingFrames,failedFrames,coverageIssues,frames};
}
