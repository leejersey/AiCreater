import test from 'node:test';
import assert from 'node:assert/strict';
import {reviewSourceMotion,motionQualityFeedback} from '../src/source-motion-review';
import {parseDesign} from '../src/design';

const design=parseDesign({schemaVersion:'visual-design:1',palette:'blueprint',
 brief:{schemaVersion:'custom-scene-brief:1',id:'pose-test',title:'Pose test',narration:'Test.',visualGoal:'Check pose boundaries.',facts:['A card moves.'],materials:['Card'],width:1920,height:1080,fps:30,durationInFrames:982},
 cues:[{id:'cue-1',text:'Test.',startFrame:0,endFrame:982}],thesis:'Stable handoff.',metaphor:'Paper card.',
 objects:[{id:'answer-card',meaning:'Answer',appearance:'Top-left card.',x:470,y:470,width:210,height:140}],
 beats:[{cueId:'cue-1',focus:'answer-card',action:'Move the card.',changes:[{objectId:'answer-card',from:'Hidden',to:'Settled'}]}],composition:'Card at outlet.',avoid:['Jump'],acceptance:['Stable pose']});
test('chapter-1 failure patterns expose settled clipping and discontinuous tray handoff without execution',()=>{
 const source=`${header}
export default function Scene({frame}:{frame:number}){
 const card2=interpolate(frame,[224,284,327],[0,0.5,1],clamp);
 const slot={x:470,y:470};const tray={x:168,y:800};
 const oldEmergent=slot;
 const oldTrayMid=lerpPt(slot,tray,card2);
 const oldTrayFinal={x:tray.x,y:oldTrayMid.y};
 const oldPos=card2>0?oldTrayFinal:oldEmergent;
 const newOut=interpolate(frame,[697,769],[0,1],clamp);
 const newPos=lerpPt({x:114,y:470},slot,newOut);
 return <svg><defs><clipPath id="clip-old-outlet"><rect x={330} y={470} width={140} height={260}/></clipPath></defs>
 <g transform={\`translate(\${oldPos.x} \${oldPos.y})\`}><rect width={210} height={140}/></g>
 <g clipPath="url(#clip-old-outlet)"><g transform={\`translate(\${newPos.x} \${newPos.y})\`}><g data-object="answer-card"/></g></g></svg>;
}`;
 const artifact={schemaVersion:'custom-scene:1',brief:design.brief,rationale:'Retained failure patterns',source};
 const review=reviewSourceMotion(artifact,design);
 const clip=review.findings.find(f=>f.kind==='occlusion-incomplete'&&f.target.includes('clip-old-outlet')&&f.detail.includes('settled'));
 assert.ok(clip,'settled answer outside outlet clip must be diagnosed');
 assert.ok(clip.lines.includes(source.split('\n').findIndex(l=>l.includes('<clipPath'))+1));
 const jump=review.findings.find(f=>f.kind==='motion-discontinuity'&&f.target==='oldPos');
 assert.ok(jump,'conditional point handoff must be diagnosed');assert.ok(jump.lines.includes(source.split('\n').findIndex(l=>l.includes('const oldPos='))+1));assert.match(jump.detail,/302/);
 assert.equal(review.status,'revise-required');assert.equal(review.accepted,false);assert.equal(review.staticContinuityProven,false);
 assert.match(motionQualityFeedback(artifact,design).feedback,/oldPos/);
 const propsSource=source.replace('Scene({frame}:{frame:number}){','Scene(props:{frame:number}){const {frame}=props;');
 assert.equal(reviewSourceMotion({...artifact,source:propsSource},design).findings.length,2);
});

async function fixture(source:string){
 return reviewSourceMotion({schemaVersion:'custom-scene:1',brief:design.brief,rationale:'Static-only fixture',source},design);
}
const header=`import {interpolate} from 'remotion';
const clamp={extrapolateLeft:'clamp' as const,extrapolateRight:'clamp' as const};
const lerp=(a:number,b:number,u:number)=>a+(b-a)*u;
const lerpPt=(a:{x:number;y:number},b:{x:number;y:number},u:number)=>({x:lerp(a.x,b.x,u),y:lerp(a.y,b.y,u)});`;
test('same endpoint, early-only clipping and unknown helper semantics are not declared broken',async()=>{
 const safe=await fixture(`${header}
export default function Scene({frame}:{frame:number}){
 const phase=interpolate(frame,[224,327],[0,1],clamp);
 const from={x:470,y:470};const to={x:168,y:800};
 const moving=lerpPt(from,to,phase);const pose=phase>0?moving:from;
 return <svg><defs><clipPath id="outlet"><rect x={330} y={470} width={140} height={260}/></clipPath></defs>
 {frame<200&&<g clipPath="url(#outlet)"><g transform={\`translate(\${pose.x} \${pose.y})\`}><g data-object="answer-card"/></g></g>}
 <g transform={\`translate(\${pose.x} \${pose.y})\`}><g data-object="answer-card"/></g></svg>;
}`);
 assert.ok(!safe.findings.some(f=>f.target==='pose'&&f.kind==='motion-discontinuity'));
 assert.ok(!safe.findings.some(f=>f.detail.includes('settled')));
 const unknown=await fixture(`function customPose(n:number){return {x:n*100,y:0};}
export default function Scene({frame}:{frame:number}){const pose=customPose(frame);return <svg><defs><clipPath id="small"><rect x={0} y={0} width={10} height={10}/></clipPath></defs><g clipPath="url(#small)"><g transform={\`translate(\${pose.x} \${pose.y})\`}><g data-object="answer-card"/></g></g></svg>;}`);
 assert.ok(!unknown.findings.some(f=>f.detail.includes('settled')));
 assert.equal(unknown.staticContinuityProven,false);
});
test('clip checks do not treat artwork-center offsets or a rotated group as a top-left pose',async()=>{
 for(const transform of ['translate(0 0)','translate(470 470) rotate(10)']){
  const r=await fixture(`export default function Scene(){return <svg><defs><clipPath id="crop"><rect x={0} y={0} width={10} height={10}/></clipPath></defs><g clipPath="url(#crop)"><g transform="${transform}"><g data-object="answer-card"/></g></g></svg>}`);
  assert.ok(!r.findings.some(f=>f.detail.includes('settled')));
 }
});

