import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,rm,access} from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {freezeTeachingScene} from '../src/teaching-artifact';
import {renderTeachingIsolated} from '../src/teaching-isolated-render';
import {teachingBrief,teachingCues,teachingExample} from './fixtures/teaching-examples';
test('stale frozen runtime is rejected before directory creation or container dispatch',async()=>{
 const root=await mkdtemp(path.join(os.tmpdir(),'teaching-stale-'));
 try{
  const artifact=await freezeTeachingScene(teachingExample('state-change'),teachingBrief,teachingCues);
  const stale=structuredClone(artifact);stale.binding.runtime[0].sha256='0'.repeat(64);
  const output=path.join(root,'job');
  await assert.rejects(renderTeachingIsolated(stale,artifact.artifactSha256,output),/binding mismatch/);
  await assert.rejects(access(output));
 }finally{await rm(root,{recursive:true,force:true});}
});
