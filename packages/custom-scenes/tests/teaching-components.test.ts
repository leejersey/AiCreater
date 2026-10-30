import test from 'node:test';
import assert from 'node:assert/strict';
import React from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
import sharp from 'sharp';
import {teachingComponents} from '../src/teaching-plan';
import {teachingAsset,teachingConnector,TeachingComponent,teachingComponentVersion} from '../src/teaching-components';

test('every semantic component state has deterministic host geometry and nontrivial artwork',()=>{
 for(const [kind,capability] of Object.entries(teachingComponents))for(const state of capability.states){
  const asset=teachingAsset(kind as keyof typeof teachingComponents,state,'Example');
  assert.equal(asset.version,teachingComponentVersion);
  assert.deepEqual(asset,teachingAsset(kind as keyof typeof teachingComponents,state,'Example'));
  assert.ok(asset.back.length+asset.front.length>=5,kind);
  assert.ok(asset.obstacles.length>0,kind);
  for(const box of [asset.bounds,asset.text.box,...asset.obstacles,...(asset.receiving?[asset.receiving]:[])]){
   assert.ok(Object.values(box).every(Number.isFinite));
   assert.ok(box.width>0&&box.height>0);
   assert.ok(box.x>=0&&box.y>=0&&box.x+box.width<=asset.bounds.width&&box.y+box.height<=asset.bounds.height);
  }
  for(const port of Object.values(asset.ports))assert.ok(Number.isFinite(port.x)&&Number.isFinite(port.y)&&port.x>=0&&port.y>=0&&port.x<=asset.bounds.width&&port.y<=asset.bounds.height);
  assert.equal(Boolean(asset.receiving),capability.canContain);
  assert.equal(asset.text.lines.join(''),'Example');
 }
});

test('labels are wrapped without truncation; unsupported text or state fails explicitly',()=>{
 const label='\u76f8\u5173\u4ee3\u7801\u4e0e\u5f53\u524d\u4efb\u52a1';
 assert.equal(teachingAsset('document','waiting',label).text.lines.join(''),label);
 for(const [kind,capability] of Object.entries(teachingComponents)){
  assert.throws(()=>teachingAsset(kind as keyof typeof teachingComponents,'invented','Example'),/state/);
  assert.throws(()=>teachingAsset(kind as keyof typeof teachingComponents,capability.states[0],'\u957f'.repeat(200)),/label/);
 }
 assert.throws(()=>teachingAsset('unknown' as never,'idle','Example'),/component/);
 assert.throws(()=>teachingAsset('document','waiting',''),/label/);
 assert.throws(()=>teachingAsset('document','waiting','bad\nlabel'),/label/);
});

test('short Latin words stay intact when a readable font size fits',()=>{
 assert.deepEqual(teachingAsset('document','waiting','paper').text.lines,['paper']);
 assert.deepEqual(teachingAsset('classifier','idle','machine').text.lines,['machine']);
 assert.deepEqual(teachingAsset('document','waiting','WWWWWWW').text.lines,['WWWWWWW']);
});

test('baseline and line height reserve the measured Noto font box, not only ink pixels',()=>{
 for(const [kind,state,label] of [['document','waiting','\u76f8\u5173\u4ee3\u7801\u5f53\u524d\u4efb\u52a1'],['classifier','idle','\u5904\u7406\u5668']] as const){
  const {text:t}=teachingAsset(kind,state,label);
  for(let i=0;i<t.lines.length;i++){
   const baseline=t.baselineOffset+i*t.lineHeight;
   assert.ok(baseline-t.size*28/24>=0);assert.ok(baseline+t.size*7/24<=t.box.height);
   if(i)assert.ok(t.lineHeight>=t.size*35/24);
  }
 }
});

test('each supported state has a distinct visible marker without changing component geometry',()=>{
 for(const [kind,capability] of Object.entries(teachingComponents)){
  const assets=capability.states.map(state=>teachingAsset(kind as keyof typeof teachingComponents,state,'Example'));
  assert.equal(new Set(assets.map(a=>JSON.stringify([a.back,a.front]))).size,capability.states.length,kind);
  for(const asset of assets){
   assert.deepEqual(asset.bounds,assets[0].bounds);assert.deepEqual(asset.ports,assets[0].ports);
   assert.deepEqual(asset.gateway,assets[0].gateway);assert.deepEqual(asset.solids,assets[0].solids);assert.deepEqual(asset.receiving,assets[0].receiving);
  }
 }
});

