import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,rm,stat} from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {generateWorkbench,previewWorkbench,exportWorkbench} from '../src/workbench';
import {execFileSync} from 'node:child_process';

test('real isolated rendering produces checked silent MP4 without a second source confirmation',{
 skip:process.env.RUN_ISOLATED_RENDER_TEST!=='1',timeout:360000,
},async()=>{
 const root=await mkdtemp(path.join(os.tmpdir(),'isolated-video-integration-'));
 try{
  const brief={schemaVersion:'custom-scene-brief:1',id:'isolation-test',title:'Isolation test',narration:'Measured.',visualGoal:'Move along a line',facts:[],materials:[],width:1920,height:1080,fps:30,durationInFrames:60};
  const cues=[{id:'cue',text:'Measured.',startFrame:6,endFrame:54}];
  const design={schemaVersion:'visual-design:1',brief,cues,thesis:'Movement',metaphor:'Track',objects:[{id:'payload',meaning:'moving dot',appearance:'circle',x:100,y:100,width:20,height:20}],beats:[{cueId:'cue',focus:'payload',action:'move',changes:[{objectId:'payload',from:'left',to:'right'}]}],composition:'Center',palette:'blueprint',avoid:['cards'],acceptance:['continuous movement']};
  const artifact={schemaVersion:'custom-scene:1',brief,rationale:'Trusted isolation integration fixture',source:'export default function Scene({frame}:{frame:number}){return <svg width="1920" height="1080"><rect width="1920" height="1080" fill="#101820"/><path id="track" data-route="true" d="M100 100 L200 100" stroke="#40c9e0"/><g data-follow-path="track" transform={`translate(${100+frame} 100)`}><circle r="12" fill="#40c9e0"/></g></svg>}'};
  let requests=0;
  const generation=path.join(root,'generation');
  const result=await generateWorkbench({brief,cues},generation,{request:async()=>++requests===1?design:artifact});
  const output=path.join(root,'preview');
  const preview=await previewWorkbench({generation_directory:generation,sha256:result.sha256,scene:{duration_frames:60,narration:{text:'Measured.',audio_start_frame:6},captions:[{text:'Measured.',start_frame:6,end_frame:54}]},audio_file:'',timing_mode:'draft',isolated_render:true},output);
  assert.equal(requests,2,'only offline mocked responses');
  assert.equal(preview.geometry.status,'passed');assert.equal(preview.video,'video.mp4');
  assert.ok((await stat(path.join(output,'video.mp4'))).size>1000);
  const exported=path.join(root,'export');
  await exportWorkbench({chapters:[{generation_directory:generation,sha256:result.sha256,scene:{duration_frames:60,narration:{text:'Measured.',audio_start_frame:6},captions:[{text:'Measured.',start_frame:6,end_frame:54}]},audio_file:path.join(output,'chapter-0/audio.wav'),isolated_render:true}]},exported);
  assert.ok((await stat(path.join(exported,'video.mp4'))).size>1000);
  const media=JSON.parse(execFileSync('ffprobe',['-v','error','-show_streams','-show_format','-of','json',path.join(exported,'video.mp4')],{encoding:'utf8'}));
  assert.ok(media.streams.some((s:{codec_type:string;width?:number;height?:number})=>s.codec_type==='video'&&s.width===1920&&s.height===1080));
  assert.ok(media.streams.some((s:{codec_type:string})=>s.codec_type==='audio'));
  assert.ok(Math.abs(Number(media.format.duration)-2)<.05);
 }finally{await rm(root,{recursive:true,force:true});}
});
