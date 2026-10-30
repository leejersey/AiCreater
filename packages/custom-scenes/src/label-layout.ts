import {parseDesign,designHash,type VisualDesign} from './design';
import {designLayoutFindings} from './design-layout';

/** Bounded vertical label proposals only; no automatic code generation or acceptance. */
export function proposeLabelLayout(value:unknown,options:{clearance?:number;maxDistance?:number}={}){
 const clearance=options.clearance??12,maxDistance=options.maxDistance??96;
 if(!Number.isInteger(clearance)||clearance<0||clearance>32||!Number.isInteger(maxDistance)||maxDistance<0||maxDistance>240)throw Error('label_layout: invalid options');
 const original=parseDesign(value),design=structuredClone(original);
 const moves:{objectId:string;from:{x:number;y:number};to:{x:number;y:number}}[]=[];
 const labels=design.objects.filter(o=>o.kind==='label').sort((a,b)=>a.id.localeCompare(b.id,'en'));
 for(const label of labels){
  const affected=designLayoutFindings(design).some(f=>f.objects.includes(label.id)&&(f.kind==='label-overlap'||f.kind==='caption-area'));
  if(!affected)continue;
  const obstacles=design.objects.filter(o=>o.id!==label.id&&o.kind!=='path');
  const candidates=[label.y,0,980-label.height,...obstacles.flatMap(o=>[o.y-label.height-clearance,o.y+o.height+clearance])];
  const safe=(y:number)=>y>=0&&y+label.height<=980&&Math.abs(y-label.y)<=maxDistance&&obstacles.every(o=>
   label.x+label.width+clearance<=o.x||label.x>=o.x+o.width+clearance||y+label.height+clearance<=o.y||y>=o.y+o.height+clearance);
  const target=[...new Set(candidates)].filter(safe).sort((a,b)=>Math.abs(a-label.y)-Math.abs(b-label.y)||a-b)[0];
  if(target===undefined||target===label.y)continue;
  moves.push({objectId:label.id,from:{x:label.x,y:label.y},to:{x:label.x,y:target}});label.y=target;
 }
 const validated:VisualDesign=parseDesign(design),unresolved=designLayoutFindings(validated);
 return {schemaVersion:'label-layout-proposal:1' as const,status:'proposal' as const,accepted:false as const,
  originalDesignSha256:designHash(original),proposedDesignSha256:designHash(validated),
  policy:{axis:'vertical-only' as const,clearance,maxDistance,scope:'Affected independent labels only; paths, typography, animation and aesthetic quality are not solved.'},
  layoutPreflight:unresolved.length?'failed' as const:'passed' as const,moves,unresolved,design:validated};
}
