import {buildRagMotionAssembly} from '../motion-rag/fixture';
import type {VisualDesign} from '../../../packages/custom-scenes/src/design';
import {parseMotionAssembly,type MotionAssembly,type SvgNode} from '../../../packages/custom-scenes/src/motion-assembly';

export const ragPortGeometry={tray:{left:1160,right:1320,floor:760},generator:{top:460,bottom:680},outlet:{top:330,bottom:540}} as const;
const path=(d:string,stroke='accent',fill='none'):SvgNode=>({tag:'path',attrs:{d,stroke,fill,strokeWidth:2}});
const rect=(x:number,y:number,width:number,height:number):SvgNode=>({tag:'rect',attrs:{x,y,width,height,stroke:'accent',fill:'background',strokeWidth:2}});

// Preserve the old fixture and poses; this candidate changes painted geometry and audit metadata only.
export function buildRepairedRagAssembly(design:VisualDesign):MotionAssembly{
 const base=buildRagMotionAssembly(design);
 const layer=(id:string)=>{const found=base.layers.find(l=>l.id===id);if(!found)throw Error('rag_clearance: missing layer '+id);return found;};
 const hand=layer('hand');hand.artwork=hand.artwork.filter(n=>n.tag==='rect');
 const glyph=layer('question-roll').artwork.find(n=>n.tag==='text')!;
 glyph.attrs.y=48;glyph.attrs.fontSize=36;
 const p=ragPortGeometry,localLeft=p.tray.left-1150,localRight=p.tray.right-1150,floor=p.tray.floor-470;
 const tray=layer('slot-back');
 tray.artwork[0]=path(`M ${localLeft} ${floor} H 0 V 0 H 280 V ${floor} H ${localRight}`);
 tray.artwork.find(n=>n.tag==='text')!.attrs.y=-40;
 tray.artwork=tray.artwork.slice(0,3);
 layer('slot-front').artwork=[rect(0,250,localLeft,floor-250),rect(localRight,250,280-localRight,floor-250)];
 layer('generator-back').artwork=[path(`M 0 ${p.generator.top-300} V 0 H 300 V ${p.outlet.top-300} M 300 ${p.outlet.bottom-300} V 470 H 0 V ${p.generator.bottom-300}`,'muted')];
 const front=layer('generator-front');
 front.artwork[0]=path(`M 0 0 H 280 V ${p.outlet.top-300} H 260 V ${p.outlet.bottom-300} H 280 V 470 H 0 V ${p.generator.bottom-300} H 40 V ${p.generator.top-300} H 0 Z`,'accent','background');
 front.artwork=front.artwork.filter(n=>n.attrs.d!=='M 0 235 H 35 V 300 H 0 M 280 30 H 300 V 110 H 280');
 front.artwork.find(n=>n.text==='问题 + 上下文')!.attrs.y=430;
 // Routes use the real outer group's top-left origin, not a shifted audit-only anchor.
 layer('transfer-route').artwork=[path('M 330 470 V 774 H 1180 V 500','muted'),path('M 1180 475 H 1530','muted')];
 return parseMotionAssembly({...base,schemaVersion:'motion-assembly:2',audit:{
  routes:[
   {id:'route-transfer',layerId:'transfer-route',nodePath:[0],followers:[{objectId:'question-roll',startFrame:500,endFrame:655}]},
   {id:'route-feed',layerId:'transfer-route',nodePath:[1],followers:[{objectId:'question-roll',startFrame:706,endFrame:779}]},
  ],
  obstacles:[
   {layerId:'emitter',nodePath:[0]}, {layerId:'gantry',nodePath:[0]}, {layerId:'library',nodePath:[0]},
   {layerId:'slot-back',nodePath:[0]}, {layerId:'slot-front',nodePath:[0]}, {layerId:'slot-front',nodePath:[1]},
   {layerId:'hand',nodePath:[0]}, {layerId:'jaw-left',nodePath:[0]}, {layerId:'jaw-right',nodePath:[0]},
   {layerId:'generator-front',nodePath:[0]},
  ],
 }});
}
