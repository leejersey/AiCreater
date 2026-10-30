// Where each audited label actually is, and what it says, so findings can tell a model which text to move and how far.
// Copied into the render bundle; no Node APIs. Targets are named exactly like geometry-audit.ts's measureScene.

export type LabelBox={x:number;y:number;width:number;height:number;text:string};

export function measureLabels(svg:SVGSVGElement):Record<string,LabelBox>{
 const root=svg.getScreenCTM();
 if(!root)return {};
 const inverse=root.inverse();
 const out:Record<string,LabelBox>={};
 const elements=svg.querySelectorAll('text,[data-obstacle],[data-route],[data-follow-path]');
 for(let index=0;index<Math.min(elements.length,256);index++){
  const el=elements[index] as SVGGraphicsElement;
  if(el.tagName.toLowerCase()!=='text'||!el.textContent?.trim())continue;
  try{
   const b=el.getBBox(),ctm=el.getScreenCTM();if(!ctm)continue;
   const m=inverse.multiply(ctm);
   const points=[[b.x,b.y],[b.x+b.width,b.y],[b.x,b.y+b.height],[b.x+b.width,b.y+b.height]].map(([x,y])=>({x:m.a*x+m.c*y+m.e,y:m.b*x+m.d*y+m.f}));
   const xs=points.map(p=>p.x),ys=points.map(p=>p.y);
   out[el.id||`text[${index}]`]={x:Math.min(...xs),y:Math.min(...ys),width:Math.max(...xs)-Math.min(...xs),height:Math.max(...ys)-Math.min(...ys),text:el.textContent.trim().replace(/\s+/g,' ').slice(0,24)};
  }catch{}
 }
 return out;
}

const r=(v:number)=>Math.round(v);
/** "text[5] "BM25 稀疏检索" at x 300–520, y 480–520" */
export function describeLabel(target:string,box:LabelBox):string{
 return `${target} "${box.text}" at x ${r(box.x)}–${r(box.x+box.width)}, y ${r(box.y)}–${r(box.y+box.height)}`;
}

/** How far a label sticks out of the 1920×980 caption-safe area, e.g. "bottom by 24px". */
export function outOfBounds(box:LabelBox):string{
 const parts=[box.x<0&&`left by ${r(-box.x)}px`,box.y<0&&`top by ${r(-box.y)}px`,box.x+box.width>1920&&`right by ${r(box.x+box.width-1920)}px`,box.y+box.height>980&&`bottom by ${r(box.y+box.height-980)}px (the caption band starts at y 980)`].filter(Boolean);
 return parts.join(', ');
}
