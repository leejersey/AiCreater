import {createHash} from 'node:crypto';
import {parseBrief,type ModelOptions} from './contract';
import type {VisualDesign} from './design';
import {compileMotionIntent} from './motion-intent';
import {parseMotionAssembly,type MotionAssembly} from './motion-assembly';
import {buildMotionOutputSchema} from './motion-output';
import {motionAuditRules} from './motion-audit';

type Schema=Record<string,unknown>;
const object=(properties:Record<string,Schema>,required=Object.keys(properties)):Schema=>({type:'object',properties,required,additionalProperties:false});
const array=(items:Schema,min:number,max:number):Schema=>({type:'array',items,minItems:min,maxItems:max});

export function buildIntentOutputSchema(design:VisualDesign):NonNullable<ModelOptions['outputSchema']>{
 const base=buildMotionOutputSchema(design.brief,design).schema as {properties:Record<string,Schema>;$defs:Schema};
 const ids=design.objects.map(o=>o.id),knownId:Schema={type:'string',enum:ids};
 const anchorId:Schema={type:'string',pattern:'^[a-z][a-z0-9-]{0,63}$'};
 const numeric:Schema={type:'number',minimum:-10000,maximum:10000};
 const pose=object({x:numeric,y:numeric,scale:{type:'number',minimum:0.001,maximum:100},opacity:{type:'number',minimum:0,maximum:1}});
 const frame:Schema={type:'integer',minimum:0,maximum:design.brief.durationInFrames-1};
 const initialAnchor={...anchorId,description:'Sample the referenced anchor at frame zero. For an absolute initial world pose, use an anchor without objectId. An anchor relative to its own object creates a self-dependency and is invalid; another object frame is allowed only if the whole dependency graph is acyclic.'};
 const targetAnchor={...anchorId,description:'Sample this anchor at arrival. A world waypoint omits objectId; a local dock depends on its referenced other object. A move target relative to its own object is invalid. Cross-object dependencies must remain acyclic across all actions.'};
 const anchorFrame={...knownId,description:'Optional coordinate-frame dependency, not an ownership label. If present, pose is local to this referenced object at sample time. If omitted, pose is absolute world-space. Never assign it simply because the anchor is named for or used by that object.'};
 const action:Schema={anyOf:[
  object({kind:{const:'move'},startFrame:frame,endFrame:frame,targetAnchor}),
  object({kind:{const:'attach'},frame,parentId:knownId}),
  object({kind:{const:'release'},frame}),
 ]};
 const objects={...array(object({id:knownId,initialAnchor,actions:array(action,0,60)}),ids.length,ids.length),allOf:ids.map(id=>({contains:{type:'object',properties:{id:{const:id}},required:['id']}}))};
 const intent=object({schemaVersion:{const:'motion-intent:1'},durationInFrames:{const:design.brief.durationInFrames},anchors:array(object({id:anchorId,pose,objectId:anchorFrame},['id','pose']),1,120),objects});
 return {name:'motion_intent_assembly_v1',schema:{...object({schemaVersion:{const:'motion-intent-assembly:1'},brief:base.properties.brief,intent,layers:base.properties.layers,audit:base.properties.audit}),$defs:base.$defs}};
}

export function parseIntentAssembly(value:unknown,design:VisualDesign):MotionAssembly{
 if(!value||typeof value!=='object'||Array.isArray(value))throw Error('intent_assembly: expected object');
 const r=value as Record<string,unknown>,keys=['schemaVersion','brief','intent','layers','audit'];
 if(r.schemaVersion!=='motion-intent-assembly:1'||Object.keys(r).some(k=>!keys.includes(k))||keys.some(k=>!Object.hasOwn(r,k)))throw Error('intent_assembly: unexpected fields or version');
 const brief=parseBrief(r.brief);
 if(JSON.stringify(brief)!==JSON.stringify(design.brief))throw Error('intent_assembly: brief mismatch');
 const plan=compileMotionIntent(r.intent);
 if(plan.tracks.length!==design.objects.length||design.objects.some(o=>!plan.tracks.some(t=>t.id===o.id)))throw Error('intent_assembly: design identity mismatch');
 return parseMotionAssembly({schemaVersion:'motion-assembly:2',brief,plan,layers:r.layers,audit:r.audit});
}

export function intentHash(value:unknown,design:VisualDesign):string{
 parseIntentAssembly(value,design);
 return createHash('sha256').update(JSON.stringify(value)).digest('hex');
}

export function intentActionRules(design:VisualDesign):string[]{
 return [
  'The host computes every attachment offset, release pose, hold key and boundary key. Describe ordered actions, never calculate duplicate handoff coordinates yourself.',
  'Intent anchors have unique id and pose{x,y,scale,opacity}; optional objectId makes the pose local to that owner, otherwise it is world-space. initialAnchor samples at frame zero only, it does not attach. Use named local docking anchors for gripper jaws and inlet contact points.',
  'ANCHOR_COORDINATE_CONTRACT: objectId is a coordinate-frame dependency, not an ownership label or the object using the anchor. For an absolute home pose or free world waypoint, OMIT objectId entirely. Use objectId only for a pose expressed relative to another coordinate frame. Never remove objectId from a prior response mechanically: that changes its coordinate semantics.',
  'An object initialAnchor must not reference an anchor relative to its own object. A move targetAnchor must not reference an anchor relative to its own object either. Named homes and waypoints for an object usually need world anchors, not self-owned local anchors. A local jaw/dock may be used by another object, not by its owner to position itself.',
  'The compiler requires one acyclic dependency graph across initial anchor owners, move target owners and attachment parents, even when actions occur at different times. If A moves to a B-local anchor while B attaches to A, that creates a cycle. Use independently specified world-space approach waypoints where appropriate; do not invent parent relations or reinterpret local poses as world poses to bypass this rule.',
  'An object has id, initialAnchor and ordered actions. move has kind,startFrame,endFrame,targetAnchor and samples the target at arrival; attach has kind,frame,parentId and captures the current relative pose; release has kind,frame and preserves the derived world pose. Move to the actual docking anchor before attach: capture does not teleport or guarantee grasp contact.',
  `Events use frames 0..${design.brief.durationInFrames-1}. Moves require startFrame<endFrame; actions must not overlap or move while attached. Attach lasts until release or composition end. Do not create cyclic dependencies, including target anchor owners. Omit unused fields; never emit null.`,
  'Use world-space sibling artwork with local coordinates and theme paint tokens. Keep all paint clear of obstacles, labels and subtitle space; the compiler does not solve collisions. Do not replace explanation with text cards.',
 ];
}

export function buildIntentPrompt(design:VisualDesign,reference:string,previous?:unknown,feedback?:string):string{
 return [
  'HOST_INTENT_DATA: Return only motion-intent-assembly:1 JSON matching the supplied schema. No source, expressions, motion keys, transforms or URLs.',
  `OBJECT_IDS ${JSON.stringify(design.objects.map(o=>o.id))}. Include each exact ID once in intent.objects and once in layers. Layers contain only id and artwork; group decorative parts inside artwork.`,
  ...intentActionRules(design),
  ...motionAuditRules,
  'The following reviewed reference is for appearance and semantic choreography only. Do not copy its legacy motion-plan fields into the intent response.',
  reference,
  'FROZEN_DESIGN\n'+JSON.stringify(design),
  ...(previous?['PREVIOUS_INTENT\n'+JSON.stringify(previous)]:[]),
  ...(feedback?['REPAIR_FEEDBACK\n'+feedback]:[]),
 ].join('\n\n');
}
