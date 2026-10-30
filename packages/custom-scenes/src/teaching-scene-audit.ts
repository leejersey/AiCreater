import {analyzeGeometry,type GeometryRecord,type GeometryBox} from './geometry-audit';
import {evaluateMotion} from './motion-plan';
import type {TeachingArtifact} from './teaching-artifact';
import type {SvgNode} from './motion-assembly';

export function teachingAncestorsVisible(styles:{display:string;visibility:string;opacity:string}[]){
 let opacity=1;
 for(const style of styles){
  const value=Number(style.opacity);
  if(style.display==='none'||style.visibility!=='visible'||style.opacity.trim()===''||!Number.isFinite(value)||value<0||value>1)return false;
  opacity*=value;
 }
 return styles.length>0&&opacity>=.95;
}

export function teachingNumericAttributeMatches(actual:string|null,expected:number){
 return actual!==null&&actual.trim()!==''&&Number.isFinite(Number(actual))&&Math.abs(Number(actual)-expected)<=.001;
}
export function teachingTitleLineMatches(layout:TeachingArtifact['titleLayout'],index:number,x:string|null,y:string|null,matrix:{a:number;b:number;c:number;d:number;e:number;f:number}){
 return Number.isInteger(index)&&index>=0&&index<layout.lines.length&&teachingNumericAttributeMatches(x,layout.box.x)&&teachingNumericAttributeMatches(y,layout.box.y+layout.baselineOffset+index*layout.lineHeight)&&
  (['a','b','c','d','e','f'] as const).every(k=>Number.isFinite(matrix[k])&&Math.abs(matrix[k]-(k==='a'||k==='d'?1:0))<=.001);
}
export function teachingPaintMatches(expected:string,actual:string,opacity:string){
 const color=(value:string)=>{
  if(value==='none')return 'none';
  if(/^#[a-f0-9]{6}$/i.test(value))return value.toLowerCase();
  const m=/^rgb\(\s*(\d+),\s*(\d+),\s*(\d+)\s*\)$/.exec(value);
  return m&&m.slice(1).every(n=>Number(n)<=255)?'#'+m.slice(1).map(n=>Number(n).toString(16).padStart(2,'0')).join(''):null;
 };
 return color(expected)!==null&&color(expected)===color(actual)&&(expected==='none'||teachingNumericAttributeMatches(opacity,1));
}
export function expectedTeachingSolids(artifact:TeachingArtifact){
 const moving=new Set(artifact.compiled.transports.map(t=>t.objectId));
 return artifact.compiled.objects.filter(o=>!moving.has(o.id)).flatMap(o=>o.asset.solids.map((s,i)=>({id:o.id+'-'+i,owner:o.id,bbox:{...s,x:o.initial.x+s.x,y:o.initial.y+s.y}})));
}
export function checkTeachingSolids(expected:ReturnType<typeof expectedTeachingSolids>,actual:{id:string|null;owner:string|null;bbox:GeometryBox}[]){
 return actual.length!==expected.length||new Set(actual.map(s=>s.id)).size!==expected.length||expected.some(e=>{
  const a=actual.find(a=>a.id===e.id&&a.owner===e.owner);
  return !a||(['x','y','width','height'] as const).some(k=>!Number.isFinite(a.bbox[k])||Math.abs(a.bbox[k]-e.bbox[k])>.01);
 })?[{kind:'solid-coverage',target:'scene',detail:'Missing, duplicate or altered frozen intrinsic solid'}]:[];
}

export function expectedTeachingForeground(artifact:TeachingArtifact,frame:number){
 const moving=new Set(artifact.compiled.transports.map(t=>t.objectId)),specs:{id:string;owner:string;node:SvgNode}[]=[];
 for(const o of artifact.compiled.objects.filter(o=>!moving.has(o.id))){
  let state=o.asset.state;
  for(const e of artifact.compiled.schedule.events)if(e.kind==='transition'&&e.objectId===o.id&&frame>=e.endFrame-1)state=e.toState!;
  const visit=(node:SvgNode,key:string)=>{specs.push({id:o.id+'-'+key,owner:o.id,node});node.children?.forEach((n,i)=>visit(n,key+'-'+i));};
  o.states.find(a=>a.state===state)!.front.forEach((n,i)=>visit(n,'front'+i));
 }
 return specs;
}
export function checkTeachingForeground(expected:ReturnType<typeof expectedTeachingForeground>,actual:{id:string|null;owner:string|null;tag:string}[]){
 const ids=new Set(actual.map(a=>a.id));
 return actual.length!==expected.length||ids.size!==expected.length||expected.some(e=>!actual.some(a=>a.id===e.id&&a.owner===e.owner&&a.tag===e.node.tag))?
  [{kind:'foreground-coverage',target:'scene',detail:'Missing, duplicate or unrelated frozen foreground geometry'}]:[];
}

export function measureTeachingScene(svg:SVGSVGElement,artifact:TeachingArtifact,frame:number){
 const issues:{kind:string;target:string;detail:string}[]=[];
 const add=(kind:string,target:string,detail:string)=>{if(issues.length<200)issues.push({kind,target,detail});};
 const c=artifact.compiled,records:GeometryRecord[]=[],poses=evaluateMotion(c.motion,frame),moving=new Set(c.transports.map(t=>t.objectId));
 const active=c.transports.filter(t=>frame>=t.startFrame&&frame<t.endFrame);
 let labels=0,solids=0,occlusionChecks=0,foreground=0;
 try{
  const matrix=svg.getScreenCTM();if(!matrix)throw Error('Missing root transform');const inverse=matrix.inverse();
  const bb=(el:SVGGraphicsElement):GeometryBox=>{
   const local=el.getBBox(),ctm=el.getScreenCTM();if(!ctm)throw Error('Missing element transform');
   const m=inverse.multiply(ctm),points=[[local.x,local.y],[local.x+local.width,local.y],[local.x,local.y+local.height],[local.x+local.width,local.y+local.height]].map(([x,y])=>({x:m.a*x+m.c*y+m.e,y:m.b*x+m.d*y+m.f}));
   const xs=points.map(p=>p.x),ys=points.map(p=>p.y),x=Math.min(...xs),y=Math.min(...ys);
   if(!points.every(p=>Number.isFinite(p.x)&&Number.isFinite(p.y)))throw Error('Nonfinite actual transform');
   return {x,y,width:Math.max(...xs)-x,height:Math.max(...ys)-y};
  };
  const inside=(a:GeometryBox,b:GeometryBox)=>b.x>=a.x-.01&&b.y>=a.y-.01&&b.x+b.width<=a.x+a.width+.01&&b.y+b.height<=a.y+a.height+.01;
  const visible=(el:Element)=>{const styles:CSSStyleDeclaration[]=[];for(let p:Element|null=el;p;p=p.parentElement)styles.push(getComputedStyle(p));return teachingAncestorsVisible(styles);};
  if(!visible(svg))add('scene-hidden','scene','Scene or an ancestor is hidden or transparent');
  const fonts=svg.ownerDocument.fonts;
  let fontLoaded=false;
  (fonts as FontFaceSet&{forEach(callback:(face:FontFace)=>void):void}).forEach(f=>{if(f.family.includes('Noto Sans SC')&&f.status==='loaded')fontLoaded=true;});
  if(!fontLoaded)add('font-not-loaded','scene','The bound font was not loaded');
  const owners=Array.from(svg.querySelectorAll<SVGGraphicsElement>('[data-teaching-object]'));
  if(owners.length!==c.objects.length||new Set(owners.map(o=>o.getAttribute('data-teaching-object'))).size!==c.objects.length)add('identity-coverage','scene','Missing or duplicate host identities');
  const occluders=Array.from(svg.querySelectorAll<SVGGeometryElement>('[data-occluder-owner]')).map(el=>({el,bounds:bb(el),style:getComputedStyle(el)}));
  const specs=expectedTeachingForeground(artifact,frame);foreground=occluders.length;
  issues.push(...checkTeachingForeground(specs,occluders.map(s=>({id:s.el.getAttribute('data-occluder-id'),owner:s.el.getAttribute('data-occluder-owner'),tag:s.el.tagName.toLowerCase()}))));
  const attributeNames:Record<string,string>={strokeWidth:'stroke-width',strokeLinecap:'stroke-linecap',strokeLinejoin:'stroke-linejoin',fillOpacity:'fill-opacity',strokeOpacity:'stroke-opacity'};
  for(const spec of specs){
   const measured=occluders.find(s=>s.el.getAttribute('data-occluder-id')===spec.id);if(!measured)continue;
   for(const [name,value] of Object.entries(spec.node.attrs)){
    const actual=measured.el.getAttribute(attributeNames[name]??name),expected=(name==='fill'||name==='stroke')&&value!=='none'?artifact.binding.theme[value as keyof typeof artifact.binding.theme]:value;
    if(typeof expected==='number'?!teachingNumericAttributeMatches(actual,expected):actual!==String(expected))add('foreground-geometry',spec.id,'Rendered paint differs from frozen geometry');
   }
   for(const paint of ['fill','stroke'] as const){
    const token=spec.node.attrs[paint]??(paint==='fill'?'ink':'none');
    const expected=token==='none'?'none':artifact.binding.theme[token as keyof typeof artifact.binding.theme];
    if(!teachingPaintMatches(String(expected),measured.style[paint],measured.style[paint+'Opacity' as 'fillOpacity'|'strokeOpacity']))add('foreground-paint',spec.id,'Effective CSS paint differs from frozen geometry');
   }
   if(spec.node.attrs.strokeWidth!==undefined&&!teachingNumericAttributeMatches(measured.style.strokeWidth.replace(/px$/,''),Number(spec.node.attrs.strokeWidth)))add('foreground-paint',spec.id,'Effective stroke width differs from frozen geometry');
   if(!visible(measured.el))add('foreground-hidden',spec.id,'Required foreground or an ancestor was hidden');
  }
  for(const o of c.objects){
   const owner=owners.find(el=>el.getAttribute('data-teaching-object')===o.id);
   let state=o.asset.state;for(const e of c.schedule.events)if(e.kind==='transition'&&e.objectId===o.id&&frame>=e.endFrame-1)state=e.toState!;
   if(!owner||owner.getAttribute('data-component-state')!==state){add('state-coverage',o.id,'Rendered state differs from the frozen state track');continue;}
   const label=owner.querySelector<SVGGElement>('[data-label-owner]'),a=o.states.find(a=>a.state===state)!;
   if(!label||label.textContent!==a.text.lines.join(''))add('label-content',o.id,'Frozen label text missing or changed');
   const transform=owner.getScreenCTM();if(!transform)throw Error('Missing identity transform');
   const actual=inverse.multiply(transform),p=poses[o.id];
   if(Math.abs(actual.e-p.x)>.01||Math.abs(actual.f-p.y)>.01||Math.abs(actual.a-1)>.001||Math.abs(actual.d-1)>.001||Math.abs(actual.b)>.001||Math.abs(actual.c)>.001)add('pose-mismatch',o.id,'Actual DOM pose differs from compiled pose');
   const residency=c.residencies.find(r=>r.objectId===o.id&&frame>=r.startFrame&&frame<r.endFrame);
   const wrapper=owner.parentElement;
   if(moving.has(o.id)&&(wrapper?.getAttribute('data-residence')??null)!==(residency?.receiverId??null))add('residence-mismatch',o.id,'Actual clipping owner differs from compiled residence');
   let clipBox:GeometryBox|undefined;
   if(residency){
    const clip=wrapper?.getAttribute('clip-path')??'',match=/^url\(#([a-z0-9-]+)\)$/.exec(clip);
    const rect=match?svg.querySelector<SVGRectElement>('#'+match[1]+' rect'):null;
    if(!rect)add('clip-coverage',o.id,'Resident label has no measurable receiving clip');else clipBox=bb(rect);
   }
   for(const [i,text] of Array.from(label?.querySelectorAll<SVGTextElement>('text')??[]).entries()){
    if(!text.textContent?.trim())continue;labels++;
    const bounds=bb(text),target='label-'+o.id+'-'+i,style=getComputedStyle(text);
    if(!visible(text)||!teachingPaintMatches(artifact.binding.theme.foreground,style.fill,style.fillOpacity)||Number.parseFloat(style.fontSize)<16)add('hidden-label',target,'Label is hidden or below the readable font policy');
    const textRegion={...a.text.box,x:p.x+a.text.box.x,y:p.y+a.text.box.y};
    if(!inside(textRegion,bounds))add('label-region',target,'Actual glyph bounds exceed the host text region: '+JSON.stringify({actual:bounds,region:textRegion,fontSize:style.fontSize}));
    if(clipBox&&!inside(clipBox,bounds))add('label-clipped',target,'Receiving clip cuts actual glyph bounds');
    records.push({kind:'label',target,bbox:bounds,object:o.id});
    for(const shape of occluders){
     if(shape.el.getAttribute('data-occluder-owner')===o.id||!(text.compareDocumentPosition(shape.el)&Node.DOCUMENT_POSITION_FOLLOWING))continue;
     occlusionChecks++;
     const fill=shape.style.fill!=='none'&&Number(shape.style.fillOpacity)>.05,stroke=shape.style.stroke!=='none'&&Number(shape.style.strokeOpacity)>.05;
     if(!fill&&!stroke)continue;
     const pad=stroke?Number.parseFloat(shape.style.strokeWidth)/2:0,b=shape.bounds;
     const left=Math.max(bounds.x,b.x-pad),right=Math.min(bounds.x+bounds.width,b.x+b.width+pad),top=Math.max(bounds.y,b.y-pad),bottom=Math.min(bounds.y+bounds.height,b.y+b.height+pad);
     if(left>=right||top>=bottom)continue;
     if((right-left)*(bottom-top)*4>5000){add('occlusion-limit',target,'Occlusion coverage exceeded bounded sampling');continue;}
     if(typeof shape.el.isPointInFill!=='function'||typeof shape.el.isPointInStroke!=='function'){add('occlusion-unsupported',target,'Occluder is not measurable SVG geometry');continue;}
     const toLocal=shape.el.getScreenCTM()!.inverse().multiply(matrix);let hit=false;
     for(let y=top+.25;y<bottom&&!hit;y+=.5)for(let x=left+.25;x<right;x+=.5){
      const point=new DOMPoint(x,y).matrixTransform(toLocal);
      if((fill&&shape.el.isPointInFill(point))||(stroke&&shape.el.isPointInStroke(point))){hit=true;break;}
     }
     if(hit)add('label-occluded',target,'Later receiver foreground covers the label region');
    }
   }
  }
  const title=svg.querySelector<SVGGElement>('[data-scene-title]');
  if(!title||title.textContent!==artifact.brief.title)add('title-content','title','Frozen scene title is missing');
  else {
   const lines=Array.from(title.querySelectorAll<SVGTextElement>('text')),layout=artifact.titleLayout;
   if(lines.length!==layout.lines.length)add('title-content','title','Frozen title line coverage differs');
   for(const [i,line] of lines.entries()){
    const style=getComputedStyle(line);
    if(line.textContent!==layout.lines[i]||line.getAttribute('data-title-line')!==String(i))add('title-content','title','Frozen title line changed');
    const lineMatrix=line.getScreenCTM();
    if(!lineMatrix||!teachingTitleLineMatches(layout,i,line.getAttribute('x'),line.getAttribute('y'),inverse.multiply(lineMatrix)))add('title-placement','title','Title line differs from its frozen baseline or transform');
    if(!visible(line)||!teachingPaintMatches(artifact.binding.theme.foreground,style.fill,style.fillOpacity)||Number.parseFloat(style.fontSize)!==layout.size)add('hidden-label','title','Title or an ancestor is hidden or resized');
    if(!inside(layout.box,bb(line)))add('title-region','title','Actual title glyphs exceed the frozen header');
   }
   records.push({kind:'label',target:'title',bbox:bb(title)});
  }
  const measuredSolids:{id:string|null;owner:string|null;bbox:GeometryBox}[]=[];
  for(const [i,rect] of Array.from(svg.querySelectorAll<SVGGraphicsElement>('[data-solid-owner]')).entries()){
   solids++;const owner=rect.getAttribute('data-solid-owner')!,o=c.objects.find(o=>o.id===owner),id=rect.getAttribute('data-solid-id'),index=Number(id?.slice(owner.length+1));
   const expected=o?.asset.solids[index],actual=bb(rect);
   measuredSolids.push({id,owner,bbox:actual});
   if(!o||!expected||id!==owner+'-'+index||!inside({...expected,x:o.initial.x+expected.x,y:o.initial.y+expected.y},actual)||!inside(actual,{...expected,x:o.initial.x+expected.x,y:o.initial.y+expected.y}))add('solid-geometry',owner,'Rendered intrinsic solid differs from its frozen declaration');
   records.push({kind:'obstacle',target:'solid-'+i,bbox:actual,object:owner});
  }
  issues.push(...checkTeachingSolids(expectedTeachingSolids(artifact),measuredSolids));
  for(const path of Array.from(svg.querySelectorAll<SVGPathElement>('[data-route]'))){
   const length=path.getTotalLength(),m=inverse.multiply(path.getScreenCTM()!);
   const points=Array.from({length:length===0?1:17},(_,i)=>{const p=path.getPointAtLength(length*i/16);return {x:m.a*p.x+m.c*p.y+m.e,y:m.b*p.x+m.d*p.y+m.f};});
   records.push({kind:'route',target:path.id,id:path.id,points});
  }
  for(const node of Array.from(svg.querySelectorAll<SVGGraphicsElement>('[data-follow-path]'))){
   const m=inverse.multiply(node.getScreenCTM()!);records.push({kind:'mover',target:node.getAttribute('data-teaching-object')!,routeId:node.getAttribute('data-follow-path')!,anchor:{x:m.e,y:m.f}});
  }
  const legacy=analyzeGeometry(records);issues.push(...legacy.issues);
  if(legacy.routes!==active.length||legacy.movers!==active.length)add('motion-coverage','scene','Actual route/mover count differs from the active frozen transport');
  return {frame,status:issues.length?'failed' as const:'passed' as const,issues,labels,solids,foreground,occlusionChecks,routes:legacy.routes,movers:legacy.movers,legacy};
 }catch(error){add('measurement-failed','scene',error instanceof Error?error.message:'DOM measurement failed');return {frame,status:'failed' as const,issues,labels,solids,foreground,occlusionChecks,routes:0,movers:0};}
}
