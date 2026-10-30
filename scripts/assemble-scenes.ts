import './loopback.cjs';
import {bundle} from '@remotion/bundler';
import {openBrowser,selectComposition,renderStill,renderMedia,makeCancelSignal} from '@remotion/renderer';
import {mkdir,mkdtemp,readFile,writeFile,copyFile,rm} from 'node:fs/promises';
import path from 'node:path';
import {existsSync} from 'node:fs';
import {execFileSync,spawn} from 'node:child_process';
import {createHash} from 'node:crypto';
import {prepareAssembly,verifyAssembly,verifyAssemblyVideoMetadata,assemblyRenderTimeout} from '../packages/custom-scenes/src/assembly-files';
import {assemblySrt} from '../packages/custom-scenes/src/assembly';
import {ensureOutputAbsent,repositoryRoot} from '../packages/custom-scenes/src/files';

async function snapshot(input:string,temp:string){
 const original=await verifyAssembly(input);
 await mkdir(path.join(temp,'public','audio'),{recursive:true});
 for(const file of ['assembly.json','entry.tsx',...original.chapters.map((_,i)=>`scene-${i}.tsx`)])await copyFile(path.join(input,file),path.join(temp,file));
 for(const chapter of original.timeline.chapters)for(const audio of chapter.audio)await copyFile(path.join(input,'public',audio.file),path.join(temp,'public',audio.file));
 const frozen=await verifyAssembly(temp);
 if(frozen.sha256!==original.sha256)throw Error('assembly: snapshot changed during copy');
 return frozen;
}
async function preview(input:string,port:number){
 const temp=await mkdtemp(path.join(repositoryRoot,'.assembly-preview-'));
 try{
  await snapshot(input,temp);
  const child=spawn(process.execPath,['--require',path.join(repositoryRoot,'scripts/loopback.cjs'),path.join(repositoryRoot,'node_modules/@remotion/cli/remotion-cli.js'),'studio',path.join(temp,'entry.tsx'),'--public-dir='+path.join(temp,'public'),'--port='+port,'--no-open'],{stdio:'inherit',cwd:repositoryRoot});
  const interrupt=()=>child.kill('SIGTERM');process.on('SIGINT',interrupt);process.on('SIGTERM',interrupt);
  try{await new Promise<void>((resolve,reject)=>{child.once('error',reject);child.once('exit',code=>code===0?resolve():reject(Error('assembly: preview exited '+code)));});}
  finally{process.off('SIGINT',interrupt);process.off('SIGTERM',interrupt);}
 }finally{await rm(temp,{recursive:true,force:true});}
}
async function render(input:string,out:string,stillsOnly:boolean){
 await ensureOutputAbsent(out);
 const temp=await mkdtemp(path.join(repositoryRoot,'.assembly-render-'));
 let browser:Awaited<ReturnType<typeof openBrowser>>|undefined,timer:ReturnType<typeof setTimeout>|undefined;
 const {cancel,cancelSignal}=makeCancelSignal();let cancelled=false;
 const interrupt=()=>{cancelled=true;cancel();};
 const checkpoint=()=>{if(cancelled)throw Error('assembly: cancelled or timed out');};
 process.on('SIGINT',interrupt);process.on('SIGTERM',interrupt);
 let reserved=false;
 try{
  const frozen=await snapshot(input,temp);
  await mkdir(path.dirname(path.resolve(out)),{recursive:true});await mkdir(out);reserved=true;
  timer=setTimeout(interrupt,assemblyRenderTimeout(frozen.timeline.durationInFrames));
  const serveUrl=await bundle({entryPoint:path.join(temp,'entry.tsx'),publicDir:path.join(temp,'public'),outDir:path.join(temp,'bundle')});checkpoint();
  const executable=process.env.REMOTION_BROWSER_EXECUTABLE??(existsSync('/Applications/Google Chrome.app/Contents/MacOS/Google Chrome')?'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome':undefined);
  browser=await openBrowser('chrome',{browserExecutable:executable});checkpoint();
  const composition=await selectComposition({serveUrl,id:'ReviewedAssembly',puppeteerInstance:browser});
  const frames=[...new Set(frozen.timeline.chapters.flatMap(c=>[c.from,c.from+Math.floor(c.durationInFrames/2),c.from+c.durationInFrames-1,...c.cues.flatMap(q=>[c.from+q.startFrame,c.from+q.endFrame-1])]))].sort((a,b)=>a-b);
  const frameHashes:Record<string,string>={};
  for(const frame of frames){checkpoint();const name=`frame-${frame}.png`;await renderStill({serveUrl,composition,puppeteerInstance:browser,frame,imageFormat:'png',output:path.join(out,name),cancelSignal,timeoutInMilliseconds:30000});frameHashes[name]=createHash('sha256').update(await readFile(path.join(out,name))).digest('hex');}
  let metadata:unknown=null;
  if(!stillsOnly){
   const video=path.join(out,'video.mp4');let last=-1;
   await renderMedia({serveUrl,composition,puppeteerInstance:browser,codec:'h264',audioCodec:'aac',pixelFormat:'yuv420p',outputLocation:video,concurrency:2,cancelSignal,timeoutInMilliseconds:30000,overwrite:false,onProgress:({progress})=>{const p=Math.floor(progress*10)*10;if(p!==last){last=p;console.log(`render ${p}%`);}}});checkpoint();
   const result=JSON.parse(execFileSync('ffprobe',['-v','error','-show_entries','format=duration:stream=codec_type,width,height','-of','json',video],{encoding:'utf8',timeout:30000}));
   verifyAssemblyVideoMetadata(result,frozen.timeline.durationInFrames);
   metadata=result;
  }
  await writeFile(path.join(out,'video.srt'),assemblySrt(frozen.timeline),{flag:'wx'});
  await writeFile(path.join(out,'timeline.json'),JSON.stringify(frozen.timeline,null,2),{flag:'wx'});
  const report={schemaVersion:'scene-assembly-render:1',sha256:frozen.sha256,technical:'passed',visual:'pending',purpose:'Reviewed local chapter integration; not autonomous-generation acceptance',paidRequests:0,durationInFrames:frozen.timeline.durationInFrames,fps:30,chapters:frozen.timeline.chapters.map(c=>({chapter:c.chapter,from:c.from,durationInFrames:c.durationInFrames,sha256:c.sha256,designSha256:c.designSha256,visual:c.visual})),frames:frames.map(f=>`frame-${f}.png`),frameHashes,metadata,trust:'Explicitly approved local source, NOT sandboxed execution'};
  await writeFile(path.join(out,'report.json'),JSON.stringify(report,null,2),{flag:'wx'});
  console.log(JSON.stringify({output:path.resolve(out),...report,frameHashes:undefined},null,2));
 }catch(error){if(reserved)await writeFile(path.join(out,'failure.json'),JSON.stringify({error:String(error)}));throw error;}
 finally{if(timer)clearTimeout(timer);process.off('SIGINT',interrupt);process.off('SIGTERM',interrupt);try{if(browser)await browser.close({silent:true});}finally{await rm(temp,{recursive:true,force:true});}}
}
async function main(){
 const [command,input,out,...flags]=process.argv.slice(2);
 if(command==='prepare'&&input&&out&&!flags.length){console.log(JSON.stringify(await prepareAssembly(path.resolve(input),path.resolve(out)),null,2));return;}
 if(command==='verify'&&input&&!out){const v=await verifyAssembly(path.resolve(input));console.log(JSON.stringify({sha256:v.sha256,durationInFrames:v.timeline.durationInFrames,chapters:v.timeline.chapters.map(c=>({chapter:c.chapter,visual:c.visual}))}));return;}
 if(command==='preview'&&input&&(!out||/^--port=\d{4,5}$/.test(out))&&!flags.length){const port=out?Number(out.slice(7)):3101;if(port<1024||port>65535)throw Error('assembly: invalid port');await preview(path.resolve(input),port);return;}
 if(command==='render'&&input&&out&&(!flags.length||(flags.length===1&&flags[0]==='--stills-only'))){await render(path.resolve(input),path.resolve(out),flags.length===1);return;}
 throw Error('Usage: custom:assemble prepare input.json new-directory | verify frozen-directory | preview frozen-directory [--port=3101] | render frozen-directory new-output-directory [--stills-only]');
}
main().catch(error=>{console.error(error instanceof Error?error.message:String(error));process.exitCode=1;});
