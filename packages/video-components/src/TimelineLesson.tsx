import React from 'react';
import type {Scene} from '../../video-schema/src/types';
import {activeStepAtFrame, entranceAtFrame} from './motion';
import {wrapText} from './layout';
import {usePalette,useVisualStyle,visualStyles} from './theme';
import {dedicatedPanel,dedicatedReveal} from './dedicated-style';

export function timelineBoxes(scene: Scene, frame: number) {
  const starts = new Map(scene.animations.map(a => [a.target, a.start_frame]));
  return scene.elements.filter(e => starts.get(e.id)! <= frame).map(e => {
    const event = e.event!, width = 800 * (event.end_ms - event.start_ms) / scene.timeline!.duration_ms;
    return {id: e.id, x: 340 + 800 * event.start_ms / scene.timeline!.duration_ms,
      y: 300 + 160 * scene.timeline!.lanes.findIndex(l => l.id === event.lane_id), width, short: width < 32, phase: event.phase};
  });
}

export function TimelineLesson({scene, frame}: {scene: Scene; frame: number}) {
  const timeline = scene.timeline!, step = activeStepAtFrame(scene, frame),p=usePalette(),style=useVisualStyle(),legacy=style===visualStyles.legacy;
  const panel=dedicatedPanel(style,p);
  const ticks = [...new Set([0, .25, .5, .75, 1].map(t => Math.round(t * timeline.duration_ms)))];
  return <>
    <div style={{...panel,left:80,top:150,width:1100,height:720}}>
      <div style={{fontSize:32}}>执行时间线（毫秒）</div>
      <div style={{fontSize:24,color:p.muted,marginTop:12}}>教学示意时间，非性能实测</div>
    </div>
    {ticks.map(t => <div key={t} style={{position:'absolute',left:340+800*t/timeline.duration_ms,top:270,transform:'translateX(-50%)',fontSize:24,color:p.muted}}>{t}</div>)}
    {timeline.lanes.map((lane,i) => <React.Fragment key={lane.id}>
      <div style={{position:'absolute',left:104,top:300+160*i,width:200,fontSize:32,lineHeight:1.25,whiteSpace:'pre'}}>{wrapText(lane.label,6).join('\n')}</div>
      <div style={{position:'absolute',left:340,top:334+160*i,width:800,borderTop:`2px solid ${p.muted}55`}}/>
    </React.Fragment>)}
    {timelineBoxes(scene,frame).map(box => {
      const a = scene.animations.find(a => a.target===box.id)!;
      const motion=entranceAtFrame(frame,a.start_frame,a.duration_frames);
      const color=box.phase==='wait'?p.secondary:p.accent, current=box.id===step?.id;
      return <div key={box.id} data-timeline-event={box.id} style={{position:'absolute',left:box.short?box.x+box.width/2-2:box.x,top:box.y,width:box.short?4:box.width,height:70,boxSizing:'border-box',border:box.short?undefined:`3px ${box.phase==='wait'?'dashed':'solid'} ${color}`,background:style.card.outline?p.background:current?color+'55':color+'22',opacity:motion.opacity,transform:legacy?`translateY(${motion.translateY}px)`:undefined,...(!legacy?{borderRadius:box.short?0:style.card.radius,outline:current?`2px solid ${color}`:undefined,outlineOffset:current?3:undefined,...dedicatedReveal(scene,frame,style,box.id)}:{})}}>
        {box.short&&<div style={{position:'absolute',top:28,left:-4,width:12,height:12,background:box.phase==='wait'?p.card:color,border:`2px solid ${color}`,boxSizing:'border-box',transform:'rotate(45deg)' }}/>}
      </div>;
    })}
    <div style={{position:'absolute',left:104,top:790,fontSize:24,color:p.muted}}>实线：执行　虚线：等待　短事件：实心执行 / 空心等待{!legacy&&' · 双框：当前'}</div>
    <div style={{...panel,left:1220,top:150,width:620,height:720,...dedicatedReveal(scene,frame,style)}}>
      <div style={{fontSize:26,color:p.accent}}>当前步骤 {step?scene.elements.indexOf(step)+1:'—'} / {scene.elements.length}</div>
      <div style={{fontSize:32,lineHeight:1.25,whiteSpace:'pre',marginTop:24}}>{wrapText(step?.content??'等待讲解开始',16).join('\n')}</div>
      {step&&<div style={{fontSize:28,lineHeight:1.6,marginTop:32}}>
        <div>{step.event!.phase==='wait'?'等待':'执行'} / {timeline.lanes.find(l=>l.id===step.event!.lane_id)!.label}</div>
        <div>{step.event!.start_ms} → {step.event!.end_ms} ms</div>
      </div>}
      <div style={{fontSize:24,lineHeight:1.6,color:p.muted,marginTop:48}}>条段重叠仅代表任务时间重叠，<br/>不保证 CPU 并行。<br/>配音时间与示意毫秒轴独立。</div>
    </div>
  </>;
}
