import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,mkdir,writeFile,readFile,rm,cp,symlink,realpath} from 'node:fs/promises';
import {randomUUID} from 'node:crypto';
import os from 'node:os';
import path from 'node:path';
import {runIsolatedRender} from '../src/isolated-render';
import {repositoryRoot} from '../src/files';

test('owned teaching execution binds host identity and container nonce label',async()=>{
 const base=await mkdtemp(path.join(os.tmpdir(),'teaching-owned-')),root=path.join(await realpath(base),randomUUID()),calls:string[][]=[];
 const previous=[process.env.TEACHING_HOST_NONCE,process.env.TEACHING_HOST_PGID];
 try{
  await mkdir(root);await writeFile(path.join(root,'input.json'),'{}');
  process.env.TEACHING_HOST_NONCE='b'.repeat(64);process.env.TEACHING_HOST_PGID='123456789';
  const execute=async(args:string[])=>{calls.push(args);if(args[0]==='create')return {stdout:'a'.repeat(64),stderr:''};if(args[0]==='start'||args[0]==='cp'&&args[1].includes(':/work/job/'))throw Error('render failed');return {stdout:'',stderr:''};};
  await assert.rejects(runIsolatedRender([path.join(repositoryRoot,'scripts/teaching-render-container.ts'),path.join(root,'input.json'),path.join(root,'render')],root,1000,execute),/render failed/);
  const identity=JSON.parse(await readFile(path.join(root,'execution.json'),'utf8'));
  assert.equal(identity.hostNonce,'b'.repeat(64));assert.equal(identity.hostPgid,123456789);
  assert.ok(calls.find(c=>c[0]==='create')!.includes('aicreater.teaching-execution-nonce='+identity.executionNonce));
 }finally{
  for(const [i,key] of ['TEACHING_HOST_NONCE','TEACHING_HOST_PGID'].entries()){if(previous[i]===undefined)delete process.env[key];else process.env[key]=previous[i];}
  await rm(base,{recursive:true,force:true});
 }
});

test('failed teaching create never removes an existing same-name container',async()=>{
 const root=await mkdtemp(path.join(os.tmpdir(),'teaching-conflict-'));const calls:string[][]=[];
 try{
  await writeFile(path.join(root,'input.json'),'{}');
  const execute=async(args:string[])=>{calls.push(args);throw Error('name already in use');};
  await assert.rejects(runIsolatedRender([path.join(repositoryRoot,'scripts/teaching-render-container.ts'),path.join(root,'input.json'),path.join(root,'render')],root,1000,execute),/cleanup-unconfirmed/);
  assert.deepEqual(calls.map(call=>call[0]),['create']);
 }finally{await rm(root,{recursive:true,force:true});}
});

test('a renamed live container cannot produce a cleanup proof when removal fails',async()=>{
 const root=await mkdtemp(path.join(os.tmpdir(),'teaching-renamed-'));const calls:string[][]=[];
 try{
  await writeFile(path.join(root,'input.json'),'{}');
  const execute=async(args:string[])=>{
   calls.push(args);
   if(args[0]==='create')return {stdout:'a'.repeat(64),stderr:''};
   if(args[0]==='rm')throw Error('remove failed');
   if(args[0]==='ps')return {stdout:args.includes('id='+'a'.repeat(64))?'a'.repeat(64):'',stderr:''};
   throw Error('render failed');
  };
  await assert.rejects(runIsolatedRender([path.join(repositoryRoot,'scripts/teaching-render-container.ts'),path.join(root,'input.json'),path.join(root,'render')],root,1000,execute),/cleanup-unconfirmed/);
  await assert.rejects(readFile(path.join(root,'cleanup.json')),/ENOENT/);
 }finally{await rm(root,{recursive:true,force:true});}
});

test('scratch removal failure never masks unconfirmed container cleanup',async()=>{
 const root=await mkdtemp(path.join(os.tmpdir(),'teaching-scratch-failure-'));const calls:string[][]=[];let scratchCalled=false;
 try{
  await writeFile(path.join(root,'input.json'),'{}');
  const execute=async(args:string[])=>{calls.push(args);if(args[0]==='create')return {stdout:'a'.repeat(64),stderr:''};throw Error('daemon unavailable');};
  const removeScratch=async(scratch:string)=>{scratchCalled=true;await rm(scratch,{recursive:true,force:true});throw Error('EACCES scratch cleanup');};
  await assert.rejects(runIsolatedRender([path.join(repositoryRoot,'scripts/teaching-render-container.ts'),path.join(root,'input.json'),path.join(root,'render')],root,1000,execute,undefined,removeScratch),/cleanup-unconfirmed/);
  assert.equal(scratchCalled,true);assert.equal(calls.some(call=>call[0]==='ps'),true);
  await assert.rejects(readFile(path.join(root,'cleanup.json')),/ENOENT/);
 }finally{await rm(root,{recursive:true,force:true});}
});

