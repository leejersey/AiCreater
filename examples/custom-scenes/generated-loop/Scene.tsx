import React from 'react';
import {interpolate, Easing} from 'remotion';

export type SceneProps = {
  frame:number; fps:number; width:number; height:number;
  theme:{background:string; foreground:string; muted:string; accent:string; secondary:string};
};

export default function Scene(props:SceneProps) {
  const {theme:t,width,height}=props;
  const f=Math.max(0,Math.min(2308,props.frame));
  const clampM=(a:number,b:number,from:number,to:number)=>interpolate(f,[a,b],[from,to],{
    extrapolateLeft:'clamp',extrapolateRight:'clamp',easing:Easing.inOut(Easing.cubic),
  });
  const lin=(a:number,b:number,from:number,to:number)=>interpolate(f,[a,b],[from,to],{
    extrapolateLeft:'clamp',extrapolateRight:'clamp',
  });

  // ---- Cue boundaries (exact from brief) ----
  const C1s=0,C1e=183;
  const C2s=189,C2e=316;
  const C3s=322,C3e=457;
  const C4s=463,C4e=694;
  const C5s=700,C5e=941;
  const C6s=947,C6e=1257;
  const C7s=1263,C7e=1674;
  const C8s=1680,C8e=2278;

  // ---- Loop geometry (single elliptical definition shared everywhere) ----
  const cx=960, cy=560, rx=560, ry=260;
  const pt=(angDeg:number)=>{ // ang measured, 0 = right, CCW positive in math; here used directly
    const a=(angDeg*Math.PI)/180;
    return {x:cx+rx*Math.cos(a), y:cy-ry*Math.sin(a)};
  };

  // Track draw-on progress during cue 1
  const draw=clampM(C1s+8,C1e-10,0,1);

  // Pulse of track after completion
  const pulse=interpolate(f,[C1e-6,C1e+2,C1e+40],[0,1,0],{extrapolateLeft:'clamp',extrapolateRight:'clamp'});

  // ---- payload path & timing across cycles ----
  // We'll model payload as a function of frame via keyframe segments along the ellipse.
  // Angles (deg) along ellipse; top gap ~ 90deg. Let model lens sit at ~35deg, terminal at ~-55deg,
  // return path swings under bottom back to model.
  const A_GAP=90;
  const A_MODEL=42;
  const A_TOOL=-58;
  // The payload travels gap->model (cue2-3), model->tool (cue4), tool->return->model (cue5-6)
  // Provide a piecewise position with clamped interpolations.

  const payloadIn=clampM(C2s+18,C2s+70,0,1);
  const payloadToModel=clampM(C3s+10,C3s+120,0,1);
  const payloadModelHold=clampM(C3s+120,C3s+150,0,1);
  const payloadToTool=clampM(C4s+20,C4e-30,0,1);
  const payloadReturn=clampM(C5s+60,C6s+150,0,1);

  // angle along track
  let payAng=A_GAP;
  // gap -> model via arc going CCW (increasing angle? here decreasing toward 42)
  if(payloadToModel>0){
    payAng=A_GAP+(A_MODEL-A_GAP)*payloadToModel;
  }
  // model -> tool: go CCW down right side: 42 -> -58
  if(payloadToTool>0){
    payAng=A_MODEL+(A_TOOL-A_MODEL)*payloadToTool;
  }
  // tool -> return -> merges back near -150 then up to model; represent via ellipse lower-left then upto model
  // We'll route return through bottom-left of ellipse back to model at 42 via 180+ arc.
  if(payloadReturn>0){
    const start=-58;
    const end=42-360; // wrap the long way, giving bottom-left travel
    payAng=start+(end-start)*payloadReturn;
  }
  if(f>=C7s)payAng=A_MODEL-360*clampM(C7s,C8e-90,0,2);

  // payload pixel position; during return we add a lift near return path then merge
  const pp=pt(payAng);
  // small offset when moving through tool: dip down a touch (terminal below track)
  const toolDip=Math.sin(Math.max(0,Math.min(1,payloadToTool))*Math.PI)*10;
  // return path raise: belly down along return-path under track
  const retBelly=Math.sin(Math.max(0,Math.min(1,payloadReturn))*Math.PI)*46;
  const payX=pp.x;
  const payY=pp.y+toolDip+retBelly;

  const payloadVisible=clampM(C2s+10,C2s+30,0,1);
  const payloadScale=0.9+0.1*clampM(C2s+10,C2s+40,0,1);
  const bugLinesGlow=clampM(C2s+30,C2s+70,0,1);

  // ---- model lens ----
  const lensIn=clampM(C1s+30,C1e-20,0,1);
  // ripple logic: pulse each time payload dwells in lens; approximate with windows
  const inLensWindow=(s:number,e:number)=>f>=s&&f<=e;
  const ripple1=interpolate(f,[C3s+100,C3s+160], [0,1],{extrapolateLeft:'clamp',extrapolateRight:'clamp'});
  const ripple1fade=interpolate(f,[C3s+160,C3s+220],[1,0],{extrapolateLeft:'clamp',extrapolateRight:'clamp'});
  const rippleLoopEarly=inLensWindow(C6s+20,C6e-40);
  const rippleLoopLate=inLensWindow(C8s+40,C8e-120);
  const ripplePulse=(()=>{
    if(f<C3s+100) return 0;
    if(f<C3s+220) return Math.max(ripple1*ripple1fade,0);
    if(rippleLoopEarly){
      const local=(f-(C6s+20))/160;
      return Math.max(0,Math.sin(Math.min(1,local)*Math.PI));
    }
    if(rippleLoopLate){
      const local=((f-(C8s+40))%180)/180;
      return Math.max(0,Math.sin(local*Math.PI));
    }
    return 0;
  })();

  // gears rotate a little
  const gearRot=interpolate(f,[C3s,C3s+220,C6s,C6e],[0,7,7,12],{extrapolateLeft:'clamp',extrapolateRight:'clamp'});

  // ---- tool terminal ----
  const toolIn=clampM(C4s,C4s+40,0,1);
  const slot1=clampM(C4s+30,C4s+90,0,1);
  const slot2=clampM(C4s+110,C4s+170,0,1);
  const slot3=clampM(C4s+200,C4s+260,0,1);

  // ---- result badge ----
  const badgeRise=clampM(C5s+20,C5s+80,0,1);
  const checkFlash=clampM(C5s+80,C5s+130,0,1)*(1-clampM(C5s+150,C5s+200,0,1));
  const crossFlash=clampM(C5s+150,C5s+200,0,1)*(1-clampM(C5s+250,C5s+300,0,1));
  const badgeNeutral=clampM(C5s+200,C5s+280,0,1);
  // badge travels on return path in cue6
  const badgeTravel=clampM(C6s+10,C6s+180,0,1);
  const badgeAlongReturn=(()=>{
    const s=pt(A_TOOL),m=pt(A_MODEL),u=badgeTravel,v=1-u;
    const x=v*v*v*s.x+3*v*v*u*(s.x-620)+3*v*u*u*(m.x-700)+u*u*u*(m.x+10);
    const y=v*v*v*(s.y+100)+3*v*v*u*(s.y+180)+3*v*u*u*(m.y+380)+u*u*u*(m.y+60);
    return {x,y};
  })();
  const badgeReveal=clampM(C5s+10,C5s+40,0,1);
  // badge final homes on payload area after merge; keep visible in late frames as a returning info mark
  const badgeOpacity=badgeReveal*(1-clampM(C6e-20,C6e+40,0,0.55));

  // ---- return path ----
  const returnReveal=clampM(C5s+40,C5e-20,0,1);

  // ---- error trace ----
  const errReveal=clampM(C8s+20,C8s+140,0,1);
  const errPulse=inLensWindow(C8s+120,C8s+260)?0.6+0.4*Math.sin((f-C8s)*0.08):0.6;

  // ---- planner ghost ----
  const ghostReveal=clampM(C7s+10,C7s+80,0,1);

  // ---- cycle counter notches ----
  // ticks light up progressively: first at C6 mid, then accumulate through late cues
  const tickTimes=[C6s+90,C6s+170,C7s+60,C7s+150,C8s+60,C8s+180,C8s+300,C8s+420];
  const ticks=tickTimes.map((f0,i)=>{
    const v=clampM(f0,f0+40,0,1);
    return v;
  });

  // title/subtitle
  const title="Agent 的工作循环";
  const headline=(()=>{
    if(f<C2s) return '循环，是它的心脏';
    if(f<C3s) return '① 提需求：帮我修好这个 bug';
    if(f<C4s) return '② 模型想一想：下一步做什么';
    if(f<C5s) return '③ 动手：打开、搜索、运行';
    if(f<C6s) return '④ 结果原样丢回模型';
    if(f<C7s) return '回到②，一圈一圈地转';
    if(f<C8s) return '规划，就在每一圈里';
    return '报错，也只是“一条新信息”';
  })();

  const mono='"Noto Sans SC", sans-serif';

  // helper for gold task shape
  const TaskBody=({scale=1}:{scale?:number})=>(
    <g transform={`scale(${scale})`}>
      <path d="M-46 -46 H24 L46 -24 V46 H-46 Z" fill={t.background} stroke={t.accent} strokeWidth={3}/>
      <path d="M24 -46 V-24 H46" fill="none" stroke={t.accent} strokeWidth={2}/>
      <path d="M-30 -12 H18 M-30 6 H6" stroke={t.accent} strokeWidth={3} strokeLinecap="round" opacity={0.5+0.5*bugLinesGlow}/>
      <circle cx={-30} cy={-12} r={3} fill={t.secondary} opacity={bugLinesGlow}/>
    </g>
  );

  return <svg width={width} height={height} viewBox="0 0 1920 1080"
    style={{display:'block',background:t.background,fontFamily:mono}}
    role="img" aria-label={`${title}：${headline}`}>
    <defs>
      <radialGradient id="loop-glow" cx="0.5" cy="0.45" r="0.6">
        <stop offset="0" stopColor={t.accent} stopOpacity={0.10}/>
        <stop offset="1" stopColor={t.accent} stopOpacity={0}/>
      </radialGradient>
      <pattern id="grid" width={48} height={48} patternUnits="userSpaceOnUse">
        <path d="M48 0 H0 V48" fill="none" stroke={t.muted} strokeWidth={0.6} opacity={0.1}/>
      </pattern>
    </defs>
    <rect width={1920} height={1080} fill={t.background}/>
    <rect x={60} y={60} width={1800} height={900} fill="url(#grid)"/>

    {/* Title block */}
    <g transform="translate(120 150)">
      <text fill={t.foreground} fontSize={72} fontWeight={500}>{title}</text>
      <text y={54} fill={t.muted} fontSize={32}>{headline}</text>
    </g>

    {/* Soft glow behind loop */}
    <ellipse cx={cx} cy={cy} rx={rx+70} ry={ry+70} fill="url(#loop-glow)"/>

    {/* Loop track: drawn with dash offset via arc segments; approximate using arc path with dash technique */}
    <g>
      {/* faint full track always present as guide */}
      <ellipse cx={cx} cy={cy} rx={rx} ry={ry} fill="none" stroke={t.muted} strokeWidth={1.5} opacity={0.28} strokeDasharray="4 10"/>
      {/* the actual drawn loop with arrowheads */}
      <ellipse cx={cx} cy={cy} rx={rx} ry={ry} fill="none" stroke={t.accent}
        strokeWidth={5+2*pulse} opacity={draw}
        strokeDasharray={`${2*Math.PI*Math.sqrt((rx*rx+ry*ry)/2)*(0.02+0.98*draw)} 9999`}
        strokeLinecap="round"/>
      {/* pulse bloom */}
      {pulse>0 && <ellipse cx={cx} cy={cy} rx={rx} ry={ry} fill="none" stroke={t.accent} strokeWidth={5+16*pulse} opacity={0.3*pulse}/>}
      {/* small gap marker at top */}
      <g transform={`translate(${cx} ${cy-ry})`}>
        <circle r={10} fill={t.background} stroke={t.accent} strokeWidth={3} opacity={draw}/>
      </g>
    </g>

    {/* planner ghost (outside upper-left of loop) */}
    <g transform="translate(640 520)" opacity={ghostReveal}>
      <circle r={70} fill="none" stroke={t.muted} strokeWidth={2} strokeDasharray="6 8" opacity={0.7}/>
      <path d="M-24 0 H24 M0 -24 V24" stroke={t.muted} strokeWidth={2} strokeDasharray="4 6" opacity={0.5}/>
      <text x={0} y={110} textAnchor="middle" fill={t.muted} fontSize={24}>没有专门的规划师</text>
    </g>

    {/* Model lens on upper arc */}
    <g transform={`translate(${pt(A_MODEL).x} ${pt(A_MODEL).y})`} opacity={lensIn}>
      {/* gears */}
      <g transform={`rotate(${gearRot})`}>
        {[0,1,2,3,4,5,6,7].map(i=>{
          const a=(i/8)*Math.PI*2;
          return <line key={i} x1={Math.cos(a)*150} y1={Math.sin(a)*150} x2={Math.cos(a)*170} y2={Math.sin(a)*170}
            stroke={t.accent} strokeWidth={8} strokeLinecap="round"/>
        })}
        <circle r={150} fill={t.background} stroke={t.accent} strokeWidth={4}/>
        <circle r={150} fill="none" stroke={t.accent} strokeWidth={1.5} opacity={0.5}/>
      </g>
      {/* ripples */}
      {[0,1,2].map(i=>{
        const r=40+i*40+60*(ripplePulse*(((i%3)+1)/3));
        return <circle key={i} r={r} fill="none" stroke={t.accent} strokeWidth={2}
          opacity={ripplePulse*(0.55-i*0.15)}/>;
      })}
      {/* inner core icon: three dots as 'thinking' */}
      <g>
        <circle cx={-26} cy={0} r={7} fill={t.accent}/>
        <circle cx={0} cy={0} r={7} fill={t.accent}/>
        <circle cx={26} cy={0} r={7} fill={t.accent}/>
      </g>
      <text y={210} textAnchor="middle" fill={t.muted} fontSize={26}>模型 · 想一想</text>
    </g>

    {/* Tool terminal on right-lower arc */}
    <g data-object="tool-terminal" transform={`translate(${pt(A_TOOL).x} ${pt(A_TOOL).y+10})`} opacity={toolIn}>
      <g transform="rotate(-8)">
        <rect x={-130} y={-90} width={260} height={180} rx={12} fill={t.background} stroke={t.accent} strokeWidth={3}/>
        <rect x={-116} y={-74} width={232} height={44} rx={6} fill="none" stroke={t.accent} strokeWidth={2} opacity={0.25+0.75*slot1}/>
        <rect x={-116} y={-20} width={232} height={44} rx={6} fill="none" stroke={t.accent} strokeWidth={2} opacity={0.25+0.75*slot2}/>
        <rect x={-116} y={34} width={232} height={44} rx={6} fill="none" stroke={t.accent} strokeWidth={2} opacity={0.25+0.75*slot3}/>
        {/* little prompts in slots */}
        <text x={-100} y={-43} fill={t.muted} fontSize={22} opacity={0.6+0.4*slot1}>打开文件</text>
        <text x={-100} y={11} fill={t.muted} fontSize={22} opacity={0.6+0.4*slot2}>搜索代码</text>
        <text x={-100} y={65} fill={t.muted} fontSize={22} opacity={0.6+0.4*slot3}>运行命令</text>
      </g>
      {/* base */}
      <path d="M-90 92 H90 L70 128 H-70 Z" fill="none" stroke={t.accent} strokeWidth={3}/>
      <text y={165} textAnchor="middle" fill={t.muted} fontSize={26}>工具 · 动手</text>
    </g>

    {/* Return path */}
    <g opacity={returnReveal}>
      <path d={(()=>{
        const s=pt(A_TOOL);
        const m=pt(A_MODEL);
        return `M ${s.x} ${s.y+100} C ${s.x-620} ${s.y+180}, ${m.x-700} ${m.y+380}, ${m.x+10} ${m.y+60}`;
      })()} fill="none" stroke={t.accent} strokeWidth={3} strokeDasharray="2 8" opacity={0.7}/>
      {/* arrow tip */}
      <g transform={`translate(${pt(A_MODEL).x+6} ${pt(A_MODEL).y+70})`}>
        <path d="M-10 -16 L6 0 L-10 16" fill="none" stroke={t.accent} strokeWidth={3} strokeLinecap="round"/>
      </g>
      <text x={720} y={900} fill={t.muted} fontSize={24}>结果原样回流 · 成功与报错同权</text>
    </g>

    {/* result badge */}
    {badgeOpacity>0.01 && <g transform={`translate(${badgeAlongReturn.x} ${badgeAlongReturn.y})`} opacity={badgeOpacity*Math.max(badgeReveal,badgeNeutral)}>
      <g transform={`scale(${0.4+0.6*badgeRise})`}>
        <path d="M0 -34 L34 0 L0 34 L-34 0 Z" fill={t.background} stroke={t.accent} strokeWidth={3}/>
        {/* half cyan half gold */}
        <path d="M0 -34 L34 0 L0 34 Z" fill={t.accent} opacity={0.35}/>
        {checkFlash>0.01 && <path d="M-14 0 L-4 10 L16 -12" stroke={t.accent} strokeWidth={5} fill="none" strokeLinecap="round" opacity={checkFlash}/>}
        {crossFlash>0.01 && <g stroke={t.secondary} strokeWidth={5} strokeLinecap="round" opacity={crossFlash}>
          <path d="M-12 -12 L12 12 M12 -12 L-12 12"/>
        </g>}
        {badgeNeutral>0.5 && <circle r={5} fill={t.foreground} opacity={badgeNeutral-0.5}/>}
      </g>
    </g>}

    {/* error trace */}
    <g opacity={errReveal}>
      <path d={(()=>{
        const s=pt(-120);
        const m=pt(A_MODEL);
        return `M ${s.x} ${s.y+40} Q ${(s.x+m.x)/2} ${cy+ry+120}, ${m.x+40} ${m.y+130}`;
      })()} fill="none" stroke={t.secondary} strokeWidth={2.5} strokeDasharray="6 8" opacity={errPulse}/>
      <g transform={`translate(${pt(A_MODEL).x+42} ${pt(A_MODEL).y+128})`} opacity={errPulse}>
        <path d="M-8 -14 L6 0 L-8 14" fill="none" stroke={t.secondary} strokeWidth={2.5} strokeLinecap="round"/>
      </g>
      <text x={980} y={758} fill={t.secondary} fontSize={24} opacity={errPulse}>报错 = 新信息</text>
    </g>

    {/* cycle counter notches lower-right outside loop */}
    <g transform="translate(1620 840)">
      {ticks.map((v,i)=>{
        const a=(-70+i*14)*Math.PI/180;
        const x1=Math.cos(a)*60, y1=Math.sin(a)*60;
        const x2=Math.cos(a)*(60+34*v), y2=Math.sin(a)*(60+34*v);
        return <line key={i} x1={x1} y1={y1} x2={x2} y2={y2}
          stroke={v>0.5?t.accent:t.muted} strokeWidth={5} strokeLinecap="round" opacity={0.3+0.7*v}/>;
      })}
      <text y={120} textAnchor="middle" fill={t.muted} fontSize={24}>累积的圈数</text>
    </g>

    {/* task payload */}
    <g transform={`translate(${payX} ${payY}) scale(${payloadScale})`} opacity={payloadVisible}>
      <TaskBody scale={1}/>
    </g>

    {/* Inline labels for nodes */}
    <g fill={t.muted} fontSize={24} opacity={draw}>
      <text x={cx} y={cy-ry-40} textAnchor="middle">任务入口</text>
    </g>

    {/* footer example caption (illustrative example per brief) */}
    <g opacity={0.9}>
      <text x={120} y={950} fill={t.muted} fontSize={24}>教学示意 · 非完整产品内部结构</text>
    </g>
  </svg>;
}
