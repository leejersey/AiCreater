import assert from 'node:assert/strict';import test from 'node:test';
import {interactiveExamples} from './interactive-fixture';
import {annotatedFunnel} from './annotated-funnel-fixture';
import {processTextBoxes} from '../src/ProcessDemonstration';import {funnelDemoTextBoxes} from '../src/FunnelDemonstration';
test('paragraph separator whitespace never adds blank intro lines or changes source cues',()=>{
 for(const [s,boxes] of [[structuredClone(interactiveExamples()[1]),processTextBoxes],[annotatedFunnel(),funnelDemoTextBoxes]] as const){
  s.narration.text='\n\n\n\n'+s.narration.text;
  for(const e of s.elements)e.cue={text_start:e.cue.text_start+4,text_end:e.cue.text_end+4};
  for(const a of s.visual_actions??[])a.cue={text_start:a.cue.text_start+4,text_end:a.cue.text_end+4};
  const before=structuredClone(s),intro=boxes(s,0).find(b=>b.kind==='intro')!;
  assert.ok(intro.lines.every(line=>line.trim().length>0));assert.ok(intro.lines.length*intro.fontSize*1.35<=intro.height);
  assert.deepEqual(s,before);
 }
});
