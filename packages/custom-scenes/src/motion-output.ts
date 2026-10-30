import type {SceneBrief,ModelOptions} from './contract';
import type {VisualDesign} from './design';
import {motionSvgGeometry,motionSvgRequired,type MotionAssembly} from './motion-assembly';
import {motionAuditRules} from './motion-audit';
type Schema=Record<string,unknown>;
const object=(properties:Record<string,Schema>,required=Object.keys(properties)):Schema=>({type:'object',properties,required,additionalProperties:false});
const array=(items:Schema,min:number,max:number):Schema=>({type:'array',items,minItems:min,maxItems:max});
const id:Schema={type:'string',pattern:'^[a-z][a-z0-9-]{0,63}$'};
const number:Schema={type:'number',minimum:-10000,maximum:10000};
const integer=(min:number,max:number):Schema=>({type:'integer',minimum:min,maximum:max});
const paint:Schema={type:'string',enum:['background','foreground','muted','accent','secondary','none']};

/** Bind identities when a design is available; local handoff and geometry checks still apply. */
export function buildMotionOutputSchema(brief:SceneBrief,design?:VisualDesign):NonNullable<ModelOptions['outputSchema']>{
 const ids=design?.objects.map(object=>object.id),objectId:Schema=ids?{type:'string',enum:ids}:id;
 const identityArray=(items:Schema):Schema=>ids?{...array(items,ids.length,ids.length),allOf:ids.map(value=>({contains:{type:'object',properties:{id:{const:value}},required:['id']}}))}:array(items,1,60);
 const duration=brief.durationInFrames,pose={x:number,y:number,scale:{type:'number',minimum:0.001,maximum:100},opacity:{type:'number',minimum:0,maximum:1}};
 const key=object({frame:integer(0,duration-1),...pose});
 const attachment=object({startFrame:integer(0,duration-1),endFrame:integer(1,duration),parentId:objectId,offset:object(pose)});
 const track={...object({id:objectId,keys:array(key,1,120),parentId:objectId,attachments:array(attachment,1,16)},['id','keys']),description:'Motion only: id, keys, and optional parentId OR attachments. Omit unused optional fields, never null. Artwork belongs to layers, not here.'};
 const nodeVariants=Object.entries(motionSvgGeometry).map(([tag,geometry])=>{
  const attrs:Record<string,Schema>=Object.fromEntries(geometry.map(name=>[name,number]));
  Object.assign(attrs,{fill:paint,stroke:paint,strokeWidth:{type:'number',exclusiveMinimum:0,maximum:10000},fillOpacity:{type:'number',minimum:0.05,maximum:1},strokeOpacity:{type:'number',minimum:0.05,maximum:1},strokeLinecap:{type:'string',enum:['butt','round','square']},strokeLinejoin:{type:'string',enum:['miter','round','bevel']}});
  for(const name of ['width','height','r','rx','ry'])if(geometry.includes(name))attrs[name]={type:'number',exclusiveMinimum:0,maximum:10000};
  if(tag==='path')attrs.d={type:'string',minLength:1,maxLength:12000};
  if(tag==='polygon'||tag==='polyline')attrs.points={type:'string',minLength:1,maxLength:12000};
  if(tag==='text')Object.assign(attrs,{fontSize:{type:'number',minimum:12,maximum:200},fontWeight:{type:'number',enum:[400,500,600,700]},textAnchor:{type:'string',enum:['start','middle','end']}});
  return object({tag:{type:'string',enum:[tag]},attrs:object(attrs,motionSvgRequired[tag]),...(tag==='text'?{text:{type:'string',minLength:1,maxLength:500}}:{}),...(tag==='g'?{children:array({$ref:'#/$defs/node'},1,200)}:{})});
 });
 const ref={layerId:objectId,nodePath:array(integer(0,199),1,13)};
 const audit={...object({routes:array(object({...ref,id,followers:array(object({objectId,startFrame:integer(0,duration-1),endFrame:integer(1,duration)}),1,20)}),0,16),obstacles:array(object(ref),0,80)}),description:motionAuditRules.join('\n')};
 const layer={...object({id:objectId,artwork:array({$ref:'#/$defs/node'},1,200)}),description:'Drawing only: only id and artwork. parentId, attachments and keys belong to plan.tracks, never here. The host computes transforms; do not emit them anywhere.'};
 return {name:'motion_assembly_v2',schema:{...object({schemaVersion:{type:'string',enum:['motion-assembly:2']},brief:{type:'object',enum:[brief]},plan:object({schemaVersion:{type:'string',enum:['motion-plan:2']},durationInFrames:{type:'integer',enum:[duration]},tracks:identityArray(track)}),layers:identityArray(layer),audit}),$defs:{node:{anyOf:nodeVariants}}}};
}

export function buildMotionPrompt(design:VisualDesign,reference:string,previous?:MotionAssembly,feedback?:string):string{
 const exampleId=design.objects[0].id;
 const example={plan:{tracks:[{id:exampleId,keys:[{frame:0,x:0,y:0,scale:1,opacity:1}]}]},layers:[{id:exampleId,artwork:[{tag:'circle',attrs:{r:1,fill:'accent'}}]}]};
 return [
  'HOST_MOTION_DATA: Return only motion-assembly:2 JSON matching the supplied schema. No source/JavaScript/TSX, expressions, URLs, transforms or style fields.',
  'The host owns all interpolation and outer SVG groups. Artwork uses local coordinates. All layers are world-space siblings; never apply a parent transform twice. Use theme paint tokens.',
  'Plan: motion-plan:2, duration exactly equals the brief. Every track starts at frame 0. Each key has frame,x,y,scale,opacity; preserve ordered keys and stable object identity. One layer per track, in paint order.',
  `OBJECT_IDS ${JSON.stringify(design.objects.map(object=>object.id))}. Use each exact ID once in plan.tracks and once in layers; both arrays have ${design.objects.length} entries. Do not add t-/l- prefixes, rename, omit or duplicate IDs. Put decorative parts inside the owning layer artwork, not extra layers.`,
  `Key frame range is 0..${design.brief.durationInFrames-1} inclusive; ${design.brief.durationInFrames} is not a valid key frame. Attachment/follower endFrame is an exclusive boundary and may equal ${design.brief.durationInFrames}. These end boundaries are not key frames.`,
  'FIELD_OWNERSHIP: plan.tracks[] owns id, keys, and optional parentId OR attachments. layers[] contains only id and artwork. Never copy parentId, attachments, keys or motion fields into layers or artwork attrs. Omit unused parentId and attachments; never emit null. Do not use an empty attachments array.',
  'Use static parentId OR timed attachments on the track, not both. During attachment the offset is parent-local. At attachment/release boundaries the authored free pose must exactly match the attached world pose. Use the same fragment, never a fade-in replacement.',
  'The following is a structural fragment for one identity, NOT a complete response or a visual template. The tiny circle only demonstrates an SVG leaf. Invent the actual artwork from the frozen design; include every required object in the full response.',
  'STRUCTURE_EXAMPLE\n'+JSON.stringify(example),
  'Follow the frozen design cues and state changes. Reserve label space outside the complete moving paint sweep. Keep full payloads clear of obstacles and all inlet/outlet decoration. Do not reduce the explanation to text cards.',
  ...motionAuditRules,
  'FROZEN_DESIGN\n'+JSON.stringify(design),
  reference,
  ...(previous?['PREVIOUS_ASSEMBLY\n'+JSON.stringify(previous)]:[]),
  ...(feedback?['REPAIR_FEEDBACK\n'+feedback]:[]),
 ].join('\n\n');
}
