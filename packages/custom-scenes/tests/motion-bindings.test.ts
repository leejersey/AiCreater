import test from 'node:test';
import assert from 'node:assert/strict';
import {checkMotionBindings} from '../src/motion-bindings';

const source=(attributes='transform={motion["payload"].transform} opacity={motion["payload"].opacity}')=>
 `export default function Scene(){return <svg><g data-object="payload" ${attributes}><path d="M0 0"/></g></svg>;}`;

test('accept one actual group binding, not a comment or an unused coordinate calculation',()=>{
 assert.doesNotThrow(()=>checkMotionBindings(source(),['payload']));
 assert.throws(()=>checkMotionBindings(source('transform={`translate(${x}, ${y})`}'),['payload']),/binding/);
 assert.throws(()=>checkMotionBindings('// motion["payload"].transform\nexport default function Scene(){return <svg/>;}', ['payload']),/missing/);
});
test('reject wrong object bindings, expression overrides, duplicate identity and attribute spreads',()=>{
 for(const attributes of [
  'transform={motion["other"].transform} opacity={motion["payload"].opacity}',
  'transform={ready ? motion["payload"].transform : "translate(0 0)"} opacity={motion["payload"].opacity}',
  'transform={motion["payload"].transform} opacity={motion["payload"].opacity} {...overrides}',
  'transform={motion["payload"].transform} opacity={motion["payload"].opacity} style={{transform:"none"}}',
 ])assert.throws(()=>checkMotionBindings(source(attributes),['payload']),/binding/);
 const one='<g data-object="payload" transform={motion["payload"].transform} opacity={motion["payload"].opacity}/>';
 assert.throws(()=>checkMotionBindings(`const x=<svg>${one}${one}</svg>`,['payload']),/duplicate/);
});
test('world-space motion groups cannot be nested below another transformed group',()=>{
 assert.throws(()=>checkMotionBindings(`const x=<svg><g transform="translate(10 10)">${source().match(/<g.*<\/g>/)![0]}</g></svg>`,['payload']),/ancestor/);
});
