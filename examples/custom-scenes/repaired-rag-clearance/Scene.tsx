import React from 'react';
import { interpolate, spring } from 'remotion';

type Theme = {
  background: string;
  foreground: string;
  muted: string;
  accent: string;
  secondary: string;
};

type SceneProps = {
  frame: number;
  fps: number;
  width: number;
  height: number;
  theme: Theme;
};

type Cue = { start: number; end: number };

// Cue windows derived from brief timing (do not split equally).
const CUE1: Cue = { start: 6, end: 83 };
const CUE2: Cue = { start: 94, end: 230 };
const CUE3: Cue = { start: 243, end: 424 };
const CUE4: Cue = { start: 447, end: 664 };
const CUE5: Cue = { start: 673, end: 842 };
const CUE6: Cue = { start: 852, end: 932 };

const clamp = { extrapolateLeft: 'clamp' as const, extrapolateRight: 'clamp' as const };

// Sub-phase interpolator within a cue window.
function phase(frame: number, cue: Cue, from: number, to: number): number {
  const a = cue.start + (cue.end - cue.start) * from;
  const b = cue.start + (cue.end - cue.start) * to;
  return interpolate(frame, [a, b], [0, 1], clamp);
}

// Carry a state forward: hold previous toState through gaps.
function stageDone(frame: number, cue: Cue, frac: number): number {
  const t = cue.start + (cue.end - cue.start) * frac;
  return frame >= t ? 1 : interpolate(frame, [cue.start + (cue.end - cue.start) * Math.max(0, frac - 0.18), t], [0, 1], clamp);
}

