import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,writeFile,rm} from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {freezeTeachingScene} from '../src/teaching-artifact';
import {verifyTeachingRenderOutput} from '../src/teaching-render-receipt';
import {expectedTeachingForeground,expectedTeachingSolids} from '../src/teaching-scene-audit';
import {teachingSampledFrames} from '../src/teaching-render-policy';
import {teachingBrief,teachingCues,teachingExample} from './fixtures/teaching-examples';
import {designInputHash} from '../src/design-content';

test('receipt verifier rejects missing, mismatched and incomplete host evidence without a browser',async()=>{
 const root=await mkdtemp(path.join(os.tmpdir(),'teaching-receipt-'));
 try{
  const artifact=await freezeTeachingScene(teachingExample('state-change'),teachingBrief,teachingCues);
  const all=Array.from({length:artifact.brief.durationInFrames},(_,i)=>i);
  const report=(frames:number[])=>({artifactSha256:artifact.artifactSha256,requiredFrames:frames,invalidLogs:[] as string[],frames:Object.fromEntries(frames.map(frame=>{
   const movers=artifact.compiled.transports.filter(t=>frame>=t.startFrame&&frame<t.endFrame).length;
   return [frame,{frame,status:'passed',issues:[],movers,routes:movers,labels:artifact.compiled.objects.reduce((n,o)=>n+o.asset.text.lines.filter(t=>t.trim()).length,0),solids:expectedTeachingSolids(artifact).length,foreground:expectedTeachingForeground(artifact,frame).length,occlusionChecks:0}];
  }))});
  // Synthetic evidence only: this fixture is not an actual rendered video.
  const bytes=Buffer.from('fake-render-output'),videoSha256=createHash('sha256').update(bytes).digest('hex');
  const receipt={status:'preview-ready',artifactSha256:artifact.artifactSha256,videoSha256,media:{format:{duration:'4'},streams:[{codec_type:'video',codec_name:'h264',width:1920,height:1080,r_frame_rate:'30/1',nb_read_frames:'120',start_time:'0'}]}};
  const result={status:'preview-ready',artifactSha256:artifact.artifactSha256,previewPath:path.join(root,'preview.mp4')};
  const write=(name:string,data:unknown)=>writeFile(path.join(root,name),JSON.stringify(data));
  const reset=async()=>{await write('artifact.json',artifact);await write('stills-report.json',report(teachingSampledFrames(artifact)));await write('continuous-report.json',report(all));await write('report.json',receipt);await writeFile(result.previewPath,bytes);};
  await reset();assert.equal((await verifyTeachingRenderOutput(artifact,result,root)).accepted,false);
  const mutations=[
   async()=>rm(path.join(root,'continuous-report.json')),
   async()=>write('stills-report.json',{...report(teachingSampledFrames(artifact)),artifactSha256:'0'.repeat(64)}),
   async()=>{const value=report(all);delete value.frames[0];await write('continuous-report.json',value);},
   async()=>write('continuous-report.json',{...report(all),invalidLogs:['bad audit']}),
   async()=>write('report.json',{...receipt,media:{...receipt.media,format:{duration:'5'}}}),
   async()=>writeFile(result.previewPath,Buffer.from('changed')),
  ];
  for(const mutate of mutations){await reset();await mutate();await assert.rejects(verifyTeachingRenderOutput(artifact,result,root));}
  await reset();
  await assert.rejects(verifyTeachingRenderOutput(artifact,{...result,previewPath:path.join(root,'..','outside.mp4')},root),/escaped/);
  const foreignBrief={...teachingBrief,title:'Other'},foreignPlan=teachingExample('state-change');foreignPlan.inputSha256=designInputHash(foreignBrief,teachingCues);
  const foreign=await freezeTeachingScene(foreignPlan,foreignBrief,teachingCues);
  await write('artifact.json',foreign);
  await assert.rejects(verifyTeachingRenderOutput(artifact,{...result,artifactSha256:foreign.artifactSha256},root),/semantic/);
 }finally{await rm(root,{recursive:true,force:true});}
});
