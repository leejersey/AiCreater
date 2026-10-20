import assert from 'node:assert/strict';
import {test} from 'node:test';
import {validProject} from './fixture';
import {parseProject} from '../src/validate';
import {activeStepAtFrame} from '../../video-components/src/CodeLesson';
import {stateBoxes} from '../../video-components/src/StateLesson';
const base=validProject();
const scene=parseProject({...base,scenes:[{...base.scenes[0],type:'state_diagram',structure:{kind:'stack',name:'栈'},elements:base.scenes[0].elements.map((e,i)=>({...e,items:Array.from({length:i+1},(_,n)=>({id:`i${n}`,key:String(n),value:String(n)})),active_item_ids:[`i${i}`]}))}]}).scenes[0];
test('snapshot boundary and backwards seek do not inherit later items',()=>{
 const [a,b]=scene.animations.map(a=>a.start_frame);
 assert.equal(activeStepAtFrame(scene,a-1),undefined);
 assert.equal(activeStepAtFrame(scene,a)?.items?.length,1);
 assert.equal(activeStepAtFrame(scene,b-1)?.items?.length,1);
 assert.equal(activeStepAtFrame(scene,b)?.items?.length,2);
 assert.equal(activeStepAtFrame(scene,a)?.items?.length,1);
});
test('stack top is final item, bottom stays anchored, empty has no cells',()=>{
 const items=Array.from({length:6},(_,n)=>({id:`i${n}`,key:String(n),value:'字'.repeat(16)}));
 const boxes=stateBoxes('stack',items);
 assert.ok(boxes[5].y<boxes[0].y);
 assert.equal(boxes[5].top,true);assert.equal(boxes[0].top,false);
 // Bundled Noto at 26px measures '[0] · 栈顶 TOP · 当前' as 267.7px in the renderer.
 assert.ok(boxes[0].keyWidth>=267.7);
 assert.equal(stateBoxes('stack',items.slice(0,2))[0].y,boxes[0].y);
 assert.deepEqual(stateBoxes('stack',[]),[]);
});
test('all six cells fit safety area, keys/values have readable fixed fonts',()=>{
 const items=Array.from({length:6},(_,n)=>({id:`i${n}`,key:'键'.repeat(12),value:'值'.repeat(16)}));
 for(const kind of ['array','object','stack'] as const) for(const box of stateBoxes(kind,items)) {
  assert.ok(box.x>=80&&box.x+box.width<=1180&&box.y+box.height<920);
  assert.ok((kind==='stack'?Math.max(32*1.3,26*1.3):box.valueLines.length*32*1.3+26*1.3+8)+52<=box.height);
  assert.ok(box.valueLines.every(line=>[...line].length*32<=box.width-52));
 }
});
