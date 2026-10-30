// npm run scene-agent:preview -- <scene-agent run dir> <voiced reference dir>
// Renders a voiced MP4 of an agent-made scene by reusing an existing chapter's frozen audio, measured captions and
// cue binding (the reference's composition.json). Local only: no model or TTS calls. Output: <run>/voiced-preview/.
import {copyFile,mkdir,readFile,writeFile} from 'node:fs/promises';
import path from 'node:path';
import {parseArtifact,sourceHash,type SceneArtifact} from '../packages/custom-scenes/src/contract';
import {designHash,parseDesign} from '../packages/custom-scenes/src/design';
import {ensureOutputAbsent,readJson} from '../packages/custom-scenes/src/files';
import {renderWorkbench} from '../packages/custom-scenes/src/workbench-render';
import {sourceSha256} from '../packages/scene-agent/src/render/stills';
import {validateWorkbenchScene,workbenchSrt,type WorkbenchManifest} from '../packages/custom-scenes/src/workbench';

async function main(){
 const [runArg,referenceArg]=process.argv.slice(2);
 if(!runArg||!referenceArg)throw Error('Usage: scene-agent:preview <scene-agent run dir> <voiced reference dir>');
 const run=path.resolve(runArg),reference=path.resolve(referenceArg);
 const result=JSON.parse(await readFile(path.join(run,'result.json'),'utf8'));
 if(result.status!=='passed')throw Error(`run did not pass (${result.status}: ${result.reason}); refusing to preview it as a result`);
 const manifest=await readJson(path.join(reference,'composition.json')) as WorkbenchManifest;
 if(manifest.chapters.length!==1)throw Error('reference must be a single-chapter composition');
 const chapter=manifest.chapters[0];

 const brief=JSON.parse(await readFile(path.join(run,'brief.json'),'utf8'));
 const source=await readFile(path.join(run,'scene/Scene.tsx'),'utf8');
 const artifact:SceneArtifact=parseArtifact({schemaVersion:'custom-scene:1',brief,rationale:`scene-agent ${result.model}, ${result.turns} turns, gates passed; not human-reviewed`,source},brief);
 if(sourceSha256(source)!==result.finish?.gates?.sourceSha256)throw Error('scene/Scene.tsx is not the version that passed the gates');
 // The reference design is used only for its cue/caption binding, which must match this brief exactly.
 const design=parseDesign(await readJson(path.join(reference,chapter.artifact+'.design.json')),artifact.brief);
 const scene=validateWorkbenchScene(chapter.scene,artifact,design);

 const out=path.join(run,'voiced-preview');
 await ensureOutputAbsent(out);
 await mkdir(path.join(out,'chapter-0'),{recursive:true});
 await writeFile(path.join(out,'chapter-0/artifact.json'),JSON.stringify(artifact,null,2));
 await copyFile(path.join(reference,chapter.artifact+'.design.json'),path.join(out,'chapter-0/artifact.json.design.json'));
 await copyFile(path.join(reference,chapter.audio),path.join(out,chapter.audio));
 const preview:WorkbenchManifest={durationInFrames:manifest.durationInFrames,chapters:[{...chapter,sha256:sourceHash(artifact),design_sha256:designHash(design),scene}]};
 await writeFile(path.join(out,'composition.json'),JSON.stringify(preview,null,2));
 // Captions are burned into the video. Not named video.srt: players auto-load a same-name sidecar and show them twice.
 await writeFile(path.join(out,'captions-for-upload.srt'),workbenchSrt(preview));
 console.log(`rendering ${preview.durationInFrames} frames with reference audio…`);
 await renderWorkbench(out);
 console.log(JSON.stringify({video:path.join(out,'video.mp4'),srt:path.join(out,'captions-for-upload.srt'),modelRequests:0,voiceRequests:0}));
}
main().catch(error=>{console.error(error instanceof Error?error.message:String(error));process.exitCode=1;});
