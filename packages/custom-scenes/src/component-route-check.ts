import type {VisualDesign} from './design';
import {parseComponentMotionData} from './component-motion';
import {evaluateMotion} from './motion-plan';

type Finding={kind:'path-deviation'|'unsupported-route';routeId:string;objectId:string;firstFrame:number;worstFrame:number;maxDistance:number|null};

/** Exact origin-to-segment check for the host's straight route component, not collision/contact acceptance. */
export function componentRouteFindings(value:unknown,design:VisualDesign):Finding[]{
 const assembly=parseComponentMotionData(value,design);
 const data=value as {objects:{id:string;component:string}[]};
 const components=new Map(data.objects.map(o=>[o.id,o.component]));
 const sizes=new Map(design.objects.map(o=>[o.id,o]));
 const frames=new Map<number,ReturnType<typeof evaluateMotion>>();
 const at=(frame:number)=>{if(!frames.has(frame))frames.set(frame,evaluateMotion(assembly.plan,frame));return frames.get(frame)!;};
 const findings:Finding[]=[];
 for(const route of assembly.audit?.routes??[]){
  for(const follower of route.followers){
   if(components.get(route.layerId)!=='route'||route.nodePath.length!==1||route.nodePath[0]!==0){
    findings.push({kind:'unsupported-route',routeId:route.id,objectId:follower.objectId,firstFrame:follower.startFrame,worstFrame:follower.startFrame,maxDistance:null});continue;
   }
   const size=sizes.get(route.layerId)!;let first=-1,worst=follower.startFrame,max=0;
   for(let frame=follower.startFrame;frame<follower.endFrame;frame++){
    const poses=at(frame),line=poses[route.layerId],point=poses[follower.objectId];
    const left=line.x,right=line.x+size.width*line.scale,y=line.y+size.height*.5*line.scale;
    const distance=Math.hypot(point.x-Math.max(left,Math.min(right,point.x)),point.y-y);
    if(distance>2&&first<0)first=frame;
    if(distance>max){max=distance;worst=frame;}
   }
   if(first>=0)findings.push({kind:'path-deviation',routeId:route.id,objectId:follower.objectId,firstFrame:first,worstFrame:worst,maxDistance:max});
  }
 }
 return findings;
}
