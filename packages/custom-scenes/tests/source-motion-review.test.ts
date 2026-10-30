import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {parseArtifact,sourceHash} from '../src/contract';
import {parseDesign,designHash,geometryFeedback,buildScenePrompt} from '../src/design';
import {summarizeGeometryCoverage} from '../src/geometry-audit';
import {reviewSourceMotion,motionQualityFeedback} from '../src/source-motion-review';

test('route nested under its own mover is rejected, sibling world route is not',async()=>{
 const design=JSON.parse(await readFile('examples/custom-scenes/reviewed-loop/design.json','utf8'));
 const make=(nested:boolean)=>parseArtifact({schemaVersion:'custom-scene:1',brief:design.brief,rationale:'Coordinate-space regression',source:`export default function Scene(){return <svg>${nested?'':'<path id="travel" data-route="true" d="M100 100 L300 100"/>'}<g data-follow-path="travel" transform="translate(100 100)">${nested?'<path id="travel" data-route="true" d="M100 100 L300 100"/>':''}<circle r="10"/></g></svg>}`},design.brief);
 const bad=reviewSourceMotion(make(true),design);
 assert.equal(bad.status,'revise-required');
 assert.ok(bad.findings.some(f=>f.kind==='route-mismatch'&&/nested/i.test(f.detail)));
 assert.ok(!reviewSourceMotion(make(false),design).findings.some(f=>/nested/i.test(f.detail)));
});

test('real RAG failure sample diagnoses premature jump, route mismatch, missing follow-path and empty clip group with source lines',async()=>{
 const design=parseDesign(JSON.parse(await readFile('output/visual-agent/source-rag-layout-proposal-v1/approved-design.json','utf8')));
 const source=await readFile('output/visual-agent/source-rag-layout-proposal-v1/diagnostic-prefix-source.txt','utf8');
 const artifact=parseArtifact({schemaVersion:'custom-scene:1',brief:design.brief,rationale:'Diagnostic prefix sample',source},design.brief);
 assert.equal(designHash(design),'d2df6c26268cdc5ea0a22d54f8ddf4c11657402aa34bb3e09d363c1f1435dab9');
 assert.equal(sourceHash(artifact),'0c9ef9ca4fbb9b6f0051a6b1ac4893e6db69b99bad2d7f521d501926872e0722');

 const review=reviewSourceMotion(artifact,design);
 assert.equal(review.schemaVersion,'source-motion-review:1');
 assert.equal(review.sha256,sourceHash(artifact));
 assert.equal(review.designSha256,designHash(design));
 assert.equal(review.status,'revise-required');
 assert.equal(review.coverage,'partial');
 assert.equal(review.staticContinuityProven,false);
 assert.equal(review.accepted,false);
 assert.equal(review.visual,'pending');
 assert.ok(review.pendingRenderChecks.includes('arbitrary-frame-pose-continuity'));

 const discontinuity=review.findings.find(f=>f.kind==='motion-discontinuity');
 assert.ok(discontinuity,'expected motion-discontinuity finding');
 assert.ok(discontinuity.lines.includes(109),'expected snippetCarry declaration line 109');
 assert.ok(discontinuity.lines.includes(167),'expected premature branch cutoff line 167');
 assert.ok(discontinuity.lines.includes(175),'expected premature endpoint evaluation line 175');
 assert.match(discontinuity.detail,/348\.\.404/);
 assert.match(discontinuity.detail,/396/);

 const routeMismatch=review.findings.find(f=>f.kind==='route-mismatch');
 assert.ok(routeMismatch,'expected route-mismatch finding');
 for(const line of [48,50,151,169,212])assert.ok(routeMismatch.lines.includes(line),`expected line ${line} in route-mismatch lines ${JSON.stringify(routeMismatch.lines)}`);
 assert.ok(routeMismatch.lines.some(l=>l>=297&&l<=300),'expected route-left JSX line');
 assert.ok(routeMismatch.lines.some(l=>l>=307&&l<=310),'expected route-right JSX line');
 assert.match(routeMismatch.detail,/data-follow-path/);

 const occlusion=review.findings.find(f=>f.kind==='occlusion-incomplete');
 assert.ok(occlusion,'expected occlusion-incomplete finding');
 assert.ok(occlusion.lines.includes(278),'expected gen-inlet-clip line 278');
 assert.ok(occlusion.lines.some(l=>l===515||l===516),'expected empty clipped group line 515/516');
 assert.match(occlusion.detail,/gen-inlet-clip/);
 assert.match(review.feedback,/396/);
 assert.match(review.feedback,/data-follow-path/);
 assert.match(review.feedback,/gen-inlet-clip/);
 assert.ok(review.feedback.length>0&&review.feedback.length<=4000);
});

