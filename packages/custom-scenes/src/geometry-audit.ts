export type GeometryAudit = {
  issues:{kind:string;target:string;detail:string}[];
  labels:number;movers:number;routes:number;obstacles:number;
};
export function hasCompleteSvgCoverage(root:HTMLElement):boolean {
  const svgs=root.querySelectorAll('svg');
  if(svgs.length!==1||root.children.length!==1||root.firstElementChild!==svgs[0])return false;
  return Array.from(root.childNodes).every(node=>node===svgs[0]||node.nodeType===8||(node.nodeType===3&&!node.textContent?.trim()));
}
export type GeometryPoint = {x:number;y:number};
export type GeometryBox = GeometryPoint & {width:number;height:number};
export type GeometryRecord =
  | {kind:'label'|'obstacle';target:string;bbox:GeometryBox;object?:string}
  | {kind:'route';target:string;id:string;points:GeometryPoint[]}
  | {kind:'mover';target:string;routeId:string;anchor:GeometryPoint};

const MAX_RECORDS=256,MAX_POINTS=1025,MAX_ISSUES=200;
const emptyAudit=():GeometryAudit=>({issues:[],labels:0,movers:0,routes:0,obstacles:0});
function issue(audit:GeometryAudit,kind:string,target:string,detail:string) {
  if(audit.issues.length<MAX_ISSUES) audit.issues.push({kind,target,detail});
  else if(!audit.issues.some(i=>i.kind==='audit-limit'&&i.target==='audit')) {
    audit.issues.push({kind:'audit-limit',target:'audit',detail:'Issue limit reached; additional problems omitted.'});
  }
}
const finitePoint=(p:GeometryPoint)=>Number.isFinite(p.x)&&Number.isFinite(p.y);
const finiteBox=(b:GeometryBox)=>finitePoint(b)&&Number.isFinite(b.width)&&Number.isFinite(b.height)
  &&b.width>=0&&b.height>=0&&Number.isFinite(b.x+b.width)&&Number.isFinite(b.y+b.height);
function bounds(points:GeometryPoint[]):GeometryBox {
  const xs=points.map(p=>p.x),ys=points.map(p=>p.y);
  const x=Math.min(...xs),y=Math.min(...ys);
  return {x,y,width:Math.max(...xs)-x,height:Math.max(...ys)-y};
}
function overlaps(a:GeometryBox,b:GeometryBox) {
  return a.x<b.x+b.width&&b.x<a.x+a.width&&a.y<b.y+b.height&&b.y<a.y+a.height;
}
function pointDistance(p:GeometryPoint,a:GeometryPoint,b:GeometryPoint) {
  const dx=b.x-a.x,dy=b.y-a.y,length=dx*dx+dy*dy;
  const t=length===0?0:Math.max(0,Math.min(1,((p.x-a.x)*dx+(p.y-a.y)*dy)/length));
  return Math.hypot(p.x-a.x-t*dx,p.y-a.y-t*dy);
}
function segmentHitsBox(a:GeometryPoint,b:GeometryPoint,box:GeometryBox) {
  let lo=0,hi=1;
  for(const [start,delta,min,max] of [
    [a.x,b.x-a.x,box.x,box.x+box.width],
    [a.y,b.y-a.y,box.y,box.y+box.height],
  ]) {
    if(delta===0){if(start<min||start>max)return false;}
    else {
      const t1=(min-start)/delta,t2=(max-start)/delta;
      lo=Math.max(lo,Math.min(t1,t2));hi=Math.min(hi,Math.max(t1,t2));
      if(lo>hi)return false;
    }
  }
  return true;
}

