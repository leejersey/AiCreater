import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,writeFile,readFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {spawnSync} from 'node:child_process';
import {saveGeneratedCandidate} from '../src/files';
import {parseArtifact} from '../src/contract';
const brief={schemaVersion:'custom-scene-brief:1',id:'wallet',title:'预算',narration:'信息有限。',visualGoal:'画钱包',facts:[],materials:[],width:1920,height:1080,fps:30,durationInFrames:60};
const source='import React from "react";export default function Scene({frame}:{frame:number}){return <svg><text>{frame}</text></svg>}';
const run=(...args:string[])=>spawnSync(process.execPath,['--import','tsx','scripts/custom-scene.ts',...args],{encoding:'utf8'});
test('local prepare and pack require no key, check emits exact approval hash, output never overwritten',async()=>{
 const dir=await mkdtemp(path.join(tmpdir(),'custom-cli-'));
 try{
  const b=path.join(dir,'brief.json'),s=path.join(dir,'Scene.tsx'),out=path.join(dir,'scene.json'),prompt=path.join(dir,'prompt.txt');
  await writeFile(b,JSON.stringify(brief));await writeFile(s,source);
  assert.equal(run('prepare',b,prompt).status,0);
  assert.match(await readFile(prompt,'utf8'),/SVG/);
  const packed=run('pack',b,s,out);assert.equal(packed.status,0,packed.stderr);
  const checked=run('check',out);assert.equal(checked.status,0,checked.stderr);assert.match(checked.stdout,/"sha256":\s*"[a-f0-9]{64}"/);
  const previous=await readFile(out,'utf8');assert.notEqual(run('pack',b,s,out).status,0);assert.equal(await readFile(out,'utf8'),previous);
  const feedback=path.join(dir,'feedback.txt'),revision=path.join(dir,'revision.txt');await writeFile(feedback,'钱包和纸片重叠，调整布局。');
  assert.equal(run('revise',out,feedback,revision).status,0);assert.match(await readFile(revision,'utf8'),/钱包和纸片重叠/);
 }finally{await rm(dir,{recursive:true,force:true});}
});
test('local renderer refuses missing or stale approval before bundling and before output exists',async()=>{
 const dir=await mkdtemp(path.join(tmpdir(),'custom-approval-'));
 try{
  const artifact=path.join(dir,'scene.json'),out=path.join(dir,'render');
  await writeFile(artifact,JSON.stringify({schemaVersion:'custom-scene:1',brief,rationale:'演示',source}));
  const result=spawnSync(process.execPath,['--import','tsx','scripts/render-custom-scene.ts',artifact,out],{encoding:'utf8'});
  assert.equal(result.status,1);assert.match(result.stderr,/approval_required/);await assert.rejects(readFile(path.join(out,'report.json')),/ENOENT/);
 }finally{await rm(dir,{recursive:true,force:true});}
});
test('generated sources must compile before check accepts them',async()=>{
 const dir=await mkdtemp(path.join(tmpdir(),'custom-type-'));
 try{
  const artifact=path.join(dir,'scene.json');await writeFile(artifact,JSON.stringify({schemaVersion:'custom-scene:1',brief,rationale:'演示',source:'export default function Scene(){return <div>{missingValue}</div>}'}));
  const result=run('check',artifact);assert.equal(result.status,1);assert.match(result.stderr,/custom_scene_typecheck/);
 }finally{await rm(dir,{recursive:true,force:true});}
});
test('paid generation checks output collision before key lookup or provider request',async()=>{
 const dir=await mkdtemp(path.join(tmpdir(),'custom-cost-'));
 try{
  const b=path.join(dir,'brief.json'),out=path.join(dir,'artifact.json');await writeFile(b,JSON.stringify(brief));await writeFile(out,'original');
  const result=run('generate',b,out,'--confirm-cost');assert.equal(result.status,1);assert.match(result.stderr,/output_exists/);assert.equal(await readFile(out,'utf8'),'original');
 }finally{await rm(dir,{recursive:true,force:true});}
});
test('a paid candidate with type errors is retained with failed check status for local repair',async()=>{
 const dir=await mkdtemp(path.join(tmpdir(),'custom-retain-'));
 try{
  const out=path.join(dir,'candidate.json');
  const candidate=parseArtifact({schemaVersion:'custom-scene:1',brief,rationale:'演示',source:'export default function Scene(){return <svg>{undefinedVariable}</svg>}'});
  await assert.rejects(saveGeneratedCandidate(candidate,out),/candidate_retained/);
  assert.equal(JSON.parse(await readFile(out,'utf8')).source,candidate.source);
  const report=JSON.parse(await readFile(out+'.check.json','utf8'));assert.equal(report.technical,'failed');assert.equal(report.visual,'pending');
 }finally{await rm(dir,{recursive:true,force:true});}
});
