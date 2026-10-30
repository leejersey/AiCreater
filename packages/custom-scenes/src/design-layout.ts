import type {VisualDesign} from './design';

export type LayoutFinding={kind:'object-overlap'|'label-overlap'|'caption-area';objects:string[];detail:string};
export class LayoutPreflightError extends Error{
 readonly code='layout_preflight';
 constructor(readonly findings:LayoutFinding[]){super('visual_design: layout preflight failed: '+findings.slice(0,8).map(f=>f.detail).join(' '));}
}
const pair=(a:string,b:string)=>JSON.stringify([a,b].sort());

/** Conservative plan bounds, not an aesthetic verdict or animation simulation. */
export function designLayoutFindings(design:VisualDesign):LayoutFinding[]{
 const allowed=new Set((design.overlaps??[]).map(p=>pair(p.a,p.b))),findings:LayoutFinding[]=[];
 for(const [i,a] of design.objects.entries()){
  if(a.y+a.height>980)findings.push({kind:'caption-area',objects:[a.id],detail:`${a.id} enters the caption area at y=${a.y+a.height}; reserve y=980..1080.`});
  for(const b of design.objects.slice(i+1)){
   // A route's rectangular extent is not its visible stroke; rendered checks handle it.
   if(a.kind==='path'||b.kind==='path')continue;
   const w=Math.min(a.x+a.width,b.x+b.width)-Math.max(a.x,b.x);
   const h=Math.min(a.y+a.height,b.y+b.height)-Math.max(a.y,b.y);
   if(a.kind==='label'||b.kind==='label'){
    if(w>0&&h>0)findings.push({kind:'label-overlap',objects:[a.id,b.id],detail:`Independent label ${a.kind==='label'?a.id:b.id} overlaps ${a.kind==='label'?b.id:a.id} by ${w}x${h}px; move its bounds into clear space. Assembly and overlap declarations cannot waive label safety.`});
    continue;
   }
   if(a.parentId===b.id||b.parentId===a.id)continue;
   if(w<=4||h<=4||w*h<Math.min(a.width*a.height,b.width*b.height)*.12||allowed.has(pair(a.id,b.id)))continue;
   findings.push({kind:'object-overlap',objects:[a.id,b.id],detail:`${a.id} overlaps ${b.id} by ${w}x${h}px. Separate silhouettes, declare parentId for a permanent part, or declare a specific intentional overlap reason.`});
  }
 }
 return findings;
}

export function assertDesignLayout(design:VisualDesign):void{
 const findings=designLayoutFindings(design);
 if(findings.length)throw new LayoutPreflightError(findings);
}
