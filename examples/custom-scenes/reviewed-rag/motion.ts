export function ragWorkflowMotion(frame:number){
 const f=Math.max(0,Math.min(937,frame));
 const tween=(at:number,start:number,end:number)=>{const t=Math.max(0,Math.min(1,(at-start)/(end-start)));return t*t*(3-2*t);};
 const handAt=(at:number)=>({
  x:252+774*tween(at,336,368),
  y:370-128*tween(at,320,336)+200*tween(at,368,398),
 });
 const sleeve={x:900+40*tween(f,452,640)+480*tween(f,673,712),y:380};
 const grip=handAt(f);
 const back=tween(f,398,424);
 const hand={x:grip.x+(252-grip.x)*back,y:grip.y+(370-grip.y)*back};
 const a=f<398?{x:grip.x-80,y:grip.y+26}:{x:sleeve.x+46,y:sleeve.y+88};
 const b=f<398?{x:grip.x+24,y:grip.y+42}:{x:sleeve.x+150,y:sleeve.y+104};
 return {sleeve,a,b,hand,closed:tween(f,300,320)*(1-back),opacity:1};
}
