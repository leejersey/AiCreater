import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdir,readFile,writeFile} from 'node:fs/promises';
import {randomUUID} from 'node:crypto';
import {execFileSync,spawn} from 'node:child_process';
import path from 'node:path';
import {sourceHash,parseArtifact,assertApproval} from '../src/contract';
import {parseDesign,designHash,reviewScene} from '../src/design';
import {repositoryRoot} from '../src/files';
import {workbenchRoot,scrubRenderEnvironment} from '../src/workbench';

// Explicit, offline QA only. The production CLI has no fixture or injection mode.
test('retained UUID-owned CLI smoke from previously reviewed opening and existing recorded audio',{skip:process.env.RUN_WORKBENCH_LOCAL_SMOKE!=='1',timeout:600000},async()=>{
 const assembly=JSON.parse(await readFile(path.join(repositoryRoot,'output/visual-agent/full-course-assembly/assembly.json'),'utf8'));
 const existing=assembly.chapters.find((c:{chapter:string})=>c.chapter==='opening');
 const artifact=parseArtifact(existing.artifact),design=parseDesign(existing.design,artifact.brief);
 assertApproval(artifact,existing.approval);assert.equal(reviewScene(existing.review,artifact,design).verdict,'pass');
 const root=path.join(workbenchRoot,randomUUID());const generation=path.join(root,randomUUID()),preview=path.join(root,randomUUID()),exported=path.join(root,randomUUID());
 await mkdir(generation,{recursive:true,mode:0o700});
 const json=async(file:string,value:unknown)=>writeFile(file,JSON.stringify(value,null,2)+'\n',{mode:0o600,flag:'wx'});
 const result={sha256:sourceHash(artifact),design_sha256:designHash(design),source:artifact.source,rationale:artifact.rationale,design,requests_dispatched:0};
 await json(path.join(generation,'artifact.json'),artifact);await json(path.join(generation,'artifact.json.design.json'),design);await json(path.join(generation,'design.json'),design);await writeFile(path.join(generation,'source.txt'),artifact.source,{mode:0o600});await json(path.join(generation,'result.json'),result);await json(path.join(generation,'provenance.json'),{qaOnly:true,source:'output/visual-agent/full-course-assembly/assembly.json',approval:existing.approval,review:existing.review});
 const rows=assembly.audioManifest.segments.filter((s:{chapter:string})=>s.chapter==='opening');
 const audio=path.join(root,'audio.wav');
 const inputs=rows.flatMap((s:{audio:string})=>['-i',path.join(repositoryRoot,'output/visual-agent/full-course-assembly/public',s.audio)]);
 const delays=rows.map((s:{start:number},i:number)=>`[${i}:a]adelay=${Math.round((s.start-rows[0].start)*1000)}:all=1[a${i}]`).join(';');
 const mix=`${rows.map((_s:unknown,i:number)=>`[a${i}]`).join('')}amix=inputs=${rows.length}:duration=longest:dropout_transition=0:normalize=0[out]`;
 execFileSync('ffmpeg',['-v','error',...inputs,'-filter_complex',delays+';'+mix,'-map','[out]','-c:a','pcm_s16le',audio],{timeout:30000});
 const chapter={generation_directory:generation,sha256:result.sha256,scene:{duration_frames:artifact.brief.durationInFrames,narration:{text:artifact.brief.narration,audio_start_frame:0},captions:design.cues.map(c=>({text:c.text,start_frame:c.startFrame,end_frame:c.endFrame}))},audio_file:audio};
 const previewInput=path.join(root,'preview-input.json'),exportInput=path.join(root,'export-input.json');await json(previewInput,chapter);await json(exportInput,{chapters:[chapter]});
 const summary={root,generation,preview,exported,previewInput,exportInput,sha256:result.sha256,design_sha256:result.design_sha256,durationInFrames:artifact.brief.durationInFrames};
 await json(path.join(root,'smoke.json'),summary);console.log('WORKBENCH_SMOKE '+JSON.stringify(summary));
 async function cli(command:string,input:string,output:string){await new Promise<void>((resolve,reject)=>{const child=spawn(process.execPath,[path.join(repositoryRoot,'node_modules/tsx/dist/cli.mjs'),path.join(repositoryRoot,'scripts/visual-workbench.ts'),command,input,output],{cwd:repositoryRoot,env:scrubRenderEnvironment(process.env),stdio:['ignore','pipe','pipe']});let log='';child.stdout.on('data',b=>{log+=b});child.stderr.on('data',b=>{log+=b});child.once('error',reject);child.once('close',code=>code===0?resolve():reject(Error(log)));});}
 await cli('preview',previewInput,preview);const previewResult=JSON.parse(await readFile(path.join(preview,'result.json'),'utf8'));assert.equal(previewResult.geometry.status,'passed');assert.equal(previewResult.video,'video.mp4');
 await cli('export',exportInput,exported);
 for(const directory of [preview,exported]){
  const probe=JSON.parse(execFileSync('ffprobe',['-v','error','-show_entries','format=duration:stream=codec_type,width,height,nb_frames,duration','-of','json',path.join(directory,'video.mp4')],{encoding:'utf8',timeout:30000}));
  const video=probe.streams.find((s:{codec_type:string})=>s.codec_type==='video');assert.equal(Number(video.nb_frames),artifact.brief.durationInFrames);assert.equal(video.width,1920);assert.equal(video.height,1080);assert.ok(probe.streams.some((s:{codec_type:string})=>s.codec_type==='audio'));assert.ok((await readFile(path.join(directory,'video.srt'),'utf8')).includes(design.cues[0].text));await json(path.join(directory,'ffprobe.json'),probe);
 }
 console.log('WORKBENCH_SMOKE_VERIFIED '+JSON.stringify(summary));
});
