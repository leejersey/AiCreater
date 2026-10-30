import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {mkdtemp,lstat,readdir,mkdir,copyFile,writeFile,rm} from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {randomBytes,randomUUID} from 'node:crypto';
import {repositoryRoot} from './files';

export const renderImage='aicreater-renderer:local';
export const teachingRenderImage='aicreater-teaching-renderer:local';
const jobIdPattern=/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i;
export function teachingContainerName(jobId:string){
 if(!jobIdPattern.test(jobId))throw Error('isolated render: invalid teaching identity');
 return 'aicreater-teaching-'+jobId.toLowerCase();
}
const exec=promisify(execFile);
const docker=(args:string[],timeout=30000)=>exec('docker',args,{timeout,maxBuffer:1024*1024,env:{PATH:process.env.PATH,HOME:process.env.HOME,NODE_ENV:'production'}});

export function isolatedRenderCommand(args:string[],directory:string,name:string):string[]{
 const script=path.relative(repositoryRoot,args[0]);
 const teaching=script==='scripts/teaching-render-container.ts';
 if(!teaching&&!['scripts/render-custom-scene.ts','packages/custom-scenes/src/workbench-render.ts'].includes(script))throw Error('isolated render: unsupported entry');
 const root=path.resolve(directory);
 if(teaching&&(args.length!==3||path.resolve(args[1])!==path.join(root,'input.json')||path.resolve(args[2])!==path.join(root,'render')))throw Error('isolated render: invalid teaching paths');
 const mapped=args.slice(1).map(arg=>{
  const prefix=arg.startsWith('--design=')?'--design=':'';
  if(arg.startsWith('--approve=' )||arg==='--stills-only')return arg;
  const value=prefix?arg.slice(prefix.length):arg;
  const relative=path.relative(root,path.resolve(value));
  if(relative.startsWith('..')||path.isAbsolute(relative))throw Error('isolated render: input escapes frozen job');
  return prefix+path.posix.join('/work/job',relative.split(path.sep).join('/'));
 });
 return ['create','--name',name,...(teaching?['--pull=never','--label','aicreater.teaching-job='+path.basename(root)]:[]),'--init','--network','none','--cap-drop','ALL','--security-opt','no-new-privileges',
  '--pids-limit','256','--memory','4g','--cpus','2','--shm-size','256m','--user',`${process.getuid?.()??1000}:${process.getgid?.()??1000}`,
  teaching?teachingRenderImage:renderImage,'node','node_modules/tsx/dist/cli.mjs',script,...mapped];
}

async function inspectTree(root:string):Promise<void>{
 let bytes=0,count=0;
 const visit=async(file:string)=>{
  const info=await lstat(file);
  if(++count>1000||info.isSymbolicLink()||(!info.isFile()&&!info.isDirectory()))throw Error('isolated render: unsafe output');
  if(info.isFile()){bytes+=info.size;if(bytes>512*1024*1024)throw Error('isolated render: output too large');}
  else for(const item of await readdir(file))await visit(path.join(file,item));
 };
 await visit(root);
}
async function copyTree(source:string,target:string):Promise<void>{
 const info=await lstat(source);
 if(info.isDirectory()){await mkdir(target,{recursive:true});for(const item of await readdir(source))await copyTree(path.join(source,item),path.join(target,item));}
 else await copyFile(source,target);
}

