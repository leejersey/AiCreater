import React from 'react';
import {interpolate, Easing} from 'remotion';

type Theme = {background:string;foreground:string;muted:string;accent:string;secondary:string};
type SceneProps = {frame:number;fps:number;width:number;height:number;theme:Theme};

const clampM = (f:number,a:number,b:number,c:number,d:number):number =>
  interpolate(f,[a,b],[c,d],{extrapolateLeft:'clamp',extrapolateRight:'clamp',easing:Easing.inOut(Easing.cubic)});

function Doc(props:{x:number;y:number;w:number;h:number;color:string;bg:string;flip?:boolean;lines?:number;rot?:number;accent?:string}) {
  const {x,y,w,h,color,bg,flip,lines}=props;
  const fl = Math.min(26, w*0.32);
  const d = flip
    ? `M${fl} 0 H${w} V${h} H0 V${fl} Z`
    : `M0 0 H${w-fl} L${w} ${fl} V${h} H0 Z`;
  return (
    <g transform={`translate(${x} ${y}) rotate(${props.rot||0} ${w/2} ${h/2})`}>
      <path d={d} fill={bg} stroke={color} strokeWidth={2.5}/>
      {flip
        ? <path d={`M${fl} 0 L0 ${fl} H${fl}`} fill="none" stroke={props.accent||color} strokeWidth={1.8}/>
        : <path d={`M${w-fl} 0 V${fl} H${w}`} fill="none" stroke={props.accent||color} strokeWidth={1.8}/>}
      {Array.from({length:lines||3}).map((_,i)=>(
        <path key={i} d={`M14 ${fl+16+i*18} H${w-(i===0?22:12)}`} stroke={color} strokeWidth={1.6} opacity={0.55}/>
      ))}
    </g>
  );
}

const FRAG_A_SHELF = {x:172, y:396, w:80, h:110};
const FRAG_B_SHELF = {x:276, y:412, w:75, h:95};

