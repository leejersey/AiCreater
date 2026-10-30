import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import Ajv from 'ajv';
import {parseDesign,designHash} from '../src/design';
import {evaluateMotion} from '../src/motion-plan';
import {buildStrictObjectMotionSchema,buildStrictObjectMotionRequest,parseStrictObjectMotionResponse} from '../src/strict-object-tool';

const brief={schemaVersion:'custom-scene-brief:1',id:'strict-test',title:'Move',narration:'Move.',visualGoal:'Move a file',facts:[],materials:[],width:1920,height:1080,fps:30,durationInFrames:60};
const cues=[{id:'cue',text:'Move.',startFrame:6,endFrame:54}];
const design=parseDesign({schemaVersion:'visual-design:1',brief,cues,thesis:'Move',metaphor:'Paper',objects:[{id:'file',meaning:'input',appearance:'paper',x:100,y:100,width:100,height:100}],beats:[{cueId:'cue',focus:'file',action:'move',changes:[{objectId:'file',from:'left',to:'right'}]}],composition:'open',palette:'blueprint',avoid:['cards'],acceptance:['same file']});
const pose=(x:number)=>({x,y:100,scale:1,opacity:1});
const wire=()=>({schemaVersion:'strict-object-motion:1',designSha256:designHash(design),anchors:[{id:'home',frame:{kind:'world'},pose:pose(100)},{id:'end',frame:{kind:'world'},pose:pose(300)}],objects:[{id:'file',initialAnchor:'home',actions:[{kind:'move',startFrame:6,endFrame:54,targetAnchor:'end'}],artwork:[{tag:'circle',attrs:[{name:'r',value:30},{name:'fill',value:'accent'}]}]}],audit:{routes:[],obstacles:[]}});
const response=(v:unknown)=>({choices:[{finish_reason:'tool_calls',message:{role:'assistant',content:null,tool_calls:[{id:'call-1',type:'function',function:{name:'submit_object_motion',arguments:JSON.stringify(v)}}]}}]});

test('offline builder creates one forced strict tool without credentials or production provider dispatch',()=>{
 const req=buildStrictObjectMotionRequest(design,'REFERENCE');
 assert.equal(req.url,'https://api.deepseek.com/beta/chat/completions');assert.equal(req.body.tools.length,1);
 assert.equal(req.body.tools[0].function.strict,true);assert.deepEqual(req.body.tool_choice,{type:'function',function:{name:'submit_object_motion'}});
 assert.equal(Object.hasOwn(req,'headers'),false);assert.equal(Object.hasOwn(req.body,'text'),false);
 assert.match(req.body.messages[0].content,/not.*execut/i);assert.match(req.body.messages[1].content,/REFERENCE/);
 assert.throws(()=>buildStrictObjectMotionRequest(design,'',{maxTokens:0}));
});

test('wire schema has required-only objects and excludes unsupported transport constraints',()=>{
 const schema=buildStrictObjectMotionSchema(design);
 function walk(s:any){
  if(!s||typeof s!=='object')return;
  assert.ok(s.type||s.anyOf||s.$ref,'each wire schema node needs an explicit type, anyOf or $ref');
  for(const key of ['minLength','maxLength','minItems','maxItems','allOf','contains','const'])assert.equal(Object.hasOwn(s,key),false,key);
  if(s.type==='object'){assert.equal(s.additionalProperties,false);assert.deepEqual(new Set(s.required),new Set(Object.keys(s.properties)));}
  for(const key of ['properties','$defs'])for(const child of Object.values(s[key]??{}))walk(child);
  if(s.items)walk(s.items);for(const child of s.anyOf??[])walk(child);
 }
 walk(schema);const validate=new Ajv({strict:false}).compile(schema);assert.equal(validate(wire()),true,JSON.stringify(validate.errors));
});

