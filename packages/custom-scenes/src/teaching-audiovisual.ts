import {createHash} from 'node:crypto';
import {readFile} from 'node:fs/promises';
import {isDeepStrictEqual} from 'node:util';
import postcss from 'postcss';
import {validateTeachingArtifact,teachingRuntimeSnapshot,type TeachingArtifact} from './teaching-artifact';
import {assertTeachingMedia} from './teaching-render-policy';

const sha=(value:Buffer|string)=>createHash('sha256').update(value).digest('hex');
const fail=(message:string):never=>{throw Error('teaching_av: '+message);};
const hash=(v:unknown)=>typeof v==='string'&&/^[a-f0-9]{64}$/.test(v);
const integer=(v:unknown,min:number,max:number)=>typeof v==='number'&&Number.isInteger(v)&&v>=min&&v<=max;
const normalize=(s:string)=>s.replace(/\s/gu,'');
export const teachingCaptionBand=Object.freeze({x:0,y:980,width:1920,height:96,fontSize:32,lineHeight:40});
type Caption={text:string;start_frame:number;end_frame:number};
export type TeachingAudiovisualInput={artifact:TeachingArtifact;artifactSha256:string;timelineSha256:string;packageSha256:string;
 audioSha256:string;audioBytes:number;audioDurationMs:number;audioStartFrame:number;captions:Caption[]};

