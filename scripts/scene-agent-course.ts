// npm run scene-agent:course -- <out dir> <reference course export dir> <run dir for chapter 1> <run dir for chapter 2> …
// Renders a full-course MP4 from passed scene-agent runs, reusing a reference export's frozen audio, measured
// captions and cue bindings for every chapter. Local only: no model or TTS calls.
import {copyFile,mkdir,readFile,writeFile} from 'node:fs/promises';
import path from 'node:path';
import {parseArtifact,sourceHash,type SceneArtifact} from '../packages/custom-scenes/src/contract';
import {designHash,parseDesign} from '../packages/custom-scenes/src/design';
import {ensureOutputAbsent,readJson} from '../packages/custom-scenes/src/files';
import {renderWorkbench} from '../packages/custom-scenes/src/workbench-render';
import {validateWorkbenchScene,workbenchSrt,type WorkbenchManifest} from '../packages/custom-scenes/src/workbench';
import {sourceSha256} from '../packages/scene-agent/src/render/stills';

async function main(){
 const [outArg,referenceArg,...runArgs]=process.argv.slice(2);
 if(!outArg||!referenceArg||!runArgs.length)throw Error('Usage: scene-agent:course <out dir> <reference export dir> <run dir>…');
 const out=path.resolve(outArg),reference=path.resolve(referenceArg);
 const manifest=await readJson(path.join(reference,'composition.json')) as WorkbenchManifest;
 if(manifest.chapters.length!==runArgs.length)throw Error(`reference has ${manifest.chapters.length} chapters, got ${runArgs.length} runs`);
 await ensureOutputAbsent(out);
 const chapters:WorkbenchManifest['chapters']=[];
 const provenance=[];
 for(const [i,runArg] of runArgs.entries()){
  const run=path.resolve(runArg),chapter=manifest.chapters[i];
  const result=JSON.parse(await readFile(path.join(run,'result.json'),'utf8'));
  if(result.status!=='passed')throw Error(`chapter ${i+1}: run did not pass (${result.status}: ${result.reason})`);
  const brief=JSON.parse(await readFile(path.join(run,'brief.json'),'utf8'));
  const source=await readFile(path.join(run,'scene/Scene.tsx'),'utf8');
  if(sourceSha256(source)!==result.finish?.gates?.sourceSha256)throw Error(`chapter ${i+1}: Scene.tsx is not the gated version`);
  const artifact:SceneArtifact=parseArtifact({schemaVersion:'custom-scene:1',brief,rationale:`scene-agent ${result.model}, ${result.turns} turns, finish by ${result.finish.by}; not human-reviewed`,source},brief);
  // The reference design is used only for its cue/caption binding, which must match this chapter's brief exactly.
  const design=parseDesign(await readJson(path.join(reference,chapter.artifact+'.design.json')),artifact.brief);
  const scene=validateWorkbenchScene(chapter.scene,artifact,design);
  const dir=`chapter-${i}`,audio=`${dir}/audio.${chapter.audio.split('.').pop()}`;
  await mkdir(path.join(out,dir),{recursive:true});
  await writeFile(path.join(out,dir,'artifact.json'),JSON.stringify(artifact,null,2));
  await copyFile(path.join(reference,chapter.artifact+'.design.json'),path.join(out,dir,'artifact.json.design.json'));
  await copyFile(path.join(reference,chapter.audio),path.join(out,audio));
  chapters.push({...chapter,artifact:`${dir}/artifact.json`,audio,sha256:sourceHash(artifact),design_sha256:designHash(design),scene});
  provenance.push({chapter:i+1,title:brief.title,run:path.relative(out,run),model:result.model,turns:result.turns,finishBy:result.finish.by,usage:result.usage});
 }
 const course:WorkbenchManifest={durationInFrames:manifest.durationInFrames,chapters};
 await writeFile(path.join(out,'composition.json'),JSON.stringify(course,null,2));
 await writeFile(path.join(out,'provenance.json'),JSON.stringify(provenance,null,2));
 // Captions are burned in; not named video.srt so players do not overlay them twice.
 await writeFile(path.join(out,'captions-for-upload.srt'),workbenchSrt(course));
 console.log(`rendering ${course.durationInFrames} frames, ${chapters.length} chapters…`);
 await renderWorkbench(out);
 console.log(JSON.stringify({video:path.join(out,'video.mp4'),chapters:chapters.length,modelRequests:0,voiceRequests:0}));
}
main().catch(error=>{console.error(error instanceof Error?error.message:String(error));process.exitCode=1;});
