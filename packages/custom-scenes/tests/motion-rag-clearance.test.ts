import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {buildRagMotionAssembly} from '../../../examples/custom-scenes/motion-rag/fixture';
import {buildRepairedRagAssembly,ragPortGeometry} from '../../../examples/custom-scenes/motion-rag-clearance/fixture';
import {parseDesign} from '../src/design';
import {evaluateMotion} from '../src/motion-plan';
import {assembleMotionScene} from '../src/motion-assembly';
import {checkMotionBindings} from '../src/motion-bindings';
async function fixture(){return parseDesign(JSON.parse(await readFile('examples/custom-scenes/motion-rag/design.json','utf8')));}
test('repair keeps all tested timing and motion poses, while removing the offending suspension line',async()=>{
 const design=await fixture(),before=buildRagMotionAssembly(design),after=buildRepairedRagAssembly(design);
 assert.deepEqual(after.brief,before.brief);assert.deepEqual(after.plan,before.plan);
 const hand=after.layers.find(l=>l.id==='hand')!;
 assert.equal(hand.artwork.length,1);assert.equal(hand.artwork[0].tag,'rect');
 assert.equal(hand.artwork[0].attrs.y,-25);
 const paper=after.layers.find(l=>l.id==='question-roll')!;
 const glyph=paper.artwork.find(n=>n.tag==='text')!;
 assert.equal(glyph.attrs.fontSize,36);assert.equal(glyph.attrs.y,48);
 const slot=after.layers.find(l=>l.id==='slot-back')!;
 assert.equal(slot.artwork.find(n=>n.tag==='text')!.attrs.y,-40);
 const artifact=await assembleMotionScene(after);checkMotionBindings(artifact.source,after.plan.tracks.map(t=>t.id));
});
test('tray and generator have real notched silhouettes sharing the tested port dimensions',async()=>{
 const input=buildRepairedRagAssembly(await fixture()),p=ragPortGeometry;
 const tray=input.layers.find(l=>l.id==='slot-back')!.artwork[0];
 assert.equal(tray.tag,'path');assert.equal(tray.attrs.d,`M ${p.tray.left-1150} ${p.tray.floor-470} H 0 V 0 H 280 V ${p.tray.floor-470} H ${p.tray.right-1150}`);
 const front=input.layers.find(l=>l.id==='slot-front')!.artwork;
 assert.equal(front.length,2);
 assert.equal(Number(front[0].attrs.x)+Number(front[0].attrs.width),p.tray.left-1150);
 assert.equal(front[1].attrs.x,p.tray.right-1150);
 const gen=input.layers.find(l=>l.id==='generator-front')!.artwork[0];
 assert.equal(gen.tag,'path');
 assert.equal(gen.attrs.d,'M 0 0 H 280 V 30 H 260 V 240 H 280 V 470 H 0 V 380 H 40 V 160 H 0 Z');
 for(let f=500;f<=778;f++){
  const m=evaluateMotion(input.plan,f)['question-roll'];
  const b={left:m.x-4,right:m.x+124,top:m.y-4,bottom:m.y+190};
  if(f<=618&&b.right>1150&&b.left<1430)assert.ok(b.top>=p.tray.floor+8,`premature floor contact ${f}`);
  if(f>=618&&f<=654&&b.top<p.tray.floor+8){assert.ok(b.left>=p.tray.left+8);assert.ok(b.right<=p.tray.right-8);}
  if(f>=706&&b.right>=1470){assert.ok(b.top>=p.generator.top+8);assert.ok(b.bottom<=p.generator.bottom-8);}
 }
 assert.ok(350-4>=p.outlet.top+8&&350+170+4<=p.outlet.bottom-8);
});
test('real geometry and unchanged motion are annotated, without invisible obstacle proxies',async()=>{
 const input=buildRepairedRagAssembly(await fixture());
 assert.equal(input.schemaVersion,'motion-assembly:2');assert.ok(input.audit!.obstacles.length>=6);
 assert.deepEqual(input.audit!.routes.map(r=>r.followers),[
  [{objectId:'question-roll',startFrame:500,endFrame:655}],
  [{objectId:'question-roll',startFrame:706,endFrame:779}],
 ]);
 assert.deepEqual(input.layers.find(l=>l.id==='transfer-route')!.artwork.map(n=>n.attrs.d),['M 330 470 V 774 H 1180 V 500','M 1180 475 H 1530']);
});
