import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import Ajv from 'ajv';
import {buildDesignOutputSchema} from '../src/design-schema';
import {buildDesignPrompt,buildDesignRevisionPrompt,parseDesign,designHash} from '../src/design';
import {requestModelJson} from '../src/contract';

const brief={schemaVersion:'custom-scene-brief:1' as const,id:'schema',title:'流程',narration:'装入。',visualGoal:'解释组装',facts:[],materials:[],width:1920 as const,height:1080 as const,fps:30 as const,durationInFrames:90};
const cues=[{id:'a',text:'装入。',startFrame:6,endFrame:84}];
const design=()=>({schemaVersion:'visual-design:1',brief,cues,thesis:'同一个套筒',metaphor:'装配',objects:[{id:'sleeve',meaning:'提示',appearance:'开口套筒',x:400,y:300,width:300,height:200,kind:'solid',states:[{id:'empty',appearance:'空'},{id:'filled',appearance:'装满'}]}],beats:[{cueId:'a',focus:'sleeve',action:'装入',changes:[{objectId:'sleeve',from:'空',to:'装满',fromState:'empty',toState:'filled'}]}],composition:'分区',palette:'blueprint',avoid:['复制实体'],acceptance:['保持身份'],overlaps:[]});
const response=(value:unknown,status='completed')=>new Response(JSON.stringify({status,output:[{type:'message',role:'assistant',status:'completed',content:[{type:'output_text',text:JSON.stringify(value)}]}]}));

test('explicit null parent means an independent root and canonicalizes without mutating input',()=>{
 const raw:any=design();raw.objects[0].parentId=null;const before=JSON.stringify(raw);
 const validate=new Ajv({strict:false}).compile(buildDesignOutputSchema(brief,cues).schema);
 assert.equal(validate(raw),true,JSON.stringify(validate.errors));
 const canonical=parseDesign(raw,brief,cues);
 assert.equal(Object.hasOwn(canonical.objects[0],'parentId'),false);
 assert.deepEqual(canonical,parseDesign(design()));
 assert.equal(designHash(canonical),designHash(parseDesign(design())));
 assert.equal(JSON.stringify(raw),before);
});
test('nullable parent is not a coercion for malformed values or unknown ownership',()=>{
 const validate=new Ajv({strict:false}).compile(buildDesignOutputSchema(brief,cues).schema);
 for(const parentId of ['',false,0,[],{}]){
  const raw:any=design();raw.objects[0].parentId=parentId;
  assert.equal(validate(raw),false);assert.throws(()=>parseDesign(raw));
 }
 const unknown:any=design();unknown.objects[0].parentId='missing';assert.throws(()=>parseDesign(unknown),/parent/);
});
test('retained null-root design can reach revision feedback without hiding layout conflicts',()=>{
 const raw:any=design();raw.objects[0].parentId=null;
 raw.objects.push({...structuredClone(raw.objects[0]),id:'gripper',x:410,y:310});
 const before=JSON.stringify(raw);
 const prompt=buildDesignRevisionPrompt(brief,cues,raw,'Separate shelf and gripper','original schema error');
 assert.match(prompt,/"parentId":null/);assert.match(prompt,/"kind":"object-overlap"/);
 assert.match(prompt,/"objects":\["sleeve","gripper"\]/);
 assert.equal(JSON.stringify(raw),before);
});