test('local clips, changed poses and child frame props do not create false world-space findings',async()=>{
 for(const body of [
  '<g transform={`translate(${pose.x} ${pose.y})`} clipPath="url(#crop)"><g data-object="answer-card"/></g>',
  '<g transform={`translate(${pose.x} ${pose.y})`}><g clipPath="url(#crop)"><g data-object="answer-card"/></g></g>',
 ]){
  const r=await fixture(`export default function Scene(){const pose={x:470,y:470};return <svg><defs><clipPath id="crop"><rect x={0} y={0} width={220} height={150}/></clipPath></defs>${body}</svg>}`);
  assert.ok(!r.findings.some(f=>f.detail.includes('settled')));
 }
 for(const pose of ['let pose={x:470,y:470};pose={x:0,y:0};','const pose={x:470,y:470};pose.x=0;pose.y=0;']){
  const r=await fixture(`export default function Scene(){${pose}return <svg><defs><clipPath id="crop"><rect x={0} y={0} width={220} height={150}/></clipPath></defs><g clipPath="url(#crop)"><g transform={\`translate(\${pose.x} \${pose.y})\`}><g data-object="answer-card"/></g></g></svg>}`);
  assert.ok(!r.findings.some(f=>f.detail.includes('settled')));
 }
 const child=await fixture(`${header}
function Child({frame}:{frame:number}){const phase=interpolate(frame,[224,327],[0,1],clamp);const pose=phase>0?{x:168,y:470}:{x:470,y:470};return <g transform={\`translate(\${pose.x} \${pose.y})\`}/>;}
export default function Scene(){return <svg><Child frame={100}/></svg>;}`);
 assert.ok(!child.findings.some(f=>f.target==='pose'));
});

test('unresolved interpolation options and unreachable switches remain render checks',async()=>{
 for(const [range,options] of [['[224,327]','{...clamp,easing:()=>1}'],['[1100,1200]','clamp'],['[-200,-100]','clamp']]){
  const r=await fixture(`${header}
export default function Scene({frame}:{frame:number}){const phase=interpolate(frame,${range},[0,1],${options});const pose=phase>0?{x:168,y:470}:{x:470,y:470};return <svg><g transform={\`translate(\${pose.x} \${pose.y})\`}/></svg>;}`);
  assert.ok(!r.findings.some(f=>f.target==='pose'));
 }
});

test('reassigned progress and a local frame constant cannot stand in for scene time',async()=>{
 for(const [signature,setup] of [
  ['{frame}:{frame:number}','let phase=interpolate(frame,[10,20],[0,1],clamp);phase=1;'],
  ['','const frame=100;const phase=interpolate(frame,[10,20],[0,1],clamp);'],
 ]){
  const r=await fixture(`${header}
export default function Scene(${signature}){${setup}const pose=phase>0?{x:168,y:470}:{x:470,y:470};return <svg><g transform={\`translate(\${pose.x} \${pose.y})\`}/></svg>;}`);
  assert.ok(!r.findings.some(f=>f.target==='pose'));
 }
});

test('changed helper bodies and shadowed bindings stay unresolved',async()=>{
 for(const h of [header.replace('a+(b-a)*u','a+(b-a)*u+100'),header+'\nfunction unrelated(from:number){return from;}']){
  const r=await fixture(`${h}
export default function Scene({frame}:{frame:number}){
 const phase=interpolate(frame,[224,327],[0,1],clamp);
 const from={x:470,y:470};const to={x:168,y:800};
 const moving=lerpPt(from,to,phase);const pose=phase>0?moving:to;
 return <svg><g transform={\`translate(\${pose.x} \${pose.y})\`}><g data-object="answer-card"/></g></svg>;
}`);
  assert.ok(!r.findings.some(f=>f.target==='pose'));
 }
});

test('expanded outlet clip preserves the declared settled card',async()=>{
 const r=await fixture(`${header}
export default function Scene({frame}:{frame:number}){
 const out=interpolate(frame,[0,100],[0,1],clamp);
 const pose=lerpPt({x:114,y:470},{x:470,y:470},out);
 return <svg><defs><clipPath id="outlet"><rect x={330} y={470} width={400} height={260}/></clipPath></defs>
 <g clipPath="url(#outlet)"><g transform={\`translate(\${pose.x} \${pose.y})\`}><g data-object="answer-card"/></g></g></svg>;
}`);
 assert.ok(!r.findings.some(f=>f.detail.includes('settled')));
 assert.equal(r.accepted,false);
});

test('literal clip references require a definition in the self-contained scene',async()=>{
 const r=await fixture('export default function Scene(){return <svg><g clipPath="url(#missing-reveal)"><rect width={210} height={140}/></g></svg>;}');
 assert.ok(r.findings.some(f=>f.kind==='occlusion-incomplete'&&f.target==='missing-reveal'&&f.detail.includes('no definition')));
 assert.equal(r.status,'revise-required');
 const defined=await fixture('export default function Scene(){return <svg><defs><clipPath id="reveal"><rect width={210} height={140}/></clipPath></defs><g clipPath="url(#reveal)"><rect width={210} height={140}/></g></svg>;}');
 assert.ok(!defined.findings.some(f=>f.detail.includes('no definition')));
});
