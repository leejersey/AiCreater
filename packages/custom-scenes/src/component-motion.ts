import Ajv from 'ajv';
import {designHash,type VisualDesign} from './design';
import type {SvgNode} from './motion-assembly';
import {buildObjectMotionSchema,parseObjectMotionData} from './object-motion-output';
import {intentActionRules} from './motion-intent-output';
import {motionAuditRules} from './motion-audit';

const components=['document','shelf','gripper','processor','sleeve','label','route'] as const;
type Component=typeof components[number];
export const componentDesignGuidance='HOST_COMPONENT_CATALOG: This mode draws only document, shelf, gripper, processor, sleeve, label and horizontal route components. Plan explicit stable labels as separate objects when their payload enters another machine. Allocate separate route objects for lanes at different heights; a stationary step guide is not a moving follower. Reserve actual component bounds, caption-safe space and grasp/entry clearance. Do not promise arbitrary bespoke SVG or unsupported component states.';

/** Local, deterministic artwork only. No caller paths, attributes, expressions or URLs. */
export function hostArtwork(component:Component,width:number,height:number,label:string):SvgNode[]{
 if(!components.includes(component)||![width,height].every(v=>Number.isFinite(v)&&v>0&&v<=1920)||typeof label!=='string'||label.length>24)throw Error('component_motion: invalid drawing parameters');
 const w=width,h=height;
 const node=(tag:string,attrs:SvgNode['attrs'],text?:string):SvgNode=>({tag,attrs,...(text===undefined?{}:{text})});
 const line=(x1:number,y1:number,x2:number,y2:number,stroke='muted')=>node('line',{x1,y1,x2,y2,stroke,strokeWidth:2});
 const rect=(x:number,y:number,width:number,height:number,fill='background')=>node('rect',{x,y,width,height,fill,stroke:'accent',strokeWidth:2});
 const path=(d:string)=>node('path',{d,fill:'none',stroke:'accent',strokeWidth:2});
 const text=():SvgNode[]=>{
  if(!label)return [];
  const units=Array.from(label).reduce((sum,c)=>sum+(/[\x00-\x7f]/.test(c)?.6:1),0);
  const x=component==='gripper'?w*.68:w*.1;
  const baseline=component==='label'?.62:component==='gripper'?.4:component==='sleeve'?.78:component==='processor'?.2:.3;
  const y=h*baseline;
  const availableWidth=w*(component==='gripper'?.3:.8);
  const size=Math.min(28,h*(component==='label'?.55:.2),availableWidth/Math.max(1,units));
  if(size<12)throw Error('component_motion: label does not fit');
  return [node('text',{x,y,fontSize:size,fill:'foreground'},label)];
 };
 if(component==='route')return [path(`M 0 ${h/2} H ${w}`),line(w*.9,h*.2,w,h*.5,'accent'),line(w*.9,h*.8,w,h*.5,'accent'),...text()];
 if(component==='label')return [...text(),line(w*.1,h*.8,w*.9,h*.8,'secondary')];
 if(component==='document')return [
  path(`M 0 0 H ${w*.75} L ${w} ${h*.2} V ${h} H 0 Z`),
  path(`M ${w*.75} 0 V ${h*.2} H ${w}`),...text(),
  ...[.48,.62,.76,.9].map((y,i)=>line(w*.12,h*y,w*(i===3?.6:.87),h*y)),
 ];
 if(component==='shelf')return [rect(0,0,w,h),...text(),
  ...[.4,.65,.9].flatMap(y=>[line(w*.06,h*y,w*.94,h*y,'accent'),...[.18,.35,.52,.69,.86].map(x=>line(w*x,h*(y-.14),w*x,h*(y-.02)))]),
 ];
 if(component==='gripper')return [rect(w*.35,0,w*.3,h*.25),line(w*.5,h*.25,w*.5,h*.55,'accent'),
  path(`M ${w*.42} ${h} V ${h*.55} H ${w*.58} V ${h}`),
  line(w*.4,h*.95,w*.42,h*.95,'secondary'),line(w*.58,h*.95,w*.6,h*.95,'secondary'),
  node('circle',{cx:w*.5,cy:h*.15,r:Math.min(w,h)*.05,fill:'accent'}),...text(),
 ];
 if(component==='processor')return [rect(w*.1,h*.1,w*.8,h*.8),rect(w*.22,h*.4,w*.56,h*.34),...text(),
  ...[.25,.5,.75].flatMap(y=>[line(0,h*y,w*.1,h*y),line(w*.9,h*y,w,h*y)]),
  ...[.3,.5,.7].map(x=>node('circle',{cx:w*x,cy:h*.83,r:Math.min(w,h)*.018,fill:'secondary'})),
 ];
 return [rect(0,h*.3,w,h*.7),path(`M 0 ${h*.3} Q ${w*.5} ${h*.5} ${w} ${h*.3}`),
  line(w*.06,h*.88,w*.94,h*.88),rect(w*.8,h*.55,w*.2,h*.2),...text(),
 ];
}

