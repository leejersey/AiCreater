import '../../../scripts/loopback.cjs';
import {bundle} from '@remotion/bundler';
import {openBrowser,selectComposition,renderStill} from '@remotion/renderer';
import {mkdir,mkdtemp,readFile,writeFile,rm,lstat,rename} from 'node:fs/promises';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {repositoryRoot} from './files';
import {teachingRuntimeSnapshot} from './teaching-artifact';
import {renderTeachingArtifactRecovering} from './teaching-render';
import {verifyTeachingRenderOutput} from './teaching-render-receipt';
import {validateTeachingAudiovisual,assertTeachingAudiovisualMedia,teachingCaptionsSrt,type TeachingAudiovisual} from './teaching-audiovisual';

const exec=promisify(execFile),sha=(b:Buffer)=>createHash('sha256').update(b).digest('hex');
const env=()=>Object.fromEntries(['PATH','HOME','TMPDIR','LANG'].filter(k=>process.env[k]!==undefined).map(k=>[k,process.env[k]]));
async function ffmpeg(args:string[],maximum=128*1024*1024){return (await exec('ffmpeg',['-nostdin','-v','error','-threads','1','-filter_threads','1','-filter_complex_threads','1',...args],{timeout:240000,maxBuffer:maximum,encoding:'buffer',env:env()})).stdout;}
async function probe(file:string){return JSON.parse((await exec('ffprobe',['-v','error','-count_frames','-show_entries','format=duration:stream=codec_type,codec_name,width,height,r_frame_rate,nb_read_frames,start_time,duration,sample_rate,channels','-of','json',file],{timeout:60000,maxBuffer:128*1024,env:env()})).stdout);}

async function captionPlates(a:TeachingAudiovisual,folder:string){
 await mkdir(folder);
 const temp=await mkdtemp(path.join(repositoryRoot,'.teaching-caption-'));
 let browser:Awaited<ReturnType<typeof openBrowser>>|undefined;
 try{
  for(const file of (await teachingRuntimeSnapshot()).fonts){const target=path.join(temp,'font',file.name);await mkdir(path.dirname(target),{recursive:true});await writeFile(target,file.bytes);}
  const texts=a.captions.map(c=>c.text).join(''),layouts=a.captionLayouts;
  const entry=`import React,{useEffect,useLayoutEffect,useRef,useState} from 'react';
import {Composition,registerRoot,useCurrentFrame,delayRender,continueRender,cancelRender} from 'remotion';import './font/400.css';
const lines=${JSON.stringify(layouts)};
function Caption(){const frame=useCurrentFrame(),root=useRef(null),[handle]=useState(()=>delayRender('bound caption font')),[ready,setReady]=useState(false),released=useRef(false);
useEffect(()=>{let live=true;Promise.all([document.fonts.load('400 32px "Noto Sans SC"',${JSON.stringify(texts)}),document.fonts.ready]).then(()=>{if(live)setReady(true)}).catch(cancelRender);return()=>{live=false}},[]);
useLayoutEffect(()=>{if(!ready||!root.current)return;const elements=[...root.current.querySelectorAll('span')];const report={frame,text:elements.map(e=>e.textContent),boxes:elements.map(e=>{const b=e.getBoundingClientRect();return{x:b.x,y:b.y,width:b.width,height:b.height}}),font:document.fonts.check('400 32px "Noto Sans SC"',${JSON.stringify(texts)})};console.info('TEACHING_CAPTION:'+JSON.stringify(report));if(!released.current){released.current=true;continueRender(handle)}},[ready,frame]);
return <div ref={root} style={{width:1920,height:96,background:'#000',color:'#fff',display:'flex',flexDirection:'column',justifyContent:'center',fontFamily:'Noto Sans SC',fontSize:32,lineHeight:'40px',letterSpacing:0}}>{lines[frame].map((line,i)=><span key={i} style={{display:'block',width:'fit-content',margin:'0 auto',whiteSpace:'pre'}}>{line}</span>)}</div>}
registerRoot(()=> <Composition id="Caption" component={Caption} width={1920} height={96} fps={30} durationInFrames={lines.length}/>);`;
  const entryPoint=path.join(temp,'index.tsx');await writeFile(entryPoint,entry);await mkdir(path.join(temp,'public'));
  const serveUrl=await bundle({entryPoint,publicDir:path.join(temp,'public'),outDir:path.join(temp,'bundle')});
  browser=await openBrowser('chrome',{browserExecutable:process.env.REMOTION_BROWSER_EXECUTABLE??'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'});
  const composition=await selectComposition({serveUrl,id:'Caption',puppeteerInstance:browser}),audits=[];
  for(let frame=0;frame<a.captions.length;frame++){
   let audit:any;let invalid=false;
   await renderStill({serveUrl,composition,puppeteerInstance:browser,frame,imageFormat:'png',output:path.join(folder,'caption-'+frame+'.png'),timeoutInMilliseconds:30000,logLevel:'error',onBrowserLog:log=>{
    if(!log.text.startsWith('TEACHING_CAPTION:'))return;
    try{if(log.text.length>4096)throw Error();const item=JSON.parse(log.text.slice(17));if(item.frame===frame)audit=item;}catch{invalid=true;}
   }});
   if(invalid||!audit||audit.font!==true||JSON.stringify(audit.text)!==JSON.stringify(layouts[frame])||!Array.isArray(audit.boxes)||audit.boxes.length!==layouts[frame].length||audit.boxes.some((b:any)=>![b.x,b.y,b.width,b.height].every(Number.isFinite)||b.x<48||b.y<0||b.width<=0||b.height<=0||b.x+b.width>1872||b.y+b.height>96))throw Error('teaching_av: actual caption font or layout failed');
   audits.push(audit);
  }
  await writeFile(path.join(folder,'layout-report.json'),JSON.stringify({status:'passed',audiovisualSha256:a.audiovisualSha256,audits}));
 }finally{try{if(browser)await browser.close({silent:true});}finally{await rm(temp,{recursive:true,force:true});}}
}

