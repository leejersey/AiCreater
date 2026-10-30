import test from 'node:test';
import assert from 'node:assert/strict';
import Ajv from 'ajv';
import {parseDesign,designHash} from '../src/design';
import {parseIntentAssembly,buildIntentPrompt} from '../src/motion-intent-output';
import {buildMotionPrompt} from '../src/motion-output';
import {evaluateMotion} from '../src/motion-plan';
import {buildObjectMotionSchema,parseObjectMotionData,parseStoredIntentData,storedIntentHash,buildObjectMotionPrompt} from '../src/object-motion-output';

const brief={schemaVersion:'custom-scene-brief:1',id:'object-data',title:'Move',narration:'Move.',visualGoal:'Move a paper',facts:[],materials:[],width:1920,height:1080,fps:30,durationInFrames:60};
const cues=[{id:'cue',text:'Move.',startFrame:6,endFrame:54}];
const design=parseDesign({schemaVersion:'visual-design:1',brief,cues,thesis:'Move',metaphor:'Paper',objects:[{id:'file',meaning:'input',appearance:'paper',x:100,y:100,width:100,height:100}],beats:[{cueId:'cue',focus:'file',action:'move',changes:[{objectId:'file',from:'left',to:'right'}]}],composition:'open',palette:'blueprint',avoid:['cards'],acceptance:['same file']});
const pose=(x:number)=>({x,y:100,scale:1,opacity:1});
const data=()=>({schemaVersion:'object-motion-data:1',designSha256:designHash(design),anchors:[{id:'start',pose:pose(100)},{id:'end',pose:pose(300)}],objects:[{id:'file',initialAnchor:'start',actions:[{kind:'move',startFrame:6,endFrame:54,targetAnchor:'end'}],artwork:[{tag:'circle',attrs:{r:30,fill:'accent'}}]}],audit:{routes:[],obstacles:[]}});
const legacy=()=>{const v=data();return {schemaVersion:'motion-intent-assembly:1',brief,intent:{schemaVersion:'motion-intent:1',durationInFrames:60,anchors:v.anchors,objects:v.objects.map(({artwork,...motion})=>motion)},layers:v.objects.map(({id,artwork})=>({id,artwork})),audit:v.audit};};

test('object schema owns one identity list and host adapter matches existing assembly without mutation',()=>{
 const schema=buildObjectMotionSchema(design),validate=new Ajv({strict:false}).compile(schema.schema),v=data(),before=JSON.stringify(v);
 assert.equal(schema.name,'object_motion_data_v1');assert.equal(validate(v),true,JSON.stringify(validate.errors));
 assert.deepEqual(parseObjectMotionData(v,design),parseIntentAssembly(legacy(),design));assert.equal(JSON.stringify(v),before);
 for(const key of ['brief','durationInFrames','intent','layers'])assert.equal(Object.hasOwn(schema.schema.properties,key),false);
 const prompt=buildObjectMotionPrompt(design,'REFERENCE');assert.match(prompt,/HOST_OBJECT_MOTION_DATA/);assert.match(prompt,/REFERENCE/);assert.match(prompt,/host computes.*offset/i);
});
test('strict object parser rejects old envelopes, wrong design binding, nesting, duplicated IDs and executable artwork',()=>{
 for(const mutate of [
  (v:any)=>v.designSha256='0'.repeat(64),(v:any)=>v.objects[0].id='other',
  (v:any)=>v.objects.push(structuredClone(v.objects[0])),(v:any)=>delete v.objects[0].artwork,
  (v:any)=>v.intent={},(v:any)=>v.layers=[],(v:any)=>v.brief=brief,
  (v:any)=>{v.objects[0].audit=v.audit;delete v.audit;},
  (v:any)=>v.objects[0].artwork[0].attrs.transform='translate(10)',
  (v:any)=>v.objects[0].actions[0].endFrame=60,
 ]){const v=data();mutate(v);assert.throws(()=>parseObjectMotionData(v,design));}
 assert.throws(()=>parseObjectMotionData(legacy(),design));
});

test('two object records require complete identity coverage even when the array length is correct',()=>{
 const two=parseDesign({...design,objects:[...design.objects,{...design.objects[0],id:'second',x:400}]});
 const v=data();v.designSha256=designHash(two);v.objects.push({...structuredClone(v.objects[0]),id:'second'});
 assert.doesNotThrow(()=>parseObjectMotionData(v,two));v.objects[1].id='file';assert.throws(()=>parseObjectMotionData(v,two));
});
test('schema-valid cyclic dependencies remain invalid while stored legacy and new data remain readable',()=>{
 const cyclic:any=data();cyclic.anchors[0].objectId='file';const validate=new Ajv({strict:false}).compile(buildObjectMotionSchema(design).schema);assert.equal(validate(cyclic),true);
 assert.throws(()=>parseObjectMotionData(cyclic,design),/cyclic/);
 assert.deepEqual(parseStoredIntentData(legacy(),design),parseStoredIntentData(data(),design));
 assert.match(storedIntentHash(data(),design),/^[a-f0-9]{64}$/);assert.notEqual(storedIntentHash(data(),design),storedIntentHash(legacy(),design));
 const changed=data();changed.anchors.push({id:'unused',pose:pose(500)});assert.notEqual(storedIntentHash(changed,design),storedIntentHash(data(),design));
});

