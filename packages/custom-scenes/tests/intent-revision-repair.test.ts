import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {sourceHash} from '../src/contract';
import {designHash} from '../src/design';
import {reviewSourceMotion} from '../src/source-motion-review';

test('actual failed intent source has a separately bound offline repair and real zero-warning rendered evidence',async()=>{
 const base='output/visual-agent/intent-revision-offline-v3/';
 const artifact=JSON.parse(await readFile(base+'artifact.json','utf8'));
 const parent=JSON.parse(await readFile('output/visual-workbench/1f8f643f-71ed-4ebb-9cd9-a8a2cef6856f/artifact.json','utf8'));
 const design=JSON.parse(await readFile(base+'artifact.json.design.json','utf8'));
 const parentDesign=JSON.parse(await readFile('output/visual-workbench/1f8f643f-71ed-4ebb-9cd9-a8a2cef6856f/design.json','utf8'));
 assert.deepEqual(artifact.brief,parent.brief);assert.equal(designHash(design),designHash(parentDesign));
 assert.match(parent.source,/\bsheetY\b/);assert.doesNotMatch(artifact.source,/\bsheetY\b/);
 for(const object of design.objects)assert.ok(artifact.source.includes(`data-object="${object.id}"`));
 for(const id of ['utterance-sheet','intent-tag'])assert.equal(artifact.source.split(`data-object="${id}"`).length-1,1);
 const review=reviewSourceMotion(artifact,design);assert.equal(review.findings.length,0);assert.equal(review.coverage,'declared');
 const report=JSON.parse(await readFile(base+'preview/stills/report.json','utf8'));
 assert.equal(report.sha256,sourceHash(artifact));assert.equal(report.designSha256,designHash(design));
 assert.equal(report.geometry.status,'passed');assert.equal(report.geometry.issueCount,0);
 assert.ok(report.geometry.motionChecks>0);assert.equal(report.frames.length,27);
 for(const frame of report.frames){
  const data=await readFile(base+'preview/stills/'+frame);
  assert.equal(createHash('sha256').update(data).digest('hex'),report.frameHashes[frame]);
 }
});