test('wide Latin and Chinese labels stay inside the declared text box in actual raster output',async()=>{
 for(const label of ['WWWWWWW','MMMMMM','\u76f8\u5173\u4ee3\u7801\u4e0e\u5f53\u524d\u4efb\u52a1','A  B  C']){
  const asset=teachingAsset('document','waiting',label),t=asset.text;
  const svg=renderToStaticMarkup(React.createElement('svg',{xmlns:'http://www.w3.org/2000/svg',width:180,height:240},
   ...t.lines.map((line,i)=>React.createElement('text',{key:i,x:t.box.x,y:t.box.y+t.baselineOffset+i*t.lineHeight,fontFamily:'"Noto Sans SC", sans-serif',fontSize:t.size,fill:'#ffffff',xmlSpace:'preserve'},line))));
  const {data,info}=await sharp(Buffer.from(svg)).ensureAlpha().raw().toBuffer({resolveWithObject:true});
  let pixels=0;
  for(let y=0;y<info.height;y++)for(let x=0;x<info.width;x++)if(data[(y*info.width+x)*info.channels+3]>20){
   pixels++;assert.ok(x>=t.box.x&&x<t.box.x+t.box.width&&y>=t.box.y&&y<t.box.y+t.box.height,label+' glyph outside text box');
  }
  assert.ok(pixels>20);assert.equal(t.lines.join(''),label);
 }
});

test('text regions never intersect payload windows and collision envelopes cover shell margins',()=>{
 for(const [kind,capability] of Object.entries(teachingComponents)){
  const asset=teachingAsset(kind as keyof typeof teachingComponents,capability.states[0],'Example');
  if(!asset.receiving)continue;
  const a=asset.text.box,b=asset.receiving;
  assert.ok(a.x+a.width<=b.x||b.x+b.width<=a.x||a.y+a.height<=b.y||b.y+b.height<=a.y,kind+' label intersects payload');
  for(const [name,p] of Object.entries(asset.ports))if(name!=='stored')assert.ok(
   ((p.x===b.x||p.x===b.x+b.width)&&p.y>=b.y&&p.y<=b.y+b.height)||
   ((p.y===b.y||p.y===b.y+b.height)&&p.x>=b.x&&p.x<=b.x+b.width),kind+' port misses receiving window');
  for(let y=1;y<asset.bounds.height;y+=7)for(let x=1;x<asset.bounds.width;x+=7){
   if(x>=b.x&&x<=b.x+b.width&&y>=b.y&&y<=b.y+b.height)continue;
   assert.ok(asset.obstacles.some(o=>x>=o.x&&x<=o.x+o.width&&y>=o.y&&y<=o.y+o.height),kind+' unguarded shell');
  }
 }
});

test('rasterized wallet actually clips its payload and hides it behind the front pocket',async()=>{
 const svg=renderToStaticMarkup(React.createElement('svg',{xmlns:'http://www.w3.org/2000/svg',width:420,height:300},
  React.createElement(TeachingComponent,{id:'wallet',kind:'wallet',state:'receiving',label:'Budget'},
   React.createElement('rect',{x:0,y:0,width:420,height:300,fill:'#ff0000'}))));
 const {data,info}=await sharp(Buffer.from(svg)).ensureAlpha().raw().toBuffer({resolveWithObject:true});
 const red=(x:number,y:number)=>{const i=(y*info.width+x)*info.channels;return data[i]>240&&data[i+1]<10&&data[i+2]<10&&data[i+3]===255;};
 assert.equal(red(70,40),true,'payload visible inside receiving slot');
 assert.equal(red(70,220),false,'front pocket hides lower payload');
 assert.equal(red(20,40),false,'payload clipped outside slot');
});

test('receiving payloads render once between back and front with per-object clips and text above',()=>{
 for(const kind of ['wallet','classifier','loop-node','container'] as const){
  const html=renderToStaticMarkup(React.createElement('svg',null,
   React.createElement(TeachingComponent,{id:'first',kind,state:teachingComponents[kind].states[0],label:'First'},React.createElement('path',{'data-payload':'one',d:'M 0 0 L 1 1'})),
   React.createElement(TeachingComponent,{id:'second',kind,state:teachingComponents[kind].states[0],label:'Second'})));
  assert.equal((html.match(/data-payload="one"/g)??[]).length,1);
  assert.ok(html.indexOf('data-component-layer="back"')<html.indexOf('data-payload="one"'));
  assert.ok(html.indexOf('data-payload="one"')<html.indexOf('data-component-layer="front"'));
  assert.ok(html.indexOf('data-component-layer="front"')<html.indexOf('data-component-label="first"'));
  assert.match(html,/clip-path="url\(#teaching-first-slot\)"/);
  assert.match(html,/id="teaching-second-slot"/);
 }
 assert.throws(()=>renderToStaticMarkup(React.createElement(TeachingComponent,{id:'doc',kind:'document',state:'waiting',label:'Doc'},React.createElement('path'))),/receive/);
});

test('connectors preserve endpoints, bounded orthogonal paths and reject unsafe geometry',()=>{
 const points=[{x:10,y:20},{x:100,y:20},{x:100,y:160},{x:200,y:160}];
 const route=teachingConnector(points);
 assert.deepEqual(route.points,points);assert.equal(route.d,'M 10 20 L 100 20 L 100 160 L 200 160');
 points[0].x=30;assert.equal(route.points[0].x,10);
 for(const bad of [[{x:NaN,y:0},{x:1,y:0}],[{x:0,y:0},{x:1,y:1}],[{x:0,y:0},{x:0,y:0}],[],[{x:0,y:0},{x:10001,y:0}]])assert.throws(()=>teachingConnector(bad),/connector/);
});
