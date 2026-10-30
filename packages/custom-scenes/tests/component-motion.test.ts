import test from 'node:test';
import assert from 'node:assert/strict';
import {parseDesign,designHash} from '../src/design';
import {buildComponentMotionSchema,buildComponentMotionPrompt,parseComponentMotionData,hostArtwork} from '../src/component-motion';

const brief={schemaVersion:'custom-scene-brief:1',id:'component-test',title:'Move',narration:'Move.',visualGoal:'Move a file',facts:[],materials:[],width:1920,height:1080,fps:30,durationInFrames:60};
const design=parseDesign({schemaVersion:'visual-design:1',brief,cues:[{id:'cue',text:'Move.',startFrame:6,endFrame:54}],thesis:'Move',metaphor:'Paper',objects:[{id:'file',meaning:'input',appearance:'paper',x:100,y:100,width:100,height:140}],beats:[{cueId:'cue',focus:'file',action:'move',changes:[{objectId:'file',from:'left',to:'right'}]}],composition:'open',palette:'blueprint',avoid:['cards'],acceptance:['same file']});
const payload=()=>({schemaVersion:'component-motion-data:1',designSha256:designHash(design),anchors:[{id:'home',pose:{x:100,y:100,scale:1,opacity:1}},{id:'end',pose:{x:300,y:100,scale:1,opacity:1}}],objects:[{id:'file',initialAnchor:'home',actions:[{kind:'move',startFrame:6,endFrame:54,targetAnchor:'end'}],component:'document',label:'代码'}],audit:{routes:[],obstacles:[]}});

test('compact schema has no recursive artwork or provider references',()=>{
 const s=JSON.stringify(buildComponentMotionSchema(design));
 assert.doesNotMatch(s,/\$defs|\$ref|"artwork"|"children"/);
 assert.match(buildComponentMotionPrompt(design),/never return artwork/);
 assert.match(buildComponentMotionPrompt(design),new RegExp(designHash(design)));
 assert.match(buildComponentMotionPrompt(design),/release belongs to the attached child/);
});
test('host document has actual outline, fold, text and content lines, preserving original motion',()=>{
 const raw=payload(),before=JSON.stringify(raw),result=parseComponentMotionData(raw,design);
 assert.ok(result.layers[0].artwork.length>=6);
 assert.ok(result.layers[0].artwork.some(n=>n.tag==='path'));
 assert.ok(result.layers[0].artwork.some(n=>n.text==='代码'));
 assert.equal(result.plan.tracks[0].keys.at(-1)!.x,300);
 assert.equal(JSON.stringify(raw),before);
});
test('every catalog component compiles through the existing full drawing parser',()=>{
 for(const component of ['document','shelf','gripper','processor','sleeve','label','route']){
  const raw=payload();raw.objects[0].component=component;
  assert.ok(parseComponentMotionData(raw,design).layers[0].artwork.length);
 }
});
test('compact step labels use the label layout rather than illustration title proportions',()=>{
 const artwork=hostArtwork('label',140,48,'1 检索');
 const text=artwork.find(n=>n.tag==='text')!;
 assert.ok(Number(text.attrs.fontSize)>=12);
 assert.ok(Number(text.attrs.y)-Number(text.attrs.fontSize)>=0);
 assert.ok(Number(text.attrs.y)<48*.8);
});
test('carrier label clears its rail and sleeve label reserves the lower pocket',()=>{
 const claw=hostArtwork('gripper',420,130,'检索器').find(n=>n.tag==='text')!;
 assert.ok(Number(claw.attrs.x)>=420*.68);
 assert.ok(Number(claw.attrs.x)+3*Number(claw.attrs.fontSize)<=420);
 assert.ok(Number(claw.attrs.y)-Number(claw.attrs.fontSize)>12);
 const sleeve=hostArtwork('sleeve',230,220,'问题提示').find(n=>n.tag==='text')!;
 assert.ok(Number(sleeve.attrs.y)-Number(sleeve.attrs.fontSize)>220*.6);
 assert.ok(Number(sleeve.attrs.y)<220*.88);
 assert.ok(Number(sleeve.attrs.y)-Number(sleeve.attrs.fontSize)>=0);
});
test('processor caption stays above the horizontal feed band',()=>{
 const text=hostArtwork('processor',400,500,'生成器').find(n=>n.tag==='text')!;
 assert.ok(Number(text.attrs.y)<500*.3-12);
 assert.ok(Number(text.attrs.y)-Number(text.attrs.fontSize)>=0);
});
test('gripper jaws form a centered pickup rather than a full-width decorative bracket',()=>{
 const artwork=hostArtwork('gripper',420,130,'检索器');
 const jaw=artwork.find(n=>n.tag==='path')!;
 const points=String(jaw.attrs.d).match(/[\d.]+/g)!.map(Number);
 assert.ok(Math.abs(points[0]-176.4)<.001);
 assert.ok(Math.abs(points[3]-243.6)<.001);
 assert.ok(points[3]-points[0]<70);
});
test('no arbitrary artwork, paths, unknown components, missing labels or design rebinding',()=>{
 for(const mutate of [(r:any)=>r.objects[0].artwork=[],(r:any)=>r.objects[0].component='custom-svg',(r:any)=>delete r.objects[0].label,(r:any)=>r.designSha256='0'.repeat(64),(r:any)=>r.objects[0].id='unknown',(r:any)=>r.objects.push(structuredClone(r.objects[0]))]){
  const raw=payload();mutate(raw);assert.throws(()=>parseComponentMotionData(raw,design));
 }
 assert.throws(()=>hostArtwork('document',NaN,100,'file'));
 assert.throws(()=>hostArtwork('document',100,100,'x'.repeat(25)));
});
test('compact drawings never bypass cycle and real painted route audit guards',()=>{
 const raw:any=payload();raw.anchors[0].objectId='file';
 assert.throws(()=>parseComponentMotionData(raw,design),/cyclic/);
 const route:any=payload();route.audit.routes=[{id:'road',layerId:'file',nodePath:[0],followers:[]}];
 assert.throws(()=>parseComponentMotionData(route,design),/route|stroke/);
 const orphan:any=payload();orphan.objects[0].actions=[{kind:'release',frame:20}];
 assert.throws(()=>parseComponentMotionData(orphan,design),/positive attachment interval/);
});

test('host route leaf can retain real audit binding only while static and visible',()=>{
 const two=parseDesign({...design,objects:[...design.objects,{...design.objects[0],id:'road',x:400}]});
 const raw:any=payload();raw.designSha256=designHash(two);
 raw.objects.push({id:'road',component:'route',label:'',initialAnchor:'home',actions:[]});
 raw.audit.routes=[{id:'road-path',layerId:'road',nodePath:[0],followers:[{objectId:'file',startFrame:6,endFrame:54}]}];
 assert.deepEqual(parseComponentMotionData(raw,two).audit,raw.audit);
 raw.objects[1].actions=payload().objects[0].actions;
 assert.throws(()=>parseComponentMotionData(raw,two),/static/);
});
