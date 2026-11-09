import test from 'node:test';
import assert from 'node:assert/strict';
import {perturbedCues,sceneTiming} from '../src/timing';

const cues=[{id:'cue-1',text:'a',startFrame:6,endFrame:100},{id:'cue-2',text:'b',startFrame:104,endFrame:300},{id:'cue-3',text:'c',startFrame:300,endFrame:420}];

test('timing lists each cue as start and end frames',()=>{
 assert.deepEqual(sceneTiming(450,cues),{durationInFrames:450,cues:[{start:6,end:100},{start:104,end:300},{start:300,end:420}]});
});

test('a perturbed voice-over keeps the sentences, gaps and span but moves every boundary',()=>{
 const moved=perturbedCues(cues,450);
 assert.deepEqual(moved.map(c=>c.text),['a','b','c']);
 assert.equal(moved[0].startFrame,6);assert.equal(moved.at(-1)!.endFrame,420);
 assert.equal(moved[1].startFrame-moved[0].endFrame,4);  // gap kept
 assert.notEqual(moved[0].endFrame,100);assert.notEqual(moved[1].endFrame,300);
 for(let i=0;i<moved.length;i++){assert.ok(moved[i].endFrame>moved[i].startFrame);if(i)assert.ok(moved[i].startFrame>=moved[i-1].endFrame);}
 assert.deepEqual(perturbedCues([cues[0]],450),[cues[0]]);
});

test('cue frames are found where the scene wrote numbers instead of timing',async()=>{
 const {literalTiming,usesTiming}=await import('../src/contract');
 const old=`export default function Scene({frame}:any){const fade=(a:number,b:number)=>interpolate(frame,[a,b],[0,1]);
  const x=interpolate(frame,[470,490],[0,1]);const y=fade(600,640);const show=frame>=820;const z=interpolate(frame,[0,15],[0,1]);return null;}`;
 assert.deepEqual(literalTiming(old).map(l=>l.text),['470','490','fade(600,640)','frame>=820']);
 assert.equal(usesTiming(old),false);
 const good=`export default function Scene({frame,timing}:any){const s=timing.cues;const x=interpolate(frame,[s[2].start,s[2].start+15],[0,1]);
  const fade=(a:number,b:number)=>interpolate(frame,[a,b],[0,1]);const y=fade(s[3].start,s[3].start+20);return null;}`;
 assert.deepEqual(literalTiming(good),[]);
 assert.equal(usesTiming(good),true);
 assert.equal(usesTiming('export default function Scene({timing}:any){const {cues}=timing;return null;}'),true);
});
