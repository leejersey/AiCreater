import test from 'node:test';
import assert from 'node:assert/strict';
import {retimeArtifact} from '../src/visual-retime';
import {retimeWorkbench} from '../src/visual-retime';
import {mkdtemp,writeFile,readFile,mkdir,rm} from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {sourceHash} from '../src/contract';
import {designHash} from '../src/design';
import {previewWorkbench,exportWorkbench} from '../src/workbench';
import {parseArtifact} from '../src/contract';
import {parseDesign} from '../src/design';
import {validateWorkbenchScene} from '../src/workbench';
const brief={schemaVersion:'custom-scene-brief:1',id:'demo',title:'Demo',narration:'先找资料。再回答。',visualGoal:'Move paper',facts:[],materials:[],width:1920,height:1080,fps:30,durationInFrames:120} as const;
const cues=[{id:'one',text:'先找资料。',startFrame:6,endFrame:60},{id:'two',text:'再回答。',startFrame:66,endFrame:114}];
const design=parseDesign({schemaVersion:'visual-design:1',brief,cues,thesis:'Move',metaphor:'Paper',objects:[{id:'paper',meaning:'paper',appearance:'sheet',x:100,y:100,width:100,height:100}],beats:cues.map(c=>({cueId:c.id,focus:'paper',action:'Move',changes:[{objectId:'paper',from:'here',to:'there'}]})),composition:'one paper',palette:'blueprint',avoid:['cards'],acceptance:['motion']});
const artifact=parseArtifact({schemaVersion:'custom-scene:1',brief,rationale:'Demo',source:'export default function Scene({frame}:{frame:number}){return <svg><circle cx={frame} cy={100} r={10}/></svg>}'});
const scene={duration_frames:240,narration:{text:brief.narration,audio_start_frame:6},captions:[{text:'先找资料。',start_frame:6,end_frame:130},{text:'再回答。',start_frame:150,end_frame:230}]};
test('retiming preserves artwork, binds measured captions and changes the hash without execution',()=>{
 const r=retimeArtifact(artifact,design,scene);
 assert.equal(r.artifact.brief.durationInFrames,240);assert(r.artifact.source.includes('cx={frame}'));
 assert.match(r.artifact.source,/__VisualAligned/);assert.notEqual(r.artifact.source,artifact.source);
 assert.deepEqual(validateWorkbenchScene(scene,r.artifact,r.design),scene);
 for(let i=1;i<r.anchors.length;i++){assert(r.anchors[i][0]>r.anchors[i-1][0]);assert(r.anchors[i][1]>=r.anchors[i-1][1]);}
});
test('caption spanning multiple draft beats merges design beats instead of inventing measured splits',()=>{
 const joined={...scene,captions:[{text:brief.narration,start_frame:6,end_frame:230}]};
 const r=retimeArtifact(artifact,design,joined);assert.equal(r.design.cues.length,1);
 assert.deepEqual(validateWorkbenchScene(joined,r.artifact,r.design),joined);
});
test('contiguous measured captions compress a draft pause without reversing frame order',()=>{
 const contiguous={...scene,captions:[scene.captions[0],{...scene.captions[1],start_frame:130}]};
 const r=retimeArtifact(artifact,design,contiguous);
 assert.deepEqual(validateWorkbenchScene(contiguous,r.artifact,r.design),contiguous);
});
test('retiming rejects changed narration, overlapping captions and unsupported default exports',()=>{
 assert.throws(()=>retimeArtifact(artifact,design,{...scene,narration:{...scene.narration,text:'改稿'}}));
 assert.throws(()=>retimeArtifact(artifact,design,{...scene,captions:[scene.captions[0],{...scene.captions[1],start_frame:100}]}));
 assert.throws(()=>retimeArtifact({...artifact,source:'export default ()=>null'},design,scene),/function/);
 assert.throws(()=>retimeArtifact({...artifact,source:'import {useCurrentFrame as clock} from "remotion";export default function Scene({frame}:{frame:number}){return <svg/>}'},design,scene),/clock hooks/);
});
test('draft preview freezes local silence and alignment produces a new nonexecuted candidate',async()=>{
 const root=await mkdtemp(path.join(os.tmpdir(),'visual-draft-'));
 try{
  const input=path.join(root,'generation');await mkdir(input);
  const put=(name:string,value:unknown)=>writeFile(path.join(input,name),JSON.stringify(value));
  await put('artifact.json',artifact);await put('artifact.json.design.json',design);await put('result.json',{sha256:sourceHash(artifact),design_sha256:designHash(design)});
  const draftScene={duration_frames:120,narration:{text:brief.narration,audio_start_frame:6},captions:cues.map(c=>({text:c.text,start_frame:c.startFrame,end_frame:c.endFrame}))};
  const chapter={generation_directory:input,sha256:sourceHash(artifact),scene:draftScene,audio_file:'',timing_mode:'draft' as const};
  let renders=0;
  await previewWorkbench(chapter,path.join(root,'preview'),{
   stills:async(_a,out,sha,d)=>{await mkdir(out);await writeFile(path.join(out,'frame-0.png'),'test');await writeFile(path.join(out,'report.json'),JSON.stringify({sha256:sha,designSha256:designHash(JSON.parse(await readFile(d,'utf8'))),geometry:{status:'passed'},frames:['frame-0.png']}));},
   render:async(manifest,out)=>{renders++;const wav=await readFile(path.join(out,manifest.chapters[0].audio));assert.equal(wav.toString('ascii',0,4),'RIFF');assert(wav.subarray(44).every(v=>v===0));}
  });assert.equal(renders,1);
  await assert.rejects(exportWorkbench({chapters:[chapter]},path.join(root,'export')),/drafts cannot be exported/);
  const r=await retimeWorkbench({generation_directory:input,sha256:sourceHash(artifact),design_sha256:designHash(design),scene},path.join(root,'aligned'));
  assert.equal(r.requests_dispatched,0);assert.notEqual(r.sha256,sourceHash(artifact));
  const receipt=JSON.parse(await readFile(path.join(root,'aligned/retime.json'),'utf8'));assert.equal(receipt.execution,'not_run');
 }finally{await rm(root,{recursive:true,force:true});}
});