function lines(text:string){
 const result:string[]=[];let line='',width=0;
 for(const glyph of text.replace(/\s+/gu,' ').trim()){
  const advance=/^[\x20-\x7e]$/.test(glyph)?21:32;
  if(width+advance>1728){result.push(line);line='';width=0;}
  line+=glyph;width+=advance;
 }
 if(line)result.push(line);
 if(!result.length||result.length>2)fail('Caption exceeds the readable two-line region');
 return result;
}
function freeze<T>(v:T):T{if(v&&typeof v==='object'){Object.values(v).forEach(freeze);Object.freeze(v);}return v;}
export async function freezeTeachingAudiovisual(value:unknown){
 const input=value as TeachingAudiovisualInput;
 const keys=['artifact','artifactSha256','timelineSha256','packageSha256','audioSha256','audioBytes','audioDurationMs','audioStartFrame','captions'];
 if(!input||typeof input!=='object'||Object.keys(input).sort().join(',')!==keys.sort().join(','))fail('Invalid media input fields');
 const artifact=await validateTeachingArtifact(input.artifact,input.artifactSha256),duration=artifact.brief.durationInFrames;
 if(!hash(input.timelineSha256)||!hash(input.packageSha256)||!hash(input.audioSha256)||!integer(input.audioBytes,1,50*1024*1024)||!integer(input.audioDurationMs,1,120000)||!integer(input.audioStartFrame,0,duration-1))fail('Invalid audio binding');
 const end=input.audioStartFrame+Math.ceil(input.audioDurationMs*30/1000);
 if(end>duration||!Array.isArray(input.captions)||!input.captions.length||input.captions.length>120)fail('Audio or captions exceed the bounded chapter');
 let previous=input.audioStartFrame;
 const captions=input.captions.map(c=>{
  if(!c||Object.keys(c).sort().join(',')!=='end_frame,start_frame,text'||typeof c.text!=='string'||!c.text.trim()||c.text.length>200||!integer(c.start_frame,previous,end-1)||!integer(c.end_frame,c.start_frame+1,end))fail('Invalid measured caption interval');
  previous=c.end_frame;return {text:c.text,start_frame:c.start_frame,end_frame:c.end_frame};
 });
 if(normalize(captions.map(c=>c.text).join(''))!==normalize(artifact.brief.narration))fail('Captions do not preserve narration');
 const fonts=(await teachingRuntimeSnapshot()).fonts,ranges:{from:number;to:number}[]=[];
 postcss.parse(fonts.find(f=>f.name==='400.css')!.bytes.toString()).walkDecls('unicode-range',decl=>{
  for(const item of decl.value.split(',')){const m=/^U\+([0-9a-f]{1,6})(?:-([0-9a-f]{1,6}))?$/i.exec(item.trim());if(!m)fail('Invalid font coverage');ranges.push({from:parseInt(m![1],16),to:parseInt(m![2]??m![1],16)});}
 });
 for(const glyph of captions.map(c=>c.text).join('').replace(/\s/gu,'')){
  const point=glyph.codePointAt(0)!;
  if(!/^[\x20-\x7e\u3000-\u303f\u3400-\u9fff\uff01-\uff60]$/u.test(glyph)||!ranges.some(r=>point>=r.from&&point<=r.to))fail('Unbound caption glyph');
 }
 const runtime=[];
 for(const name of ['packages/custom-scenes/src/teaching-audiovisual.ts','packages/custom-scenes/src/teaching-av-render.ts','scripts/teaching-render-container.ts']){
  runtime.push({name,sha256:sha(await readFile(new URL('../../../'+name,import.meta.url)))});
 }
 const data={schemaVersion:'teaching-audiovisual:1' as const,artifact,artifactSha256:artifact.artifactSha256,
  timelineSha256:input.timelineSha256,packageSha256:input.packageSha256,audioSha256:input.audioSha256,
  audioBytes:input.audioBytes,audioDurationMs:input.audioDurationMs,audioStartFrame:input.audioStartFrame,captions,
  captionLayouts:captions.map(c=>lines(c.text)),captionBand:teachingCaptionBand,runtime,
  accepted:false as const,execution:'not-run' as const};
 return freeze({...data,audiovisualSha256:sha(JSON.stringify(data))});
}
export type TeachingAudiovisual=Awaited<ReturnType<typeof freezeTeachingAudiovisual>>;
export function teachingCaptionsSrt(a:TeachingAudiovisual){
 const stamp=(frame:number)=>{const ms=Math.round(frame*1000/30),pad=(n:number,width=2)=>String(n).padStart(width,'0');return `${pad(Math.floor(ms/3600000))}:${pad(Math.floor(ms/60000)%60)}:${pad(Math.floor(ms/1000)%60)},${pad(ms%1000,3)}`;};
 return a.captions.map((c,i)=>`${i+1}\n${stamp(c.start_frame)} --> ${stamp(c.end_frame)}\n${a.captionLayouts[i].join('\n')}\n`).join('\n');
}
export async function validateTeachingAudiovisual(value:unknown,expected:string){
 if(!hash(expected)||!value||typeof value!=='object'||Buffer.byteLength(JSON.stringify(value))>16*1024*1024)fail('Invalid audiovisual binding');
 const input=value as TeachingAudiovisual;
 const rebuilt=await freezeTeachingAudiovisual(Object.fromEntries(['artifact','artifactSha256','timelineSha256','packageSha256','audioSha256','audioBytes','audioDurationMs','audioStartFrame','captions'].map(k=>[k,input[k as keyof TeachingAudiovisual]])));
 if(rebuilt.audiovisualSha256!==expected||!isDeepStrictEqual(rebuilt,value))fail('Audiovisual data or runtime changed');
 return rebuilt;
}
export function assertTeachingAudiovisualMedia(value:unknown,frames:number){
 const media=value as {format:{duration:string};streams:Record<string,unknown>[]};
 if(!Array.isArray(media?.streams)||media.streams.length!==2)fail('Expected exactly two media streams');
 const video=media.streams.filter(s=>s.codec_type==='video'),audio=media.streams.filter(s=>s.codec_type==='audio');
 assertTeachingMedia({...media,streams:video},frames);
 const a=audio[0];
 if(audio.length!==1||a.codec_name!=='aac'||a.sample_rate!=='48000'||a.channels!==1||typeof a.start_time!=='string'||!a.start_time.trim()||Math.abs(Number(a.start_time))>1e-6||!Number.isFinite(Number(a.start_time))||typeof a.duration!=='string'||!a.duration.trim()||!Number.isFinite(Number(a.duration))||Math.abs(Number(a.duration)-frames/30)>1/30)fail('Audio stream is missing, shifted or incomplete');
}
