import React from 'react';
import {interpolate, Easing} from 'remotion';

export type SceneProps = {
  frame: number; fps: number; width: number; height: number;
  theme: {background: string; foreground: string; muted: string; accent: string; secondary: string};
};

export default function Scene(props: SceneProps) {
  const t = props.theme;
  const width = props.width;
  const height = props.height;
  const f = Math.max(0, Math.min(2308, props.frame * 30 / props.fps));

  const clamp = (v: number, a: number, b: number) => Math.max(a, Math.min(b, v));
  const motion = (start: number, end: number, from = 0, to = 1) =>
    interpolate(f, [start, end], [from, to], {extrapolateLeft: 'clamp', extrapolateRight: 'clamp', easing: Easing.inOut(Easing.cubic)});
  const linear = (start: number, end: number, from = 0, to = 1) =>
    interpolate(f, [start, end], [from, to], {extrapolateLeft: 'clamp', extrapolateRight: 'clamp'});

  // ---- ring geometry ----
  const cx = 960, cy = 470, R = 330;
  const angleDeg = (deg: number) => (deg * Math.PI) / 180;
  const ptOnRing = (deg: number, r = R) => ({x: cx + r * Math.cos(angleDeg(deg)), y: cy + r * Math.sin(angleDeg(deg))});
  // valve angular anchors (screen coords: 0deg=right,+cw down)
  const A_REQUEST = 210; // upper-left
  const A_THINK = 15;    // right, slightly above center
  const A_ACT = 105;     // bottom-ish
  const A_RESULT = 135;  // lower-left

  const pRequest = ptOnRing(A_REQUEST);
  const pThink = ptOnRing(A_THINK);
  const pAct = ptOnRing(A_ACT);
  const pResult = ptOnRing(A_RESULT);

  // return pipe: from result basin up-right into think contact, a real quadratic arc
  const retStart = {x: pResult.x - 30, y: pResult.y + 6};
  const retEnd = {x: pThink.x + 4, y: pThink.y - 8};
  const retCtrl = {x: 760, y: 210};
  const quad = (s: {x: number; y: number}, c: {x: number; y: number}, e: {x: number; y: number}, u: number) => {
    const mu = 1 - u;
    return { x: mu * mu * s.x + 2 * mu * u * c.x + u * u * e.x, y: mu * mu * s.y + 2 * mu * u * c.y + u * u * e.y };
  };

  // ---- beat params ----
  // cue-2 seat payload at request (189-316)
  const seat = motion(200, 316);
  // cue-3 request -> think along top of ring (322-457)
  const toThink = motion(340, 452);
  // cue-4 think -> act (463-694)
  const toAct = motion(510, 640);
  const scan = motion(560, 690);
  // cue-5 act -> result basin (700-941)
  const toResult = motion(710, 820);
  const resultResolve = motion(800, 860);
  const errorPass = f >= 1580; // error run happens later in cue-8; first result is success
  const lift = motion(880, 995); // payload lifted onto return pipe
  // cue-6 ride return pipe into think (947-1257)
  const rideBack = motion(1055, 1230);
  const ghosts = motion(1180, 1300);
  // cue-7 third lap pump: think -> act again (1263-1674)
  const lap3 = motion(1300, 1500);
  const thinkPulse7 = 0.5 + 0.5 * Math.sin(clamp((f - 1280) / 120, 0, 10));
  // cue-8 error run + solved exit (1680-2278)
  const errSnap = motion(1690, 1760);
  const errRide = motion(1780, 1990);
  const solvedMark = motion(2020, 2090);
  const gateOpen = motion(2020, 2090);
  const exitMove = motion(2100, 2200);

  // ---- payload position resolver ----
  let px = pRequest.x;
  let py = pRequest.y - 60 * (1 - 0);
  // base: from frame one payload rests at request mouth
  const arriveAtRequest = {x: pRequest.x, y: pRequest.y};
  px = arriveAtRequest.x; py = arriveAtRequest.y;

  // seat nudge into valve
  const seatPos = {x: pRequest.x + 6, y: pRequest.y + 4};
  px = px + (seatPos.x - px) * seat;
  py = py + (seatPos.y - py) * seat;

  // travel request->think: go along ring decreasing angle (top arc, counterclockwise in angle terms)
  const arcTop = (u: number) => {
    const a = A_REQUEST - 360 * u; // wrap around top
    const a2 = A_REQUEST + (A_THINK - (A_REQUEST - 360)) * u; // actually go the short way over top
    const ang = A_REQUEST + (A_THINK - 360 - A_REQUEST) * u; // pass through 0 top
    return ptOnRing(ang);
  };
  // choose top arc between A_REQUEST(210) going up through 270/0 to A_THINK(15): from 210 decreasing to 15 via 90? We'll route via upper region (angles 210 -> 270 -> 360+15)
  const arcRequestThink = (u: number) => {
    const startA = A_REQUEST; // 210
    const endA = A_THINK + 360; // 375
    const ang = startA + (endA - startA) * u; // 210 -> 375, passing 270(bottom)? no 270 is bottom
    return ptOnRing(ang);
  };
  // 210->375 passes 270(bottom) and 0(right): that goes the wrong (long) way for visual, but still on ring.
  // Use the upper short way: 210 -> 180 -> 90 -> 15
  const arcRequestThinkShort = (u: number) => {
    const startA = A_REQUEST; // 210
    const endA = A_THINK; // 15
    const ang = startA - (startA - endA) * u; // 210 -> 15 decreasing, passes 90 (bottom)? 90 is bottom.
    return ptOnRing(ang);
  };
  // Screen: 90deg = bottom, 270 = top. So to go over the TOP from 210 to 15 we go 210 -> 270 -> 360/0 -> 15 (i.e., increasing through 270 top then wrap).
  const arcTopPath = (u: number) => {
    const startA = A_REQUEST; // 210
    const endA = A_THINK + 360; // 375 => 15 equivalent, going 210->270->360->375
    const ang = startA + (endA - startA) * u; // 210 -> 375 passes 270(top),0,90? 90 is bottom not on this increasing route until 450. good, passes 270(top),360=0(right)
    return ptOnRing(ang);
  };
  const pThinkPos = arcTopPath(toThink);
  if (toThink > 0) {
    const baseX = arriveAtRequest.x + (seatPos.x - arriveAtRequest.x) * seat;
    const baseY = arriveAtRequest.y + (seatPos.y - arriveAtRequest.y) * seat;
    px = baseX + (pThinkPos.x - baseX) * toThink;
    py = baseY + (pThinkPos.y - baseY) * toThink;
  }

  // think -> act: down right side A_THINK(15) -> A_ACT(105) increasing
  const arcDown = (u: number) => ptOnRing(A_THINK + (A_ACT - A_THINK) * u);
  if (toAct > 0) {
    const s = arcTopPath(1);
    const p = arcDown(toAct);
    px = s.x + (p.x - s.x) * toAct;
    py = s.y + (p.y - s.y) * toAct;
  }

  // act -> result: A_ACT(105) -> A_RESULT(135)
  const arcActResult = (u: number) => ptOnRing(A_ACT + (A_RESULT - A_ACT) * u);
  if (toResult > 0) {
    const s = arcDown(1);
    const p = arcActResult(toResult);
    px = s.x + (p.x - s.x) * toResult;
    py = s.y + (p.y - s.y) * toResult;
  }

  // lift onto return pipe, then ride it back
  if (lift > 0) {
    const s = arcActResult(1);
    const startRet = quad(retStart, retCtrl, retEnd, 0);
    px = s.x + (startRet.x - s.x) * lift;
    py = s.y + (startRet.y - s.y) * lift;
  }
  if (rideBack > 0) {
    const u = rideBack;
    const rp = quad(retStart, retCtrl, retEnd, u);
    const startRet = quad(retStart, retCtrl, retEnd, 0);
    px = startRet.x + (rp.x - startRet.x) * rideBack;
    py = startRet.y + (rp.y - startRet.y) * rideBack;
  }
  // after rideBack(1) payload at think. Then lap3 pumps think->act again.
  if (lap3 > 0) {
    const s = retEnd;
    const p = arcDown(lap3);
    px = s.x + (p.x - s.x) * lap3;
    py = s.y + (p.y - s.y) * lap3;
  }
  // error run: at end of lap3 payload near act; then take result & return again
  if (errSnap > 0) {
    // payload sits in act/result zone
    const s = arcDown(1);
    const p = arcActResult(errSnap);
    px = s.x + (p.x - s.x) * errSnap;
    py = s.y + (p.y - s.y) * errSnap;
  }
  if (errRide > 0) {
    // lift onto pipe then ride back
    const liftE = clamp(errRide / 0.2, 0, 1);
    const rideE = clamp((errRide - 0.2) / 0.8, 0, 1);
    const s = arcActResult(1);
    const startRet = quad(retStart, retCtrl, retEnd, 0);
    const baseX = s.x + (startRet.x - s.x) * liftE;
    const baseY = s.y + (startRet.y - s.y) * liftE;
    const rp = quad(retStart, retCtrl, retEnd, rideE);
    px = baseX + (rp.x - baseX) * rideE;
    py = baseY + (rp.y - baseY) * rideE;
  }
  // solved exit through done-gate near think
  if (exitMove > 0) {
    const from = {x: retEnd.x + 10, y: retEnd.y - 10};
    const to = {x: 1560, y: 360};
    px = from.x + (to.x - from.x) * exitMove;
    py = from.y + (to.y - from.y) * exitMove;
  }

  // payload rotation follows tangent loosely (small tilt only)
  const tilt = 0;

  // ---- valve pulse params ----
  const requestGlow = motion(200, 316) * (1 - motion(340, 400)) + 0.15;
  const thinkGlowBase = motion(320, 380) * (1 - motion(430, 470));
  const thinkGlow2 = motion(1055, 1150) * (1 - motion(1230, 1300));
  const thinkGlow3 = motion(1280, 1360) * (1 - motion(1560, 1600));
  const thinkGlow = clamp(thinkGlowBase + thinkGlow2 + thinkGlow3 + thinkPulse7 * 0.25 * (f >= 1263 ? 1 : 0), 0, 1);
  const actGlow = motion(510, 570) * (1 - motion(690, 740));
  const resultGlow = motion(710, 780) * (1 - motion(900, 960));
  const resultErr = errorPass ? 1 : 0;

  // ridge pulse geometry (three short lines inside think)
  const ridgeOff = 4 + 10 * thinkGlow;

  // ghost rings opacity
  const ghostOpacity = ghosts * 0.5;

  // error mark follows payload once snapped
  const errX = px + 34;
  const errY = py - 30;

  // solved badge
  const solvedOpacity = solvedMark;

  // done gate seam near think
  const gateAng = A_THINK - 22;
  const gp = ptOnRing(gateAng, R + 48);

  const strokeBand = 46;

  return (
    <svg width={width} height={height} viewBox="0 0 1920 1080"
      style={{display: 'block', background: t.background, fontFamily: '"Noto Sans SC", sans-serif'}}
      role="img" aria-label="Agent 的工作循环：任务沿闭环流转，结果经金色回流管回到模型">
      <defs>
        <pattern id="bp-grid" width={48} height={48} patternUnits="userSpaceOnUse">
          <path d="M48 0 H0 V48" fill="none" stroke={t.muted} strokeWidth={0.7} opacity={0.10}/>
        </pattern>
        <linearGradient id="band-grad" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor={t.muted} stopOpacity={0.14}/>
          <stop offset="1" stopColor={t.muted} stopOpacity={0.03}/>
        </linearGradient>
        <radialGradient id="payload-glow" cx="0.5" cy="0.5" r="0.5">
          <stop offset="0" stopColor={t.accent} stopOpacity={0.5}/>
          <stop offset="1" stopColor={t.accent} stopOpacity={0}/>
        </radialGradient>
      </defs>

      <rect width={1920} height={1080} fill={t.background}/>
      <rect x={80} y={130} width={1760} height={810} fill="url(#bp-grid)"/>

      {/* title zone upper-left, kept clear */}
      <text x={140} y={150} fill={t.foreground} fontSize={84}>Agent 的工作循环</text>
      <text x={146} y={205} fill={t.muted} fontSize={28}>一个闭环，就是它的心脏</text>

      {/* construction arcs (faint) */}
      <g fill="none" stroke={t.muted} opacity={0.22} strokeWidth={1}>
        <circle cx={cx} cy={cy} r={R + strokeBand + 52} strokeDasharray="3 9"/>
        <circle cx={cx} cy={cy} r={R - strokeBand - 40} strokeDasharray="3 9"/>
      </g>

      {/* spiral accumulation ghost rings */}
      <g fill="none" stroke={t.accent} opacity={ghostOpacity} strokeWidth={2}>
        <ellipse cx={cx - 8} cy={cy - 6} rx={R - 92} ry={R - 110} strokeDasharray="4 10"/>
        <ellipse cx={cx - 16} cy={cy - 12} rx={R - 128} ry={R - 148} strokeDasharray="4 10"/>
        <ellipse cx={cx - 24} cy={cy - 18} rx={R - 164} ry={R - 186} strokeDasharray="4 10"/>
      </g>

      {/* LOOP RING BAND (behind valves) */}
      <g data-object="loop-ring">
        <circle cx={cx} cy={cy} r={R} fill="none" stroke={t.background} strokeWidth={strokeBand + 10}/>
        <circle cx={cx} cy={cy} r={R} fill="none" stroke={t.muted} strokeWidth={strokeBand} opacity={0.85}/>
        <circle cx={cx} cy={cy} r={R} fill="none" stroke="url(#band-grad)" strokeWidth={strokeBand}/>
        <circle cx={cx} cy={cy} r={R - strokeBand / 2 - 2} fill="none" stroke={t.accent} strokeWidth={2} opacity={0.55}/>
        <circle cx={cx} cy={cy} r={R + strokeBand / 2 + 2} fill="none" stroke={t.muted} strokeWidth={1.5} opacity={0.6}/>
      </g>

      {/* RETURN PIPE (in front of ring, behind think front lip) */}
      <g data-object="return-pipe">
        <path d={`M${retStart.x} ${retStart.y} Q${retCtrl.x} ${retCtrl.y} ${retEnd.x} ${retEnd.y}`}
          fill="none" stroke={t.background} strokeWidth={26} strokeLinecap="round"/>
        <path d={`M${retStart.x} ${retStart.y} Q${retCtrl.x} ${retCtrl.y} ${retEnd.x} ${retEnd.y}`}
          fill="none" stroke={t.secondary} strokeWidth={16} strokeLinecap="round" opacity={0.92}/>
        <path d={`M${retStart.x} ${retStart.y} Q${retCtrl.x} ${retCtrl.y} ${retEnd.x} ${retEnd.y}`}
          fill="none" stroke={t.secondary} strokeWidth={4} strokeLinecap="round" opacity={0.6} strokeDasharray="1 14"/>
        {/* inlet funnel at think end */}
        <path d={`M${retEnd.x - 22} ${retEnd.y - 18} L${retEnd.x + 6} ${retEnd.y} L${retEnd.x - 22} ${retEnd.y + 18}`}
          fill="none" stroke={t.secondary} strokeWidth={5} strokeLinejoin="round"/>
      </g>

      {/* REQUEST VALVE (upper-left) */}
      <g data-object="request-valve" transform={`translate(${pRequest.x} ${pRequest.y})`}>
        <circle r={70} fill={t.background} stroke={t.muted} strokeWidth={3}/>
        <circle r={70} fill="none" stroke={t.accent} strokeWidth={2} opacity={0.3 + 0.7 * requestGlow}/>
        {/* intake lips */}
        <path d={`M-46 -18 Q0 -52 46 -18`} fill="none" stroke={t.accent} strokeWidth={4} strokeLinecap="round"/>
        <path d={`M-46 18 Q0 -16 46 18`} fill="none" stroke={t.accent} strokeWidth={4} strokeLinecap="round" opacity={0.8}/>
        <text x={-24} y={-92} fill={t.foreground} fontSize={26}>需求</text>
        <text x={-24} y={-64} fill={t.muted} fontSize={20}>帮我修好这个 bug</text>
      </g>

      {/* THINK VALVE (right) */}
      <g data-object="think-valve" transform={`translate(${pThink.x} ${pThink.y})`}>
        <circle r={84} fill={t.background} stroke={t.muted} strokeWidth={3}/>
        <circle r={84} fill="none" stroke={t.accent} strokeWidth={2.5} opacity={0.25 + 0.75 * thinkGlow}/>
        {/* gold contact on outer edge */}
        <circle cx={70} cy={-20} r={12} fill={t.secondary}/>
        <circle cx={70} cy={-20} r={18} fill="none" stroke={t.secondary} strokeWidth={2} opacity={0.6}/>
        {/* deliberation ridges */}
        <g stroke={t.accent} strokeWidth={4} strokeLinecap="round" opacity={0.4 + 0.6 * thinkGlow}>
          <path d={`M-46 ${-18 + ridgeOff * 0} H-6`}/>
          <path d={`M-46 ${0} H14`}/>
          <path d={`M-46 ${18} H-6`}/>
        </g>
        <text x={-30} y={-108} fill={t.foreground} fontSize={26}>想一想</text>
        <text x={-30} y={112} fill={t.muted} fontSize={20}>下一步做什么？</text>
      </g>

      {/* ACT VALVE (lower) */}
      <g data-object="act-valve" transform={`translate(${pAct.x} ${pAct.y})`}>
        <circle r={78} fill={t.background} stroke={t.muted} strokeWidth={3}/>
        <circle r={78} fill="none" stroke={t.accent} strokeWidth={2} opacity={0.2 + 0.8 * actGlow}/>
        {/* terminal slot */}
        <rect x={-52} y={-14} width={104} height={30} rx={6} fill={t.background} stroke={t.muted} strokeWidth={2}/>
        {/* cursor */}
        <rect x={-52 + 96 * scan} y={-12} width={5} height={26} fill={t.accent} opacity={0.4 + 0.6 * actGlow}/>
        {/* jaw plates */}
        <path d={`M-60 -26 L-38 -34`} stroke={t.muted} strokeWidth={4} strokeLinecap="round"/>
        <path d={`M60 -26 L38 -34`} stroke={t.muted} strokeWidth={4} strokeLinecap="round"/>
        <text x={-18} y={-100} fill={t.foreground} fontSize={26}>动手</text>
        <text x={-78} y={112} fill={t.muted} fontSize={20}>看文件 · 搜代码 · 跑命令</text>
      </g>

      {/* RESULT VALVE (lower-left) */}
      <g data-object="result-valve" transform={`translate(${pResult.x} ${pResult.y})`}>
        <circle r={72} fill={t.background} stroke={t.muted} strokeWidth={3}/>
        <circle r={72} fill="none" stroke={resultErr ? t.secondary : t.accent} strokeWidth={2} opacity={0.2 + 0.8 * resultGlow}/>
        {/* catch basin lip facing up */}
        <path d={`M-44 -10 Q0 -40 44 -10`} fill="none" stroke={t.accent} strokeWidth={4} strokeLinecap="round"/>
        {/* result window */}
        <rect x={-34} y={8} width={68} height={30} rx={5} fill={t.background}
          stroke={resultErr ? t.secondary : t.accent} strokeWidth={2} opacity={0.4 + 0.6 * resultResolve}/>
        {resultErr ? (
          <g stroke={t.secondary} strokeWidth={3} strokeLinecap="round" opacity={0.4 + 0.6 * resultResolve}>
            <path d="M-18 18 L18 30 M18 18 L-18 30"/>
          </g>
        ) : (
          <path d="M-16 23 L-6 31 L16 15" fill="none" stroke={t.accent} strokeWidth={3} strokeLinecap="round" strokeLinejoin="round" opacity={0.4 + 0.6 * resultResolve}/>
        )}
        <text x={-30} y={-92} fill={t.foreground} fontSize={26}>结果回流</text>
        <text x={-40} y={112} fill={t.muted} fontSize={20}>成功或报错，都是新信息</text>
      </g>

      {/* DONE GATE near think */}
      <g data-object="done-gate">
        <circle cx={gp.x} cy={gp.y} r={16} fill={t.background} stroke={gateOpen > 0.5 ? t.secondary : (t.muted as string)} strokeWidth={3}/>
        <path d={`M${gp.x - 10} ${gp.y} H${gp.x + 10}`} stroke={gateOpen > 0.5 ? t.secondary : (t.muted as string)} strokeWidth={3} strokeLinecap="round"
          transform={gateOpen > 0.5 ? `rotate(${35 * gateOpen} ${gp.x} ${gp.y})` : undefined}/>
        {solvedOpacity > 0 && (
          <text x={gp.x + 26} y={gp.y + 8} fill={t.secondary} fontSize={22} opacity={solvedOpacity}>完成出口</text>
        )}
      </g>

      {/* TASK PAYLOAD (folded-corner bug tag) */}
      <g data-object="task-payload" transform={`translate(${px} ${py})`}>
        <circle r={48} fill="url(#payload-glow)" opacity={0.9}/>
        <g transform={`translate(-42 -40) rotate(${tilt})`}>
          <path d="M0 0 H74 L96 22 V84 H0 Z" fill={t.background} stroke={t.accent} strokeWidth={3}/>
          <path d="M74 0 V22 H96" fill="none" stroke={t.secondary} strokeWidth={3}/>
          {/* bug glyph */}
          <g stroke={t.accent} strokeWidth={2.5} fill="none" strokeLinecap="round">
            <ellipse cx={48} cy={48} rx={12} ry={16}/>
            <path d="M36 42 H30 M36 52 H30 M60 42 H66 M60 52 H66"/>
            <path d="M36 36 L30 30 M60 36 L66 30"/>
            <path d="M48 32 V28"/>
          </g>
        </g>
      </g>

      {/* ERROR MARK snapped on payload */}
      {errSnap > 0 && solvedMark < 0.5 && (
        <g data-object="error-mark" transform={`translate(${errX} ${errY})`} opacity={errSnap}>
          <path d="M0 0 L18 -10 L14 2 L30 0 L12 20 L16 8 L0 12 Z" fill={t.secondary} stroke={t.secondary} strokeWidth={1.5}/>
          <text x={20} y={12} fill={t.secondary} fontSize={20}>报错</text>
        </g>
      )}

      {/* SOLVED badge */}
      {solvedOpacity > 0 && (
        <g transform={`translate(${px + 34} ${py - 34})`} opacity={solvedOpacity}>
          <circle r={16} fill={t.background} stroke={t.accent} strokeWidth={3}/>
          <path d="M-7 0 L-2 6 L8 -6" fill="none" stroke={t.accent} strokeWidth={3} strokeLinecap="round" strokeLinejoin="round"/>
        </g>
      )}

      {/* foot note: illustrative */}
      <text x={140} y={960} fill={t.muted} fontSize={20}>示意：简化的教学回路，非完整产品内部结构</text>
    </svg>
  );
}