test('nonempty nested paint audit remains bound by identity after object order changes',()=>{
 const two=parseDesign({...design,objects:[...design.objects,{...design.objects[0],id:'route',x:400}]});
 const v:any=data();v.designSha256=designHash(two);
 v.objects.unshift({id:'route',initialAnchor:'start',actions:[],artwork:[{tag:'g',attrs:{},children:[
  {tag:'path',attrs:{d:'M 0 0 L 300 0',fill:'none',stroke:'muted'}},
  {tag:'rect',attrs:{x:400,y:100,width:40,height:40,fill:'muted'}},
 ]}]});
 v.audit={routes:[{id:'road',layerId:'route',nodePath:[0,0],followers:[{objectId:'file',startFrame:6,endFrame:54}]}],obstacles:[{layerId:'route',nodePath:[0,1]}]};
 const before=JSON.stringify(v),assembly=parseObjectMotionData(v,two);
 assert.equal(assembly.layers[0].id,'route');assert.equal(assembly.layers[1].id,'file');assert.deepEqual(assembly.audit,v.audit);assert.equal(JSON.stringify(v),before);
 const moving=structuredClone(v);moving.objects[0].actions=[{kind:'move',startFrame:6,endFrame:54,targetAnchor:'end'}];
 assert.throws(()=>parseObjectMotionData(moving,two),/route must be static and visible/);
 const grouped=structuredClone(v);grouped.audit.routes[0].nodePath=[0];
 assert.throws(()=>parseObjectMotionData(grouped,two),/route must be painted stroke geometry/);
 v.audit.obstacles[0].nodePath=[0,9];assert.throws(()=>parseObjectMotionData(v,two),/missing painted node/);
 v.audit.obstacles[0].nodePath=[0,1];v.audit.obstacles[0].layerId='missing';assert.throws(()=>parseObjectMotionData(v,two));
});

test('all motion generation prompts and object schema carry the same explicit route audit contract',()=>{
 for(const prompt of [buildObjectMotionPrompt(design,''),buildIntentPrompt(design,''),buildMotionPrompt(design,'')]){
  assert.match(prompt,/AUDIT_ROUTE_CONTRACT/);assert.match(prompt,/static and visible/);
  assert.match(prompt,/path, line, polyline or polygon/);assert.match(prompt,/not.*g.*group/i);
  assert.match(prompt,/parent\/attachment relationships are not routes/);
  assert.match(prompt,/fill:none/);assert.match(prompt,/half-open/);
 }
 const audit=(buildObjectMotionSchema(design).schema.properties.audit as any);
 assert.match(audit.description,/AUDIT_ROUTE_CONTRACT/);
});

test('intent prompts and schemas explain coordinate dependencies instead of anchor ownership labels',()=>{
 for(const prompt of [buildObjectMotionPrompt(design,''),buildIntentPrompt(design,'')]){
  assert.match(prompt,/ANCHOR_COORDINATE_CONTRACT/);assert.match(prompt,/not an ownership label/);
  assert.match(prompt,/OMIT objectId/);assert.match(prompt,/initialAnchor.*own object/i);
  assert.match(prompt,/targetAnchor.*own object/i);assert.match(prompt,/even when.*different times/i);
 }
 const schema:any=buildObjectMotionSchema(design).schema;
 assert.match(schema.properties.anchors.items.properties.objectId.description,/coordinate-frame dependency/);
 assert.match(schema.properties.objects.items.properties.initialAnchor.description,/own object/);
 const move=schema.properties.objects.items.properties.actions.items.anyOf[0];
 assert.match(move.properties.targetAnchor.description,/own object/);
});

test('local docking on another object computes its world pose while self-owned move targets remain cycles',()=>{
 const two=parseDesign({...design,objects:[...design.objects,{...design.objects[0],id:'tool',x:200}]});
 const v:any=data();v.designSha256=designHash(two);v.anchors.push({id:'tool-home',pose:pose(200)},{id:'tool-carry',pose:pose(400)},{id:'jaw',objectId:'tool',pose:{x:10,y:0,scale:1,opacity:1}});
 v.objects[0].actions=[{kind:'move',startFrame:6,endFrame:30,targetAnchor:'jaw'},{kind:'attach',frame:30,parentId:'tool'},{kind:'release',frame:45}];
 v.objects.push({id:'tool',initialAnchor:'tool-home',actions:[{kind:'move',startFrame:6,endFrame:20,targetAnchor:'end'},{kind:'move',startFrame:31,endFrame:40,targetAnchor:'tool-carry'},{kind:'move',startFrame:50,endFrame:59,targetAnchor:'tool-home'}],artwork:[{tag:'circle',attrs:{r:30,fill:'secondary'}}]});
 const before=JSON.stringify(v),assembly=parseObjectMotionData(v,two),file=assembly.plan.tracks.find(t=>t.id==='file')!;
 assert.equal(file.keys.find(k=>k.frame===30)!.x,310);assert.equal(file.keys.find(k=>k.frame===45)!.x,410);assert.equal(JSON.stringify(v),before);
 assert.equal(evaluateMotion(assembly.plan,40).file.x,410);assert.equal(evaluateMotion(assembly.plan,59).file.x,410);assert.equal(evaluateMotion(assembly.plan,59).tool.x,200);
 const self:any=data();self.anchors[1].objectId='file';assert.throws(()=>parseObjectMotionData(self,design),/cyclic object dependencies/);
});