test('design schema rejects missing references, unknown keys, oversized objects and changed frozen input',()=>{
 const schema=buildDesignOutputSchema(brief,cues),validate=new Ajv({strict:false}).compile(schema.schema);
 assert.ok(validate(design()));assert.doesNotThrow(()=>parseDesign(design(),brief,cues));
 for(const mutate of [
  (d:any)=>delete d.beats[0].changes[0].fromState,
  (d:any)=>delete d.objects[0].states,
  (d:any)=>d.objects[0].dataRoute=true,
  (d:any)=>d.objects=Array.from({length:21},()=>d.objects[0]),
  (d:any)=>d.cues[0].endFrame=83,
  (d:any)=>d.brief.narration='改写',
 ]){const d=JSON.parse(JSON.stringify(design()));mutate(d);assert.equal(validate(d),false);}
 const prompt=buildDesignPrompt(brief,cues);assert.ok(prompt.includes('OUTPUT_JSON_SCHEMA='+JSON.stringify(schema.schema)));
 assert.doesNotMatch(prompt,/schemaVersion:'visual-design:1'/);
});
test('schema requests use Responses JSON Schema, retain output, and dispatch once',async()=>{
 let calls=0,retained:any;
 const outputSchema=buildDesignOutputSchema(brief,cues);
 const d=await requestModelJson('Return JSON',{apiKey:'test',confirmCost:true,outputSchema,onResponse:async r=>{retained=r;},request:async(url,init)=>{
  calls++;assert.equal(url,'https://api.deepseek.com/responses');const b=JSON.parse(String(init?.body));
  assert.equal(b.text.format.type,'json_schema');assert.equal(b.text.format.name,outputSchema.name);
  assert.deepEqual(b.text.format.schema,outputSchema.schema);assert.equal(b.max_output_tokens,8192);
  assert.equal(b.reasoning.effort,'none');assert.equal(b.response_format,undefined);
  return response(design());
 }});
 assert.deepEqual(d,design());assert.equal(calls,1);assert.equal(retained.finishReason,'stop');
});
test('schema mismatch and HTTP errors never fall back or retry',async()=>{
 const outputSchema=buildDesignOutputSchema(brief,cues);let calls=0,retained:any;
 const bad:any=design();delete bad.beats[0].changes[0].toState;
 await assert.rejects(requestModelJson('JSON',{apiKey:'test',confirmCost:true,outputSchema,onResponse:async r=>{retained=r;},request:async()=>{calls++;return response(bad);}}),/schema_mismatch/);
 assert.equal(calls,1);assert.ok(retained.content.includes('fromState'));
 calls=0;
 await assert.rejects(requestModelJson('JSON',{apiKey:'test',confirmCost:true,outputSchema,request:async()=>{calls++;return new Response('',{status:400});}}),/HTTP 400/);
 assert.equal(calls,1);
});
test('incomplete Responses output is retained and cannot become a successful artifact',async()=>{
 let retained:any,calls=0;
 await assert.rejects(requestModelJson('JSON',{apiKey:'test',confirmCost:true,outputSchema:buildDesignOutputSchema(brief,cues),onResponse:async r=>{retained=r;},request:async()=>{calls++;return new Response(JSON.stringify({status:'incomplete',incomplete_details:{reason:'max_output_tokens'},output:[{type:'message',role:'assistant',content:[{type:'output_text',text:'{"cut":'}]}]}));}}),/truncated_response/);
 assert.equal(calls,1);assert.equal(retained.content,'{"cut":');assert.equal(retained.finishReason,'length');
});
test('invalid schema configuration is rejected before dispatch',async()=>{
 let calls=0;
 await assert.rejects(requestModelJson('JSON',{apiKey:'test',confirmCost:true,outputSchema:{name:'!invalid',schema:{}},request:async()=>{calls++;return response(design());}}),/invalid output schema/);
 assert.equal(calls,0);
});
test('failed, filtered, tool-call and refusal responses never produce design output',async()=>{
 const outputSchema=buildDesignOutputSchema(brief,cues);
 for(const body of [
  {status:'failed',output:[]},
  {status:'incomplete',incomplete_details:{reason:'content_filter'},output:[]},
  {status:'completed',output:[{type:'function_call',name:'unexpected',arguments:'{}'}]},
  {status:'completed',output:[{type:'message',role:'assistant',content:[{type:'refusal',refusal:'no'}]}]},
 ]){
  let calls=0,retained=false;
  await assert.rejects(requestModelJson('JSON',{apiKey:'test',confirmCost:true,outputSchema,onResponse:async()=>{retained=true;},request:async()=>{calls++;return new Response(JSON.stringify(body));}}),/response/);
  assert.equal(calls,1);assert.equal(retained,true);
 }
});
test('structured protocol failures retain bounded correlation metadata without headers or reasoning',async()=>{
 let retained:any,bodyText='',calls=0;
 const content='{}'+'</｜｜DSML｜｜ calls>';
 await assert.rejects(requestModelJson('private prompt',{apiKey:'secret-key',confirmCost:true,outputSchema:buildDesignOutputSchema(brief,cues),onResponse:async r=>{retained=r;},request:async(_url,init)=>{
  calls++;bodyText=String(init?.body);
  return new Response(JSON.stringify({id:'resp-example',model:'deepseek-flash',status:'completed',secret:'not retained',output:[{type:'reasoning',content:[{type:'reasoning_text',text:'private reasoning'}]},{type:'message',role:'assistant',status:'completed',content:[{type:'output_text',text:content}]}]}));
 }}),/invalid_json.*protocol_markup/);
 assert.equal(calls,1);assert.equal(retained.content,content);
 assert.deepEqual(retained.protocol,{endpoint:'responses',requestSha256:createHash('sha256').update(bodyText).digest('hex'),schemaName:'visual_design_v1',responseId:'resp-example',model:'deepseek-flash',status:'completed',output:[{type:'reasoning',parts:['reasoning_text']},{type:'message',role:'assistant',status:'completed',parts:['output_text']}]});
 assert.doesNotMatch(JSON.stringify(retained),/secret-key|private prompt|private reasoning|not retained/);
});
test('structured correlation metadata bounds provider-controlled strings and item counts',async()=>{
 let retained:any;
 await assert.rejects(requestModelJson('JSON',{apiKey:'test',confirmCost:true,outputSchema:buildDesignOutputSchema(brief,cues),onResponse:async r=>{retained=r;},request:async()=>new Response(JSON.stringify({id:'x'.repeat(1000),model:'m'.repeat(1000),status:'completed',output:Array.from({length:40},()=>({type:'message',role:'assistant',content:Array.from({length:40},()=>({type:'output_text',text:'{}'}))}))}))}),/response/);
 assert.equal(retained.protocol.responseId.length,256);assert.equal(retained.protocol.model.length,256);
 assert.equal(retained.protocol.output.length,32);assert.equal(retained.protocol.output[0].parts.length,32);assert.equal(retained.protocol.outputTruncated,true);
});
