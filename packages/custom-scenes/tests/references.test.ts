import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import path from 'node:path';
import {repositoryRoot} from '../src/files';
import {readReviewedCodingReference,readReviewedDesignReference,checkedRagBaseline,checkedCompactCodingReference} from '../src/references';

test('agent coding references use a bounded contract instead of complete source examples',async()=>{
 const reference=await readReviewedCodingReference();
 assert.match(reference,/CONTEXT_BUDGET_REFERENCE/);
 assert.match(reference,/USER_APPROVED_RAG_BASELINE/);
 assert.match(reference,/COMPACT_VISUAL_CONTRACT/);
 assert.match(reference,/29c4718e1a8750da4194ce7fbc8c5ef3dad0c900fc0738162108fb2a3dde56d5/);
 assert.doesNotMatch(reference,/export default function|function pipelineMotion|function ragWorkflowMotion/);
 assert.ok(reference.length<6000);
 assert.match(reference,/do not copy.*topic.*coordinates.*timing/i);
 assert.match(reference,/not automatic geometry acceptance/);
});
test('design-stage reference contains measured storyboard, station clearance and complete gripper ledger without source execution',async()=>{
 const reference=await readReviewedDesignReference();
 assert.match(reference,/REVIEWED_DESIGN_STORYBOARD/);
 assert.match(reference,/gripping.*lifted.*carrying.*inserting.*released/);
 assert.match(reference,/inletLeft/);
 assert.match(reference,/940/);assert.match(reference,/673/);
 assert.match(reference,/same topic.*topology/i);
 assert.match(reference,/COMPACT_VISUAL_CONTRACT/);
 assert.match(reference,/do not add.*schema/i);
 assert.doesNotMatch(reference,/export default function Scene/);
});
test('RAG reference refuses altered source or brief instead of silently changing the visual baseline',async()=>{
 const source=await readFile(path.join(repositoryRoot,'examples/custom-scenes/reviewed-rag/Scene.tsx'),'utf8');
 const brief=JSON.parse(await readFile(path.join(repositoryRoot,'examples/custom-scenes/reviewed-rag/brief.json'),'utf8'));
 const candidate={schemaVersion:'custom-scene:1',brief,source,rationale:'Reference only'};
 assert.equal(checkedRagBaseline(candidate),source);
 assert.throws(()=>checkedRagBaseline({...candidate,source:source+'\n'}),/baseline hash/);
 assert.throws(()=>checkedRagBaseline({...candidate,brief:{...brief,title:'Changed'}}),/baseline hash/);
});
test('compact contract rejects baseline drift, changed acceptance and unbounded reference data',async()=>{
 const directory=path.join(repositoryRoot,'examples/custom-scenes/repaired-rag-clearance');
 const source=await readFile(path.join(directory,'Scene.tsx'),'utf8'),brief=JSON.parse(await readFile(path.join(directory,'brief.json'),'utf8'));
 const contract=JSON.parse(await readFile(path.join(directory,'coding-reference.json'),'utf8'));
 const candidate={schemaVersion:'custom-scene:1',brief,source,rationale:'Reference only'};
 assert.match(checkedCompactCodingReference(candidate,contract),/COMPACT_VISUAL_CONTRACT/);
 assert.throws(()=>checkedCompactCodingReference({...candidate,source:source+'\n'},contract),/baseline hash/);
 for(const patch of [{sourceSha256:'0'.repeat(64)},{accepted:true},{automaticGenerationVerified:true},{principles:[]},{principles:['x'.repeat(601)]},{mechanism:' '},{source:'not a contract field'}])assert.throws(()=>checkedCompactCodingReference(candidate,{...contract,...patch}),/compact contract/);
});
