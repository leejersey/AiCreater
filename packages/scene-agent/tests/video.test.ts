import test from 'node:test';
import assert from 'node:assert/strict';
import {agentChapter} from '../src/render/video';

const brief={schemaVersion:'custom-scene-brief:1' as const,id:'demo',title:'演示',narration:'第一句。第二句。',visualGoal:'g',facts:['f'],materials:['m'],width:1920 as const,height:1080 as const,fps:30 as const,durationInFrames:120};
const cues=[{id:'a',text:'第一句。',startFrame:6,endFrame:60},{id:'b',text:'第二句。',startFrame:62,endFrame:118}];
const scene={duration_frames:120,narration:{text:'第一句。第二句。',audio_start_frame:6},captions:[{text:'第一句。',start_frame:6,end_frame:60},{text:'第二句。',start_frame:62,end_frame:118}]};

test('measured audio and captions bind to the agent cues without a design document',()=>{
 const manifest=agentChapter({source:'x',brief,cues,scene,audioFile:'/tmp/a.wav'});
 assert.equal(manifest.durationInFrames,120);
 assert.equal(manifest.chapters[0].audio,'chapter-0/audio.wav');
 assert.deepEqual(manifest.chapters[0].scene.captions,scene.captions);
});

test('mismatched timing, narration or audio is refused before any model call',()=>{
 assert.throws(()=>agentChapter({source:'',brief,cues,scene:{...scene,duration_frames:121},audioFile:'/tmp/a.wav'}),/does not match the brief/);
 assert.throws(()=>agentChapter({source:'',brief,cues:[{...cues[0],startFrame:5},cues[1]],scene,audioFile:'/tmp/a.wav'}),/cue start mismatch/);
 assert.throws(()=>agentChapter({source:'',brief,cues,scene:{...scene,narration:{...scene.narration,audio_start_frame:30}},audioFile:'/tmp/a.wav'}),/audio starts after/);
 assert.throws(()=>agentChapter({source:'',brief,cues,scene,audioFile:'/tmp/a.exe'}),/unsupported audio/);
});