for(const teaching of [true,false])for(const mode of ['success','failure','signal-create','signal-start','signal-copy','signal-local-copy','diagnostics-missing','diagnostics-symlink','already-removed','cleanup-failure','scratch-failure'] as const){
 test(`isolated ${teaching?'teaching':'legacy'} lifecycle: `+mode,async()=>{
  const root=await mkdtemp(path.join(os.tmpdir(),'teaching-life-'));const calls:string[][]=[];
  try{
   await writeFile(path.join(root,'input.json'),'{}');
   const execute=async(args:string[])=>{
    calls.push(args);
    if(mode==='signal-create'&&args[0]==='create')process.emit('SIGTERM');
    if(mode==='signal-copy'&&args[0]==='cp'&&args[1]==='-a')process.emit('SIGTERM');
    if(args[0]==='start'){
     if(mode==='signal-start')process.emit('SIGTERM');
     if(['failure','signal-start','signal-copy','diagnostics-missing','diagnostics-symlink'].includes(mode))throw Error('render failed');
    }
    if(['rm','ps'].includes(args[0])&&mode==='cleanup-failure')throw Error('daemon unavailable');
    if(args[0]==='rm'&&mode==='already-removed')throw Error('already removed');
    if(args[0]==='cp'&&args[1].includes(':/work/job/')){
     if(mode==='diagnostics-missing')throw Error('no evidence');
     if(teaching){await mkdir(args[2],{recursive:true});await writeFile(path.join(args[2],'failure.json'),'{"original":true}');if(mode==='diagnostics-symlink')await symlink('/etc/passwd',path.join(args[2],'link'));}
     else await writeFile(args[2],'fake legacy media');
    }
    return {stdout:args[0]==='create'?'a'.repeat(64):args[0]==='inspect'?'0':'',stderr:''};
   };
   const entry=teaching?'scripts/teaching-render-container.ts':'packages/custom-scenes/src/workbench-render.ts';
   const copy=async(source:string,target:string)=>{await cp(source,target,{recursive:true});if(mode==='signal-local-copy')process.emit('SIGTERM');};
   const removeScratch=async(scratch:string)=>{await rm(scratch,{recursive:true,force:true});if(mode==='scratch-failure')throw Error('scratch cleanup failed');};
   const action=runIsolatedRender([path.join(repositoryRoot,entry),path.join(root,'input.json'),path.join(root,teaching?'render':'video.mp4')],root,1000,execute,copy,removeScratch);
   if(['success','already-removed'].includes(mode)||!teaching&&mode==='cleanup-failure')await action;else await assert.rejects(action,mode==='cleanup-failure'?/cleanup-unconfirmed/:/failed|cancelled/);
   assert.equal(calls.filter(c=>c[0]==='rm').length,1,'one final removal, never a signal/remove race');
   if(teaching){
    const identity=JSON.parse(await readFile(path.join(root,'execution.json'),'utf8'));const create=calls.find(c=>c[0]==='create')!;assert.equal(identity.containerName,create[create.indexOf('--name')+1]);assert.equal(identity.image,'aicreater-teaching-renderer:local');
    assert.equal(calls.find(c=>c[0]==='rm')![2],'a'.repeat(64),'remove only the immutable created container ID');
    if(mode!=='cleanup-failure'){
     const proof=JSON.parse(await readFile(path.join(root,'cleanup.json'),'utf8'));
     assert.equal(proof.schemaVersion,'teaching-container-cleanup:1');assert.equal(proof.status,'absent');
     assert.equal(proof.executionNonce,identity.executionNonce);assert.match(identity.executionNonce,/^[a-f0-9]{64}$/);
     assert.equal(proof.containerId,'a'.repeat(64));assert.equal(proof.jobId,identity.jobId);
    }
   }
   if(teaching&&['failure','signal-start','signal-copy'].includes(mode))assert.equal(JSON.parse(await readFile(path.join(root,'failure-evidence','render','failure.json'),'utf8')).original,true);
   if(teaching&&mode.startsWith('diagnostics'))assert.equal(JSON.parse(await readFile(path.join(root,'isolation-failure.json'),'utf8')).evidenceRecovered,false);
   if(mode.startsWith('signal'))assert.equal(calls.filter(c=>c[0]==='stop').length,mode==='signal-create'&&!teaching?0:1);
   if(mode==='signal-create')assert.equal(calls.filter(c=>c[0]==='start').length,0);
  }finally{await rm(root,{recursive:true,force:true});}
 });
}
