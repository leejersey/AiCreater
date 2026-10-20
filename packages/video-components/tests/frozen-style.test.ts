import {test} from 'node:test';
import assert from 'node:assert/strict';
import demo from '../../../examples/demo.json';
import * as theme from '../src/theme';
import {dedicatedPanel} from '../src/dedicated-style';
import type {VideoProject} from '../../video-schema/src/types';
const resolve=theme.validateVisualStyle as (p:VideoProject|undefined,id?:unknown,snapshot?:unknown)=>theme.StyleTokens;
const frozen=(id:theme.VisualStyleId)=>({id,tokens:structuredClone(theme.visualStyles[id])});

test('frozen nonlegacy tokens are used, not the current named preset',()=>{
  const snapshot=frozen('whiteboard');snapshot.tokens.card.radius=7;
  assert.equal(resolve(demo as VideoProject,undefined,snapshot).card.radius,7);
  assert.equal(theme.visualStyles.whiteboard.card.radius,2);
});
test('frozen JSONB key ordering preserves legacy identity and old panel behavior',()=>{
  const s=frozen('legacy');
  s.tokens=Object.fromEntries(Object.entries(theme.visualStyles.legacy).reverse().map(([k,v])=>[k,typeof v==='object'?Object.fromEntries(Object.entries(v).reverse()):v])) as theme.StyleTokens;
  assert.equal(resolve(undefined,undefined,s),theme.visualStyles.legacy);
  assert.deepEqual(dedicatedPanel(resolve(undefined,undefined,s),theme.palettes.tech_explainer),dedicatedPanel(theme.visualStyles.legacy,theme.palettes.tech_explainer));
});
test('invalid frozen shapes, unsafe strings, numeric bounds and ID mismatches fail closed',()=>{
  const mutations:Array<(s:ReturnType<typeof frozen>)=>unknown>=[
    s=>s.tokens.card.radius=-1,s=>s.tokens.layout.columnGap=10000,
    s=>s.tokens.entrance.kind='eval',s=>s.tokens.card.shadow='url(https://example.invalid)',
    s=>s.tokens.label='<img>',s=>Reflect.deleteProperty(s.tokens,'arrow'),s=>Object.assign(s.tokens,{extra:true}),
    s=>Object.assign(s.tokens.card,{outline:'yes'}),s=>Object.assign(s,{id:'unknown'}),
  ];
  for(const mutate of mutations){const s=frozen('minimal');mutate(s);assert.throws(()=>resolve(undefined,undefined,s),/style/i);}
  for(const bad of [null,{},false,{id:'minimal'},{tokens:theme.visualStyles.minimal},{id:'minimal',tokens:theme.visualStyles.minimal,extra:true}])assert.throws(()=>resolve(undefined,undefined,bad),/style/i);
  assert.throws(()=>resolve(undefined,'whiteboard',frozen('minimal')),/style/i);
});
test('frozen legacy cannot silently use incompatible preset geometry',()=>{
  const s=frozen('legacy');s.tokens.card.radius=3;assert.throws(()=>resolve(undefined,undefined,s),/style/i);
});
test('snapshots remain immutable and unknown scene support still fails',()=>{
  const s=frozen('minimal'),before=structuredClone(s);resolve(undefined,undefined,s);assert.deepEqual(s,before);
  const p=structuredClone(demo) as VideoProject;(p.scenes[0] as {type:string}).type='unknown';
  assert.throws(()=>resolve(p,undefined,s),/style/i);
});
