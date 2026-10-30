import test from 'node:test';
import assert from 'node:assert/strict';
import {freezeTeachingScene} from '../src/teaching-artifact';
import {freezeTeachingAudiovisual,validateTeachingAudiovisual,assertTeachingAudiovisualMedia,teachingCaptionsSrt} from '../src/teaching-audiovisual';
import {teachingExample,teachingBrief,teachingCues} from './fixtures/teaching-examples';

test('audiovisual contract binds existing artwork, exact captions, audio and renderer runtime',async()=>{
 const artifact=await freezeTeachingScene(teachingExample('state-change'),teachingBrief,teachingCues);
 const input={artifact,artifactSha256:artifact.artifactSha256,timelineSha256:'a'.repeat(64),packageSha256:'b'.repeat(64),
  audioSha256:'c'.repeat(64),audioBytes:1000,audioDurationMs:3600,audioStartFrame:6,
  captions:[{text:'First.',start_frame:6,end_frame:54},{text:'Second.',start_frame:60,end_frame:114}]};
 const frozen=await freezeTeachingAudiovisual(input);
 assert.equal(frozen.accepted,false);assert.equal(frozen.execution,'not-run');
 assert.deepEqual(frozen.captions.map(c=>c.text),input.captions.map(c=>c.text));
 assert.equal(teachingCaptionsSrt(frozen),'1\n00:00:00,200 --> 00:00:01,800\nFirst.\n\n2\n00:00:02,000 --> 00:00:03,800\nSecond.\n');
 assert.deepEqual(await validateTeachingAudiovisual(JSON.parse(JSON.stringify(frozen)),frozen.audiovisualSha256),frozen);
 for(const mutation of [
  (v:any)=>v.audioSha256='0'.repeat(64),
  (v:any)=>v.captions[0].start_frame++,
  (v:any)=>v.runtime[0].sha256='0'.repeat(64),
  (v:any)=>v.accepted=true,
 ]){const changed=structuredClone(frozen);mutation(changed);await assert.rejects(validateTeachingAudiovisual(changed,frozen.audiovisualSha256));}
 for(const patch of [
  {audioDurationMs:5000},{audioStartFrame:-1},{audioBytes:0},
  {captions:[{text:'Different.',start_frame:6,end_frame:114}]},
  {captions:input.captions.map((c,i)=>i?{...c,start_frame:50}:c)},
 ])await assert.rejects(freezeTeachingAudiovisual({...input,...patch}));
});

test('audiovisual receipt requires one complete video and one aligned AAC audio stream',()=>{
 const media={format:{duration:'4.000000'},streams:[
  {codec_type:'video',codec_name:'h264',width:1920,height:1080,r_frame_rate:'30/1',nb_read_frames:'120',start_time:'0.000000'},
  {codec_type:'audio',codec_name:'aac',sample_rate:'48000',channels:1,start_time:'0.000000',duration:'4.000000'},
 ]};
 assert.doesNotThrow(()=>assertTeachingAudiovisualMedia(media,120));
 for(const change of [
  (v:any)=>v.streams.pop(),(v:any)=>v.streams.push(v.streams[1]),
  (v:any)=>v.streams[1].start_time='0.2',
  (v:any)=>v.streams[1].start_time=' ',
  (v:any)=>v.streams[1].duration='3',
  (v:any)=>v.streams[0].nb_read_frames='119',
 ]){const bad=structuredClone(media);change(bad);assert.throws(()=>assertTeachingAudiovisualMedia(bad,120));}
});
