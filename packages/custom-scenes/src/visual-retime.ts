import ts from 'typescript';
import path from 'node:path';
import {mkdir,writeFile} from 'node:fs/promises';
import {parseArtifact,sourceHash,type SceneArtifact} from './contract';
import {parseDesign,designHash,type VisualDesign} from './design';
import {readJson,ensureOutputAbsent,saveGeneratedCandidate} from './files';
import {validateWorkbenchScene,type WorkbenchScene} from './workbench';
import {assertDesignLayout} from './design-layout';
const normalize=(s:string)=>s.replace(/\s/g,'');

export function retimeArtifact(original:SceneArtifact,prior:VisualDesign,scene:WorkbenchScene){
 if(scene.narration.text!==original.brief.narration||!Number.isSafeInteger(scene.duration_frames)||scene.duration_frames<30||scene.duration_frames>3600)throw Error('retime: narration or duration changed');
 const text=normalize(original.brief.narration),captions=scene.captions;
 if(!captions.length||captions.map(c=>normalize(c.text)).join('')!==text)throw Error('retime: caption text mismatch');
 let offset=0,previous=0;
 const measured=captions.map(c=>{
  if(!Number.isSafeInteger(c.start_frame)||!Number.isSafeInteger(c.end_frame)||c.start_frame<previous||c.end_frame<=c.start_frame||c.end_frame>scene.duration_frames||!normalize(c.text))throw Error('retime: invalid caption time');
  previous=c.end_frame;const begin=offset;offset+=normalize(c.text).length;return {...c,begin,end:offset};
 });
 offset=0;
 const draft=prior.cues.map(c=>{const begin=offset;offset+=normalize(c.text).length;return {...c,begin,end:offset};});
 if(offset!==text.length)throw Error('retime: draft cue mismatch');
 const at=(position:number,end:boolean)=>{
  const c=draft.find(c=>end?position>c.begin&&position<=c.end:position>=c.begin&&position<c.end)??(end?draft.at(-1)!:draft[0]);
  return c.startFrame+(c.endFrame-c.startFrame)*(position-c.begin)/(c.end-c.begin);
 };
 const anchors:[number,number][]=[[0,0]];
 const add=(x:number,y:number)=>{
  const last=anchors.at(-1)!;
  if(x===last[0]){if(y<last[1])throw Error('retime: reversed boundary');last[1]=y;return;}
  if(x<last[0]||y<last[1])throw Error('retime: nonmonotonic mapping');anchors.push([x,y]);
 };
 for(const c of measured){add(c.start_frame,at(c.begin,false));add(c.end_frame,at(c.end,true));}
 add(scene.duration_frames,original.brief.durationInFrames);
 // Only shared text boundaries become design cue boundaries; never split a measured caption.
 const ends=new Map(measured.map((c,i)=>[c.end,i]));
 const cues:VisualDesign['cues']=[],beats:VisualDesign['beats']=[];let first=0,captionFirst=0;
 for(let i=0;i<draft.length;i++){
  const capEnd=ends.get(draft[i].end);if(capEnd===undefined)continue;
  const oldBeats=prior.beats.slice(first,i+1),id=`cue-${cues.length+1}`;
  cues.push({id,text:prior.cues.slice(first,i+1).map(c=>c.text).join(''),startFrame:measured[captionFirst].start_frame,endFrame:measured[capEnd].end_frame});
  const changes=new Map<string,VisualDesign['beats'][number]['changes'][number]>();
  for(const beat of oldBeats)for(const change of beat.changes){const priorChange=changes.get(change.objectId);changes.set(change.objectId,priorChange?{...priorChange,to:change.to,...(change.toState!==undefined?{toState:change.toState}:{})}:{...change});}
  beats.push({cueId:id,focus:oldBeats[0].focus,action:oldBeats.map(b=>b.action).join(' ').slice(0,4000),changes:[...changes.values()]});
  first=i+1;captionFirst=capEnd+1;
 }
 if(first!==draft.length)throw Error('retime: unmatched final cue');
 const brief={...original.brief,durationInFrames:scene.duration_frames};
 const design=parseDesign({...prior,brief,cues,beats},brief);assertDesignLayout(design);
 const file=ts.createSourceFile('Scene.tsx',original.source,ts.ScriptTarget.Latest,true,ts.ScriptKind.TSX);
 for(const node of file.statements)if(ts.isImportDeclaration(node)&&ts.isStringLiteral(node.moduleSpecifier)&&node.moduleSpecifier.text==='remotion'){
  const bindings=node.importClause?.namedBindings;
  if(bindings&&(ts.isNamespaceImport(bindings)||bindings.elements.some(s=>['useCurrentFrame','useVideoConfig'].includes((s.propertyName??s.name).text))))throw Error('retime: direct Remotion clock hooks require manual revision to frame props');
 }
 const fn=file.statements.find(n=>ts.isFunctionDeclaration(n)&&n.modifiers?.some(m=>m.kind===ts.SyntaxKind.DefaultKeyword));
 if(!fn||!ts.isFunctionDeclaration(fn)||!fn.name||fn.parameters.length!==1||original.source.includes('__VisualAligned'))throw Error('retime: requires one named default function with frame props');
 const plain=ts.factory.updateFunctionDeclaration(fn,fn.modifiers?.filter(m=>![ts.SyntaxKind.ExportKeyword,ts.SyntaxKind.DefaultKeyword].includes(m.kind)),fn.asteriskToken,fn.name,fn.typeParameters,fn.parameters,fn.type,fn.body);
 const source=original.source.slice(0,fn.getStart(file))+ts.createPrinter().printNode(ts.EmitHint.Unspecified,plain,file)+original.source.slice(fn.end)+`
const __VisualAnchors:${'[number,number][]'}=${JSON.stringify(anchors)};
function __VisualFrame(f:number):number{const a=__VisualAnchors;for(let i=1;i<a.length;i++){if(f<=a[i][0]){const u=Math.max(0,Math.min(1,(f-a[i-1][0])/(a[i][0]-a[i-1][0])));return Math.min(${original.brief.durationInFrames-1},Math.round(a[i-1][1]+u*(a[i][1]-a[i-1][1])));}}return ${original.brief.durationInFrames-1};}
export default function __VisualAligned(props:Parameters<typeof ${fn.name.text}>[0]){return <${fn.name.text} {...props} frame={__VisualFrame(props.frame)}/>;}
`;
 const artifact=parseArtifact({...original,brief,source,rationale:'Measured-caption frame remapping of retained visual draft; no model request.'},brief);
 validateWorkbenchScene(scene,artifact,design);
 return {artifact,design,anchors};
}