test('reviewed loop and decorative empty groups are not falsely rejected, while continuity remains pending render',async()=>{
 const design=parseDesign(JSON.parse(await readFile('examples/custom-scenes/reviewed-loop/design.json','utf8')));
 const source=await readFile('examples/custom-scenes/reviewed-loop/Scene.tsx','utf8');
 const artifact=parseArtifact({schemaVersion:'custom-scene:1',brief:design.brief,rationale:'Reviewed loop reference',source},design.brief);
 const review=reviewSourceMotion(artifact,design);
 assert.equal(review.findings.length,0);
 assert.equal(review.coverage,'declared');
 assert.equal(review.status,'pending-render');
 assert.equal(review.staticContinuityProven,false);
 assert.equal(review.accepted,false);
 assert.equal(review.visual,'pending');
 assert.ok(review.pendingRenderChecks.length>=2);

 // Decorative empty <g/> and valid non-empty <g clipPath="url(#...)"> must not trigger false positives.
 const decoratedSource=source.replace(
  '</defs>',
  '<clipPath id="valid-clip"><rect x={0} y={0} width={100} height={100}/></clipPath></defs>\n<g data-decorative="spacer">{/* empty decorative group without clipPath */}</g>\n<g clipPath="url(#valid-clip)"><rect x={0} y={0} width={10} height={10} fill="none"/></g>',
 );
 const decoratedArtifact=parseArtifact({schemaVersion:'custom-scene:1',brief:design.brief,rationale:'Decorated',source:decoratedSource},design.brief);
 const decoratedReview=reviewSourceMotion(decoratedArtifact,design);
 assert.equal(decoratedReview.findings.length,0);
 assert.equal(decoratedReview.status,'pending-render');
});

test('missing data-follow-path coverage reports partial and never passes from zero measured movers',async()=>{
 const summary=summarizeGeometryCoverage({
  0:{issues:[],labels:2,movers:0,routes:2,obstacles:3},
  120:{issues:[],labels:2,movers:0,routes:2,obstacles:3},
 });
 assert.equal(summary.status,'partial');
 assert.equal(summary.motionChecks,0);
 assert.equal(summary.issueCount,0);
 assert.ok(summary.coverageGaps.some(g=>g.kind==='missing-motion-coverage'));

 const design=parseDesign(JSON.parse(await readFile('output/visual-agent/source-rag-layout-proposal-v1/approved-design.json','utf8')));
 const source=await readFile('output/visual-agent/source-rag-layout-proposal-v1/diagnostic-prefix-source.txt','utf8');
 const artifact=parseArtifact({schemaVersion:'custom-scene:1',brief:design.brief,rationale:'Diagnostic prefix sample',source},design.brief);
 const partialReport={
  technical:'passed',
  sha256:sourceHash(artifact),
  designSha256:designHash(design),
  frames:['frame-0.png','frame-396.png'],
  geometry:{
   status:'partial',
   frames:{
    0:{issues:[],labels:4,movers:0,routes:2,obstacles:1},
    396:{issues:[],labels:4,movers:0,routes:2,obstacles:1},
   },
  },
 };
 const feedback=geometryFeedback(partialReport,artifact,design);
 assert.equal(feedback.visual,'pending');
 assert.equal(feedback.originalGeometryStatus,'partial');
 assert.ok(feedback.findings.some(f=>f.kind==='missing-motion-coverage'));

 // A report that falsely claims status='passed' with zero movers across all frames is rejected.
 assert.throws(()=>geometryFeedback({
  ...partialReport,
  geometry:{...partialReport.geometry,status:'passed'},
 },artifact,design),/partial_geometry|no_geometry_findings/);
});

test('combined feedback preserves failed geometry and feeds existing repair prompt without relaxing rules',async()=>{
 const design=parseDesign(JSON.parse(await readFile('output/visual-agent/source-rag-layout-proposal-v1/approved-design.json','utf8')));
 const source=await readFile('output/visual-agent/source-rag-layout-proposal-v1/diagnostic-prefix-source.txt','utf8');
 const artifact=parseArtifact({schemaVersion:'custom-scene:1',brief:design.brief,rationale:'Diagnostic prefix sample',source},design.brief);
 const failedReport={
  technical:'passed',
  sha256:sourceHash(artifact),
  designSha256:designHash(design),
  frames:['frame-0.png','frame-396.png'],
  geometry:{
   status:'failed',
   frames:{
    0:{issues:[{kind:'label-obstacle',target:'question-mark',detail:'Overlaps obstacle retrieval-station.'}],labels:4,movers:0,routes:2,obstacles:1},
    396:{issues:[],labels:4,movers:0,routes:2,obstacles:1},
   },
  },
 };
 const before=JSON.stringify(failedReport);
 const combined=motionQualityFeedback(artifact,design,failedReport);
 assert.equal(JSON.stringify(failedReport),before);
 assert.equal(combined.accepted,false);
 assert.equal(combined.visual,'pending');
 assert.equal(combined.originalGeometryStatus,'failed');
 assert.equal(combined.staticReview.status,'revise-required');
 assert.ok(combined.feedback.length>0&&combined.feedback.length<=8000);
 const prompt=buildScenePrompt(design,undefined,artifact,combined.feedback);
 assert.match(prompt,/motion-discontinuity/);
 assert.match(prompt,/route-mismatch/);
 assert.match(prompt,/occlusion-incomplete/);
 assert.match(prompt,/label-obstacle/);
});