export function buildComponentMotionSchema(design:VisualDesign){
 const base=structuredClone(buildObjectMotionSchema(design).schema) as any;
 delete base.$defs;
 base.properties.schemaVersion={const:'component-motion-data:1'};
 const item=base.properties.objects.items;
 delete item.properties.artwork;
 item.properties.component={type:'string',enum:[...components]};
 item.properties.label={type:'string',maxLength:24};
 item.required=item.required.filter((key:string)=>key!=='artwork').concat('component','label');
 return {name:'component_motion_data_v1',schema:base};
}

export function parseComponentMotionData(value:unknown,design:VisualDesign){
 const validate=new Ajv({allErrors:false,strict:false}).compile(buildComponentMotionSchema(design).schema);
 if(!validate(value))throw Error('component_motion: schema mismatch; '+JSON.stringify(validate.errors?.slice(0,3)));
 const r=value as {anchors:unknown;audit:unknown;objects:{id:string;component:Component;label:string;initialAnchor:string;actions:unknown[]}[]};
 return parseObjectMotionData({schemaVersion:'object-motion-data:1',designSha256:designHash(design),anchors:r.anchors,audit:r.audit,
  objects:r.objects.map(({component,label,...motion})=>{
   const object=design.objects.find(o=>o.id===motion.id)!;
   return {...motion,artwork:hostArtwork(component,object.width,object.height,label)};
  }),
 },design);
}

export function buildComponentMotionPrompt(design:VisualDesign):string{
 return ['Return only component-motion-data:1 JSON. The host draws every component; never return artwork, SVG, paths, code or arbitrary attributes.',
  'Choose document, shelf, gripper, processor, sleeve, label or route for each exact design object ID. label is a short display label (maximum 24 characters); use empty text when no label is needed. Host dimensions come from the frozen design. This is a bounded catalog, not an arbitrary illustration engine.',
  'ROUTE_NODE_PATH: route component stroke is nodePath [0]; use this only for a real static visible route. Host drawings do not guarantee contact, route following, clearance or semantic correctness.',
  'ATTACHMENT_ACTOR: release belongs to the attached child, never to its carrier merely because the carrier opens its jaws. If a document attaches to a gripper, attach and release are actions of that document. An independently moving gripper with no prior attach must not emit release. Do not use release as a generic visual open action.',
  'COMPONENT_GEOMETRY: All artwork uses local upper-left origin (0,0), with frozen object width w and height h. The route stroke is the finite segment (0,h/2)..(w,h/2); route followers are checked at their local origin, not their visual center. A stationary step label is not a valid traveling follower. Split lanes at different heights into different route objects in the design, never invent drawing IDs.',
  'The gripper jaw center is (0.5*w,0.95*h), with left/right sides at 0.42*w and 0.58*w. Align the document top center to this contact before attaching; capture alone does not establish contact. The sleeve opening is at 0.3*h; attach deposited documents to the sleeve before it moves, and release only when intentionally transferred. Processor body occupies 0.1*w..0.9*w and 0.1*h..0.9*h. Avoid moving readable labels into that body; use a separate predesigned stationary caption instead. Never delete label text or audit records merely to suppress diagnostics.',
  ...intentActionRules(design).filter(rule=>!rule.startsWith('Use world-space sibling artwork')),
  ...motionAuditRules,
  JSON.stringify({designSha256:designHash(design),durationInFrames:design.brief.durationInFrames,objects:design.objects,cues:design.cues,beats:design.beats}),
 ].join('\n\n');
}
