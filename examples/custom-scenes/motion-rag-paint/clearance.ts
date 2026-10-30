import type {MotionAssembly,SvgNode} from '../../../packages/custom-scenes/src/motion-assembly';
import {evaluateMotion} from '../../../packages/custom-scenes/src/motion-plan';
type Box={x:number;y:number;width:number;height:number};
const overlap=(a:Box,b:Box,gap=0)=>a.x<b.x+b.width+gap&&b.x<a.x+a.width+gap&&a.y<b.y+b.height+gap&&b.y<a.y+a.height+gap;
// shortcut: exact reviewed templates only; arbitrary paths need measured SVG bounds, never silent omission.
const paths:Record<string,Box>={
 'M 0 -5 V 18 H 10':{x:0,y:-5,width:10,height:23},
 'M 0 -5 V 18 H -10':{x:-10,y:-5,width:10,height:23},
 'M 0 0 H 100 L 120 20 V 160 H 0 Z':{x:0,y:0,width:120,height:160},
 'M 100 0 V 20 H 120':{x:100,y:0,width:20,height:20},
 'M 15 45 H 105 M 15 65 H 95 M 15 85 H 105 M 15 105 H 85 M 15 125 H 100':{x:15,y:45,width:90,height:80},
 'M 140 95 V 115 M 140 165 V 185 M 95 140 H 115 M 165 140 H 185':{x:95,y:95,width:90,height:90},
 'M 20 200 H 260 M 20 220 H 260':{x:20,y:200,width:240,height:20},
};
function paintBoxes(node:SvgNode):Box[]{
 if(node.tag==='g')return (node.children??[]).flatMap(paintBoxes);
 const a=node.attrs,n=(key:string,fallback=0)=>Number(a[key]??fallback);
 let box:Box;
 if(node.tag==='rect')box={x:n('x'),y:n('y'),width:n('width'),height:n('height')};
 else if(node.tag==='line')box={x:Math.min(n('x1'),n('x2')),y:Math.min(n('y1'),n('y2')),width:Math.abs(n('x2')-n('x1')),height:Math.abs(n('y2')-n('y1'))};
 else if(node.tag==='circle')box={x:n('cx')-n('r'),y:n('cy')-n('r'),width:2*n('r'),height:2*n('r')};
 else if(node.tag==='text'){
  const size=n('fontSize'),width=[...(node.text??'')].length*size*1.1;
  const shift=a.textAnchor==='middle'?width/2:a.textAnchor==='end'?width:0;
  box={x:n('x')-shift,y:n('y')-size*1.25,width,height:size*1.65};
 }else if(node.tag==='path'&&Object.hasOwn(paths,String(a.d)))box={...paths[String(a.d)]};
 else throw Error('rag_paint: unsupported_paint '+node.tag);
 const stroke=a.stroke&&a.stroke!=='none'?n('strokeWidth',1)/2:0;
 return [{x:box.x-stroke,y:box.y-stroke,width:box.width+stroke*2,height:box.height+stroke*2}];
}
export function assertRagPaintClearance(input:MotionAssembly):void{
 const layer=(id:string)=>{const l=input.layers.find(l=>l.id===id);if(!l)throw Error('rag_paint: missing layer '+id);return l;};
 const heading=layer('library').artwork.find(n=>n.tag==='text'&&n.text==='文档库');
 if(!heading)throw Error('rag_paint: missing library heading');
 const localHeading=paintBoxes(heading)[0];
 const actors=['hand','jaw-left','jaw-right','doc-fragment'].map(id=>({id,boxes:layer(id).artwork.flatMap(paintBoxes)}));
 for(let frame=0;frame<input.plan.durationInFrames;frame++){
  const poses=evaluateMotion(input.plan,frame),l=poses.library;
  const headingBox={x:l.x+localHeading.x*l.scale,y:l.y+localHeading.y*l.scale,width:localHeading.width*l.scale,height:localHeading.height*l.scale};
  for(const actor of actors){
   const p=poses[actor.id];if(p.opacity<=0.05)continue;
   for(const b of actor.boxes){
    const world={x:p.x+b.x*p.scale,y:p.y+b.y*p.scale,width:b.width*p.scale,height:b.height*p.scale};
    if(overlap(headingBox,world,8))throw Error(`rag_paint: library_heading versus ${actor.id} at ${frame}`);
   }
  }
 }
 const front=layer('generator-front');
 const shell=front.artwork[0];
 if(shell.tag!=='path'||shell.attrs.d!=='M 0 0 H 280 V 30 H 260 V 240 H 280 V 470 H 0 V 380 H 40 V 160 H 0 Z')throw Error('rag_paint: unverified shell');
 const ports=[{x:0,y:160,width:40,height:220},{x:260,y:30,width:40,height:210}];
 for(const node of front.artwork.slice(1))for(const box of paintBoxes(node))for(const port of ports){
  if(overlap(box,port,8))throw Error('rag_paint: port_paint '+node.tag);
 }
}
