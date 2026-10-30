// Finds filled shapes (cards, panels, badges) that partly cover each other — the geometry audit only checks text.
// Copied into the render bundle like geometry-audit.ts, so it must stay free of Node APIs.

export type PanelBox={target:string;x:number;y:number;width:number;height:number};
export type PanelIssue={kind:'panel-overlap';target:string;detail:string};

const CANVAS_AREA=1920*1080;
const MIN_AREA=12000;          // smaller than a ~110×110 badge is decoration, not a panel
const MAX_AREA=CANVAS_AREA*0.6; // full-canvas backgrounds and grids
const MIN_SHARE=0.05,CONTAINED_SHARE=0.9; // share of the smaller box that is covered

/** Pairs that partly overlap. A box fully inside another (a card on a panel) is layout, not a collision. */
export function analyzePanels(boxes:readonly PanelBox[]):PanelIssue[]{
 const panels=boxes.filter(b=>{const a=b.width*b.height;return a>=MIN_AREA&&a<=MAX_AREA;});
 const issues:PanelIssue[]=[];
 for(let i=0;i<panels.length;i++)for(let j=i+1;j<panels.length;j++){
  const a=panels[i],b=panels[j];
  const w=Math.min(a.x+a.width,b.x+b.width)-Math.max(a.x,b.x),h=Math.min(a.y+a.height,b.y+b.height)-Math.max(a.y,b.y);
  if(w<=0||h<=0)continue;
  const share=w*h/Math.min(a.width*a.height,b.width*b.height);
  if(share<MIN_SHARE||share>=CONTAINED_SHARE)continue;
  issues.push({kind:'panel-overlap',target:a.target,detail:`Shape partly covers ${b.target} (${Math.round(share*100)}% of the smaller one).`});
  if(issues.length>=40)return issues;
 }
 return issues;
}

/** Browser adapter: visible filled shapes in root SVG coordinates, named by their own or nearest ancestor id. */
export function measurePanels(svg:SVGSVGElement):PanelIssue[]{
 const view=svg.ownerDocument.defaultView,root=svg.getScreenCTM();
 if(!view||!root)return [];
 const inverse=root.inverse();
 const visible=(el:Element):number=>{
  let value=1;
  for(let node:Element|null=el;node&&node!==svg.parentElement;node=node.parentElement){
   const style=view.getComputedStyle(node);
   if(style.display==='none'||style.visibility==='hidden')return 0;
   const o=Number.parseFloat(style.opacity);if(Number.isFinite(o))value*=o;
  }
  return value;
 };
 const boxes:PanelBox[]=[];
 const shapes=svg.querySelectorAll('rect,path,circle,ellipse,polygon');
 for(let index=0;index<Math.min(shapes.length,400);index++){
  const el=shapes[index] as SVGGraphicsElement;
  if(el.closest('defs,clipPath,mask,pattern'))continue;
  const style=view.getComputedStyle(el);
  const painted=(paint:string,opacity:string)=>paint!=='none'&&paint!=='transparent'&&!/rgba\(.*,\s*0\)$/.test(paint)&&!(Number.parseFloat(opacity)<=0.05);
  // A card is a filled shape, or a rectangle drawn by its outline (a nearly transparent body with a visible border).
  const outlinedRect=el.tagName.toLowerCase()==='rect'&&painted(style.stroke,style.strokeOpacity)&&Number.parseFloat(style.strokeWidth)>=1;
  if(!painted(style.fill,style.fillOpacity)&&!outlinedRect)continue;
  if(visible(el)<=0.05)continue;
  try{
   const b=el.getBBox(),ctm=el.getScreenCTM();if(!ctm)continue;
   const m=inverse.multiply(ctm);
   const points=[[b.x,b.y],[b.x+b.width,b.y],[b.x,b.y+b.height],[b.x+b.width,b.y+b.height]].map(([x,y])=>({x:m.a*x+m.c*y+m.e,y:m.b*x+m.d*y+m.f}));
   const xs=points.map(p=>p.x),ys=points.map(p=>p.y);
   // Only named objects are compared (own or nearest id, or data-object, inside this <svg> — above it is the host page).
   // Unnamed decoration (document lines, icon parts) overlaps by design and would drown the real collisions.
   let owner='';
   for(let node:Element|null=el;node&&node!==svg;node=node.parentElement){const name=node.id||node.getAttribute('data-object');if(name){owner=name;break;}}
   if(!owner)continue;
   boxes.push({target:owner,x:Math.min(...xs),y:Math.min(...ys),width:Math.max(...xs)-Math.min(...xs),height:Math.max(...ys)-Math.min(...ys)});
  }catch{}
 }
 // Shapes of the same named object (a card's body and its border) are one panel, not a collision.
 const merged=new Map<string,PanelBox>();
 for(const b of boxes){
  const m=merged.get(b.target);
  if(!m){merged.set(b.target,{...b});continue;}
  const x=Math.min(m.x,b.x),y=Math.min(m.y,b.y);
  merged.set(b.target,{target:b.target,x,y,width:Math.max(m.x+m.width,b.x+b.width)-x,height:Math.max(m.y+m.height,b.y+b.height)-y});
 }
 return analyzePanels([...merged.values()]);
}
