import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {parseMotionAssembly,assembleMotionScene} from '../src/motion-assembly';
import {typecheckSource} from '../src/files';
async function fixture(){
 const input=JSON.parse(await readFile('examples/custom-scenes/motion-host/assembly.json','utf8'));
 input.schemaVersion='motion-assembly:2';
 input.plan.tracks.push({id:'route',keys:[{frame:0,x:0,y:0,scale:1,opacity:1}]});
 input.layers.push({id:'route',artwork:[{tag:'path',attrs:{d:'M 300 350 H 1200',stroke:'muted',fill:'none',strokeWidth:2}}]});
 input.audit={routes:[{id:'route-main',layerId:'route',nodePath:[0],followers:[{objectId:'question',startFrame:15,endFrame:91}]}],obstacles:[{layerId:'context',nodePath:[0]}]};
 return input;
}
test('host audit annotations attach to actual painted nodes and phase-bound real motion groups',async()=>{
 const input=parseMotionAssembly(await fixture()),artifact=await assembleMotionScene(input);
 assert.equal(input.audit!.routes[0].id,'route-main');
 assert.match(artifact.source,/"route:0":\{"id":"route-main","data-route":"true"\}/);
 assert.match(artifact.source,/"context:0":\{"data-obstacle":"true"\}/);
 assert.match(artifact.source,/data-follow-path=\{props.frame >= 15 && props.frame < 91 \? "route-main" : undefined\}/);
 assert.ok(artifact.source.includes("auditAttrs[layerId+':'+key]"));
 await typecheckSource(artifact.source);
});
test('reject invalid node references, moving/invisible routes, duplicate annotations and overlapping follow windows',async()=>{
 const changes=[
  (v:any)=>v.schemaVersion='motion-assembly:1',
  (v:any)=>v.audit.routes[0].nodePath=[9],
  (v:any)=>v.audit.routes[0].layerId='missing',
  (v:any)=>v.audit.routes[0].nodePath=[0,0],
  (v:any)=>v.audit.routes[0].followers[0].objectId='missing',
  (v:any)=>v.audit.routes[0].followers[0].endFrame=121,
  (v:any)=>v.audit.routes[0].followers[0].startFrame=15.5,
  (v:any)=>v.audit.routes[0].followers.push({...v.audit.routes[0].followers[0],startFrame:30,endFrame:50}),
  (v:any)=>v.plan.tracks[2].keys.push({frame:100,x:5,y:0,scale:1,opacity:1}),
  (v:any)=>v.layers[2].artwork[0].attrs.stroke='background',
  (v:any)=>v.audit.obstacles.push({...v.audit.obstacles[0]}),
  (v:any)=>v.audit.obstacles.push({layerId:'route',nodePath:[0]}),
 ];
 for(const change of changes){const input=await fixture();change(input);assert.throws(()=>parseMotionAssembly(input),/motion_(assembly|audit)/);}
});
