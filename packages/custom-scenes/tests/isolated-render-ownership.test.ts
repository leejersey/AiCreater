import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,mkdir,writeFile,readFile,rm,symlink} from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {randomUUID} from 'node:crypto';
import {runIsolatedRender} from '../src/isolated-render';
import {repositoryRoot} from '../src/files';

test('teaching execution binds host ownership and labels the same execution nonce',async()=>{
 const parent=await mkdtemp(path.join(os.tmpdir(),'owned-render-')),root=path.join(parent,randomUUID());
 const previous=[process.env.TEACHING_HOST_NONCE,process.env.TEACHING_HOST_PGID];
 try{
  await mkdir(root);await writeFile(path.join(root,'input.json'),'{}');
  process.env.TEACHING_HOST_NONCE='b'.repeat(64);process.env.TEACHING_HOST_PGID='12345';
  let create:string[]=[];
  await assert.rejects(runIsolatedRender([path.join(repositoryRoot,'scripts/teaching-render-container.ts'),path.join(root,'input.json'),path.join(root,'render')],root,1000,async args=>{create=args;throw Error('create interrupted');}),/cleanup-unconfirmed/);
  const record=JSON.parse(await readFile(path.join(root,'execution.json'),'utf8'));
  assert.equal(record.hostNonce,'b'.repeat(64));assert.equal(record.hostPgid,12345);
  assert.ok(create.includes('aicreater.teaching-execution-nonce='+record.executionNonce));
 }finally{
  for(const [i,key] of ['TEACHING_HOST_NONCE','TEACHING_HOST_PGID'].entries())if(previous[i]===undefined)delete process.env[key];else process.env[key]=previous[i];
  await rm(parent,{recursive:true,force:true});
 }
});

test('invalid or partial host binding fails before Docker and before execution record',async()=>{
 const parent=await mkdtemp(path.join(os.tmpdir(),'owned-invalid-'));
 const previous=[process.env.TEACHING_HOST_NONCE,process.env.TEACHING_HOST_PGID];
 try{
  for(const [nonce,pgid] of [['x','123'],['b'.repeat(64),'1'],['b'.repeat(64),'123x'],['b'.repeat(64),undefined],[undefined,'123']]){
   const root=path.join(parent,randomUUID());await mkdir(root);await writeFile(path.join(root,'input.json'),'{}');
   if(nonce===undefined)delete process.env.TEACHING_HOST_NONCE;else process.env.TEACHING_HOST_NONCE=nonce;
   if(pgid===undefined)delete process.env.TEACHING_HOST_PGID;else process.env.TEACHING_HOST_PGID=pgid;
   let called=false;
   await assert.rejects(runIsolatedRender([path.join(repositoryRoot,'scripts/teaching-render-container.ts'),path.join(root,'input.json'),path.join(root,'render')],root,1000,async()=>{called=true;return {stdout:'',stderr:''};}),/host ownership/);
   assert.equal(called,false);await assert.rejects(readFile(path.join(root,'execution.json')),/ENOENT/);
  }
 }finally{
  for(const [i,key] of ['TEACHING_HOST_NONCE','TEACHING_HOST_PGID'].entries())if(previous[i]===undefined)delete process.env[key];else process.env[key]=previous[i];
  await rm(parent,{recursive:true,force:true});
 }
});

test('a symlink ancestor never authorizes Docker',async()=>{
 const parent=await mkdtemp(path.join(os.tmpdir(),'owned-link-'));
 try{
  const actual=path.join(parent,'actual');await mkdir(actual);await symlink(actual,path.join(parent,'link'));
  const root=path.join(parent,'link',randomUUID());await mkdir(root);await writeFile(path.join(root,'input.json'),'{}');
  let called=false;
  await assert.rejects(runIsolatedRender([path.join(repositoryRoot,'scripts/teaching-render-container.ts'),path.join(root,'input.json'),path.join(root,'render')],root,1000,async()=>{called=true;return {stdout:'',stderr:''};}),/unsafe/);
  assert.equal(called,false);
 }finally{await rm(parent,{recursive:true,force:true});}
});
