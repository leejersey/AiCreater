import test from 'node:test';
import assert from 'node:assert/strict';
import React from 'react';
import {interpolate,Easing} from 'remotion';
import Scene from '../../../examples/custom-scenes/reviewed-loop/Scene';
import {sceneTheme} from '../src/contract';
import {readFileSync} from 'node:fs';

function nodes(frame:number){
 const result:React.ReactElement<Record<string,any>>[]=[];
 const walk=(v:React.ReactNode)=>{if(!React.isValidElement(v))return;const e=v as React.ReactElement<Record<string,any>>;result.push(e);React.Children.forEach(e.props.children,walk);};
 walk(Scene({frame,fps:30,width:1920,height:1080,theme:sceneTheme}));return result;
}
function position(frame:number){
 const node=nodes(frame).find(n=>n.props['data-object']==='task-payload')!;
 const values=String(node.props.transform).match(/translate\(([-\d.e]+) ([-\d.e]+)\)/)!;
 return {x:Number(values[1]),y:Number(values[2]),route:node.props['data-follow-path']};
}
test('ring motion uses the actual ring point, not a second interpolation toward that point',()=>{
 for(const frame of [356,389,423,521,578,636]){
  const p=position(frame);assert.ok(Math.abs(Math.hypot(p.x-960,p.y-470)-330)<1e-6,`frame ${frame} left ring`);assert.equal(p.route,'loop-route');
 }
});
test('return motion follows the same quadratic as the visible return pipe',()=>{
 const frame=1154,p=position(frame);
 const pipe=nodes(frame).find(n=>n.type==='path'&&n.props.id==='return-route')!;
 assert.ok(pipe,'visible return path must be declared');
 const [sx,sy,cx,cy,ex,ey]=String(pipe.props.d).match(/-?\d+(?:\.\d+)?(?:e[-+]?\d+)?/g)!.map(Number);
 const u=interpolate(frame,[1055,1230],[0,1],{extrapolateLeft:'clamp',extrapolateRight:'clamp',easing:Easing.inOut(Easing.cubic)}),v=1-u;
 assert.ok(Math.abs(p.x-(v*v*sx+2*v*u*cx+u*u*ex))<1e-6);
 assert.ok(Math.abs(p.y-(v*v*sy+2*v*u*cy+u*u*ey))<1e-6);assert.equal(p.route,'return-route');
});
test('completion exit starts continuously at the returned payload position',()=>{
 const a=position(2100),b=position(2101);assert.ok(Math.hypot(a.x-b.x,a.y-b.y)<1);assert.equal(b.route,'exit-route');
});
test('corrected preview is separate from the original model-output preview',()=>{
 const source=readFileSync(new URL('../../../apps/renderer/src/custom-lab.tsx',import.meta.url),'utf8');assert.match(source,/id="ReviewedLoop"/);assert.match(source,/id="GeneratedLoopV2"/);
});
