import {workbenchCaptionLines,workbenchDisplayCaptions} from './workbench-captions';

// A chapter in a rendered course: its scene module, measured audio and captions, placed at frame `from`.
export type WorkbenchScene={duration_frames:number;narration:{text:string;audio_start_frame:number};captions:{text:string;start_frame:number;end_frame:number}[]};
export type FrozenChapter={artifact:string;sha256:string;design_sha256:string;audio:string;from:number;scene:WorkbenchScene};
export type WorkbenchManifest={durationInFrames:number;chapters:FrozenChapter[]};

export function workbenchSrt(manifest:WorkbenchManifest):string{
 const time=(frame:number)=>{const ms=Math.round(frame*1000/30);return `${String(Math.floor(ms/3600000)).padStart(2,'0')}:${String(Math.floor(ms/60000)%60).padStart(2,'0')}:${String(Math.floor(ms/1000)%60).padStart(2,'0')},${String(ms%1000).padStart(3,'0')}`;};
 let index=0;return manifest.chapters.flatMap(ch=>workbenchDisplayCaptions(ch.scene.captions).map(c=>`${++index}\n${time(ch.from+c.start_frame)} --> ${time(ch.from+c.end_frame)}\n${workbenchCaptionLines(c.text).join('\n')}`)).join('\n\n')+'\n\n';
}
