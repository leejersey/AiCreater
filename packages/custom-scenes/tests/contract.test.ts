import test from 'node:test';
import assert from 'node:assert/strict';
import {parseBrief, parseArtifact, sourceHash, assertApproval, buildPrompt, generateArtifact, requestModelJson} from '../src/contract';

const brief = {schemaVersion:'custom-scene-brief:1',id:'wallet',title:'上下文预算',narration:'只保留当前需要的信息。',visualGoal:'信息装入钱包并筛除无关内容。',facts:['容量有限，不指定容量数字'],materials:[],width:1920,height:1080,fps:30,durationInFrames:540};
const source = 'import React from "react"; export default function Scene({frame}:{frame:number}) {return <svg><text>{frame}</text></svg>;}';
const artifact = () => ({schemaVersion:'custom-scene:1',brief,rationale:'用装入和筛除表达预算。',source});

test('brief has bounded duration and no executable or unknown fields',()=>{
  assert.equal(parseBrief(brief).narration,brief.narration);
  for(const change of [{durationInFrames:0},{fps:60},{id:'../wallet'},{narration:''},{script:'bad'}]) assert.throws(()=>parseBrief({...brief,...change}),/custom_scene/);
});
test('artifact preserves narration and accepts a standalone frame-driven TSX scene',()=>{
  assert.equal(parseArtifact(artifact(),parseBrief(brief)).source,source);
  assert.throws(()=>parseArtifact({...artifact(),brief:{...brief,narration:'改写'}},parseBrief(brief)),/brief_mismatch/);
});
test('source guardrails reject outside modules, network, media, timers and malformed TSX',()=>{
  for(const code of [
    'import fs from "node:fs"; export default function S(){return null}',
    'import "./secret"; export default function S(){return null}',
    'export default function S(){fetch("https://example.com");return null}',
    'export default function S(){return <iframe src="https://example.com"/>}',
    'export default function S(){return <img src="x"/>}',
    'export default function S(){setTimeout(()=>{},2);return null}',
    'export default function S(){return <div onClick={()=>{}}/>}',
    'export default function S(){return <div>',
    'export default function S(){return import("node:fs")}',
  ]) assert.throws(()=>parseArtifact({...artifact(),source:code}),/custom_scene_source/);
});
test('approval is tied to source and brief, never a boolean bypass',()=>{
  const a=parseArtifact(artifact());const hash=sourceHash(a);
  assert.match(hash,/^[a-f0-9]{64}$/);assert.doesNotThrow(()=>assertApproval(a,hash));
  assert.throws(()=>assertApproval(a,'yes'),/approval_required/);
  assert.throws(()=>assertApproval({...a,source:a.source+'\n'},hash),/approval_required/);
  assert.throws(()=>assertApproval({...a,brief:{...a.brief,durationInFrames:600}},hash),/approval_required/);
});
test('self-contained SVG paint references are allowed but external resources are not',()=>{
  assert.doesNotThrow(()=>parseArtifact({...artifact(),source:'export default function Scene(){return <svg><defs><pattern id="grid"/></defs><rect fill="url(#grid)"/></svg>}'}));
  assert.throws(()=>parseArtifact({...artifact(),source:'export default function Scene(){return <svg><rect fill="url(https://example.com/a.svg)"/></svg>}'}),/external resource/);
});
test('only the literal standard SVG namespace on an SVG element is exempt from URL checks',()=>{
  assert.doesNotThrow(()=>parseArtifact({...artifact(),source:'export default function Scene(){return <svg xmlns="http://www.w3.org/2000/svg"/>}'}));
  for(const code of [
    'export default function Scene(){return <svg xmlns="https://example.com/svg"/>}',
    'export default function Scene(){return <div xmlns="http://www.w3.org/2000/svg"/>}',
    'export default function Scene(){return <svg href="http://www.w3.org/2000/svg"/>}',
    'export default function Scene(){const address="http://www.w3.org/2000/svg";return <svg/>}',
  ])assert.throws(()=>parseArtifact({...artifact(),source:code}),/external resource/);
});
test('prompt separates immutable facts from visual freedom and requires real mechanism',()=>{
  const prompt=buildPrompt(parseBrief(brief));
  assert.ok(prompt.includes(brief.narration));assert.match(prompt,/SVG/);assert.match(prompt,/frame/);assert.match(prompt,/not a sandbox/i);
});
test('generation never calls paid provider without explicit cost confirmation',async()=>{
  let called=false;
  await assert.rejects(generateArtifact(parseBrief(brief),{apiKey:'test',confirmCost:false,request:async()=>{called=true;throw Error('should not call')}}),/cost_confirmation/);
  assert.equal(called,false);
});
test('code generation uses a bound output schema and checks the original brief',async()=>{
  const response=(value:unknown)=>new Response(JSON.stringify({status:'completed',output:[{type:'message',role:'assistant',content:[{type:'output_text',text:JSON.stringify(value)}]}]}));
  const result=await generateArtifact(parseBrief(brief),{apiKey:'test',confirmCost:true,request:async(url,init)=>{
    assert.equal(url,'https://api.deepseek.com/responses');
    const format=JSON.parse(String(init?.body)).text.format;
    assert.equal(format.type,'json_schema');assert.equal(format.name,'scene_artifact_v1');
    assert.deepEqual(format.schema.properties.brief.enum,[brief]);
    assert.equal(format.schema.additionalProperties,false);
    return response(artifact());
  }});
  assert.equal(result.source,source);
  for(const bad of [{...artifact(),brief:{...brief,narration:'changed'}},{...artifact(),source:undefined},{...artifact(),extra:true},{...artifact(),rationale:'  '}]){
    await assert.rejects(generateArtifact(parseBrief(brief),{apiKey:'test',confirmCost:true,request:async()=>response(bad)}),/schema_mismatch/);
  }
});
test('structured code rejects protocol pollution and truncation without retry or cleanup',async()=>{
 for(const truncated of [false,true]){
  const content=JSON.stringify(artifact())+'</DSML invoke>';let calls=0;let retained:any;
  await assert.rejects(generateArtifact(parseBrief(brief),{apiKey:'test',confirmCost:true,onResponse:async r=>{retained=r;},request:async()=>{
   calls++;return new Response(JSON.stringify({status:truncated?'incomplete':'completed',incomplete_details:{reason:'max_output_tokens'},output:[{type:'message',role:'assistant',content:[{type:'output_text',text:content}]}]}));
  }}),truncated?/truncated_response/:/invalid_json/);
  assert.equal(calls,1);assert.equal(retained.content,content);
 }
});
test('provider retains truncated content before rejecting it and never retries',async()=>{
 let calls=0;let retained:unknown;
 await assert.rejects(requestModelJson('scene',{apiKey:'test',confirmCost:true,maxTokens:16384,onResponse:async r=>{retained=r;},request:async(_url,init)=>{
  calls++;assert.equal(JSON.parse(String(init?.body)).max_tokens,16384);
  return new Response(JSON.stringify({choices:[{finish_reason:'length',message:{content:'{"source":"cut off'}}]}));
 }}),/truncated_response/);
 assert.equal(calls,1);assert.deepEqual(retained,{content:'{"source":"cut off',finishReason:'length'});
});
test('malformed JSON with a stop reason is retained and reported distinctly',async()=>{
 let retained:unknown;
 await assert.rejects(requestModelJson('scene',{apiKey:'test',confirmCost:true,onResponse:async r=>{retained=r;},request:async()=>new Response(JSON.stringify({choices:[{finish_reason:'stop',message:{content:'not JSON'}}]}))}),/invalid_json/);
 assert.deepEqual(retained,{content:'not JSON',finishReason:'stop'});
});
test('oversized response keeps bounded diagnostics and finish reason before rejection',async()=>{
 let retained:any;
 await assert.rejects(requestModelJson('scene',{apiKey:'test',confirmCost:true,onResponse:async r=>{retained=r;},request:async()=>new Response(JSON.stringify({choices:[{finish_reason:'length',message:{content:'x'.repeat(140000)}}]}))}),/oversized_response/);
 assert.equal(retained.finishReason,'length');assert.equal(retained.originalBytes,140000);assert.equal(retained.truncated,true);assert.ok(Buffer.byteLength(retained.content)<=128*1024);
});
