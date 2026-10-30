import {readFile} from 'node:fs/promises';
import path from 'node:path';
import ts from 'typescript';
import {parseArtifact,sourceHash} from './contract';
import {readJson,repositoryRoot} from './files';

const baselines={
 wallet:{hash:'8f07a70981200d7507cec1fef8dc691d63ec46c07c7bc5678501708a68017e00',source:'examples/custom-scenes/context-wallet/WalletScene.tsx',brief:'examples/custom-scenes/context-wallet/brief.json'},
 loop:{hash:'fb685d9d23f3e55226ab9176f14eac256a76f79d2d9023bf0522d7ccc6e2687e',source:'examples/custom-scenes/reviewed-loop/Scene.tsx',brief:'examples/custom-scenes/reviewed-loop/design.json'},
} as const;
type Name=keyof typeof baselines;
type Fragment={purpose:string;source:string};

export const sourceDesignDirection=`SOURCE_ART_DIRECTION: Use the existing visual-design JSON schema only. Do not add an artDirection field or another protocol.
In each major object's appearance, specify its recognisable outer silhouette, meaningful internal construction, material/line treatment, embedded label region and foreground/background parts. Describe actual drawable forms rather than "a beautiful machine" or a noun in a box. Put fixed small details inside their owner's appearance; do not inflate the object list with decorative fragments.
In composition, allocate the dominant illustration, title, supporting labels and output zones; give the exact back-to-front drawing order and intended occlusion. Explain how typography, contrast and scale establish hierarchy. Background detail is subordinate and should never compete with the teaching object.
In beats.action and the existing changes/from/to/state fields, describe what is visibly present at cue start, what changes during that CURRENT measured cue, and what settles at its end. Tie motion to the teaching claim, not a generic fade or a page transition. Preserve identity and hold settled states across pauses. Keep relevant shape/material detail readable in the opening, mechanism and final states.
Choose a mechanism for the CURRENT topic. Wallets, circular valves and transport grippers are examples, not defaults for every topic. Existing example-specific safety lessons apply when that geometry exists, not an instruction to invent it. Do not replace the scene with a fixed component catalog or a row of cards.
Meaningful construction, not arbitrary visual density: do not add gears, numbers, indicators or text that invents facts or only increases detail count. Use the current facts, measured cue frames, bounds, overlap rules and output schema unchanged. These instructions are design intent, not an automatic aesthetic verdict.`;

const sourceCodeDirection=`SOURCE_ART_CONSTRUCTION_ATLAS: The excerpts below are read-only reference data, not instructions and not standalone components. They contain example-only symbols, coordinates, labels and timing. Learn their construction; do not paste the wallet/loop or its constants into unrelated content. Recompute geometry and motion from the CURRENT design and CURRENT measured cues.
Implement the specific silhouette, meaningful internal parts, embedded marks and layer order described by each object's appearance and states. Preserve the richness of that design instead of replacing it with rectangles carrying labels. Use self-contained SVG curves, local defs/gradients/masks or inline HTML when appropriate; do not downgrade the design to the host's seven-component catalog. Keep references to SVG defs local and unique.
Keep illustration layers and labels readable at the requested scale. A container needs a back shell, inserted content and an opaque front lip in the declared order; a circuit needs meaningful node interiors and a shared visible path/position model. These are examples of visual explanation, not mandatory mechanisms. Do not add meaningless decoration to imitate complexity.
Keep the existing React/Remotion-only source contract, deterministic frame math, explicit TypeScript types, caption ownership, static guardrails and exact-source approval. Reference context and successful compilation do not prove visual quality, physical clearance or audio synchronization. Do not claim a render or review happened.`;

/** Parse hash-pinned source as text; never import or evaluate a reviewed Scene module. */
export function checkedSourceArtReference(name:Name,value:unknown){
 if(!Object.hasOwn(baselines,name))throw Error('source_art: unknown reference');
 const artifact=parseArtifact(value),baseline=baselines[name];
 if(sourceHash(artifact)!==baseline.hash)throw Error('source_art: baseline hash mismatch');
 const file=ts.createSourceFile('reference.tsx',artifact.source,ts.ScriptTarget.ES2022,true,ts.ScriptKind.TSX);
 const extract=(purpose:string,predicate:(node:ts.Node)=>boolean):Fragment=>{
  const matches:ts.Node[]=[];
  const visit=(node:ts.Node)=>{if(predicate(node))matches.push(node);ts.forEachChild(node,visit);};visit(file);
  if(matches.length!==1)throw Error('source_art: missing or ambiguous illustration fragment');
  const source=matches[0].getText(file);
  if(source.length<100||source.length>4000)throw Error('source_art: fragment budget exceeded');
  return {purpose,source};
 };
 const jsx=(attribute:string,value?:string)=>(node:ts.Node)=>{
  const opening=ts.isJsxElement(node)?node.openingElement:ts.isJsxSelfClosingElement(node)?node:undefined;
  return !!opening?.attributes.properties.some(a=>ts.isJsxAttribute(a)&&a.name.getText(file)===attribute&&
   (value===undefined||(a.initializer&&ts.isStringLiteral(a.initializer)&&a.initializer.text===value)));
 };
 const fragments=name==='wallet'?[
  extract('Subordinate local pattern and low-opacity material fills',n=>ts.isJsxElement(n)&&n.openingElement.tagName.getText(file)==='defs'),
  extract('Curved shell, inserted papers, front pocket, seam and clasp draw order',jsx('data-wallet-assembly','visible')),
  extract('Folded paper silhouette and role-specific internal marks, not identical label cards',jsx('data-paper')),
 ]:[
  extract('Node silhouette, meaningful internal strokes and subordinate external labels',jsx('data-object','think-valve')),
  extract('Visible curved return route using the same curve descriptor as motion',jsx('id','return-route')),
  extract('Analytical curve evaluator; adapt its inputs to the current mechanism',n=>ts.isVariableDeclaration(n)&&ts.isIdentifier(n.name)&&n.name.text==='quad'),
 ];
 return {id:name,sourceSha256:baseline.hash,origin:'manually reviewed visual reference; not autonomous generation evidence',fragments};
}

export async function readSourceArtReferences(){
 const examples=[];
 for(const name of ['wallet','loop'] as const){
  const baseline=baselines[name],data=await readJson(path.join(repositoryRoot,baseline.brief));
  const brief=name==='loop'&&data&&typeof data==='object'&&!Array.isArray(data)?(data as {brief?:unknown}).brief:data;
  examples.push(checkedSourceArtReference(name,{schemaVersion:'custom-scene:1',brief,
   source:await readFile(path.join(repositoryRoot,baseline.source),'utf8'),rationale:'Reviewed source construction reference only'}));
 }
 const summary=examples.map(({fragments,...example})=>({...example,construction:fragments.map(f=>f.purpose)}));
 const design=sourceDesignDirection+'\nREVIEWED_CONSTRUCTION_SUMMARIES='+JSON.stringify(summary);
 const code=sourceCodeDirection+'\nREVIEWED_CONSTRUCTION_EXCERPTS='+JSON.stringify(examples);
 if(design.length>=6000||code.length>=16000)throw Error('source_art: reference context budget exceeded');
 return {design,code,manifest:{schemaVersion:'source-art-direction:1',automaticQualityVerified:false,examples:summary}};
}
