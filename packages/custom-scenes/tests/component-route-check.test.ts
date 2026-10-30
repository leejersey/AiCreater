import test from 'node:test';
import assert from 'node:assert/strict';
import {componentRouteFindings} from '../src/component-route-check';
import {parseDesign,designHash} from '../src/design';
const brief={schemaVersion:'custom-scene-brief:1',id:'route-test',title:'Route',narration:'Move.',visualGoal:'Move',facts:[],materials:[],width:1920,height:1080,fps:30,durationInFrames:60};
const design=parseDesign({schemaVersion:'visual-design:1',brief,cues:[{id:'cue',text:'Move.',startFrame:6,endFrame:54}],thesis:'Move',metaphor:'Paper',objects:['file','road'].map((id,i)=>({id,meaning:id,appearance:id,x:100+i*200,y:100,width:100,height:100})),beats:[{cueId:'cue',focus:'file',action:'move',changes:[{objectId:'file',from:'left',to:'right'}]}],composition:'open',palette:'blueprint',avoid:['cards'],acceptance:['same file']});
const pose=(x:number,y:number)=>({x,y,scale:1,opacity:1});
function data(){return {schemaVersion:'component-motion-data:1',designSha256:designHash(design),anchors:[{id:'road-home',pose:pose(100,100)},{id:'home',pose:pose(100,150)},{id:'end',pose:pose(200,150)}],objects:[{id:'road',initialAnchor:'road-home',actions:[],component:'route',label:''},{id:'file',initialAnchor:'home',actions:[{kind:'move',startFrame:6,endFrame:54,targetAnchor:'end'}],component:'document',label:''}],audit:{routes:[{id:'path',layerId:'road',nodePath:[0],followers:[{objectId:'file',startFrame:6,endFrame:54}]}],obstacles:[]}};}
test('checks actual component line including half-height offset without mutating data',()=>{
 const raw=data(),before=JSON.stringify(raw);assert.deepEqual(componentRouteFindings(raw,design),[]);assert.equal(JSON.stringify(raw),before);
 raw.anchors[1].pose.y=100;raw.anchors[2].pose.y=100;
 const [finding]=componentRouteFindings(raw,design);
 assert.equal(finding.objectId,'file');assert.equal(finding.firstFrame,6);assert.equal(finding.maxDistance,50);
});
test('detects excursions beyond the finite line, not only distance to its infinite extension',()=>{
 const raw=data();raw.anchors[2].pose.x=400;
 const distance=componentRouteFindings(raw,design)[0].maxDistance;
 assert.ok(distance!==null&&distance>100);
});