/** Pure analysis of visible geometry already expressed in root SVG user coordinates. */
export function analyzeGeometry(records:readonly GeometryRecord[]):GeometryAudit {
  const audit=emptyAudit();
  if(records.length>MAX_RECORDS)issue(audit,'audit-limit','records',`Only the first ${MAX_RECORDS} geometry records were audited.`);
  const labels:Extract<GeometryRecord,{bbox:GeometryBox}>[]=[],obstacles:typeof labels=[];
  const routes=new Map<string,{target:string;points:GeometryPoint[];bbox:GeometryBox}>();
  const movers:Extract<GeometryRecord,{kind:'mover'}>[]=[];
  for(const record of records.slice(0,MAX_RECORDS)) {
    if(record.kind==='label'||record.kind==='obstacle') {
      if(record.kind==='label'&&finiteBox(record.bbox)&&(!record.bbox.width||!record.bbox.height))continue;
      if(record.kind==='label')audit.labels++;else audit.obstacles++;
      if(!finiteBox(record.bbox)){issue(audit,'invalid-geometry',record.target,'Non-finite or negative bounding box.');continue;}
      (record.kind==='label'?labels:obstacles).push(record);
    } else if(record.kind==='route') {
      audit.routes++;
      if(record.points.length>MAX_POINTS)issue(audit,'audit-limit',record.target,`Route polyline reduced to ${MAX_POINTS} points; approximate.`);
      const count=Math.min(record.points.length,MAX_POINTS);
      const points=Array.from({length:count},(_,i)=>record.points[Math.round(i*(record.points.length-1)/Math.max(1,count-1))]);
      if(!points.length||!points.every(finitePoint)){issue(audit,'invalid-geometry',record.target,'Route requires finite sampled points.');continue;}
      if(!record.id){issue(audit,'invalid-geometry',record.target,'Route has no id and cannot be followed.');continue;}
      if(routes.has(record.id)){issue(audit,'invalid-geometry',record.target,'Duplicate route id; the first measured route is used.');continue;}
      routes.set(record.id,{target:record.target,points,bbox:bounds(points)});
    } else if(record.kind==='mover') {
      audit.movers++;
      if(!finitePoint(record.anchor)){issue(audit,'invalid-geometry',record.target,'Mover local origin could not be transformed.');continue;}
      movers.push(record);
    }
  }
  for(let i=0;i<labels.length;i++) {
    const label=labels[i],b=label.bbox;
    if(b.x<0||b.y<0||b.x+b.width>1920||b.y+b.height>980) {
      issue(audit,'label-out-of-bounds',label.target,'Label exceeds 0..1920 x 0..980 caption-safe area (approximate root-coordinate bbox).');
    }
    for(const other of labels.slice(i+1)) {
      if(label.target!==other.target&&overlaps(b,other.bbox))issue(audit,'label-overlap',label.target,`Overlaps ${other.target} (approximate axis-aligned bboxes).`);
    }
    for(const obstacle of obstacles) {
      if(label.target===obstacle.target||(label.object&&label.object===obstacle.object))continue;
      if(overlaps(b,obstacle.bbox))issue(audit,'label-obstacle',label.target,`Overlaps obstacle ${obstacle.target} (approximate axis-aligned bboxes).`);
    }
    for(const route of routes.values()) {
      // Inclusive broad phase preserves contact with horizontal or vertical routes.
      const r=route.bbox;
      if(b.x>r.x+r.width||b.x+b.width<r.x||b.y>r.y+r.height||b.y+b.height<r.y)continue;
      const hit=route.points.length===1?segmentHitsBox(route.points[0],route.points[0],b)
        :route.points.slice(1).some((point,j)=>segmentHitsBox(route.points[j],point,b));
      if(hit)issue(audit,'label-route',label.target,`Intersects route ${route.target} (approximate sampled centerline versus label bbox).`);
    }
  }
  for(const mover of movers) {
    const route=routes.get(mover.routeId);
    if(!route){issue(audit,'missing-route',mover.target,`No visible measured [data-route] geometry with id ${mover.routeId}.`);continue;}
    let distance=pointDistance(mover.anchor,route.points[0],route.points[0]);
    for(let i=1;i<route.points.length;i++)distance=Math.min(distance,pointDistance(mover.anchor,route.points[i-1],route.points[i]));
    if(distance>2)issue(audit,'path-deviation',mover.target,`Local (0,0) anchor is ${distance.toFixed(2)}px from route ${route.target}; tolerance 2px (approximate sampled path).`);
  }
  return audit;
}

type Matrix = Pick<DOMMatrix,'a'|'b'|'c'|'d'|'e'|'f'>;
const finiteMatrix=(m:Matrix)=>[m.a,m.b,m.c,m.d,m.e,m.f].every(Number.isFinite);
const transform=(p:GeometryPoint,m:Matrix):GeometryPoint=>({x:m.a*p.x+m.c*p.y+m.e,y:m.b*p.x+m.d*p.y+m.f});

/**
 * Browser DOM adapter; no Node APIs. Call after fonts and the requested frame settle.
 * Bboxes are conservative; route sampling ignores stroke width, clipping and masks.
 */