test('provider request uses documented $def dialect without changing local schema constraints',()=>{
 const local=buildStrictObjectMotionSchema(design),before=JSON.stringify(local);
 const sent=buildStrictObjectMotionRequest(design).body.tools[0].function.parameters;
 assert.equal(Object.hasOwn(sent,'$defs'),false);assert.ok(sent.$def.node);
 let refs=0;
 function restore(s:any):any{
  if(Array.isArray(s))return s.map(restore);
  if(!s||typeof s!=='object')return s;
  return Object.fromEntries(Object.entries(s).map(([key,value])=>{
   if(key==='$ref'){assert.equal(value,'#/$def/node');refs++;return [key,'#/$defs/node'];}
   return [key==='$def'?'$defs':key,restore(value)];
  }));
 }
 const restored=restore(sent);assert.ok(refs>=2);assert.deepEqual(restored,local);
 assert.equal(JSON.stringify(local),before);
 const validate=new Ajv({strict:false}).compile(restored);
 assert.equal(validate(wire()),true);
 const invalid:any=wire();invalid.objects[0].artwork=[{tag:'g',attrs:[],children:[{tag:'circle',attrs:[{name:'transform',value:'translate(0 0)'}]}]}];
 assert.equal(validate(invalid),false);
});

test('valid tool data decodes losslessly and passes the existing full host compiler',()=>{
 const v=wire(),raw=response(v),before=JSON.stringify(raw),parsed=parseStrictObjectMotionResponse(raw,design);
 assert.equal(parsed.payload.schemaVersion,'object-motion-data:1');assert.equal(parsed.payload.anchors[0].objectId,undefined);
 assert.deepEqual(parsed.payload.objects[0].artwork[0].attrs,{r:30,fill:'accent'});
 assert.equal(parsed.assembly.plan.tracks[0].keys.at(-1)!.x,300);assert.equal(JSON.stringify(raw),before);
 assert.equal(parsed.wire_sha256,createHash('sha256').update(raw.choices[0].message.tool_calls[0].function.arguments).digest('hex'));
});

test('wire does not default audit, overwrite duplicate attributes or accept unknown artwork',()=>{
 for(const mutate of [
  (v:any)=>delete v.audit,(v:any)=>v.designSha256='0'.repeat(64),
  (v:any)=>v.objects[0].artwork[0].attrs.push({name:'r',value:40}),
  (v:any)=>v.objects[0].artwork[0].attrs.push({name:'transform',value:'translate(1)'}),
  (v:any)=>v.objects[0].artwork[0].attrs[0].value=-1,
  (v:any)=>v.objects.push(structuredClone(v.objects[0])),
  (v:any)=>v.objects[0].actions[0].endFrame=60,
  (v:any)=>v.anchors[0].frame={kind:'world',objectId:'file'},
 ]){const v=wire();mutate(v);assert.throws(()=>parseStrictObjectMotionResponse(response(v),design));}
});

test('explicit object-local coordinates still produce a self-cycle rather than being stripped to world poses',()=>{
 const v:any=wire();v.anchors[0].frame={kind:'object',objectId:'file'};
 assert.throws(()=>parseStrictObjectMotionResponse(response(v),design),/cyclic object dependencies/);
});

test('ambiguous, incomplete or unexpected tool replies reject without invoking returned names',()=>{
 for(const mutate of [
  (r:any)=>r.choices[0].finish_reason='length',
  (r:any)=>r.choices[0].message.tool_calls.push(structuredClone(r.choices[0].message.tool_calls[0])),
  (r:any)=>r.choices[0].message.tool_calls[0].function.name='run_shell',
  (r:any)=>r.choices[0].message.tool_calls[0].function.arguments='{bad',
  (r:any)=>r.choices[0].message.content='extra output',
  (r:any)=>r.choices[0].message.refusal='refused',
  (r:any)=>r.choices.push(structuredClone(r.choices[0])),
  (r:any)=>r.choices[0]=null,
  (r:any)=>r.choices[0].message.tool_calls[0]=null,
 ]){const r=response(wire());mutate(r);assert.throws(()=>parseStrictObjectMotionResponse(r,design),/strict_object_tool/);}
});

test('oversized arguments and deeply recursive artwork reject before recursive validation',()=>{
 const huge=response(wire());huge.choices[0].message.tool_calls[0].function.arguments=' '.repeat(128*1024+1);assert.throws(()=>parseStrictObjectMotionResponse(huge,design),/size/);
 const v:any=wire();let node:any=v.objects[0].artwork[0];for(let i=0;i<80;i++)node={tag:'g',attrs:[],children:[node]};v.objects[0].artwork=[node];
 assert.throws(()=>parseStrictObjectMotionResponse(response(v),design),/depth/);
});