function ragWorkflowMotion(frame:number){
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

const clamp01 = (v:number):number => v<0?0:v>1?1:v;

export default function Scene(props:SceneProps) {
  const {theme:t,width,height}=props;
  const f = Math.max(0, Math.min(937, props.frame*30/props.fps));
  const gold = t.accent;
  const cyan = t.secondary;
  const motion = ragWorkflowMotion(f);

  // Rail starts outside the shelf silhouette.
  const railY = 892;
  const railL = 540, railR = 1750, a1 = 580, a2 = 1100, a3 = 1620;

  // cue2 order
  const g1 = clampM(f,120,150,0,1);   // seg1 lit
  const g2 = clampM(f,158,188,0,1);   // seg2 lit
  const g3 = clampM(f,196,226,0,1);   // seg3 lit
  // cue3 reset: bring seg3 back to dim at start (243-250)
  const reset3 = clampM(f,243,250,0,1);
  // cue3 progress of retrieve assembly
  const insert = clampM(f,368,398,0,1);
  const scan = clampM(f,712,770,0,1);
  const eject = clampM(f,770,842,0,1);
  // cue6 settle
  const allLit = clampM(f,852,900,0,1);

  // step1 label active: during cue3 completion
  const s1a = Math.max(g1*(1-clampM(f,158,166,0,1)), clampM(f,400,420,0,1));
  const s2a = Math.max(g2*(1-clampM(f,196,204,0,1)), clampM(f,610,630,0,1));
  const s3a = Math.max(g3*(1-reset3), clampM(f,800,820,0,1));
  const s1v = Math.min(1, s1a + allLit);
  const s2v = Math.min(1, s2a + allLit);
  const s3v = Math.min(1, s3a + allLit);

  // rail gold opacities: seg1 lights during cue2, then dormant in cue3 (reset), active during cue3 completion & cue4 heading, all lit at cue6
  const seg1 = Math.max(
    g1*(1-clampM(f,158,166,0,1)),
    clampM(f,400,424,0,1),
    allLit
  );
  const seg2 = Math.max(
    g2*(1-clampM(f,196,204,0,1)),
    clampM(f,600,640,0,1),
    allLit
  );
  const seg3 = Math.max(
    g3*(1-reset3)*clamp01(1-clampM(f,852,858,0,1)),
    clampM(f,800,830,0,1)*clamp01(1-clampM(f,852,858,0,1)),
    allLit
  );

  // question slip drop
  const qDrop = clampM(f,250,300,0,1);

  // shelf extraction hole appears once grabbed
  const hole = clampM(f,314,336,0,1);

  // generator state
  const genProcessing = scan*(1-eject)*0.9 + 0.5*scan;
  const lipGlow = 0.4 + 0.6*(1-clampM(f,700,745,0,1)) + 0.5*eject;

  // answer card
  const ansEject = clampM(f,790,842,0,1);
  const ansY = 700 - ansEject*60;
  const ansX = 1520;
  const ansW = 300, ansH = 170;

  const bg = t.background;

  return (
    <svg width={width} height={height} viewBox="0 0 1920 1080" xmlns="http://www.w3.org/2000/svg"
      style={{display:'block', background:bg, fontFamily:'"Noto Sans SC", sans-serif'}} role="img" aria-label="RAG的工作流程">
      <defs>
        <pattern id="scene-grid" width={48} height={48} patternUnits="userSpaceOnUse">
          <path d="M48 0 H0 V48" fill="none" stroke={t.muted} strokeWidth={0.7} opacity={0.10}/>
        </pattern>
        <linearGradient id="sleeve-fill" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor={gold} stopOpacity={0.10}/>
          <stop offset="1" stopColor={gold} stopOpacity={0.02}/>
        </linearGradient>
      </defs>

      <rect x={0} y={0} width={width} height={height} fill={bg}/>
      <rect x={70} y={250} width={1780} height={680} fill="url(#scene-grid)"/>

      {/* title */}
      <text x={120} y={150} fill={t.foreground} fontSize={82} fontWeight={500}>RAG 的工作流程</text>
      <text x={124} y={206} fill={t.muted} fontSize={28}>检索 → 增强 → 生成</text>

      {/* ============ RAIL (kind=path, stroke-only) ============ */}
      <g data-object="assembly-rail">
        <path id="rail-base" data-route="true" d={`M${railL} ${railY} H${railR}`} stroke={t.muted} strokeWidth={2} fill="none" opacity={0.5}/>
        <path id="rail-seg1" data-route="true" d={`M${railL} ${railY} H${a2}`} stroke={gold} strokeWidth={3} fill="none" opacity={seg1}/>
        <path id="rail-seg2" data-route="true" d={`M${a1} ${railY} H${a3}`} stroke={gold} strokeWidth={3} fill="none" opacity={seg2}/>
        <path id="rail-seg3" data-route="true" d={`M${a2} ${railY} H${railR}`} stroke={gold} strokeWidth={3} fill="none" opacity={seg3}/>
        {[{x:a1,o:seg1},{x:a2,o:seg2},{x:a3,o:seg3}].map((a,i)=>(
          <g key={i}>
            <path d={`M${a.x} ${railY-12} V${railY+12}`} stroke={t.muted} strokeWidth={2}/>
            <path d={`M${a.x} ${railY-12} V${railY+12}`} stroke={gold} strokeWidth={3} opacity={a.o}/>
            <circle cx={a.x} cy={railY} r={6} fill={bg} stroke={a.o>0.5?gold:t.muted} strokeWidth={2.5}/>
          </g>
        ))}
      </g>

      {/* ============ STEP LABELS (kind=label) ============ */}
      {[{id:'step-1-label',x:580,txt:'① 检索',o:s1v},{id:'step-2-label',x:1100,txt:'② 增强',o:s2v},{id:'step-3-label',x:1620,txt:'③ 生成',o:s3v}].map((l)=>(
        <g key={l.id} data-object={l.id} transform={`translate(${l.x} 850)`}>
          <text x={0} y={0} textAnchor="middle" fontSize={30} fontWeight={500}
            fill={l.o>0.5?gold:t.muted} opacity={0.55+0.45*l.o}>{l.txt}</text>
          <path d="M-52 16 H52" stroke={gold} strokeWidth={3} opacity={l.o}/>
        </g>
      ))}

      {/* ============ DOC SHELF ============ */}
      <g data-object="doc-shelf" data-obstacle="true">
        <path d="M90 300 H510 V930 H90 Z" fill={bg} stroke={t.muted} strokeWidth={3.5}/>
        {[380,500,620,740,860].map((y,i)=>(
          <path key={i} d={`M96 ${y} H504`} stroke={t.muted} strokeWidth={2} opacity={0.7}/>
        ))}
        {[{x:110,y:306,w:52,h:66},{x:170,y:300,w:56,h:72},{x:236,y:312,w:48,h:60},{x:300,y:302,w:58,h:70},{x:368,y:310,w:50,h:62},{x:430,y:305,w:56,h:68}].map((d,i)=>(
          <Doc key={`t1${i}`} x={d.x} y={d.y} w={d.w} h={d.h} color={cyan} bg={bg} lines={2}/>
        ))}
        {[{x:112,y:396,w:52,h:66},{x:366,y:392,w:48,h:62},{x:428,y:398,w:56,h:68}].map((d,i)=>(
          <Doc key={`t2${i}`} x={d.x} y={d.y} w={d.w} h={d.h} color={cyan} bg={bg} lines={2}/>
        ))}
        {[3,4].map(row=>(
          [120,188,256,324,392,452].map((x,i)=>(
            <rect key={`${row}-${i}`} x={x} y={516+(row-3)*120} width={54} height={76} fill="none" stroke={t.muted} strokeWidth={1.4} opacity={0.45}/>
          ))
        ))}
      </g>

      {/* extraction hole where frags were */}
      <rect x={FRAG_A_SHELF.x-2} y={FRAG_A_SHELF.y} width={60} height={74} fill={bg} stroke={cyan} strokeWidth={1.6} strokeDasharray="5 6" opacity={0.5*hole}/>
      <rect x={FRAG_B_SHELF.x-2} y={FRAG_B_SHELF.y} width={58} height={64} fill={bg} stroke={cyan} strokeWidth={1.6} strokeDasharray="5 6" opacity={0.5*hole}/>

      {/* ============ RETRIEVER ARM ============ */}
      <g data-object="retriever-arm" data-obstacle="true">
        <path d={`M470 270 V220 H${motion.hand.x} V${motion.hand.y}`} fill="none" stroke={cyan} strokeWidth={8}/>
        <g transform={`translate(${motion.hand.x} ${motion.hand.y})`}>
          <path d="M-80 0 H100" stroke={cyan} strokeWidth={5}/>
          {[-40,60].map(x=><g key={x} transform={`translate(${x} 0)`}>
            <path d={`M-24 0 V${26-8*(1-motion.closed)} H${-18-12*(1-motion.closed)}`} fill="none" stroke={gold} strokeWidth={3}/>
            <path d={`M24 0 V${26-8*(1-motion.closed)} H${18+12*(1-motion.closed)}`} fill="none" stroke={gold} strokeWidth={3}/>
          </g>)}
        </g>
      </g>

      {/* ============ SLEEVE (single movable parent) ============ */}
      <g data-object="sleeve" data-obstacle="true" transform={`translate(${motion.sleeve.x} ${motion.sleeve.y})`}>
        {/* back panel: mouth opening top, sides, bottom */}
        <path d="M0 60 H400 V230 Q400 250 380 250 H20 Q0 250 0 230 Z" fill={bg} stroke={cyan} strokeWidth={3} opacity={0.9}/>
        {/* question slip: inner artwork stacked inside mouth */}
        <g data-object="question-slip" transform={`translate(70 ${interpolate(qDrop,[0,1],[40,90])})`}>
          <rect x={0} y={0} width={260} height={130} fill={bg} stroke={cyan} strokeWidth={2.5}/>
          <text id="question-mark" x={218} y={32} fill={cyan} fontSize={26}>?</text>
          <path d="M40 24 H196 M16 58 H236 M16 82 H236 M16 106 H200" stroke={cyan} strokeWidth={2} opacity={0.55}/>
        </g>
        {/* inner tint */}
        <path d="M0 60 H400 V150 H0 Z" fill="url(#sleeve-fill)"/>
      </g>

      {/* FRAGMENTS: single physical each, continuous transform */}
      <g data-object="frag-a" data-obstacle="true">
        <g transform={`translate(${motion.a.x} ${motion.a.y})`}>
          <Doc x={0} y={0} w={FRAG_A_SHELF.w} h={FRAG_A_SHELF.h} color={cyan} bg={bg} flip lines={3} accent={gold}/>
        </g>
      </g>
      <g data-object="frag-b" data-obstacle="true">
        <g transform={`translate(${motion.b.x} ${motion.b.y})`}>
          <Doc x={0} y={0} w={FRAG_B_SHELF.w} h={FRAG_B_SHELF.h} color={cyan} bg={bg} flip lines={2} accent={gold}/>
        </g>
      </g>

      {/* Front-panel overlay for occlusion of inserted fragments (sits above fragments, sits inside sleeve world coords) */}
      <g transform={`translate(${motion.sleeve.x} ${motion.sleeve.y})`}>
        <path d="M0 150 H400 V230 Q400 250 380 250 H20 Q0 250 0 230 Z" fill={bg} stroke={gold} strokeWidth={3}/>
        <path d="M0 150 H400" stroke={gold} strokeWidth={2} opacity={0.55}/>
        <circle cx={378} cy={226} r={9} fill={insert>0.6?gold:bg} stroke={gold} strokeWidth={2.5}/>
      </g>

      {/* ============ GENERATOR HEAD ============ */}
      <g data-object="gen-head" data-obstacle="true">
        <path d="M1420 300 H1820 V780 Q1820 800 1800 800 H1440 Q1420 800 1420 780 Z" fill={bg} stroke={cyan} strokeWidth={3.5}/>
        <path d="M1420 380 L1360 420 V620 L1420 660 Z" fill={bg} stroke={gold} strokeWidth={3} opacity={0.6+0.4*lipGlow/1.6}/>
        {[440,500,560].map((y,i)=>(
          <path key={i} d={`M1460 ${y} H1780`} stroke={cyan} strokeWidth={2} opacity={0.35 + 0.5*genProcessing*(i===1?1:0.6)}/>
        ))}
        <rect x={1460} y={440 + scan*140} width={320} height={16} fill={gold} opacity={0.25*scan*(1-eject)}/>
        <path d="M1560 780 H1700 L1710 815 H1550 Z" fill={bg} stroke={gold} strokeWidth={2.5} opacity={0.6+0.4*eject}/>
        <text x={1620} y={340} textAnchor="middle" fill={t.muted} fontSize={22}>生成器（大语言模型）</text>
      </g>

      {/* ============ ANSWER CARD ============ */}
      <g data-object="answer-card" transform={`translate(${ansX} ${ansY})`} opacity={ansEject>0?1:0}>
        <path d={`M0 0 H${ansW} V${ansH-20} L${ansW-30} ${ansH} H0 Z`} fill={bg} stroke={gold} strokeWidth={3}/>
        <path d={`M${ansW-30} 0 V20 H${ansW}`} fill="none" stroke={gold} strokeWidth={1.8}/>
        <path d="M20 44 H236 M20 74 H266 M20 104 H200" stroke={gold} strokeWidth={2} opacity={0.6}/>
        <path d="M20 132 L36 148 L64 116" fill="none" stroke={gold} strokeWidth={4}/>
      </g>
    </svg>
  );
}
