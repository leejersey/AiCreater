import {readFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import ts from 'typescript';
import {parseBrief,parseArtifact,type SceneBrief,type SceneArtifact} from './contract';
import {parseMotionPlan,type MotionPlan} from './motion-plan';
import {checkMotionBindings} from './motion-bindings';
import {parseMotionAudit,motionAuditAttributes,type MotionAudit} from './motion-audit';

export type SvgNode={tag:string;attrs:Record<string,string|number>;text?:string;children?:SvgNode[]};
export type MotionAssembly={schemaVersion:'motion-assembly:1'|'motion-assembly:2';brief:SceneBrief;plan:MotionPlan;layers:{id:string;artwork:SvgNode[]}[];audit?:MotionAudit};
const geometry:Record<string,string[]>={
 g:[],path:['d'],rect:['x','y','width','height','rx','ry'],circle:['cx','cy','r'],ellipse:['cx','cy','rx','ry'],
 line:['x1','y1','x2','y2'],polyline:['points'],polygon:['points'],text:['x','y','fontSize','fontWeight','textAnchor'],
};
const required:Record<string,string[]>={g:[],path:['d'],rect:['width','height'],circle:['r'],ellipse:['rx','ry'],line:['x1','y1','x2','y2'],polyline:['points'],polygon:['points'],text:['x','y','fontSize','fill']};
const paints=['background','foreground','muted','accent','secondary','none'];
export {geometry as motionSvgGeometry,required as motionSvgRequired};
function fields(value:unknown,required:string[],optional:string[]=[]):Record<string,unknown>{
 if(!value||typeof value!=='object'||Array.isArray(value))throw Error('motion_assembly: expected object');
 const r=value as Record<string,unknown>;
 if(required.some(k=>!Object.hasOwn(r,k))||Object.keys(r).some(k=>!required.includes(k)&&!optional.includes(k)))throw Error('motion_assembly: unexpected fields');
 return r;
}
function nodes(value:unknown,depth:number,budget:{count:number}):SvgNode[]{
 if(!Array.isArray(value)||!value.length||value.length>200||depth>12)throw Error('motion_assembly: invalid artwork list');
 return value.map(value=>{
  if(++budget.count>1200)throw Error('motion_assembly: artwork exceeds node budget');
  const r=fields(value,['tag','attrs'],['text','children']);
  if(typeof r.tag!=='string'||!Object.hasOwn(geometry,r.tag))throw Error('motion_assembly: unsupported SVG tag');
  const tag=r.tag,attrsIn=fields(r.attrs,required[tag],[...geometry[tag], 'fill','stroke','strokeWidth','fillOpacity','strokeOpacity','strokeLinecap','strokeLinejoin']);
  const attrs:SvgNode['attrs']={};
  for(const [name,value] of Object.entries(attrsIn)){
   if(name==='fill'||name==='stroke'){
    if(typeof value!=='string'||!paints.includes(value))throw Error('motion_assembly: invalid paint token');
    attrs[name]=value;
   }else if(name==='d'||name==='points'){
    const pattern=name==='d'?/^[MmLlHhVvCcSsQqTtAaZz0-9eE+.,\s-]+$/:/^[0-9eE+.,\s-]+$/;
    if(typeof value!=='string'||!value.trim()||value.length>12000||!pattern.test(value)||(name==='d'&&!/^\s*[Mm]/.test(value)))throw Error('motion_assembly: invalid path or points');
    const numbers=value.match(/[+-]?(?:\d+\.?\d*|\.\d+)(?:[eE][+-]?\d+)?/g)??[];
    if(!numbers.length||numbers.some(n=>!Number.isFinite(Number(n))||Math.abs(Number(n))>10000))throw Error('motion_assembly: invalid path coordinates');
    attrs[name]=value;
   }else if(name==='textAnchor'||name==='strokeLinecap'||name==='strokeLinejoin'){
    const options=name==='textAnchor'?['start','middle','end']:name==='strokeLinecap'?['butt','round','square']:['miter','round','bevel'];
    if(typeof value!=='string'||!options.includes(value))throw Error('motion_assembly: invalid SVG enum');
    attrs[name]=value;
   }else{
    if(typeof value!=='number'||!Number.isFinite(value)||Math.abs(value)>10000)throw Error('motion_assembly: invalid numeric attribute');
    if(['width','height','r','rx','ry','strokeWidth','fontSize'].includes(name)&&value<=0)throw Error('motion_assembly: empty shape');
    if(['fillOpacity','strokeOpacity'].includes(name)&&(value<0.05||value>1))throw Error('motion_assembly: invalid paint opacity');
    if(name==='fontSize'&&(value<12||value>200))throw Error('motion_assembly: invalid font size');
    if(name==='fontWeight'&&![400,500,600,700].includes(value))throw Error('motion_assembly: invalid font weight');
    attrs[name]=value;
   }
  }
  if(tag==='text'){
   if(typeof r.text!=='string'||!r.text.trim()||r.text.length>500||Object.hasOwn(r,'children'))throw Error('motion_assembly: invalid text');
   return {tag,attrs,text:r.text};
  }
  if(Object.hasOwn(r,'text')||(tag!=='g'&&Object.hasOwn(r,'children')))throw Error('motion_assembly: unsupported children');
  if(tag==='g')return {tag,attrs,children:nodes(r.children,depth+1,budget)};
  return {tag,attrs};
 });
}
export function parseMotionAssembly(value:unknown):MotionAssembly{
 const r=fields(value,['schemaVersion','brief','plan','layers'],['audit']);
 if(r.schemaVersion!=='motion-assembly:1'&&r.schemaVersion!=='motion-assembly:2')throw Error('motion_assembly: invalid version');
 if((r.schemaVersion==='motion-assembly:2')!==Object.hasOwn(r,'audit'))throw Error('motion_assembly: version/audit mismatch');
 let brief:SceneBrief,plan:MotionPlan;
 try{brief=parseBrief(r.brief);plan=parseMotionPlan(r.plan);}catch(error){throw Error('motion_assembly: '+(error instanceof Error?error.message:String(error)));}
 if(plan.durationInFrames!==brief.durationInFrames)throw Error('motion_assembly: duration mismatch');
 if(!Array.isArray(r.layers)||r.layers.length!==plan.tracks.length)throw Error('motion_assembly: layer count mismatch');
 const ids=new Set(plan.tracks.map(t=>t.id)),seen=new Set<string>(),budget={count:0};
 const layers=r.layers.map(value=>{
  const layer=fields(value,['id','artwork']);
  if(typeof layer.id!=='string'||!ids.has(layer.id)||seen.has(layer.id))throw Error('motion_assembly: invalid layer identity');
  seen.add(layer.id);return {id:layer.id,artwork:nodes(layer.artwork,0,budget)};
 });
 return {schemaVersion:r.schemaVersion,brief,plan,layers,...(r.schemaVersion==='motion-assembly:2'?{audit:parseMotionAudit(r.audit,plan,layers)}:{})};
}
export function motionAssemblyHash(value:unknown):string{
 return createHash('sha256').update(JSON.stringify(parseMotionAssembly(value))).digest('hex');
}

async function trustedRuntime():Promise<string>{
 const source=await readFile(new URL('./motion-plan.ts',import.meta.url),'utf8');
 const file=ts.createSourceFile('motion-plan.ts',source,ts.ScriptTarget.ES2022,true,ts.ScriptKind.TS);
 const names=['MotionPose','MotionKey','MotionAttachment','MotionTrack','MotionPlan','motionPoses','evaluateMotion','motionTransforms'];
 const selected=file.statements.filter(n=>(ts.isTypeAliasDeclaration(n)||ts.isFunctionDeclaration(n))&&n.name&&names.includes(n.name.text));
 if(selected.length!==names.length)throw Error('motion_assembly: trusted runtime declarations changed');
 const printer=ts.createPrinter();
 return selected.map(node=>{
  const modifiers=ts.canHaveModifiers(node)?ts.getModifiers(node)?.filter(m=>m.kind!==ts.SyntaxKind.ExportKeyword):undefined;
  const plain=ts.isTypeAliasDeclaration(node)?ts.factory.updateTypeAliasDeclaration(node,modifiers,node.name,node.typeParameters,node.type):
   ts.isFunctionDeclaration(node)?ts.factory.updateFunctionDeclaration(node,modifiers,node.asteriskToken,node.name,node.typeParameters,node.parameters,node.type,node.body):node;
  return printer.printNode(ts.EmitHint.Unspecified,plain,file);
 }).join('\n');
}
export async function assembleMotionScene(value:unknown):Promise<SceneArtifact>{
 const input=parseMotionAssembly(value),runtime=await trustedRuntime();
 const groups=input.layers.map(layer=>{
  const follows=(input.audit?.routes??[]).flatMap(r=>r.followers.filter(f=>f.objectId===layer.id).map(f=>({...f,routeId:r.id})));
  const follow=follows.length?' data-follow-path={'+follows.map(f=>`props.frame >= ${f.startFrame} && props.frame < ${f.endFrame} ? ${JSON.stringify(f.routeId)} : `).join('')+'undefined}':'';
  return `<g data-object=${JSON.stringify(layer.id)} transform={motion[${JSON.stringify(layer.id)}].transform} opacity={motion[${JSON.stringify(layer.id)}].opacity}${follow}>{artwork[${JSON.stringify(layer.id)}].map((node,i)=>draw(node,String(i),${JSON.stringify(layer.id)}))}</g>`;
 }).join('\n');
 const artwork=Object.fromEntries(input.layers.map(layer=>[layer.id,layer.artwork]));
 const source=`import React from 'react';
${runtime}
type SvgNode={tag:string;attrs:Record<string,string|number>;text?:string;children?:SvgNode[]};
type Theme={background:string;foreground:string;muted:string;accent:string;secondary:string};
const plan:MotionPlan=${JSON.stringify(input.plan)};
const artwork:Record<string,SvgNode[]>=${JSON.stringify(artwork)};
const auditAttrs:Record<string,Record<string,string>>=${JSON.stringify(motionAuditAttributes(input.audit))};
export default function Scene(props:{frame:number;fps:number;width:number;height:number;theme:Theme}):React.JSX.Element{
 const motion = motionTransforms(plan, props.frame);
 const draw=(node:SvgNode,key:string,layerId:string):React.ReactNode=>{
  const attrs=Object.fromEntries(Object.entries(node.attrs).map(([name,value])=>[name,(name==='fill'||name==='stroke')&&value!=='none'?props.theme[value as keyof Theme]:value]));
  return React.createElement(node.tag,{...attrs,...(auditAttrs[layerId+':'+key]??{}),key},node.text??node.children?.map((child,i)=>draw(child,key+'.'+i,layerId)));
 };
 return <svg width="1920" height="1080" viewBox="0 0 1920 1080"><rect width="1920" height="1080" fill={props.theme.background}/>
${groups}
</svg>;
}
`;
 const artifact=parseArtifact({schemaVersion:'custom-scene:1',brief:input.brief,rationale:'Host-assembled data-only SVG illustration with deterministic motion. Geometry and visual acceptance remain pending.',source});
 checkMotionBindings(artifact.source,input.plan.tracks.map(t=>t.id));
 return artifact;
}
