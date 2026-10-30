import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,writeFile,readFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {spawnSync} from 'node:child_process';
import {createHash} from 'node:crypto';
import {parseArtifact,sourceHash} from '../src/contract';
import {parseDesign,designHash} from '../src/design';
const run=(...args:string[])=>spawnSync(process.execPath,['--import','tsx','scripts/visual-agent.ts',...args],{encoding:'utf8'});
test('source response inspection is offline, preserves failure evidence and creates only a review proposal',async()=>{
 const dir=await mkdtemp(path.join(tmpdir(),'visual-source-inspect-'));
 try{
  const design=JSON.parse(await readFile('examples/custom-scenes/generated-context/design.json','utf8'));
  const object={...design.objects[0],x:100,y:200,width:200,height:200};design.objects=[object];design.overlaps=[];
  design.beats=design.beats.map((beat:any)=>({...beat,focus:object.id,changes:[{objectId:object.id,from:'idle',to:'active'}]}));
  const designFile=path.join(dir,'design.json'),responseFile=path.join(dir,'response.json'),out=path.join(dir,'proposal.json');
  const candidate={schemaVersion:'custom-scene:1',brief:design.brief,rationale:'Test only',source:'export default function Scene(){return <svg/>}'};
  const suffix='</\uFF5C\uFF5CDSML\uFF5C\uFF5C parameter>\n</\uFF5C\uFF5CDSML\uFF5C\uFF5C invoke>\n</\uFF5C\uFF5CDSML\uFF5C\uFF5C calls>';
  const raw=JSON.stringify({content:JSON.stringify(candidate)+suffix,finishReason:'stop'});
  await writeFile(designFile,JSON.stringify(design));await writeFile(responseFile,raw);
  const result=run('inspect-source-response',designFile,responseFile,out);assert.equal(result.status,0,result.stderr);
  const proposal=JSON.parse(await readFile(out,'utf8'));
  assert.equal(proposal.status,'review-required');assert.equal(proposal.accepted,false);assert.equal(proposal.execution,'not_run');assert.equal(proposal.modelRequests,0);
  assert.equal(proposal.technical,'passed');assert.equal(proposal.staticReview,'pending');assert.equal(proposal.responseFileSha256,createHash('sha256').update(raw).digest('hex'));
  assert.equal(proposal.candidate.source,candidate.source);assert.equal(await readFile(responseFile,'utf8'),raw);
  assert.match(run('inspect-source-response',designFile,responseFile,out).stderr,/output_exists/);
  await assert.rejects(readFile(out+'.check.json'),/ENOENT/);
  await writeFile(responseFile,JSON.stringify({content:JSON.stringify({...candidate,source:'export default function Scene(){return <svg>{missingValue}</svg>}'} )+suffix,finishReason:'stop'}));
  const failedOut=path.join(dir,'failed.json');assert.match(run('inspect-source-response',designFile,responseFile,failedOut).stderr,/typecheck/);await assert.rejects(readFile(failedOut),/ENOENT/);
 }finally{await rm(dir,{recursive:true,force:true});}
});
test('measured audio becomes frozen inputs and design prompt without a model key',async()=>{
 const dir=await mkdtemp(path.join(tmpdir(),'visual-cli-'));
 try{
  const manifest=path.join(dir,'audio.json'),out=path.join(dir,'inputs'),prompt=path.join(dir,'design.txt');
  await writeFile(manifest,JSON.stringify({segments:[{chapter:'context',text:'实际配音。',start:42,duration:2,pauseAfter:.2}]}));
  const result=run('from-audio',manifest,'context','examples/custom-scenes/context-wallet/brief.json',out);assert.equal(result.status,0,result.stderr);
  const brief=JSON.parse(await readFile(path.join(out,'brief.json'),'utf8'));assert.equal(brief.narration,'实际配音。');assert.equal(brief.durationInFrames,66);
  assert.equal(run('prepare-design',path.join(out,'brief.json'),path.join(out,'cues.json'),prompt).status,0);
  assert.match(await readFile(prompt,'utf8'),/MEASURED_CUES/);
  assert.match(await readFile(prompt,'utf8'),/SOURCE_ART_DIRECTION/);
  assert.notEqual(run('from-audio',manifest,'context','examples/custom-scenes/context-wallet/brief.json',out).status,0);
 }finally{await rm(dir,{recursive:true,force:true});}
});
test('code generation rejects invalid design and existing output without requesting provider',async()=>{
 const dir=await mkdtemp(path.join(tmpdir(),'visual-invalid-'));
 try{
  const design=path.join(dir,'design.json'),out=path.join(dir,'out.json');await writeFile(design,'{}');
  const result=run('code',design,out,'--confirm-cost');assert.notEqual(result.status,0);assert.match(result.stderr,/visual_design/);
  await writeFile(out,'preserved');const collision=run('code',design,out,'--confirm-cost');assert.match(collision.stderr,/output_exists/);assert.equal(await readFile(out,'utf8'),'preserved');
 }finally{await rm(dir,{recursive:true,force:true});}
});
test('external agent source can be packed with a frozen design association',async()=>{
 const dir=await mkdtemp(path.join(tmpdir(),'visual-pack-'));
 try{
  const design=path.join(dir,'design.json'),source=path.join(dir,'Scene.tsx'),out=path.join(dir,'out.json');
  const brief=JSON.parse(await readFile('examples/custom-scenes/context-wallet/brief.json','utf8'));
  const value={schemaVersion:'visual-design:1',brief,cues:[{id:'one',text:brief.narration,startFrame:0,endFrame:540}],thesis:'预算有限',metaphor:'钱包',objects:[{id:'wallet',meaning:'预算',appearance:'钱包轮廓',x:300,y:300,width:900,height:500}],beats:[{cueId:'one',focus:'wallet',action:'打开钱包',changes:[{objectId:'wallet',from:'闭合',to:'打开'}]}],composition:'居中',palette:'blueprint',avoid:['文字卡'],acceptance:['钱包可见']};
  await writeFile(design,JSON.stringify(value));await writeFile(source,'export default function Scene(){return <svg/>}');
  const result=run('pack',design,source,out);assert.equal(result.status,0,result.stderr);
  assert.deepEqual(JSON.parse(await readFile(out+'.design.json','utf8')),value);
  const artifact=parseArtifact(JSON.parse(await readFile(out,'utf8'))),sha256=sourceHash(artifact),designSha256=designHash(parseDesign(value));
  const png=Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jRZkAAAAASUVORK5CYII=','base64');
  await writeFile(path.join(dir,'frame-0.png'),png);
  const report=path.join(dir,'report.json'),observations=path.join(dir,'observations.json'),review=path.join(dir,'review.json');
  await writeFile(report,JSON.stringify({technical:'passed',sha256,designSha256,frames:['frame-0.png'],frameHashes:{'frame-0.png':createHash('sha256').update(png).digest('hex')}}));
  await writeFile(observations,JSON.stringify({schemaVersion:'visual-review:1',sha256,designSha256,verdict:'revise',evidence:[{frame:0,observation:'只有占位，未解释机制'}],feedback:'绘制钱包'}));
  assert.equal(run('review',out,report,observations,review).status,0);
  const revision=run('prepare-revision',design,out,review,path.join(dir,'revision.txt'));assert.equal(revision.status,0,revision.stderr);
  const failedGeometry=path.join(dir,'failed-geometry.json'),passObservations=path.join(dir,'pass-observations.json');
  await writeFile(failedGeometry,JSON.stringify({technical:'passed',sha256,designSha256,frames:['frame-0.png'],geometry:{status:'failed'}}));
  await writeFile(passObservations,JSON.stringify({schemaVersion:'visual-review:1',sha256,designSha256,verdict:'pass',evidence:[{frame:0,observation:'开场'},{frame:270,observation:'中段'},{frame:539,observation:'片尾'}],feedback:'人工认为可读'}));
  const rejected=run('review',out,failedGeometry,passObservations,path.join(dir,'invalid-pass.json'));assert.notEqual(rejected.status,0);assert.match(rejected.stderr,/geometry_failed/);
  const geometryPrompt=path.join(dir,'geometry-revision.txt');
  await writeFile(failedGeometry,JSON.stringify({technical:'passed',sha256,designSha256,frames:['frame-0.png'],geometry:{status:'failed',frames:{0:{issues:[{kind:'text-overlap',target:'title/subtitle',detail:'labels intersect'}],labels:2,movers:0,routes:0,obstacles:0}}}}));
  const feedback=run('prepare-geometry-revision',design,out,failedGeometry,geometryPrompt);assert.equal(feedback.status,0,feedback.stderr);
  assert.match(await readFile(geometryPrompt,'utf8'),/title\/subtitle/);
  assert.match(run('prepare-geometry-revision',design,out,failedGeometry,geometryPrompt).stderr,/output_exists/);
  const wrongBinding=JSON.parse(await readFile(failedGeometry,'utf8'));wrongBinding.sha256='wrong';await writeFile(failedGeometry,JSON.stringify(wrongBinding));
  assert.notEqual(run('prepare-geometry-revision',design,out,failedGeometry,path.join(dir,'wrong-binding.txt')).status,0);
  const missing=run('review',out,report,passObservations,path.join(dir,'missing-audit-pass.json'));assert.notEqual(missing.status,0);assert.match(missing.stderr,/geometry_required/);
  const partialReport=path.join(dir,'partial-report.json');
  for(const frame of [270,539])await writeFile(path.join(dir,`frame-${frame}.png`),png);
  const names=[0,270,539].map(f=>`frame-${f}.png`),digest=createHash('sha256').update(png).digest('hex');
  await writeFile(partialReport,JSON.stringify({technical:'passed',sha256,designSha256,frames:names,frameHashes:Object.fromEntries(names.map(n=>[n,digest])),geometry:{status:'partial',frames:Object.fromEntries([0,270,539].map(f=>[f,{issues:[],labels:0,movers:0,routes:0,obstacles:0,unsupported:true}]))}}));
  const partial=run('review',out,partialReport,passObservations,path.join(dir,'partial-pass.json'));assert.notEqual(partial.status,0);assert.match(partial.stderr,/partial_geometry/);
  const partialRevision=path.join(dir,'partial-geometry-revision.txt');
  assert.equal(run('prepare-geometry-revision',design,out,partialReport,partialRevision).status,0);
  assert.match(await readFile(partialRevision,'utf8'),/missing-motion-coverage/);
  const manual=run('review',out,partialReport,passObservations,path.join(dir,'manual-pass.json'),'--allow-partial-geometry');assert.equal(manual.status,0,manual.stderr);
  const arrayStatus=JSON.parse(await readFile(partialReport,'utf8'));arrayStatus.geometry.status=['partial'];await writeFile(partialReport,JSON.stringify(arrayStatus));
  const malformed=run('review',out,partialReport,passObservations,path.join(dir,'array-status-pass.json'));assert.notEqual(malformed.status,0);assert.match(malformed.stderr,/geometry_required/);
  await writeFile(path.join(dir,'frame-0.png'),Buffer.concat([png,Buffer.from('changed')]));
  const tampered=run('review',out,report,observations,path.join(dir,'tampered-review.json'));assert.notEqual(tampered.status,0);assert.match(tampered.stderr,/image hash mismatch/);
 }finally{await rm(dir,{recursive:true,force:true});}
});
test('incomplete paid-stage response is retained and cannot silently trigger a second request',async()=>{
 const dir=await mkdtemp(path.join(tmpdir(),'visual-truncated-'));
 try{
  const out=path.join(dir,'candidate.json'),mock=path.join(dir,'provider.mjs'),calls=path.join(dir,'calls.txt');
  const design=JSON.parse(await readFile('examples/custom-scenes/generated-context/design.json','utf8'));
  const object={...design.objects[0],x:100,y:200,width:200,height:200};
  design.objects=[object];design.overlaps=[];
  design.beats=design.beats.map((beat:any)=>({...beat,focus:object.id,changes:[{objectId:object.id,from:'idle',to:'active'}]}));
  const designFile=path.join(dir,'valid-design.json');await writeFile(designFile,JSON.stringify(design));
  await writeFile(mock,`import {appendFileSync} from 'node:fs';import assert from 'node:assert/strict';globalThis.fetch=async(url,init)=>{assert.equal(url,'https://api.deepseek.com/responses');assert.equal(JSON.parse(init.body).text.format.name,'scene_artifact_v1');appendFileSync(${JSON.stringify(calls)},'call\\n');return new Response(JSON.stringify({status:'incomplete',incomplete_details:{reason:'max_output_tokens'},output:[{type:'message',role:'assistant',content:[{type:'output_text',text:'{"source":"cut off'}]}]}));};`);
  const generate=()=>spawnSync(process.execPath,['--import',mock,'--import','tsx','scripts/visual-agent.ts','code',designFile,out,'--confirm-cost'],{encoding:'utf8',env:{...process.env,DEEPSEEK_API_KEY:'mock-key'}});
  const first=generate();assert.equal(first.status,1);assert.match(first.stderr,/truncated_response/);
  assert.equal(JSON.parse(await readFile(out+'.provider-response.json','utf8')).finishReason,'length');
  assert.equal(JSON.parse(await readFile(out+'.failure.json','utf8')).maxTokens,16384);
  await assert.rejects(readFile(out),/ENOENT/);
  const second=generate();assert.equal(second.status,1);assert.match(second.stderr,/output_exists/);assert.equal(await readFile(calls,'utf8'),'call\n');
 }finally{await rm(dir,{recursive:true,force:true});}
});
test('offline review-source-motion inspects recovery proposals without model calls or scene execution',async()=>{
 const dir=await mkdtemp(path.join(tmpdir(),'visual-motion-review-'));
 try{
  const out=path.join(dir,'motion-review.json');
  const res=run('review-source-motion','output/visual-agent/source-rag-layout-proposal-v1/approved-design.json','output/visual-agent/source-rag-layout-proposal-v1/recovery-proposal-bounded.json',out);
  assert.equal(res.status,0,res.stderr);
  const review=JSON.parse(await readFile(out,'utf8'));
  assert.equal(review.status,'revise-required');assert.equal(review.coverage,'partial');
  assert.equal(review.accepted,false);assert.equal(review.visual,'pending');
  assert.deepEqual(review.findings.map((f:{kind:string})=>f.kind),['motion-discontinuity','route-mismatch','occlusion-incomplete']);
  assert.match(run('review-source-motion','output/visual-agent/source-rag-layout-proposal-v1/approved-design.json','output/visual-agent/source-rag-layout-proposal-v1/recovery-proposal-bounded.json',out).stderr,/output_exists/);
 }finally{await rm(dir,{recursive:true,force:true});}
});