function pipelineMotion(frame:number){
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

// ---- Geometry constants ----
const EMITTER = { x: 60, y: 420, w: 170, h: 300 };
const EMITTER_MOUTH_X = EMITTER.x + EMITTER.w; // 230
const EMITTER_MOUTH_Y = 570;

const ROLL_W = 120;
const ROLL_H = 170;
// Rolls seat in emitter: centered around y ~ 540
const ROLL_SEAT = { x: EMITTER.x + 26, y: EMITTER.y + 70 };
// Docked waiting position left of retrieval gantry (x510)
const ROLL_DOCK_X = 330;
const ROLL_DOCK_Y = 470;

const GANTRY = { x: 510, y: 330, w: 240, h: 420 };
const GANTRY_LEFT_POST = GANTRY.x + 20;
const GANTRY_RIGHT_POST = GANTRY.x + GANTRY.w - 20;
const GANTRY_BEAM_Y = GANTRY.y + 60;
const GANTRY_TROLLEY_Y = GANTRY.y + 110;

const LIB = { x: 830, y: 300, w: 260, h: 420 };
// Fragment slot near the third slot of the shelf
const FRAG_W = 120;
const FRAG_H = 160;
const FRAG_SHELF_X = 900;
const FRAG_SHELF_Y = 440;

const SLOT = { x: 1150, y: 470, w: 280, h: 300 };
const SLOT_OPEN_X = SLOT.x + 20;
const SLOT_OPEN_Y = SLOT.y + 20;
const SLOT_OPEN_W = SLOT.w - 40;

const GEN = { x: 1470, y: 300, w: 300, h: 470 };
const GEN_INLET_LEFT = 1470; // per design
const GEN_INLET_Y = GEN.y + 260;
const GEN_OUTLET_Y = GEN.y + 60;

const ANSWER_X0 = 1650;
const ANSWER_Y0 = 300;
const ANSWER_W = 150;
const ANSWER_H = 200;

// ---- Step labels (independent markers) ----
const STEP1 = { x: 545, y: 255, w: 170, h: 52 };
const STEP2 = { x: 1205, y: 255, w: 170, h: 52 };
const STEP3 = { x: 1535, y: 236, w: 170, h: 52 };

// ---- Chain guide ----
const CHAIN = { x: 545, y: 200, w: 1160, h: 40 };

// Step light levels: 0 planned, 1 lit, 2 settled
function stepLevel(frame: number, cue: Cue, litWindow: [number, number]): number {
  // lit window fraction of cue
  const litA = cue.start + (cue.end - cue.start) * litWindow[0];
  const litB = cue.start + (cue.end - cue.start) * litWindow[1];
  const settleAt = cue.end - 4;
  if (frame < litA) return 0;
  if (frame < litB) return interpolate(frame, [litA, litB], [0, 1], clamp);
  // after lit window, stay lit until settle
  if (frame < settleAt) return 1;
  return 1; // handled by caller if settled
}

// ---- Glyph helpers ----
function QuestionMark({ x, y, size, color }: { x: number; y: number; size: number; color: string }) {
  return (
    <text
      x={x}
      y={y}
      textAnchor="middle"
      dominantBaseline="central"
      fontFamily="ui-sans-serif, system-ui, 'Segoe UI', sans-serif"
      fontWeight={800}
      fontSize={size}
      fill={color}
    >
      ?
    </text>
  );
}

// ---- Emitter (feeder hopper) ----
function Emitter({ theme, loaded }: { theme: Theme; loaded: number }) {
  // loaded 1 = has paper, 0 = empty
  const lip = loaded > 0.5 ? theme.accent : theme.muted;
  return (
    <g data-object="question-emitter" data-obstacle="true">
      {/* trapezoid hopper, mouth to the right */}
      <path
        d={`M ${EMITTER.x} ${EMITTER.y + 60}
            L ${EMITTER.x + EMITTER.w} ${EMITTER.y + 0}
            L ${EMITTER.x + EMITTER.w} ${EMITTER.y + EMITTER.h}
            L ${EMITTER.x} ${EMITTER.y + EMITTER.h - 60} Z`}
        fill="none"
        stroke={theme.secondary}
        strokeWidth={4}
      />
      {/* rivet seams */}
      <line x1={EMITTER.x + 40} y1={EMITTER.y + 80} x2={EMITTER.x + 40} y2={EMITTER.y + EMITTER.h - 50} stroke={theme.muted} strokeWidth={2} />
      <line x1={EMITTER.x + 80} y1={EMITTER.y + 60} x2={EMITTER.x + 80} y2={EMITTER.y + EMITTER.h - 40} stroke={theme.muted} strokeWidth={2} />
      {/* foot */}
      <rect x={EMITTER.x + 50} y={EMITTER.y + EMITTER.h - 80} width={30} height={40} fill="none" stroke={theme.secondary} strokeWidth={3} />
      {/* mouth lip (gold when loaded) */}
      <line x1={EMITTER_MOUTH_X} y1={EMITTER.y} x2={EMITTER_MOUTH_X} y2={EMITTER.y + EMITTER.h} stroke={lip} strokeWidth={6} />
    </g>
  );
}

// ---- Gantry (retrieval gate) ----
function Gantry({ theme, jawOpen, hand }: { theme: Theme; jawOpen: number; hand: {x:number;y:number} }) {
  // jawOpen 1 = fully open, 0 = closed
  const spread = 12 + 26 * jawOpen; // inner half-width
  const cx = (GANTRY_LEFT_POST + GANTRY_RIGHT_POST) / 2;
  const jawY = GANTRY_TROLLEY_Y + 60;
  const finger = theme.accent;
  return (
    <g data-object="retrieval-gate">
      <rect x={GANTRY_LEFT_POST - 10} y={GANTRY.y} width={20} height={GANTRY.h} fill="none" stroke={theme.secondary} strokeWidth={4} data-obstacle="true" />
      <rect x={GANTRY_RIGHT_POST - 10} y={GANTRY.y} width={20} height={GANTRY.h} fill="none" stroke={theme.secondary} strokeWidth={4} data-obstacle="true" />
      <rect x={GANTRY_LEFT_POST - 20} y={GANTRY_BEAM_Y - 12} width={GANTRY_RIGHT_POST - GANTRY_LEFT_POST + 40} height={24} fill="none" stroke={theme.secondary} strokeWidth={4} />
      {/* rail */}
      <line x1={GANTRY_LEFT_POST} y1={GANTRY_TROLLEY_Y} x2={GANTRY_RIGHT_POST} y2={GANTRY_TROLLEY_Y} stroke={theme.accent} strokeWidth={3} strokeDasharray="10 8" />
      {/* Telescoping support follows the same gripper anchor as the fragment. */}
      <line x1={cx} y1={GANTRY_TROLLEY_Y} x2={hand.x} y2={hand.y-78} stroke={theme.muted} strokeWidth={2}/>
      <g transform={`translate(${hand.x-cx} ${hand.y-(jawY+18)})`}>
        <rect x={cx - 24} y={GANTRY_TROLLEY_Y - 10} width={48} height={16} fill="none" stroke={theme.accent} strokeWidth={3} />
        {/* left jaw */}
        <line x1={cx - spread} y1={GANTRY_TROLLEY_Y + 6} x2={cx - spread} y2={jawY} stroke={theme.secondary} strokeWidth={5} />
        <polygon points={`${cx - spread - 12},${jawY} ${cx - spread + 12},${jawY} ${cx - spread},${jawY + 18}`} fill={finger} />
        {/* right jaw */}
        <line x1={cx + spread} y1={GANTRY_TROLLEY_Y + 6} x2={cx + spread} y2={jawY} stroke={theme.secondary} strokeWidth={5} />
        <polygon points={`${cx + spread - 12},${jawY} ${cx + spread + 12},${jawY} ${cx + spread},${jawY + 18}`} fill={finger} />
        {/* beam to jaws */}
        <line x1={cx - spread} y1={GANTRY_TROLLEY_Y + 6} x2={cx + spread} y2={GANTRY_TROLLEY_Y + 6} stroke={theme.secondary} strokeWidth={3} />
      </g>
    </g>
  );
}

// ---- Document library (shelf) ----
function DocLibrary({ theme, sifted }: { theme: Theme; sifted: number }) {
  const backTilt = 4 + 6 * sifted;
  // four slot cards; third slot is empty when sifted
  const cardW = 70;
  const gap = -22;
  const baseX = LIB.x + 26;
  const baseY = LIB.y + 60;
  return (
    <g data-object="doc-library" data-obstacle="true">
      {/* open box tilted top */}
      <path
        d={`M ${LIB.x} ${LIB.y + 60}
            L ${LIB.x + LIB.w} ${LIB.y}
            L ${LIB.x + LIB.w} ${LIB.y + LIB.h - 40}
            L ${LIB.x} ${LIB.y + LIB.h} Z`}
        fill="none"
        stroke={theme.secondary}
        strokeWidth={4}
      />
      {/* front edge tick scale (no numbers) */}
      {[0, 1, 2, 3, 4, 5].map((i) => (
        <line
          key={i}
          x1={LIB.x + 30 + i * 40}
          y1={LIB.y + LIB.h - 18}
          x2={LIB.x + 30 + i * 40}
          y2={LIB.y + LIB.h - 30}
          stroke={theme.accent}
          strokeWidth={2}
        />
      ))}
      {/* four card slots (third omitted when sifted) */}
      {[0, 1, 2, 3].map((i) => {
        if (i === 2 && sifted > 0.5) return null;
        const cw = cardW;
        const tilt = (i * 0.4 - backTilt * 0.03) * 2;
        const x = baseX + i * (cw + gap);
        const y = baseY + i * 10;
        return (
          <g key={i} transform={`translate(${x} ${y}) rotate(${tilt})`}>
            <rect x={0} y={0} width={cw} height={140} fill={theme.background} stroke={theme.muted} strokeWidth={3} />
            <line x1={10} y1={20} x2={cw - 10} y2={20} stroke={theme.muted} strokeWidth={2} />
            <line x1={10} y1={36} x2={cw - 10} y2={36} stroke={theme.muted} strokeWidth={2} />
            <line x1={10} y1={52} x2={cw - 10} y2={52} stroke={theme.muted} strokeWidth={2} />
          </g>
        );
      })}
    </g>
  );
}

// ---- Augment slot ----
function AugmentSlot({ theme, sealed }: { theme: Theme; sealed: number }) {
  const lining = sealed > 0.5 ? theme.accent : theme.muted;
  const frontHeight = 120;
  return (
    <g data-object="augment-slot" data-obstacle="true">
      {/* back wall + sides */}
      <rect x={SLOT.x} y={SLOT.y} width={SLOT.w} height={SLOT.h} fill="none" stroke={theme.secondary} strokeWidth={4} />
      {/* towered bottom ledge (tray) */}
      <path
        d={`M ${SLOT.x + 10} ${SLOT.y + SLOT.h - 20}
            L ${SLOT.x + SLOT.w - 10} ${SLOT.y + SLOT.h - 20}
            L ${SLOT.x + SLOT.w - 10} ${SLOT.y + SLOT.h}
            L ${SLOT.x + 10} ${SLOT.y + SLOT.h} Z`}
        fill="none"
        stroke={theme.secondary}
        strokeWidth={4}
      />
      {/* inner lining */}
      <rect x={SLOT.x + 14} y={SLOT.y + 14} width={SLOT.w - 28} height={SLOT.h - 28} fill="none" stroke={lining} strokeWidth={2} strokeDasharray="6 8" />
      {/* left alignment notch */}
      <line x1={SLOT.x} y1={SLOT.y + SLOT.h * 0.55} x2={SLOT.x + 16} y2={SLOT.y + SLOT.h * 0.55} stroke={theme.accent} strokeWidth={4} />

    </g>
  );
}

// ---- Generator core ----
function Generator({
  theme,
  rotation,
  indicator,
  inletOpen,
  outletOpen,
}: {
  theme: Theme;
  rotation: number;
  indicator: number; // 0..1 -> muted..accent..gold
  inletOpen: number; // 1 open, 0 closed
  outletOpen: number; // 1 open, 0 closed
}) {
  const ringColor = indicator > 0.85 ? theme.accent : indicator > 0.35 ? theme.secondary : theme.muted;
  const cx = GEN.x + GEN.w * 0.5;
  const cy = GEN.y + GEN.h * 0.4;
  return (
    <g data-object="generator-core">
      {/* body */}
      <rect x={GEN.x} y={GEN.y} width={GEN.w} height={GEN.h} rx={40} fill={theme.background} stroke={theme.secondary} strokeWidth={5} data-obstacle="true" />
      {/* rivet bands */}
      {[GEN.y + 60, GEN.y + 260, GEN.y + 400].map((y, i) => (
        <line key={i} x1={GEN.x + 20} y1={y} x2={GEN.x + GEN.w - 20} y2={y} stroke={theme.muted} strokeWidth={3} />
      ))}
      {/* work wheel */}
      <g transform={`rotate(${rotation} ${cx} ${cy})`}>
        <circle cx={cx} cy={cy} r={70} fill="none" stroke={theme.secondary} strokeWidth={5} />
        <circle cx={cx} cy={cy} r={40} fill="none" stroke={theme.muted} strokeWidth={3} />
        {[0, 60, 120, 180, 240, 300].map((deg) => {
          const rad = (deg * Math.PI) / 180;
          return (
            <line
              key={deg}
              x1={cx + Math.cos(rad) * 40}
              y1={cy + Math.sin(rad) * 40}
              x2={cx + Math.cos(rad) * 68}
              y2={cy + Math.sin(rad) * 68}
              stroke={theme.secondary}
              strokeWidth={4}
            />
          );
        })}
      </g>
      {/* indicator ring */}
      <circle cx={cx} cy={cy} r={90} fill="none" stroke={ringColor} strokeWidth={5} strokeDasharray="24 12" />
      {/* inlet (bottom-left) */}
      <rect
        x={GEN_INLET_LEFT - 4}
        y={GEN_INLET_Y - 40}
        width={16}
        height={80}
        fill="none"
        stroke={theme.secondary}
        strokeWidth={3}
      />
      {inletOpen > 0.5 ? (
        <rect x={GEN_INLET_LEFT} y={GEN_INLET_Y - 40} width={40} height={80} fill={theme.background} stroke={theme.accent} strokeWidth={3} />
      ) : (
        <rect x={GEN_INLET_LEFT} y={GEN_INLET_Y - 40} width={40} height={80} fill={theme.background} stroke={theme.secondary} strokeWidth={3} />
      )}
      {/* support feet */}
      <rect x={GEN.x + 30} y={GEN.y + GEN.h} width={40} height={26} fill="none" stroke={theme.secondary} strokeWidth={3} />
      <rect x={GEN.x + GEN.w - 70} y={GEN.y + GEN.h} width={40} height={26} fill="none" stroke={theme.secondary} strokeWidth={3} />
      {/* outlet (top-right) */}
      <rect
        x={GEN.x + GEN.w - 20}
        y={GEN_OUTLET_Y - 40}
        width={28}
        height={80}
        fill="none"
        stroke={outletOpen > 0.5 ? theme.accent : theme.secondary}
        strokeWidth={3}
      />
    </g>
  );
}

// ---- Flow arrows ----
function FlowArrowA({ theme, active }: { theme: Theme; active: number }) {
  const color = active > 0.5 ? theme.accent : theme.muted;
  return (
    <g>
      <path
        id="route-a"
        data-route="true"
        d={`M ${EMITTER_MOUTH_X + 18} ${ROLL_DOCK_Y + 40} L ${ROLL_DOCK_X - 20} ${ROLL_DOCK_Y + 40}`}
        stroke={color}
        strokeWidth={3}
        fill="none"
        strokeDasharray="8 8"
      />
      <polygon points={`${ROLL_DOCK_X - 20 - 14},${ROLL_DOCK_Y + 34} ${ROLL_DOCK_X - 20 - 14},${ROLL_DOCK_Y + 46} ${ROLL_DOCK_X - 20},${ROLL_DOCK_Y + 40}`} fill={color} />
    </g>
  );
}

function FlowArrowB({ theme, active }: { theme: Theme; active: number }) {
  const color = active > 0.5 ? theme.accent : theme.muted;
  return (
    <g>
      <path
        id="route-b"
        data-route="true"
        d={`M 1240 ${GEN_INLET_Y} L 1590 ${GEN_INLET_Y}`}
        stroke={color}
        strokeWidth={3}
        fill="none"
        strokeDasharray="8 8"
      />
      <polygon points={`${GEN_INLET_LEFT - 20 - 14},${GEN_INLET_Y - 16} ${GEN_INLET_LEFT - 20 - 14},${GEN_INLET_Y - 4} ${GEN_INLET_LEFT - 20},${GEN_INLET_Y - 10}`} fill={color} />
    </g>
  );
}

// ---- Step label ----
function StepLabel({
  theme,
  x,
  y,
  w,
  number,
  text,
  level,
}: {
  theme: Theme;
  x: number;
  y: number;
  w: number;
  number: string;
  text: string;
  level: number; // 0 planned, 1 lit, else settled
}) {
  const lit = level;
  const plannedColor = theme.muted;
  const accentColor = theme.accent;
  const settledColor = theme.secondary;
  const strokeColor = lit > 0.6 ? accentColor : plannedColor;
  const fillColor = lit > 1.2 ? settledColor : lit > 0.6 ? accentColor : plannedColor;
  return (
    <g>
      <text
        x={x}
        y={y + 34}
        fontFamily="ui-monospace, SFMono-Regular, Menlo, monospace"
        fontWeight={800}
        fontSize={30}
        fill={fillColor}
      >
        {number}
      </text>
      <text
        x={x + 70}
        y={y + 34}
        fontFamily="ui-sans-serif, system-ui, 'Segoe UI', sans-serif"
        fontWeight={800}
        fontSize={30}
        fill={fillColor}
      >
        {text}
      </text>
      <line x1={x} y1={y + 46} x2={x + 150} y2={y + 46} stroke={strokeColor} strokeWidth={3} />
    </g>
  );
}

// ---- Chain guide ----
function ChainGuide({ theme, nodeLevels }: { theme: Theme; nodeLevels: number[] }) {
  const y = CHAIN.y + 20;
  const xs = [STEP1.x + 20, STEP2.x + 20, STEP3.x + 20];
  const lineColor = theme.secondary;
  return (
    <g>
      <line x1={CHAIN.x} y1={y} x2={CHAIN.x + CHAIN.w} y2={y} stroke={lineColor} strokeWidth={2} strokeDasharray="6 8" />
      {xs.map((nx, i) => {
        const c = nodeLevels[i] > 0.6 ? theme.accent : theme.muted;
        return (
          <g key={i}>
            <circle cx={nx} cy={y} r={8} fill={c} />
            <circle cx={nx} cy={y} r={14} fill="none" stroke={c} strokeWidth={2} />
          </g>
        );
      })}
    </g>
  );
}

export default function Scene(props: SceneProps): React.ReactElement {
  const { frame, fps, width, height, theme } = props;

  const motion = pipelineMotion(frame);
  const {roll,fragment,hand,jawOpen,answerProgress} = motion;
  const rollX=roll.x,rollY=roll.y,rollLift=0;
  const rollThickness=frame>=520?1:phase(frame,CUE4,.05,.35);
  const slotSealed=motion.slotSealed?1:0;
  const emitterLoaded=frame<44?1:0;
  const libSifted=frame>=310?1:0;

  // ---------- Steps ----------
  // Cue-2 sequence: 01 -> 02 -> 03
  const step1_c2 = phase(frame, CUE2, 0.05, 0.35);
  const step2_c2 = phase(frame, CUE2, 0.35, 0.6);
  const step3_c2 = phase(frame, CUE2, 0.6, 0.85);
  // settle 01 back after full pass
  const step1Settle = frame >= CUE2.start + (CUE2.end - CUE2.start) * 0.85 ? 1 : 0;
  const step2Settle = frame >= CUE5.start + (CUE5.end - CUE5.start) * 0.7 ? 1 : 0;
  const step3Settle = frame >= CUE5.start + (CUE5.end - CUE5.start) * 0.8 ? 1 : 0;

  // Step levels: 0 planned, 1 lit, 2 settled
  let lvl1 = 0;
  if (frame >= CUE2.start) {
    lvl1 = step1_c2 > 0.6 ? (step1Settle ? 2 : 1) : step1_c2;
  }
  let lvl2 = 0;
  if (frame >= CUE2.start + (CUE2.end - CUE2.start) * 0.35) {
    lvl2 = step2_c2 > 0.6 ? (step2Settle ? 2 : 1) : step2_c2;
  }
  let lvl3 = 0;
  if (frame >= CUE2.start + (CUE2.end - CUE2.start) * 0.6) {
    lvl3 = step3_c2 > 0.6 ? (step3Settle ? 2 : 1) : step3_c2;
  }

  // ---------- Chain nodes ----------
  const node1 = frame >= CUE2.start + (CUE2.end - CUE2.start) * 0.05 ? 1 : 0;
  const node2 = frame >= CUE2.start + (CUE2.end - CUE2.start) * 0.35 ? 1 : 0;
  const node3 = frame >= CUE2.start + (CUE2.end - CUE2.start) * 0.6 ? 1 : 0;

  // ---------- Generator states ----------
  // Waiting during cue-1..cue-4, then ingesting, generating, then hold final
  let rotation = 0;
  let indicator = 0;
  let inletOpen = 1;
  let outletOpen = 0;


  if (frame >= CUE5.start) {
    const ingestIn = phase(frame, CUE5, 0.35, 0.6);
    const generateIn = phase(frame, CUE5, 0.6, 0.95);
    inletOpen = 1 - ingestIn;
    rotation = frame < CUE5.end
      ? interpolate(ingestIn, [0, 1], [0, 30], clamp) + interpolate(generateIn, [0, 1], [0, 40], clamp)
      : 90;
    indicator = frame < CUE5.start + (CUE5.end - CUE5.start) * 0.75
      ? ingestIn
      : interpolate(generateIn, [0, 1], [0.4, 1], clamp);
    outletOpen = generateIn > 0.3 ? generateIn : 0;
    // Answer paper emerges

  } else if (frame >= CUE6.start) {
    // final hold handled by else branch
  } else {
    // waiting
    rotation = 0;
    indicator = 0;
    inletOpen = 1;
    outletOpen = 0;
  }

  if (frame >= CUE6.start) {
    rotation = 90;
    indicator = 0.7;
    inletOpen = 0;
    outletOpen = 1;

  }

  // Sliding answer sheet
  const answerX = motion.answerX;
  const answerY = GEN_OUTLET_Y - 20;

  // Flow arrows
  const arrowAActive = frame >= CUE1.start && frame < CUE6.start ? 1 : 0;
  const arrowBActive = frame >= CUE5.start && frame < CUE6.start ? 1 : 0;

  return (
      <svg width={width} height={height} viewBox={`0 0 ${width} ${height}`} style={{ position: 'absolute', inset: 0 }}>
        {/* Blueprint grid */}
        <defs>
          <pattern id="grid" width={40} height={40} patternUnits="userSpaceOnUse">
            <path d="M 40 0 L 0 0 0 40" fill="none" stroke={theme.muted} strokeWidth={0.6} opacity={0.25} />
          </pattern>
        </defs>
        <rect x={0} y={0} width={width} height={height} fill={theme.background} />
        <rect x={0} y={0} width={width} height={height} fill="url(#grid)" />

        {/* Title block */}
        <g>
          <text
            x={96}
            y={110}
            fontFamily="ui-monospace, SFMono-Regular, Menlo, monospace"
            fontWeight={700}
            fontSize={26}
            fill={theme.muted}
          >
            RAG WORKFLOW / 工作流程
          </text>
          <line x1={96} y1={136} x2={420} y2={136} stroke={theme.accent} strokeWidth={3} />
        </g>

        {/* Chain guide line + nodes */}
        <ChainGuide theme={theme} nodeLevels={[node1, node2, node3]} />

        {/* Step labels */}
        <StepLabel theme={theme} x={STEP1.x} y={STEP1.y} w={STEP1.w} number="01" text="检索" level={lvl1} />
        <StepLabel theme={theme} x={STEP2.x} y={STEP2.y} w={STEP2.w} number="02" text="增强" level={lvl2} />
        <StepLabel theme={theme} x={STEP3.x} y={STEP3.y} w={STEP3.w} number="03" text="生成" level={lvl3} />

        {/* Flow arrows (drawn behind main mechanism) */}
        <FlowArrowA theme={theme} active={arrowAActive} />
        <FlowArrowB theme={theme} active={arrowBActive} />
        <path id="route-transfer" data-route="true" d="M 390 555 V 859 H 1240 V 585" fill="none" stroke={theme.muted} strokeWidth={2} strokeDasharray="6 8"/>

        {/* Document library (back) */}
        <DocLibrary theme={theme} sifted={libSifted} />

        {/* Gantry */}
        <Gantry theme={theme} jawOpen={jawOpen} hand={hand} />

        {/* Augment slot (back wall) */}
        <AugmentSlot theme={theme} sealed={slotSealed} />



        {/* Answer sheet (drawn behind generator outlet ring, but pulled forward) */}
        <g data-object="answer-sheet" opacity={answerProgress > 0 ? 1 : 0}>
          <rect
            x={answerX}
            y={answerY}
            width={ANSWER_W}
            height={ANSWER_H}
            rx={6}
            fill={theme.background}
            stroke={theme.secondary}
            strokeWidth={3}
            opacity={0.15 + 0.85 * answerProgress}
          />
          {/* text bars */}
          {[0, 1, 2, 3, 4].map((i) => (
            <line
              key={i}
              x1={answerX + 18}
              y1={answerY + 40 + i * 22}
              x2={answerX + ANSWER_W - 18 - (i % 2 === 1 ? 24 : 0)}
              y2={answerY + 40 + i * 22}
              stroke={theme.foreground}
              strokeWidth={4}
              opacity={0.3 + 0.6 * answerProgress}
            />
          ))}
          {/* gold seal stamp top-right */}
          <circle cx={answerX + ANSWER_W - 26} cy={answerY + 26} r={10} fill={theme.accent} opacity={0.2 + 0.8 * answerProgress} />
        </g>

        <g data-object="question-roll"
          transform={`translate(${rollX+ROLL_W/2} ${rollY+ROLL_H/2})`}
          data-follow-path={frame>=500&&frame<=654?'route-transfer':frame>=706&&frame<=778?'route-b':undefined}>
          <rect x={-60} y={-85} width={120} height={170} rx={14} fill={theme.background} stroke={theme.secondary} strokeWidth={4}/>
          <line x1={-50} y1={-93} x2={50} y2={-93} stroke={theme.secondary} strokeWidth={4}/>
          <QuestionMark x={0} y={-45} size={56} color={theme.foreground}/>
          <path d={`M -60 71 Q 0 ${91+20*rollThickness} 60 71`} fill="none" stroke={theme.secondary} strokeWidth={4}/>
        </g>
        {/* One physical fragment remains present through pickup and attachment. */}
        <g data-object="doc-fragment" transform={`translate(${fragment.x} ${fragment.y}) scale(${fragment.scale})`}>
          <rect x={0} y={0} width={FRAG_W} height={FRAG_H} rx={4} fill={theme.background} stroke={theme.accent} strokeWidth={3}/>
          <polygon points="0,0 22,0 0,22" fill={theme.accent}/>
          {[34,54,74].map((y,i)=><line key={y} x1={14} y1={y} x2={FRAG_W-14-i*8} y2={y} stroke={theme.foreground} strokeWidth={3}/>)}
        </g>
        {/* Foreground masks preserve the opening instead of fading the payload. */}
        <rect data-object="augment-slot" data-obstacle="true" x={SLOT.x} y={SLOT.y+180} width={SLOT.w} height={120} fill={theme.background} stroke={theme.secondary} strokeWidth={4}/>
        <g data-object="augment-slot" data-part="tray-intake">
          <rect x={1176} y={758} width={128} height={26} fill={theme.background} stroke={slotSealed?theme.accent:theme.muted} strokeWidth={3}/>
        </g>
        {/* Generator */}
        <Generator
          theme={theme}
          rotation={rotation}
          indicator={indicator}
          inletOpen={inletOpen}
          outletOpen={outletOpen}
        />

        {/* Emitter (front lip overlays roll bottom in seated phase) */}
        <Emitter theme={theme} loaded={emitterLoaded} />
      </svg>
  );
}


