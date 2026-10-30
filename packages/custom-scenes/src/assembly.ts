import {parseArtifact,sourceHash,assertApproval,type SceneArtifact} from './contract';
import {parseDesign,cuesFromManifest,designHash,reviewScene,type Cue,type VisualDesign,type VisualReview} from './design';

export type AssemblyChapterInput={chapter:string;artifact:SceneArtifact;design:VisualDesign;approval:string;review?:VisualReview};
export type AssemblyTimeline={
  fps:30;width:1920;height:1080;durationInFrames:number;
  chapters:{
    chapter:string;from:number;durationInFrames:number;sha256:string;designSha256:string;visual:'pass'|'pending';cues:Cue[];
    audio:{file:string;from:number;durationInFrames:number;durationSeconds:number}[];
  }[];
};

const MAX_CHAPTERS=20,MAX_SEGMENTS=1000,TIME_EPSILON=0.0001;
const chapterId=(value:unknown):value is string=>typeof value==='string'&&value.length<=64&&/^[a-z][a-z0-9-]*$/.test(value);
type Segment={chapter:string;text:string;audio:string;start:number;duration:number;pauseAfter:number};

function parseManifest(manifest:unknown):Segment[] {
  if(!manifest||typeof manifest!=='object'||Array.isArray(manifest))throw Error('assembly: invalid audio manifest');
  const values=(manifest as {segments?:unknown}).segments;
  if(!Array.isArray(values)||!values.length||values.length>MAX_SEGMENTS)throw Error('assembly: invalid or oversized manifest segments');
  const seen=new Set<string>();let previous:Segment|undefined;
  return values.map(value=>{
    if(!value||typeof value!=='object'||Array.isArray(value))throw Error('assembly: invalid manifest segment');
    const r=value as Record<string,unknown>;
    if(!chapterId(r.chapter)||typeof r.text!=='string'||!r.text.trim()||r.text.length>4000)throw Error('assembly: invalid chapter or narration');
    if(typeof r.audio!=='string'||r.audio.length>240||! /^(?:[a-z0-9_-][a-z0-9._-]*\/)*[a-z0-9_-][a-z0-9._-]*\.(?:mp3|wav)$/i.test(r.audio)) {
      throw Error('assembly: unsafe audio path; require a relative MP3/WAV path');
    }
    if(typeof r.start!=='number'||!Number.isFinite(r.start)||r.start<0
      ||typeof r.duration!=='number'||!Number.isFinite(r.duration)||r.duration<=0
      ||typeof r.pauseAfter!=='number'||!Number.isFinite(r.pauseAfter)||r.pauseAfter<0
      ||!Number.isSafeInteger(Math.round((r.start+r.duration+r.pauseAfter)*30)))throw Error('assembly: invalid audio timestamps');
    const segment:Segment={chapter:r.chapter,text:r.text,audio:r.audio,start:r.start,duration:r.duration,pauseAfter:r.pauseAfter};
    if(previous) {
      const expected=previous.start+previous.duration+previous.pauseAfter;
      if(Math.abs(segment.start-expected)>TIME_EPSILON)throw Error('assembly: pauseAfter contradicts the next global segment start');
      if(segment.chapter!==previous.chapter&&seen.has(segment.chapter))throw Error('assembly: chapter segments must be contiguous, not interleaved');
    }
    seen.add(segment.chapter);previous=segment;
    return segment;
  });
}

/** No I/O or retiming: selected chapters retain measured local timing and tail pauses. */
export function assembleTimeline(manifest:unknown,inputs:AssemblyChapterInput[]):AssemblyTimeline {
  if(!Array.isArray(inputs)||!inputs.length||inputs.length>MAX_CHAPTERS)throw Error('assembly: require 1..20 chapter inputs');
  const selected=new Set<string>();
  for(const input of inputs) {
    if(!input||typeof input!=='object'||Array.isArray(input)||!chapterId(input.chapter)
      ||!['artifact','design','approval'].every(key=>Object.hasOwn(input,key))
      ||Object.keys(input).some(key=>!['chapter','artifact','design','approval','review'].includes(key)))throw Error('assembly: invalid chapter input');
    if(selected.has(input.chapter))throw Error('assembly: duplicate chapter');
    selected.add(input.chapter);
  }
  const segments=parseManifest(manifest);
  const timeline:AssemblyTimeline={fps:30,width:1920,height:1080,durationInFrames:0,chapters:[]};
  for(const input of inputs) {
    const artifact=parseArtifact(input.artifact);
    assertApproval(artifact,input.approval);
    const rows=segments.filter(segment=>segment.chapter===input.chapter);
    if(!rows.length)throw Error(`assembly: missing chapter ${input.chapter}`);
    const track=cuesFromManifest({segments},input.chapter);
    if(track.narration!==artifact.brief.narration)throw Error('assembly: narration must exactly match the measured chapter');
    if(track.durationInFrames!==artifact.brief.durationInFrames)throw Error('assembly: chapter duration must match the measured tail pause');
    const design=parseDesign(input.design,artifact.brief,track.cues);
    const review=input.review===undefined?undefined:reviewScene(input.review,artifact,design);
    let audioEnd=0;
    const audio=rows.map((row,index)=>{
      const from=track.cues[index].startFrame,durationInFrames=Math.ceil(row.duration*30-1e-7);
      if(from<audioEnd)throw Error('assembly: audio overlap after frame quantization');
      audioEnd=from+durationInFrames;
      if(audioEnd>track.durationInFrames)throw Error('assembly: audio exceeds chapter end after frame quantization');
      return {file:row.audio,from,durationInFrames,durationSeconds:row.duration};
    });
    timeline.chapters.push({chapter:input.chapter,from:timeline.durationInFrames,durationInFrames:track.durationInFrames,
      sha256:sourceHash(artifact),designSha256:designHash(design),visual:review?.verdict==='pass'?'pass':'pending',cues:track.cues,audio});
    timeline.durationInFrames+=track.durationInFrames;
  }
  return timeline;
}

function srtTime(frame:number):string {
  if(!Number.isSafeInteger(frame)||frame<0)throw Error('assembly: invalid SRT frame');
  const total=Math.round(frame*1000/30),ms=total%1000,seconds=Math.floor(total/1000)%60;
  const minutes=Math.floor(total/60000)%60,hours=Math.floor(total/3600000);
  return `${String(hours).padStart(2,'0')}:${String(minutes).padStart(2,'0')}:${String(seconds).padStart(2,'0')},${String(ms).padStart(3,'0')}`;
}

/** Preserve sentence text and half-open cue endpoints; caption splitting belongs to the host. */
export function assemblySrt(timeline:AssemblyTimeline):string {
  let index=0;
  const blocks=timeline.chapters.flatMap(chapter=>chapter.cues.map(cue=>{
    index++;
    return `${index}\n${srtTime(chapter.from+cue.startFrame)} --> ${srtTime(chapter.from+cue.endFrame)}\n${cue.text}`;
  }));
  return blocks.length?blocks.join('\n\n')+'\n\n':'';
}