async function verifyPixels(a:TeachingAudiovisual,visual:string,video:string,folder:string){
 const band=async(file:string)=>ffmpeg(['-i',file,'-map','0:v:0','-vf','crop=1920:96:0:980,scale=960:48,format=rgb24,extractplanes=r','-f','rawvideo','pipe:1'],180*1024*1024);
 const actual=await band(video),before=await band(visual),size=960*48,total=a.artifact.brief.durationInFrames;
 if(actual.length!==size*total||before.length!==actual.length)throw Error('teaching_av: caption pixel frame coverage incomplete');
 const refs=[];
 for(let i=0;i<a.captions.length;i++)refs.push(await ffmpeg(['-i',path.join(folder,'caption-'+i+'.png'),'-vf','scale=960:48,format=rgb24,extractplanes=r','-frames:v','1','-f','rawvideo','pipe:1'],size*2));
 for(let frame=0;frame<total;frame++){
  const index=a.captions.findIndex(c=>frame>=c.start_frame&&frame<c.end_frame),offset=frame*size;
  const ref=index<0?before.subarray(offset,offset+size):refs[index];
  if(ref.length!==size)throw Error('teaching_av: caption plate missing');
  let error=0,bright=0,matched=0;
  for(let p=0;p<size;p++){const value=actual[offset+p];error+=Math.abs(value-ref[p]);if(index>=0&&ref[p]>180){bright++;if(Math.abs(value-ref[p])<45)matched++;}}
  if(error/size>10||(index>=0&&(bright<10||matched/bright<.9)))throw Error('teaching_av: burned caption pixels or exact timing failed at frame '+frame);
 }
 return {status:'passed',frames:total,captionCount:a.captions.length,audiovisualSha256:a.audiovisualSha256};
}
async function verifyWaveform(a:TeachingAudiovisual,input:string,video:string){
 const pcm=(file:string)=>ffmpeg(['-i',file,'-map','0:a:0','-ac','1','-ar','48000','-f','s16le','pipe:1'],24*1024*1024);
 const source=await pcm(input),output=await pcm(video),delay=a.audioStartFrame*1600,total=a.artifact.brief.durationInFrames*1600;
 if(output.length<total*2||output.length>(total+1024)*2||delay*2+source.length>total*2+3200)throw Error('teaching_av: decoded audio coverage mismatch');
 let early=0;
 for(let i=0;i<Math.max(0,delay-1024);i++)early=Math.max(early,Math.abs(output.readInt16LE(i*2)));
 if(early>64)throw Error('teaching_av: audio precedes its frozen offset');
 let dot=0,x2=0,y2=0;
 const count=Math.min(source.length/2,total-delay);
 for(let i=0;i<count;i+=8){const x=source.readInt16LE(i*2),y=output.readInt16LE((i+delay)*2);dot+=x*y;x2+=x*x;y2+=y*y;}
 const correlation=x2>count/8?dot/Math.sqrt(x2*y2):undefined;
 if(correlation===undefined?y2>count*100:!Number.isFinite(correlation)||correlation<.92)throw Error('teaching_av: source audio does not match its frozen playback offset');
 return {status:'passed',audioStartFrame:a.audioStartFrame,decodedSamples:output.length/2,...(correlation===undefined?{silentSource:true}:{correlation})};
}