type DockerExecutor=(args:string[],timeout?:number)=>Promise<{stdout:string;stderr:string}>;
function hostOwnership(){
 const hostNonce=process.env.TEACHING_HOST_NONCE,rawPgid=process.env.TEACHING_HOST_PGID;
 if(hostNonce===undefined&&rawPgid===undefined)return {};
 if(!hostNonce||!rawPgid||!/^[a-f0-9]{64}$/.test(hostNonce)||! /^[1-9][0-9]{0,9}$/.test(rawPgid))throw Error('isolated render: invalid host ownership');
 const hostPgid=Number(rawPgid);
 if(!Number.isSafeInteger(hostPgid)||hostPgid<2||hostPgid>2147483647)throw Error('isolated render: invalid host ownership');
 return {hostNonce,hostPgid};
}
async function inspectAncestors(directory:string){
 if(!path.isAbsolute(directory)||directory.split(path.sep).includes('..')||directory.length>4096)throw Error('isolated render: unsafe directory');
 let current=path.parse(directory).root;
 for(const part of directory.slice(current.length).split(path.sep).filter(Boolean)){
  current=path.join(current,part);const info=await lstat(current);
  if(info.isSymbolicLink()||!info.isDirectory())throw Error('isolated render: unsafe directory');
 }
}
export async function runIsolatedRender(args:string[],directory:string,timeout:number,execute:DockerExecutor=docker,copyOutput=copyTree,removeScratch=(root:string)=>rm(root,{recursive:true,force:true})):Promise<void>{
 const teaching=args[0].endsWith('teaching-render-container.ts'),jobId=path.basename(path.resolve(directory));
 const ownership=teaching?hostOwnership():{};
 if(teaching&&'hostNonce' in ownership){await inspectAncestors(directory);if(!jobIdPattern.test(jobId))throw Error('isolated render: invalid host ownership');}
 const name=teaching&&jobIdPattern.test(jobId)?teachingContainerName(jobId):'aicreater-render-'+randomUUID();
 const command=isolatedRenderCommand(args,directory,name);
 const scratch=await mkdtemp(path.join(os.tmpdir(),'aicreater-render-output-'));
 const executionNonce=randomBytes(32).toString('hex');let container=name;
 if(teaching)command.splice(3,0,'--label','aicreater.teaching-execution-nonce='+executionNonce);
 let interrupted=false,created=false,attempted=false,scratchFailed=false;let stopping:Promise<unknown>|undefined;
 const stopContainer=()=>stopping??=execute(['stop','--time','5',container]).catch(()=>{});
 const checkpoint=()=>{if(interrupted)throw Error('isolated render: cancelled');};
 const stop=()=>{interrupted=true;if(created)void stopContainer();};
 process.once('SIGTERM',stop);process.once('SIGINT',stop);
 try{
  await inspectTree(directory);
  if(teaching)await writeFile(path.join(directory,'execution.json'),JSON.stringify({schemaVersion:'teaching-container-execution:1',jobId,containerName:name,image:teachingRenderImage,executionNonce,...ownership}),{flag:'wx',mode:0o600});
  checkpoint();
  attempted=true;const result=await execute(command);
  if(teaching){if(!/^[a-f0-9]{64}$/.test(result.stdout.trim()))throw Error('isolated render: cleanup-unconfirmed');container=result.stdout.trim();}
  created=true;
  checkpoint();
  await execute(['cp','-a',directory,container+':/work/job'],60000);
  checkpoint();
  await execute(['start','-a',container],timeout);
  const state=await execute(['inspect','--format','{{.State.ExitCode}}',container]);
  if(state.stdout.trim()!=='0')throw Error('isolated render: container failed');
  const output=args[0].endsWith('teaching-render-container.ts')?'render':args[0].endsWith('render-custom-scene.ts')?'stills':'video.mp4';
  await execute(['cp',container+':/work/job/'+output,path.join(scratch,output)],60000);
  await inspectTree(scratch);
  checkpoint();
  await copyOutput(path.join(scratch,output),path.join(directory,output));
  checkpoint();
 }catch(error){
  if(teaching&&created){
   // Stop without deleting, then preserve bounded raw diagnostics as failure evidence only.
   await stopContainer();
   let recovered=false;
   try{
    const evidence=path.join(scratch,'failure-evidence');await mkdir(evidence);
    await execute(['cp',container+':/work/job/render',path.join(evidence,'render')],60000);
    await inspectTree(evidence);await copyTree(evidence,path.join(directory,'failure-evidence'));recovered=true;
   }catch{/* Original failure remains authoritative; partial evidence is never published. */}
   await writeFile(path.join(directory,'isolation-failure.json'),JSON.stringify({status:'failed',accepted:false,evidenceRecovered:recovered}));
  }
  throw error;
 }finally{
  process.off('SIGTERM',stop);process.off('SIGINT',stop);
  if(stopping)await stopping;
  try{
   // A failed create may refer to somebody else's existing container.
   if(attempted&&!created&&teaching)throw Error('isolated render: cleanup-unconfirmed');
   if(created)await execute(['rm','-f',container]);
  }catch(error){
   if(attempted&&!created)throw error;
   // Teaching removal errors are resolved only by the identity checks below.
  }finally{
   try{await removeScratch(scratch);}catch(error){if(teaching)scratchFailed=true;else throw error;}
  }
  if(teaching&&created){
   // Record proof only after all job writes and confirmed container removal.
   try{
    if((await execute(['ps','-a','--filter','id='+container,'--format','{{.ID}}'])).stdout.trim()!=='' ||
       (await execute(['ps','-a','--filter','name=^/'+name+'$','--format','{{.Names}}'])).stdout.trim()!=='')throw Error('container still exists');
    await writeFile(path.join(directory,'cleanup.json'),JSON.stringify({schemaVersion:'teaching-container-cleanup:1',jobId,containerName:name,containerId:container,executionNonce,status:'absent'}),{flag:'wx',mode:0o600});
   }catch{throw Error('isolated render: cleanup-unconfirmed');}
  }
  if(scratchFailed)throw Error('isolated render: scratch-cleanup-failed');
 }
}
