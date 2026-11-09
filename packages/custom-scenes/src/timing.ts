// Scene timing: where each narrated sentence (cue) starts and ends, in frames. Scenes animate from timing.cues[i]
// instead of literal frame numbers, so the same scene re-renders correctly under a new voice-over.
import type {Cue} from './cues';

export type SceneTiming={durationInFrames:number;cues:{start:number;end:number}[]};
export const SCENE_TIMING_TYPE='{durationInFrames:number;cues:{start:number;end:number}[]}';

export function sceneTiming(durationInFrames:number,cues:Cue[]):SceneTiming{
 return{durationInFrames,cues:cues.map(c=>({start:c.startFrame,end:c.endFrame}))};
}

const MIN_CUE=15;
/** The same sentences on another plausible voice-over: alternately longer (x1.3) and shorter (x0.75), gaps kept, the
 * first start and last end unchanged. A scene that follows timing.cues must still read well on it. */
export function perturbedCues(cues:Cue[],durationInFrames:number):Cue[]{
 if(cues.length<2)return cues.map(c=>({...c}));
 const first=cues[0].startFrame,last=cues[cues.length-1].endFrame;
 const gaps=cues.slice(1).map((c,i)=>c.startFrame-cues[i].endFrame);
 const room=last-first-gaps.reduce((a,b)=>a+b,0);
 const stretched=cues.map((c,i)=>(c.endFrame-c.startFrame)*(i%2?0.75:1.3));
 const scale=room/stretched.reduce((a,b)=>a+b,0);
 const lengths=stretched.map(l=>Math.max(MIN_CUE,Math.round(l*scale)));
 // Give rounding error to the longest cue so the total span is exact.
 const excess=lengths.reduce((a,b)=>a+b,0)-room;
 const longest=lengths.indexOf(Math.max(...lengths));lengths[longest]-=excess;
 if(lengths.some(l=>l<1))return cues.map(c=>({...c}));
 const out:Cue[]=[];let at=first;
 cues.forEach((c,i)=>{out.push({...c,startFrame:at,endFrame:at+lengths[i]});at+=lengths[i]+(gaps[i]??0);});
 out[out.length-1].endFrame=Math.min(last,durationInFrames);
 return out;
}