export async function renderTeachingAudiovisual(value:unknown,expected:string,audioFile:string,output:string){
 const a=await validateTeachingAudiovisual(value,expected),info=await lstat(audioFile);
 if(!info.isFile()||info.isSymbolicLink()||info.size!==a.audioBytes||sha(await readFile(audioFile))!==a.audioSha256)throw Error('teaching_av: audio bytes changed');
 const source=await probe(audioFile),seconds=Number(source?.format?.duration);
 if(source?.streams?.length!==1||source.streams[0].codec_type!=='audio'||!Number.isFinite(seconds)||Math.abs(Math.ceil(seconds*1000)-a.audioDurationMs)>1)throw Error('teaching_av: audio media changed');
 const root=path.resolve(output);await mkdir(root);
 let phase='visual';
 try{
  const rendered=await renderTeachingArtifactRecovering(a.artifact,a.artifactSha256,path.join(root,'visual'));
  const visual=await verifyTeachingRenderOutput(a.artifact,rendered,path.join(root,'visual'));
  const visualFile=path.join(root,'visual',visual.previewFile),plates=path.join(root,'captions');
  phase='caption-layout';
  await captionPlates(a,plates);
  const srt=teachingCaptionsSrt(a),captionsSha256=sha(Buffer.from(srt));
  await writeFile(path.join(root,'captions.srt'),srt,{flag:'wx'});
  const args=['-threads','1','-i',visualFile,'-threads','1','-i',audioFile];
  a.captions.forEach((_,i)=>args.push('-threads','1','-i',path.join(plates,'caption-'+i+'.png')));
  // Composite in full-range RGB, then convert once; mixing full/limited YUV lifts caption black.
  let previous='base';const filters:string[]=['[0:v]format=rgb24[base]'];
  a.captions.forEach((c,i)=>{filters.push(`[${previous}][${i+2}:v]overlay=0:980:format=rgb:enable='gte(n,${c.start_frame})*lt(n,${c.end_frame})':eof_action=repeat[v${i}]`);previous='v'+i;});
  filters.push(`[${previous}]scale=in_range=pc:out_range=tv,format=yuv420p[vout]`);
  const samples=a.artifact.brief.durationInFrames*1600;
  filters.push(`[1:a]aresample=48000,adelay=${a.audioStartFrame*1600}S:all=1,apad,atrim=end_sample=${samples},asetpts=PTS-STARTPTS[a]`);
  const pending=path.join(root,'video.pending.mp4');
  phase='mux';
  await ffmpeg([...args,'-filter_complex',filters.join(';'),'-map','[vout]','-map','[a]','-c:v','libx264','-threads','2','-preset','fast','-crf','18','-pix_fmt','yuv420p','-color_range','tv','-r','30','-c:a','aac','-b:a','128k','-ac','1','-ar','48000','-t',String(a.artifact.brief.durationInFrames/30),'-movflags','+faststart','-n',pending],1024*1024);
  phase='media-audit';
  const media=await probe(pending);assertTeachingAudiovisualMedia(media,a.artifact.brief.durationInFrames);
  phase='caption-pixels';
  const pixels=await verifyPixels(a,visualFile,pending,plates);
  phase='audio-waveform';
  const waveform=await verifyWaveform(a,audioFile,pending);
  if(sha(await readFile(audioFile))!==a.audioSha256)throw Error('teaching_av: source audio changed during rendering');
  const videoSha256=sha(await readFile(pending));await rename(pending,path.join(root,'video.mp4'));
  const report={status:'audiovisual-ready' as const,audiovisualSha256:a.audiovisualSha256,artifactSha256:a.artifactSha256,
   previewFile:'video.mp4',videoSha256,captionsSha256,visual,pixels,waveform,media,accepted:false as const};
  await writeFile(path.join(root,'audiovisual.json'),JSON.stringify(a));await writeFile(path.join(root,'av-report.json'),JSON.stringify(report));
  return report;
 }catch(error){await writeFile(path.join(root,'av-failure.json'),JSON.stringify({status:'failed',phase,accepted:false,audiovisualSha256:a.audiovisualSha256,
  detail:error instanceof Error&&error.message.startsWith('teaching_av:')?error.message.slice(0,256):'Fixed media stage failed; original output retained'}));throw error;}
}

