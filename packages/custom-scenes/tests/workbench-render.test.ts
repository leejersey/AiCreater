import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,readFile,writeFile,rm} from 'node:fs/promises';
import {execFileSync,spawnSync} from 'node:child_process';
import path from 'node:path';
import os from 'node:os';
import {generateWorkbench,previewWorkbench,exportWorkbench} from '../src/workbench';
import {sourceHash,parseArtifact} from '../src/contract';
import {renderWorkbench} from '../src/workbench-render';

const missingTools=['ffmpeg','ffprobe'].filter(tool=>spawnSync(tool,['-version'],{stdio:'ignore'}).status!==0);
test('real local stills gate and unified render include audio, host captions, exact duration; runtime rejects stale hash', {timeout:600000,skip:missingTools.length?`Missing PATH dependencies: ${missingTools.join(', ')}`:false},async()=>{
 const root=await mkdtemp(path.join(os.tmpdir(),'workbench-render-test-'));
 try{
  const brief={schemaVersion:'custom-scene-brief:1',id:'local',title:'Local',narration:'Measured audio.',visualGoal:'Moving circle',facts:[],materials:[],width:1920,height:1080,fps:30,durationInFrames:30};
  const cues=[{id:'cue',text:brief.narration,startFrame:6,endFrame:24}];
  const design={schemaVersion:'visual-design:1',brief,cues,thesis:'Move',metaphor:'Circle',objects:[{id:'object',meaning:'thing',appearance:'circle',x:100,y:100,width:200,height:100}],beats:[{cueId:'cue',focus:'object',action:'move',changes:[{objectId:'object',from:'left',to:'right'}]}],composition:'Center',palette:'blueprint',avoid:['cards'],acceptance:['movement']};
  const artifact=parseArtifact({schemaVersion:'custom-scene:1',brief,rationale:'Local fixture only',source:'export default function Scene({frame}:{frame:number}){return <svg width="1920" height="1080"><rect width="1920" height="1080" fill="#102030"/><path id="route" data-route="true" d="M 100 300 L 800 300" stroke="white"/><g data-follow-path="route" transform={`translate(${100+frame*20} 300)`}><circle r="30" fill="#ffe600"/></g></svg>}'});
  const generation=path.join(root,'generation');await generateWorkbench({brief,cues},generation,{request:async prompt=>prompt.includes('Act as a teaching motion designer')?design:artifact});
  const audio=path.join(root,'audio.wav');execFileSync('ffmpeg',['-v','error','-f','lavfi','-i','sine=frequency=440:duration=0.6',audio]);
  const chapter={generation_directory:generation,sha256:sourceHash(artifact),scene:{duration_frames:30,narration:{text:brief.narration,audio_start_frame:6},captions:[{text:brief.narration,start_frame:6,end_frame:24}]},audio_file:audio};
  const preview=await previewWorkbench(chapter,path.join(root,'preview'));
  assert.equal(preview.geometry.status,'passed');assert.equal(preview.video,'video.mp4');assert.ok(preview.frames.includes('stills/frame-0.png'));assert.ok(preview.frames.includes('stills/frame-15.png'));assert.ok(preview.frames.includes('stills/frame-29.png'));
  const output=path.join(root,'export');await exportWorkbench({chapters:[chapter,chapter]},output);
  const probe=JSON.parse(execFileSync('ffprobe',['-v','error','-show_entries','format=duration:stream=codec_type,width,height,duration,nb_frames','-of','json',path.join(output,'video.mp4')],{encoding:'utf8'}));
  assert.ok(Math.abs(Number(probe.format.duration)-2)<1/30);const video=probe.streams.find((s:{codec_type:string})=>s.codec_type==='video');assert.equal(Number(video.nb_frames),60);assert.equal(Number(video.duration),2);assert.ok(probe.streams.some((s:{codec_type:string})=>s.codec_type==='audio'));assert.ok(probe.streams.some((s:{width:number;height:number})=>s.width===1920&&s.height===1080));
  const manifest=JSON.parse(await readFile(path.join(output,'composition.json'),'utf8'));manifest.chapters[0].sha256='0'.repeat(64);await writeFile(path.join(output,'composition.json'),JSON.stringify(manifest));await assert.rejects(renderWorkbench(output),/approval_required/);
 }finally{await rm(root,{recursive:true,force:true});}
});