export function measureScene(svg:SVGSVGElement):GeometryAudit {
  const collection=emptyAudit(),records:GeometryRecord[]=[];
  const view=svg.ownerDocument.defaultView;
  let inverse:DOMMatrix;
  try {
    const root=svg.getScreenCTM();
    if(!view||!root)throw new Error('Unavailable SVG viewport');
    inverse=root.inverse();
    if(!finiteMatrix(inverse))throw new Error('Singular SVG transform');
  } catch {
    issue(collection,'measurement-failed','svg','Root SVG coordinate transform is unavailable or singular.');
    return collection;
  }
  const visibility=new Map<Element,number>(),objects=new Map<Element,string>();
  function opacity(el:Element):number {
    const cached=visibility.get(el);if(cached!==undefined)return cached;
    const style=view!.getComputedStyle(el),own=Number.parseFloat(style.opacity);
    const hidden=style.display==='none'||style.visibility==='hidden'||style.visibility==='collapse';
    const value=hidden?0:(Number.isFinite(own)?own:1)*(el.parentElement?opacity(el.parentElement):1);
    visibility.set(el,value);return value;
  }
  const elements=svg.querySelectorAll('text,[data-obstacle],[data-route],[data-follow-path]');
  if(elements.length>MAX_RECORDS)issue(collection,'audit-limit','elements',`Only the first ${MAX_RECORDS} candidate elements were collected, including hidden candidates.`);
  for(let index=0;index<Math.min(elements.length,MAX_RECORDS);index++) {
    const el=elements[index] as SVGGraphicsElement;
    const target=el.id||`${el.tagName.toLowerCase()}[${index}]`;
    try {
      if(opacity(el)<=0.05)continue;
      const ctm=el.getScreenCTM();
      if(!ctm)throw new Error('Missing transform');
      const matrix=inverse.multiply(ctm);
      if(!finiteMatrix(matrix))throw new Error('Invalid transform');
      const object=el.closest('[data-object]');
      if(object&&!objects.has(object))objects.set(object,`object-${objects.size}`);
      const objectKey=object?objects.get(object):undefined;
      const label=el.tagName.toLowerCase()==='text'&&!!el.textContent?.trim();
      if(label||el.hasAttribute('data-obstacle')) {
        const b=el.getBBox();
        const bbox=bounds([
          {x:b.x,y:b.y},{x:b.x+b.width,y:b.y},
          {x:b.x,y:b.y+b.height},{x:b.x+b.width,y:b.y+b.height},
        ].map(p=>transform(p,matrix)));
        if(label)records.push({kind:'label',target,bbox,object:objectKey});
        if(el.hasAttribute('data-obstacle'))records.push({kind:'obstacle',target,bbox,object:objectKey});
      }
      if(el.hasAttribute('data-route')) {
        const geometry=el as SVGGeometryElement;
        if(typeof geometry.getTotalLength!=='function'||typeof geometry.getPointAtLength!=='function')throw new Error('Route is not SVG geometry');
        const length=geometry.getTotalLength();
        if(!Number.isFinite(length)||length<0)throw new Error('Invalid route length');
        const count=length===0?1:MAX_POINTS;
        const points=Array.from({length:count},(_,i)=>transform(geometry.getPointAtLength(length*i/Math.max(1,count-1)),matrix));
        records.push({kind:'route',target,id:el.id,points});
      }
      const routeId=el.getAttribute('data-follow-path');
      if(routeId!==null)records.push({kind:'mover',target,routeId,anchor:transform({x:0,y:0},matrix)});
    } catch {
      issue(collection,'measurement-failed',target,'Unable to collect SVG geometry; audit is incomplete for this element.');
    }
  }
  const audit=analyzeGeometry(records);
  for(const problem of collection.issues)issue(audit,problem.kind,problem.target,problem.detail);
  return audit;
}

export type GeometryCoverageSummary = {
  status:'passed'|'partial'|'failed';
  issueCount:number;
  motionChecks:number;
  routeChecks:number;
  unsupportedFrames:number;
  coverageGaps:{kind:string;target:string;detail:string}[];
};

export function summarizeGeometryCoverage(frames:Record<string|number,GeometryAudit&{unsupported?:boolean}>):GeometryCoverageSummary {
  const entries=Object.values(frames);
  const issueCount=entries.reduce((n,a)=>n+a.issues.length,0);
  const motionChecks=entries.reduce((n,a)=>n+a.movers,0);
  const routeChecks=entries.reduce((n,a)=>n+a.routes,0);
  const unsupportedFrames=entries.filter(a=>a.unsupported).length;
  const coverageGaps:{kind:string;target:string;detail:string}[]=[];
  if(!entries.length||motionChecks===0) {
    coverageGaps.push({
      kind:'missing-motion-coverage',
      target:'data-follow-path',
      detail:routeChecks>0
        ?'Declared [data-route] elements were rendered without any measured [data-follow-path] mover; zero issues from zero measured movers is partial coverage, not passed.'
        :'No [data-follow-path] movers were measured across sampled frames; motion path adherence is unverified (partial coverage).',
    });
  }
  if(unsupportedFrames>0) {
    coverageGaps.push({
      kind:'unsupported-dom-coverage',
      target:'svg',
      detail:'One or more sampled frames lacked a single complete root SVG; geometry coverage is partial.',
    });
  }
  const status=issueCount>0?'failed':entries.length>0&&motionChecks>0&&unsupportedFrames===0?'passed':'partial';
  return {status,issueCount,motionChecks,routeChecks,unsupportedFrames,coverageGaps};
}
