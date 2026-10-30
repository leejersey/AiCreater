import assert from 'node:assert/strict';
import {readFileSync, existsSync} from 'node:fs';
import test from 'node:test';
import React from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
import ts from 'typescript';
import {sceneTheme} from '../src/theme';

const base = new URL('../../../examples/custom-scenes/context-wallet/', import.meta.url);
const narration = '上下文不是能随便塞的大箱子，而是有限的钱包。塞进太多没用的信息，会让模型被噪声淹没。只保留当下真正需要的。';
const theme = sceneTheme;
const props = {fps:30, width:1920, height:1080, theme};
async function scene() {
  const file = new URL('WalletScene.tsx', base);
  assert.ok(existsSync(file), 'WalletScene must exist before the comparison can render');
  return (await import(file.href)).default;
}
function tag(html:string, id:string) {
  const match = html.match(new RegExp(`<g[^>]*data-paper="${id}"[^>]*>`));
  assert.ok(match, `missing physical paper ${id}`);
  return match[0];
}
function attribute(tag:string, name:string) {
  const match = tag.match(new RegExp(`${name}="([^"]+)"`));
  assert.ok(match, `missing ${name}`);
  return match[1];
}

test('wallet brief preserves the exact script and 18-second 1080p contract', () => {
  const file = new URL('brief.json', base);
  assert.ok(existsSync(file), 'wallet brief is not implemented');
  const brief = JSON.parse(readFileSync(file, 'utf8'));
  assert.deepEqual(Object.keys(brief).sort(), ['schemaVersion','id','title','narration','visualGoal','facts','materials','width','height','fps','durationInFrames'].sort());
  assert.equal(brief.schemaVersion, 'custom-scene-brief:1');
  assert.equal(brief.id, 'context-wallet');
  assert.equal(brief.title, '上下文预算');
  assert.equal(brief.narration, narration);
  assert.deepEqual([brief.width,brief.height,brief.fps,brief.durationInFrames], [1920,1080,30,540]);
  assert.ok(brief.visualGoal.length > 20);
  for (const key of ['facts','materials']) assert.ok(brief[key].length >= 3 && brief[key].every((v:unknown)=>typeof v === 'string' && v.length));
});

test('physical sheets enter the same wallet during the loading phase', async () => {
  const View = await scene();
  const render = (frame:number)=>renderToStaticMarkup(React.createElement(View,{...props,frame}));
  const early=render(30), loaded=render(165);
  assert.match(loaded, /data-stage="loading"/);
  assert.match(loaded, /data-wallet="body"/);
  assert.match(loaded, /data-wallet="clasp"/);
  assert.equal(attribute(tag(loaded,'code'),'data-location'), 'wallet');
  assert.notEqual(attribute(tag(early,'code'),'transform'), attribute(tag(loaded,'code'),'transform'));
  assert.match(loaded, /&lt;\/&gt;/);
});

test('extra information physically stops at the capacity line', async () => {
  const View = await scene();
  const a=renderToStaticMarkup(React.createElement(View,{...props,frame:205}));
  const b=renderToStaticMarkup(React.createElement(View,{...props,frame:290}));
  assert.match(b,/data-stage="blocked"/);
  assert.match(b,/data-capacity="blocked"/);
  assert.equal(attribute(tag(b,'extra'),'data-location'),'blocked');
  assert.notEqual(attribute(tag(a,'extra'),'transform'),attribute(tag(b,'extra'),'transform'));
  assert.equal(attribute(tag(b,'noise-a'),'data-location'),'wallet');
});

test('filter moves irrelevant sheets out while related code stays in the wallet', async () => {
  const View = await scene();
  const render=(frame:number)=>renderToStaticMarkup(React.createElement(View,{...props,frame}));
  const before=render(350), filtering=render(405), end=render(539);
  assert.match(filtering,/data-filter="active"/);
  assert.match(end,/data-stage="filtered"/);
  for(const id of ['noise-a','noise-b','extra']) {
    assert.equal(attribute(tag(end,id),'data-location'),'removed');
    assert.notEqual(attribute(tag(before,id),'transform'),attribute(tag(end,id),'transform'));
    const [x,y,degrees,cx,cy,scale=1]=attribute(tag(end,id),'transform').match(/-?\d+(?:\.\d+)?/g)!.map(Number);
    const angle=degrees*Math.PI/180;
    for(const [px,py] of [[0,0],[180,0],[0,225],[180,225]]) {
      const tx=x+cx+(px*scale-cx)*Math.cos(angle)-(py*scale-cy)*Math.sin(angle);
      const ty=y+cy+(px*scale-cx)*Math.sin(angle)+(py*scale-cy)*Math.cos(angle);
      assert.ok(tx>=1520 && tx<=1812 && ty<930,`${id} must fit the discard area without covering its label`);
    }
  }
  assert.equal(attribute(tag(end,'code'),'data-location'),'wallet');
  assert.equal(attribute(tag(end,'task'),'data-location'),'wallet');
  assert.match(end,/data-capacity="available"/);
  assert.match(end,/相关代码/);
});