test('recursive artwork and a nonempty nested audit decode without losing references',()=>{
 const two=parseDesign({...design,objects:[...design.objects,{...design.objects[0],id:'route',x:400}]});
 const v:any=wire();v.designSha256=designHash(two);
 v.objects.unshift({id:'route',initialAnchor:'home',actions:[],artwork:[{tag:'g',attrs:[],children:[
  {tag:'path',attrs:[{name:'d',value:'M 0 0 L 300 0'},{name:'fill',value:'none'},{name:'stroke',value:'muted'}]},
  {tag:'rect',attrs:[{name:'width',value:40},{name:'height',value:40},{name:'fill',value:'secondary'}]},
 ]}]});
 v.audit={routes:[{id:'road',layerId:'route',nodePath:[0,0],followers:[{objectId:'file',startFrame:6,endFrame:54}]}],obstacles:[{layerId:'route',nodePath:[0,1]}]};
 const raw=response(v),before=JSON.stringify(raw),parsed=parseStrictObjectMotionResponse(raw,two);
 assert.equal(parsed.assembly.layers[0].id,'route');assert.deepEqual(parsed.assembly.audit,v.audit);assert.equal(JSON.stringify(raw),before);
 v.audit.routes[0].nodePath=[0];assert.throws(()=>parseStrictObjectMotionResponse(response(v),two),/painted stroke geometry/);
});

test('wire-only loose string and count bounds remain enforced by the unchanged host schema',()=>{
 const validate=new Ajv({strict:false}).compile(buildStrictObjectMotionSchema(design));
 const missing:any=wire();missing.objects=[];assert.equal(validate(missing),true);assert.throws(()=>parseStrictObjectMotionResponse(response(missing),design),/object_motion_data/);
 const long:any=wire();long.objects[0].artwork=[{tag:'text',attrs:[{name:'x',value:0},{name:'y',value:0},{name:'fontSize',value:24},{name:'fill',value:'foreground'}],text:'x'.repeat(501)}];
 assert.equal(validate(long),true);assert.throws(()=>parseStrictObjectMotionResponse(response(long),design),/object_motion_data/);
});

test('explicit other-object frame survives decode and attachment/release preserves world position',()=>{
 const two=parseDesign({...design,objects:[...design.objects,{...design.objects[0],id:'tool',x:300}]});
 const v:any=wire();v.designSha256=designHash(two);
 v.anchors.push({id:'tool-home',frame:{kind:'world'},pose:pose(300)},{id:'tool-end',frame:{kind:'world'},pose:pose(400)},{id:'jaw',frame:{kind:'object',objectId:'tool'},pose:{x:10,y:0,scale:1,opacity:1}});
 v.objects[0].actions=[{kind:'move',startFrame:6,endFrame:20,targetAnchor:'jaw'},{kind:'attach',frame:20,parentId:'tool'},{kind:'release',frame:45}];
 v.objects.push({id:'tool',initialAnchor:'tool-home',actions:[{kind:'move',startFrame:21,endFrame:40,targetAnchor:'tool-end'},{kind:'move',startFrame:50,endFrame:59,targetAnchor:'tool-home'}],artwork:[{tag:'circle',attrs:[{name:'r',value:30},{name:'fill',value:'secondary'}]}]});
 const parsed=parseStrictObjectMotionResponse(response(v),two);
 assert.equal(parsed.payload.anchors.find(a=>a.id==='jaw')!.objectId,'tool');
 assert.equal(evaluateMotion(parsed.assembly.plan,20).file.x,310);assert.equal(evaluateMotion(parsed.assembly.plan,40).file.x,410);
 assert.equal(evaluateMotion(parsed.assembly.plan,59).file.x,410);assert.equal(evaluateMotion(parsed.assembly.plan,59).tool.x,300);
});

test('wide malformed attribute arrays use fail-fast wire validation rather than accumulating every error',()=>{
 const v:any=wire();v.objects[0].artwork[0].attrs=Array(4000).fill(null);
 const original=Ajv.prototype.compile;let observed:boolean|undefined;
 try{
  (Ajv.prototype as any).compile=function(schema:unknown){observed=this.opts.allErrors;return original.call(this,schema as any);};
  assert.throws(()=>parseStrictObjectMotionResponse(response(v),design),/wire schema mismatch/);
  assert.equal(observed,false);
 }finally{Ajv.prototype.compile=original;}
});
