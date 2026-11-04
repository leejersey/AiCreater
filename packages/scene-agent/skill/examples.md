# Worked examples: draw the idea, not a card

An icon and a title in a rounded box says the word; it does not show the idea. When the narration names a problem, a limit or a step, draw a small object whose state changes while it is spoken. These snippets come from a scene that taught three RAG challenges well. Copy the technique, not the content: your brief decides what the objects are.

All snippets are frame-driven and take their colors from the theme. `fade(a,b)` is a helper for a 0→1 ramp:

```tsx
const fade=(a:number,b:number)=>interpolate(frame,[a,b],[0,1],{extrapolateLeft:'clamp',extrapolateRight:'clamp'});
const {foreground:fg,muted,accent,negative:BAD,radius}=theme;
```

## Something that is wrong: mark it, don't describe it

"召回不相关文档" — a row of retrieved documents where one is wrong and gets crossed out; the answer it feeds is struck through.

```tsx
const bad=fade(470,490), strike=fade(500,530);
<g data-object id="wrong-doc">
  <g data-obstacle>
    <rect x={cx-190} y={420} width={100} height={130} rx={radius} fill={fg} fillOpacity={0.06} stroke={muted} strokeWidth={2.5}/>
    <rect x={cx-70}  y={420} width={100} height={130} rx={radius} fill={fg} fillOpacity={0.06} stroke={muted} strokeWidth={2.5}/>
  </g>
  <rect x={cx+50} y={420} width={100} height={130} rx={radius} fill={BAD} fillOpacity={0.18} stroke={BAD} strokeWidth={3.5} opacity={bad}/>
  <g opacity={bad} transform={`translate(${cx+100},485)`}>
    <line x1={-24} y1={-24} x2={24} y2={24} stroke={BAD} strokeWidth={5}/>
    <line x1={24} y1={-24} x2={-24} y2={24} stroke={BAD} strokeWidth={5}/>
  </g>
  {/* the answer built from it: a text line that gets struck through */}
  <line x1={cx-120} y1={652} x2={cx+120} y2={652} stroke={muted} strokeWidth={7} strokeLinecap="round"/>
  <line x1={cx-120} y1={652} x2={cx-120+240*strike} y2={652} stroke={BAD} strokeWidth={7} strokeLinecap="round"/>
  <text x={cx} y={745} fill={fg} fontSize={40} textAnchor="middle">召回不相关文档</text>
</g>
```

## A limit: show it overflowing

"上下文窗口有限" — a box with room for three snippets; the fourth and fifth arrive and stay outside, marked red.

```tsx
const extra=[fade(600,615),fade(625,640)];
<g data-object id="window">
  <g data-obstacle>
    <rect x={cx-200} y={398} width={400} height={230} rx={radius} fill={fg} fillOpacity={0.05} stroke={BAD} strokeWidth={3.5}/>
    {[0,1,2].map(k=><rect key={k} x={cx-180} y={420+k*52} width={360} height={36} rx={radius} fill={accent} fillOpacity={0.22} stroke={accent} strokeWidth={2}/>)}
  </g>
  {extra.map((t,k)=><rect key={k} x={cx-180} y={640+k*46} width={360} height={36} rx={radius} fill={BAD} fillOpacity={0.22} stroke={BAD} strokeWidth={2} opacity={t}/>)}
  <text x={cx} y={800} fill={fg} fontSize={40} textAnchor="middle">上下文窗口有限</text>
</g>
```

## Something hard to measure: instruments that disagree

"整体性能评估复杂" — two gauges whose needles point different ways, and a question mark.

```tsx
const swing=Math.sin(frame*0.08);
{[{c:cx-95,a:-40+25*swing},{c:cx+95,a:35-20*swing}].map((g,k)=>(
  <g key={k} data-object>
    <path d={`M ${g.c-90} 580 A 90 90 0 0 1 ${g.c+90} 580`} fill="none" stroke={muted} strokeWidth={3}/>
    <line x1={0} y1={0} x2={0} y2={-74} stroke={accent} strokeWidth={5} strokeLinecap="round" transform={`translate(${g.c},580) rotate(${g.a})`}/>
  </g>
))}
<text x={cx} y={452} fill={BAD} fontSize={52} textAnchor="middle">?</text>
```

## A fix: the same object changes back

"针对这些挑战进行优化" — reuse the objects above instead of adding new cards: the wrong document fades, the window widens so the extra snippets fit, a check mark appears.

```tsx
const opt=fade(828,872);
// wrong document: opacity={1-0.7*opt}; window width: 400+120*opt; extra snippets: y moves from outside into the box as opt grows
```

## Checklist for a list of items

- Can each item be drawn as an object in a state (wrong, full, missing, locked, uncertain, connected)? Then draw that, with the item's name as a label underneath.
- Give every item the same structure and size so they read as a list, one per column across the width.
- Use icon + title cards only for items that are pure names with nothing to show (for example a list of product features the brief does not explain).