export async function retimeWorkbench(input:{generation_directory:string;sha256:string;design_sha256:string;scene:WorkbenchScene},directory:string){
 await ensureOutputAbsent(directory);
 const original=parseArtifact(await readJson(path.join(input.generation_directory,'artifact.json')));
 if(sourceHash(original)!==input.sha256)throw Error('retime: parent hash mismatch');
 const prior=parseDesign(await readJson(path.join(input.generation_directory,'artifact.json.design.json')),original.brief);
 if(designHash(prior)!==input.design_sha256)throw Error('retime: parent design hash mismatch');
 const {artifact,design,anchors}=retimeArtifact(original,prior,input.scene);
 await mkdir(directory,{mode:0o700});
 await saveGeneratedCandidate(artifact,path.join(directory,'artifact.json'));
 const put=async(name:string,value:unknown)=>writeFile(path.join(directory,name),JSON.stringify(value,null,2),{flag:'wx',mode:0o600});
 await put('artifact.json.design.json',design);await put('design.json',design);await writeFile(path.join(directory,'source.txt'),artifact.source,{flag:'wx',mode:0o600});
 await put('retime.json',{parentSha256:input.sha256,anchors,execution:'not_run',requests_dispatched:0});
 await put('request-count.json',{requests_dispatched:0});
 const result={sha256:sourceHash(artifact),design_sha256:designHash(design),source:artifact.source,design,rationale:artifact.rationale,requests_dispatched:0};
 await put('result.json',result);return result;
}
