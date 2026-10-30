import test from 'node:test';
import assert from 'node:assert/strict';
import {analyzePanels} from '../src/render/panels';

const box=(target:string,x:number,y:number,width:number,height:number)=>({target,x,y,width,height});

test('partly covering panels are reported; contained, separate, tiny and full-canvas shapes are not',()=>{
 const issues=analyzePanels([
  box('answer-card',300,300,480,220),
  box('rag-card',660,290,600,300),        // covers the answer card's right edge
  box('inner-label-bg',320,320,200,60),   // fully inside the answer card
  box('kb-panel',1500,640,300,250),       // far away
  box('badge',760,300,30,30),             // decoration
  box('background',0,0,1920,1080),        // canvas
 ]);
 assert.deepEqual(issues.map(i=>[i.target,i.detail]),[['answer-card','Shape partly covers rag-card (25% of the smaller one).']]);
});