test('arbitrary seeking and boundary frames are deterministic and finite', async () => {
  const View=await scene();
  const render=(frame:number)=>renderToStaticMarkup(React.createElement(View,{...props,frame}));
  const saved=render(405);
  for(const frame of [539,0,180,359,360,179,420,-1,540]) {
    const html=render(frame);
    assert.doesNotMatch(html,/NaN|Infinity/);
    assert.match(html,/viewBox="0 0 1920 1080"/);
  }
  assert.equal(render(405),saved);
  const custom=renderToStaticMarkup(React.createElement(View,{...props,frame:150,width:1280,height:720,theme:{...theme,background:'#123456'}}));
  assert.match(custom,/#123456/);
  assert.match(custom,/width="1280" height="720"/);
});

test('generated source imports only React and Remotion and has no external runtime effects', async () => {
  await scene();
  const source=readFileSync(new URL('WalletScene.tsx',base),'utf8');
  const ast=ts.createSourceFile('WalletScene.tsx',source,ts.ScriptTarget.Latest,true,ts.ScriptKind.TSX);
  const imports=ast.statements.filter(ts.isImportDeclaration).map(s=>(s.moduleSpecifier as ts.StringLiteral).text);
  assert.ok(imports.includes('remotion'));
  assert.ok(imports.every(s=>s==='react'||s==='remotion'));
  assert.doesNotMatch(source,/\b(Audio|Img|useCurrentFrame|setTimeout|setInterval|fetch|Date)\b|Math\.random|https?:\/\//);
  assert.match(source,/interpolate/);
  assert.match(source,/export default function WalletScene/);
});

test('clean visual has no chrome, shows the wallet at frame zero and uses an uncalibrated volume band', async () => {
  const View=await scene();
  for(const frame of [0,165,290,539]) {
    const html=renderToStaticMarkup(React.createElement(View,{...props,frame}));
    assert.doesNotMatch(html,/CONTEXT ENGINEERING|WALLET \/ CONTEXT WINDOW|data-stage-navigation/);
    assert.match(html,/上下文预算/);
    const assembly=html.match(/<g[^>]*data-wallet-assembly="visible"[^>]*>/)?.[0];
    assert.ok(assembly,'wallet assembly must be visible from frame zero');
    assert.doesNotMatch(assembly,/opacity="0"/);
    assert.match(html,/data-volume-band="uncalibrated"/);
    assert.doesNotMatch(html,/data-usage-tick/);
  }
});

test('template fixture shares narration and renders real SceneGraphics cards', async () => {
  const file=new URL('template.tsx',base);
  assert.ok(existsSync(file),'real template fixture is not implemented');
  const {TemplateWalletScene,walletTemplateScene,walletTheme}=await import(file.href);
  assert.equal(walletTemplateScene.narration.text,narration);
  assert.equal(walletTemplateScene.duration_frames,540);
  assert.deepEqual(walletTheme,theme);
  for(const element of walletTemplateScene.elements) {
    assert.equal([...narration].slice(element.cue.text_start,element.cue.text_end).join(''),element.content);
  }
  const html=renderToStaticMarkup(React.createElement(TemplateWalletScene,{frame:300}));
  assert.match(html,/data-silhouette="card_sequence"/);
  for(const id of ['budget','noise','retain']) assert.match(html,new RegExp(`data-element="${id}"`));
  assert.doesNotMatch(html,/<audio|<img/);
});

test('isolated Studio registers two matched compositions and waits for local fonts', () => {
  const file=new URL('../../../apps/renderer/src/custom-lab.tsx',import.meta.url);
  assert.ok(existsSync(file),'custom Studio entry is not implemented');
  const source=readFileSync(file,'utf8');
  assert.match(source,/id="TemplateWallet"/);
  assert.match(source,/id="CustomWallet"/);
  assert.match(source,/durationInFrames=\{brief.durationInFrames\}/);
  assert.match(source,/@fontsource\/noto-sans-sc\/400.css/);
  assert.match(source,/document.fonts.load/);
  assert.match(source,/document.fonts.ready/);
  assert.match(source,/delayRender/);
  assert.match(source,/continueRender/);
  assert.match(source,/cancelRender/);
});
