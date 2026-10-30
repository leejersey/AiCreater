import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import path from 'node:path';
import {repositoryRoot} from '../src/files';
import {checkedSourceArtReference,readSourceArtReferences} from '../src/source-art-direction';

test('source art references include actual reviewed drawing construction, not a seven-component catalog',async()=>{
 const references=await readSourceArtReferences();
 assert.match(references.design,/SOURCE_ART_DIRECTION/);assert.match(references.design,/appearance/);assert.match(references.design,/composition/);assert.match(references.design,/beats.action/);
 assert.match(references.code,/SOURCE_ART_CONSTRUCTION_ATLAS/);
 assert.match(references.code,/data-wallet-assembly/);assert.match(references.code,/strokeDasharray/);assert.match(references.code,/think-valve/);assert.match(references.code,/return-route/);
 assert.match(references.code,/linearGradient/);assert.match(references.code,/stopOpacity/);
 assert.match(references.code,/not standalone/);assert.match(references.code,/CURRENT measured cues/);
 assert.doesNotMatch(references.design,/prefer this topology|HOST_COMPONENT_CATALOG/);
 assert.ok(references.design.length<6000);assert.ok(references.code.length<16000);
 assert.equal(references.manifest.automaticQualityVerified,false);assert.equal(references.manifest.examples.length,2);
});
test('reviewed source excerpts fail closed on source or brief drift and do not execute reference code',async()=>{
 const directory=path.join(repositoryRoot,'examples/custom-scenes/context-wallet');
 const artifact={schemaVersion:'custom-scene:1',brief:JSON.parse(await readFile(path.join(directory,'brief.json'),'utf8')),source:await readFile(path.join(directory,'WalletScene.tsx'),'utf8'),rationale:'Reference only'};
 const reference=checkedSourceArtReference('wallet',artifact);
 assert.ok(reference.fragments.length>=2);assert.ok(reference.fragments.every(f=>f.source.length>100));
 assert.throws(()=>checkedSourceArtReference('wallet',{...artifact,source:artifact.source+'\n'}),/baseline hash/);
 assert.throws(()=>checkedSourceArtReference('wallet',{...artifact,brief:{...artifact.brief,title:'different'}}),/baseline hash/);
 assert.throws(()=>checkedSourceArtReference('anything' as any,artifact),/unknown reference/);
});
