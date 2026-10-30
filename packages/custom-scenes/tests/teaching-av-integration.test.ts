import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdir,mkdtemp,readFile,writeFile} from 'node:fs/promises';
import {randomUUID,createHash} from 'node:crypto';
import path from 'node:path';
import {promisify} from 'node:util';
import {execFile} from 'node:child_process';
import {repositoryRoot} from '../src/files';
import {freezeTeachingScene} from '../src/teaching-artifact';
import {freezeTeachingAudiovisual} from '../src/teaching-audiovisual';
import {renderTeachingAudiovisualIsolated} from '../src/teaching-isolated-render';
import {designInputHash} from '../src/design-content';
import {teachingExample,teachingBrief,teachingCues} from './fixtures/teaching-examples';

test('real isolated rendering burns Chinese captions and verifies the source audio offset',{
 skip:process.env.RUN_TEACHING_AV_TEST!=='1',timeout:360000,
},async()=>{
 const out=path.join(repositoryRoot,'output');await mkdir(out,{recursive:true});
 const root=await mkdtemp(path.join(out,'teaching-av-'));
 const audio=path.join(root,'source.wav');
 await promisify(execFile)('ffmpeg',['-nostdin','-v','error','-f','lavfi','-i','sine=frequency=437:sample_rate=24000:duration=3.6','-c:a','pcm_s16le','-n',audio]);
 const bytes=await readFile(audio),brief={...teachingBrief,title:'知识讲解',narration:'先观察。再执行。'};
 const cues=teachingCues.map((c,i)=>({...c,text:i?'再执行。':'先观察。'}));
 const plan=teachingExample('state-change');plan.inputSha256=designInputHash(brief,cues);
 const artifact=await freezeTeachingScene(plan,brief,cues);
 const contract=await freezeTeachingAudiovisual({artifact,artifactSha256:artifact.artifactSha256,timelineSha256:'a'.repeat(64),packageSha256:'b'.repeat(64),
  audioSha256:createHash('sha256').update(bytes).digest('hex'),audioBytes:bytes.length,audioDurationMs:3600,audioStartFrame:6,
  captions:cues.map(c=>({text:c.text,start_frame:c.startFrame,end_frame:c.endFrame}))});
 const job=path.join(root,randomUUID());
 const result=await renderTeachingAudiovisualIsolated(contract,contract.audiovisualSha256,audio,job);
 assert.equal(result.status,'audiovisual-ready');assert.equal(result.accepted,false);
 assert.equal(result.pixels.frames,120);assert.equal(result.waveform.audioStartFrame,6);
 assert.ok('correlation' in result.waveform&&result.waveform.correlation!>.92);
 assert.equal(result.media.streams.filter((s:any)=>s.codec_type==='audio').length,1);
 await writeFile(path.join(root,'integration.json'),JSON.stringify({result,modelCalls:0,ttsCalls:0,blindTest:false,accepted:false}));
 console.log(JSON.stringify({output:root,video:path.join(job,result.previewFile),accepted:false}));
});
