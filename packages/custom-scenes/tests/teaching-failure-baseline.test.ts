import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {parseArtifact,requestModelJson} from '../src/contract';
import {parseDesign} from '../src/design';
import {assertDesignLayout,LayoutPreflightError} from '../src/design-layout';
import {typecheckSource,SourceTypecheckError} from '../src/files';
import {reviewSourceMotion} from '../src/source-motion-review';
import {analyzeGeometry,type GeometryRecord} from '../src/geometry-audit';
import {renderTimeouts} from '../src/render-timeout';

const file=new URL('./fixtures/teaching-failures-v1.json',import.meta.url);
const read=async()=>JSON.parse(await readFile(file,'utf8'));
test('failure registry is self-contained, sanitized and separates content from infrastructure',async()=>{
 const baseline=await read();
 assert.equal(baseline.schemaVersion,'teaching-failure-baseline:1');
 assert.equal(new Set(baseline.cases.map((c:any)=>c.id)).size,baseline.cases.length);
 for(const category of ['protocol','layout','compilation','path','occlusion','motion','budget','infrastructure'])assert.ok(baseline.cases.some((c:any)=>c.category===category));
 assert.ok(baseline.cases.some((c:any)=>c.layer==='infrastructure'));
 for(const item of baseline.cases){
  assert.equal(item.provenance.form,'sanitized-minimal-reproduction');
  assert.ok(item.provenance.reference);assert.ok(item.expected);
  if(item.layer==='infrastructure')assert.equal(item.category,'infrastructure');
 }
 const text=JSON.stringify(baseline);
 assert.doesNotMatch(text,/\/Users\/|DEEPSEEK_API_KEY|Authorization|sk-[A-Za-z0-9]{12}|\.env/);
 assert.ok(Buffer.byteLength(text)<32*1024);
});

test('recorded failures replay through existing checkers without providers, renderer or historical output files',async t=>{
 const baseline=await read();
 const design=parseDesign(baseline.design);
 for(const item of baseline.cases.filter((c:any)=>c.checker!=='python-budget'))await t.test(item.id,async()=>{
  switch(item.checker){
   case 'provider':{
    let attempts=0;
    await assert.rejects(requestModelJson('Offline fixture only',{apiKey:'offline-fixture',confirmCost:true,request:async()=>{
     attempts++;return new Response(JSON.stringify({choices:[{finish_reason:'stop',message:{content:item.input.content??'{}'}}]}),{status:item.input.status??200});
    }}),new RegExp(item.expected.code));
    assert.equal(attempts,1);break;
   }
   case 'layout':{
    const value=parseDesign({...baseline.design,objects:item.input.objects});
    assert.throws(()=>assertDesignLayout(value),(e:unknown)=>e instanceof LayoutPreflightError&&e.findings.some(f=>f.kind===item.expected.code));break;
   }
   case 'compiler':
    await assert.rejects(typecheckSource(item.input.source),(e:unknown)=>e instanceof SourceTypecheckError&&e.diagnostics.some(d=>d.code===item.expected.code));break;
   case 'source-review':{
    const artifact=parseArtifact({schemaVersion:'custom-scene:1',brief:design.brief,rationale:'Sanitized failure fixture',source:item.input.source});
    const review=reviewSourceMotion(artifact,design);
    assert.equal(review.accepted,false);assert.ok(review.findings.some(f=>f.kind===item.expected.code),JSON.stringify(review));break;
   }
   case 'geometry':
    assert.ok(analyzeGeometry(item.input.records as GeometryRecord[]).issues.some(i=>i.kind===item.expected.code));break;
   case 'timeout':{
    const policy=renderTimeouts(item.input.durationInFrames);
    assert.ok(policy.cancelMs>item.input.legacyTimeoutMs);assert.equal(policy.cancelMs,item.expected.cancelMs);
    assert.ok(policy.childMs<=1740000);break;
   }
   default:assert.fail('Unknown checker '+item.checker);
  }
 });
});
