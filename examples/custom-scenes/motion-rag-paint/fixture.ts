import {buildRepairedRagAssembly} from '../motion-rag-clearance/fixture';
import type {VisualDesign} from '../../../packages/custom-scenes/src/design';
import {parseMotionAssembly,type MotionAssembly,type SvgNode} from '../../../packages/custom-scenes/src/motion-assembly';
import {assertRagPaintClearance} from './clearance';

export function buildPaintSafeRagAssembly(design:VisualDesign):MotionAssembly{
 const input=buildRepairedRagAssembly(design);
 const library=input.layers.find(l=>l.id==='library')!;
 library.artwork.find(n=>n.tag==='text'&&n.text==='文档库')!.attrs.y=-30;
 const front=input.layers.find(l=>l.id==='generator-front')!;
 front.artwork=front.artwork.flatMap((node):SvgNode[]=>node.tag==='path'&&node.attrs.d==='M 20 200 H 260 M 20 220 H 260'
  ?[200,220].map(y=>({tag:'line',attrs:{x1:60,y1:y,x2:240,y2:y,stroke:'muted',strokeWidth:2}})):[node]);
 const checked=parseMotionAssembly(input);
 assertRagPaintClearance(checked);
 return checked;
}
