export function pipelineMotion(frame:number){
  const f=Math.max(0,Math.min(937,frame));
  const phase=(a:number,b:number)=>{const t=Math.max(0,Math.min(1,(f-a)/(b-a)));return t*t*(3-2*t);};
  const mix=(a:number,b:number,t:number)=>a+(b-a)*t;
  const start=phase(6,83),carry=phase(530,618),lift=phase(673,706),feed=phase(706,778);
  const roll={x:mix(mix(86,330,start),1180,carry),y:mix(490,470,start)-14*4*start*(1-start)+304*phase(500,530)-274*phase(618,654)-25*lift};
  roll.x=mix(roll.x,1530,feed);
  const attach=phase(447,500);
  const fragment={x:mix(mix(900,750,phase(342,400)),roll.x+30,attach),y:mix(440-80*phase(310,342),roll.y+90,attach),scale:mix(1,.5,attach)};
  const align=phase(243,282),back=phase(500,560);
  const grasp={x:fragment.x+60*fragment.scale,y:fragment.y};
  const hand=f<282?{x:mix(630,960,align),y:mix(518,440,align)}:
    f<=500?grasp:{x:mix(390,630,back),y:mix(560,518,back)};
  return {roll,fragment,hand,jawOpen:1-phase(282,310)+phase(500,530),feedProgress:feed,
    slotSealed:roll.x+120>1150&&roll.x<1430&&roll.y<770&&roll.y+170>470,
    answerProgress:phase(790,836),answerX:1620+140*phase(790,836)};
}