/** Independently recheck returned bytes, visual coverage, caption pixels and decoded audio. */
export async function verifyTeachingAudiovisualOutput(value:unknown,expected:string,audioFile:string,output:string){
 const a=await validateTeachingAudiovisual(value,expected),root=path.resolve(output);
 await validateTeachingAudiovisual(JSON.parse((await readFile(path.join(root,'audiovisual.json'))).toString()),expected);
 const report=JSON.parse((await readFile(path.join(root,'av-report.json'))).toString());
 if(report.status!=='audiovisual-ready'||report.accepted!==false||report.audiovisualSha256!==expected||report.artifactSha256!==a.artifactSha256||report.previewFile!=='video.mp4'||report.visual?.status!=='preview-ready')throw Error('teaching_av: invalid returned receipt');
 const file=path.join(root,'video.mp4'),videoSha256=sha(await readFile(file));
 if(videoSha256!==report.videoSha256||sha(await readFile(audioFile))!==a.audioSha256)throw Error('teaching_av: returned media checksum mismatch');
 const srt=await readFile(path.join(root,'captions.srt'));
 if(srt.toString()!==teachingCaptionsSrt(a)||sha(srt)!==report.captionsSha256)throw Error('teaching_av: subtitle track changed');
 const visual=await verifyTeachingRenderOutput(a.artifact,{status:'preview-ready',artifactSha256:report.visual.artifactSha256,previewPath:path.resolve(root,'visual',report.visual.previewFile)},path.join(root,'visual'));
 const media=await probe(file);assertTeachingAudiovisualMedia(media,a.artifact.brief.durationInFrames);
 const pixels=await verifyPixels(a,path.join(root,'visual',visual.previewFile),file,path.join(root,'captions'));
 const waveform=await verifyWaveform(a,audioFile,file);
 return {status:'audiovisual-ready' as const,audiovisualSha256:expected,artifactSha256:a.artifactSha256,
  previewFile:'video.mp4',videoSha256,captionsSha256:sha(srt),visual,pixels,waveform,media,accepted:false as const};
}
