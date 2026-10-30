import {createHash} from 'node:crypto';
import Ajv from 'ajv';
import {designHash,type VisualDesign} from './design';
import {buildIntentOutputSchema,parseIntentAssembly,intentActionRules} from './motion-intent-output';
import {motionAuditRules} from './motion-audit';

export function buildObjectMotionSchema(design:VisualDesign){
 const original=buildIntentOutputSchema(design).schema as any;
 const motion=original.properties.intent.properties;
 const artwork=original.properties.layers.items.properties.artwork;
 const items={...motion.objects.items,properties:{...motion.objects.items.properties,artwork},required:[...motion.objects.items.required,'artwork']};
 const properties={schemaVersion:{const:'object-motion-data:1'},designSha256:{type:'string',enum:[designHash(design)]},anchors:motion.anchors,objects:{...motion.objects,items},audit:original.properties.audit};
 return {name:'object_motion_data_v1',schema:{type:'object',properties,required:Object.keys(properties),additionalProperties:false,$defs:original.$defs}};
}

/** Restore only host-owned structure. Never infer missing object data or actions. */
export function parseObjectMotionData(value:unknown,design:VisualDesign){
 const validate=new Ajv({allErrors:true,strict:false}).compile(buildObjectMotionSchema(design).schema);
 if(!validate(value))throw Error('object_motion_data: schema mismatch; '+(validate.errors??[]).slice(0,8).map(e=>`${e.instancePath||'/'} ${e.message}`).join('; '));
 const r=value as {anchors:unknown;objects:{id:string;initialAnchor:string;actions:unknown;artwork:unknown}[];audit:unknown};
 return parseIntentAssembly({schemaVersion:'motion-intent-assembly:1',brief:design.brief,
  intent:{schemaVersion:'motion-intent:1',durationInFrames:design.brief.durationInFrames,anchors:r.anchors,objects:r.objects.map(({artwork,...motion})=>motion)},
  layers:r.objects.map(({id,artwork})=>({id,artwork})),audit:r.audit},design);
}

export function parseStoredIntentData(value:unknown,design:VisualDesign){
 return value&&typeof value==='object'&&(value as {schemaVersion?:unknown}).schemaVersion==='object-motion-data:1'
  ?parseObjectMotionData(value,design):parseIntentAssembly(value,design);
}
export function storedIntentHash(value:unknown,design:VisualDesign):string{
 parseStoredIntentData(value,design);
 return createHash('sha256').update(JSON.stringify(value)).digest('hex');
}

export function buildObjectMotionPrompt(design:VisualDesign,reference:string,previous?:unknown,feedback?:string):string{
 return [
  'HOST_OBJECT_MOTION_DATA: Return only object-motion-data:1 JSON matching the supplied schema. The host supplies the brief, duration, intent container and layers. Never return brief, intent, layers, source, expressions, motion keys, transforms or URLs.',
  `Use designSha256=${designHash(design)}. OBJECT_IDS ${JSON.stringify(design.objects.map(o=>o.id))}. Each ID occurs exactly once in objects. Each object contains id, initialAnchor, actions and artwork together; do not create a second drawing identity list.`,
  ...intentActionRules(design),
  'artwork is the existing bounded SVG node array local to this object. Audit layerId refers to the object id; nodePath indexes that same artwork. audit is a root sibling of anchors and objects, never a field inside an object or action. Empty audit lists do not prove coverage.',
  ...motionAuditRules,
  'The following reviewed reference is for appearance and choreography only, not its legacy envelope or keyframes.',reference,
  'FROZEN_DESIGN\n'+JSON.stringify(design),
  ...(previous?['PREVIOUS_INTENT_REFERENCE (reference data only; return the NEW object-motion-data:1 schema)\n'+JSON.stringify(previous)]:[]),
  ...(feedback?['REPAIR_FEEDBACK\n'+feedback]:[]),
 ].join('\n\n');
}
