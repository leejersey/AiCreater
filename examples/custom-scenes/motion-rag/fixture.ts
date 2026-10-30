import {designHash,type VisualDesign} from '../../../packages/custom-scenes/src/design';
import {parseMotionAssembly,type MotionAssembly} from '../../../packages/custom-scenes/src/motion-assembly';
import type {MotionPlan} from '../../../packages/custom-scenes/src/motion-plan';

export const ragMotionDesignHash='e63bbef6d78bee874a2213272f5f1aee80ad0a57573f39813fc7e12e6deb0c2f';
type Art=MotionAssembly['layers'][number]['artwork'][number];
type Track=MotionPlan['tracks'][number];
const pose=(frame:number,x:number,y:number,scale=1,opacity=1)=>({frame,x,y,scale,opacity});
const path=(d:string,stroke='accent',fill='none'):Art=>({tag:'path',attrs:{d,stroke,fill,strokeWidth:2}});
const rect=(x:number,y:number,width:number,height:number,stroke='accent',fill='background'):Art=>({tag:'rect',attrs:{x,y,width,height,stroke,fill,strokeWidth:2}});
const label=(x:number,y:number,text:string,fontSize=24,fill='foreground'):Art=>({tag:'text',attrs:{x,y,fontSize,fill},text});
const fixed=(id:string,x=0,y=0):Track=>({id,keys:[pose(0,x,y)]});

// Offline, topic-specific mechanism fixture; not a model output or an accepted visual reproduction.
export function buildRagMotionAssembly(design:VisualDesign):MotionAssembly{
 if(designHash(design)!==ragMotionDesignHash)throw Error('rag_motion: frozen_design mismatch');
 const parts:{track:Track;artwork:Art[]}[]=[];
 const add=(track:Track,artwork:Art[])=>parts.push({track,artwork});
 add(fixed('heading'),[label(100,120,'RAG 的工作流程',52),label(100,170,'检索、增强、生成',26,'muted')]);
 add(fixed('step-labels'),[label(530,270,'01 检索',26),label(1150,270,'02 增强',26),label(1490,236,'03 生成',26)]);
 add(fixed('transfer-route'),[path('M 390 555 V 859 H 1240 V 585','muted')]);
 add(fixed('emitter',60,420),[rect(0,0,170,300),path('M 15 40 H 155 M 15 60 H 155 M 15 250 H 155','muted'),label(20,285,'问题',24)]);
 add(fixed('gantry',510,330),[path('M 20 420 V 0 H 220 V 420 M 20 60 H 220','muted'),label(30,405,'检索器',24)]);
 add(fixed('library',830,300),[
  rect(0,0,260,420,'muted'),label(25,42,'文档库',28),path('M 20 90 H 240 M 20 300 H 240','muted'),
  rect(20,130,40,160,'muted'),path('M 28 155 H 52 M 28 180 H 52 M 28 205 H 52','muted'),
  rect(200,130,40,160,'muted'),path('M 208 155 H 232 M 208 180 H 232 M 208 205 H 232','muted'),
 ]);
 add(fixed('slot-back',1150,470),[rect(0,0,280,314),path('M 20 250 V 20 H 260 V 250','muted'),label(30,45,'增强提示',24),path('M 20 314 V 284 H 110 V 314 M 170 314 V 284 H 260 V 314')]);
 add(fixed('generator-back',1470,300),[rect(0,0,300,470,'muted')]);
 add({id:'question-roll',keys:[
  pose(0,86,490),pose(6,86,490),pose(83,330,470),pose(500,330,470),pose(530,330,774),pose(618,1180,774),pose(654,1180,500),pose(673,1180,500),pose(706,1180,475),pose(778,1530,475),
 ]},[path('M 0 0 H 100 L 120 20 V 150 Q 120 170 100 170 H 0 Z','accent','background'),path('M 100 0 V 20 H 120'),label(42,64,'?',48)]);
 add({id:'doc-fragment',keys:[pose(0,900,440),pose(310,900,440),pose(342,900,360),pose(400,750,360),pose(447,750,360),pose(500,360,560,0.5)],attachments:[{startFrame:500,endFrame:938,parentId:'question-roll',offset:{x:30,y:90,scale:0.5,opacity:1}}]},[
  path('M 0 0 H 100 L 120 20 V 160 H 0 Z','secondary','background'),path('M 100 0 V 20 H 120','secondary'),
  path('M 15 45 H 105 M 15 65 H 95 M 15 85 H 105 M 15 105 H 85 M 15 125 H 100','secondary'),
 ]);
 add({id:'hand',keys:[pose(0,630,518),pose(243,630,518),pose(282,960,440),pose(310,960,440),pose(342,960,360),pose(400,810,360),pose(447,810,360),pose(500,390,560),pose(560,630,518)]},[path('M 0 -150 V -25','muted'),rect(-26,-25,52,20,'foreground')]);
 add({id:'jaw-left',parentId:'hand',keys:[pose(0,-26,0),pose(282,-26,0),pose(310,-8,0),pose(500,-8,0),pose(530,-26,0)]},[path('M 0 -5 V 18 H 10','foreground')]);
 add({id:'jaw-right',parentId:'hand',keys:[pose(0,26,0),pose(282,26,0),pose(310,8,0),pose(500,8,0),pose(530,26,0)]},[path('M 0 -5 V 18 H -10','foreground')]);
 add(fixed('slot-front',1150,470),[rect(0,250,280,35),path('M 20 314 V 284 H 110 V 314 M 170 314 V 284 H 260 V 314')]);
 add({id:'answer-sheet',keys:[pose(0,1620,350,1,0),pose(790,1620,350,1,0),pose(836,1760,350,1,1)]},[
  path('M 0 0 H 80 L 100 20 V 170 H 0 Z','secondary','background'),path('M 80 0 V 20 H 100 M 15 45 H 85 M 15 65 H 75 M 15 85 H 85 M 15 105 H 70','secondary'),label(14,145,'答案',22),
 ]);
 add(fixed('generator-front',1470,300),[
  rect(0,0,280,470),label(45,60,'生成器',32),path('M 20 200 H 260 M 20 220 H 260','muted'),
  {tag:'circle',attrs:{cx:140,cy:140,r:35,fill:'background',stroke:'secondary',strokeWidth:2}},
  path('M 140 95 V 115 M 140 165 V 185 M 95 140 H 115 M 165 140 H 185','secondary'),
  path('M 0 235 H 35 V 300 H 0 M 280 30 H 300 V 110 H 280'),label(45,390,'问题 + 上下文',24),
 ]);
 return parseMotionAssembly({schemaVersion:'motion-assembly:1',brief:design.brief,plan:{schemaVersion:'motion-plan:2',durationInFrames:design.brief.durationInFrames,tracks:parts.map(p=>p.track)},layers:parts.map(p=>({id:p.track.id,artwork:p.artwork}))});
}
