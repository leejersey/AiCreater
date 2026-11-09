# Worked examples: draw the idea, not a card

An icon and a title in a rounded box says the word; it does not show the idea. When the narration names a problem, a limit or a step, draw a small object whose state changes while it is spoken. These snippets come from scenes that passed and read well (RAG challenges; vector search and graph hops, timed from `timing.cues`). Copy the technique, not the content: your brief decides what the objects are.

All snippets are frame-driven, timed from `timing.cues` (here `s`; the cue numbers are this example's) and take their colors from the theme. `fade(a,b)` is a helper for a 0→1 ramp:

```tsx
const fade=(a:number,b:number)=>interpolate(frame,[a,b],[0,1],{extrapolateLeft:'clamp',extrapolateRight:'clamp'});
const {foreground:fg,muted,accent,negative:BAD,radius}=theme;
const s=timing.cues;
```

## Something that is wrong: mark it, don't describe it

"召回不相关文档" — a row of retrieved documents where one is wrong and gets crossed out; the answer it feeds is struck through.

```tsx
const bad=fade(s[3].start,s[3].start+20), strike=fade(s[3].start+30,s[3].start+60);
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
const extra=[fade(s[4].start,s[4].start+15),fade(s[4].start+25,s[4].start+40)];
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
const opt=fade(s[6].start,Math.min(s[6].start+45,s[6].end));
// wrong document: opacity={1-0.7*opt}; window width: 400+120*opt; extra snippets: y moves from outside into the box as opt grows
```

## Fit a moment inside its cue

The cue frames change with every voice-over, and a sentence can get 30% shorter. Two habits from scenes that passed
on any timing: cap each animation at its cue's end, and place phases inside a cue as fractions of its length.

```tsx
const win = (a:number, dur:number, cueEnd:number) =>
  interpolate(frame, [a, Math.max(a + 1, Math.min(a + dur, cueEnd - 2))], [0, 1], {extrapolateLeft:'clamp', extrapolateRight:'clamp'});
const d1 = Math.max(1, s[1].end - s[1].start);
const fanIn  = win(s[1].start, d1 * 0.10, s[1].end);             // first tenth of the sentence
const strike = win(s[1].start + d1 * 0.24, d1 * 0.14, s[1].end);  // then the brute force is crossed out
const hops   = win(s[1].start + d1 * 0.36, d1 * 0.58, s[1].end);  // then the search walks the graph
```

## One thing becomes another

"先把文本变成向量" — the text card turns into a row of bars (its vector), then flies along a curve into the space and
becomes a point there. The viewer sees the transformation, not two separate pictures.

```tsx
const card  = win(s[0].start, 12, s[0].end);
const bars  = BARS.map((_, k) => win(s[0].start + 22 + k * 2, 10, s[0].end));     // bars grow one after another
const t0 = s[0].start + 42, t1 = Math.max(t0 + 1, Math.min(s[0].start + 72, s[0].end - 2));
const fly = Easing.inOut(Easing.cubic)(interpolate(frame, [t0, t1], [0, 1], {extrapolateLeft:'clamp', extrapolateRight:'clamp'}));
const at  = qbez(START, CONTROL, POINT, fly);              // quadratic Bézier: (1-t)²P0 + 2t(1-t)P1 + t²P2
const cardOpacity  = card * (1 - win(t1 - 6, 10, s[0].end + 10));   // the card dissolves as it lands
const pointOpacity = Math.min(1, Math.max(0, (fly - 0.55) / 0.35)); // the point forms on arrival
```

## A search walks a route

"它不比较全部文档，而是沿着图结构跳跃" — first the expensive way (a fan of lines from the query to every document) is
shown and crossed out, then the search lights nodes one by one along a path, drawing each hop, with a dot travelling
ahead; the last node gets a ring.

```tsx
const travel = hops * (PATH.length - 1);                       // 0 → number of hops
const walked = (k:number) => Math.max(0, Math.min(1, travel - k));
const lit    = (k:number) => interpolate(travel, [k, k + 0.03], [0, 1], {extrapolateLeft:'clamp', extrapolateRight:'clamp'});
{PATH.slice(0, -1).map(([x1, y1], k) => {
  const [x2, y2] = PATH[k + 1], len = Math.hypot(x2 - x1, y2 - y1);
  return <line key={k} x1={x1} y1={y1} x2={x2} y2={y2} stroke={theme.accent} strokeWidth={4} strokeLinecap="round"
    strokeDasharray={`${len * walked(k)} ${len + 1}`}/>;      // each hop draws itself in turn
})}
{DOCS.map(([x, y], i) => <line key={i} x1={QUERY[0]} y1={QUERY[1]} x2={x} y2={y} stroke={theme.muted}
  strokeDasharray={theme.ruleDash} strokeOpacity={0.5 * fanIn * (1 - strike)}/>)}     // compare-everything, then gone
```

## Near and far, without numbers

"距离越近，内容越相关" — the relation is drawn, not stated with an invented figure: a solid accent line to the nearest
point, a dashed muted line to a far one, each with a short label.

```tsx
const rel = win(s[2].start, 20, s[2].end);
<line x1={Q.x} y1={Q.y} x2={NEAR.x} y2={NEAR.y} stroke={theme.accent} strokeWidth={3 + 3 * rel} strokeLinecap="round"/>
<g opacity={rel}>
  <line x1={Q.x} y1={Q.y} x2={FAR.x} y2={FAR.y} stroke={theme.muted} strokeWidth={theme.ruleWidth} strokeDasharray={theme.ruleDash}/>
  <text x={FAR.x} y={FAR.y + 44} fill={theme.muted} fontSize={26} textAnchor="middle">距离较远</text>
  <text x={NEAR.x + 48} y={NEAR.y + 12} fill={theme.foreground} fontSize={34} fontFamily={theme.fontDisplay}>距离最近 · 内容最相关</text>
</g>
```

## A list, one item per cue

"一是更新知识，二是减少幻觉，三是可以溯源" — each item lights on its own cue; the earlier ones stay, dimmed, so the list
builds up instead of flashing past.

```tsx
const ITEMS = ['更新知识', '减少幻觉', '可以溯源'];            // item k is spoken in cue FIRST + k
const FIRST = 1;
{ITEMS.map((label, k) => {
  const c = s[FIRST + k], next = s[FIRST + k + 1];
  const shown = win(c.start, 14, c.end);
  const dim = next ? win(next.start, 10, next.end) : 0;      // dims when the next item is spoken
  return <g key={k} data-object id={`item-${k}`} opacity={shown * (1 - 0.6 * dim)}
    transform={`translate(${240 + k * 500} ${520 - 30 * (1 - shown)})`}>
    <rect x={-200} y={-120} width={400} height={240} rx={theme.radius} fill={theme.surface}
      stroke={dim < 0.5 ? theme.accent : theme.rule} strokeWidth={theme.ruleWidth * 2} data-obstacle/>
    <text y={150 + 60} fill={theme.foreground} fontSize={40} textAnchor="middle">{label}</text>
  </g>;
})}
```

## Checklist for a list of items

- Can each item be drawn as an object in a state (wrong, full, missing, locked, uncertain, connected)? Then draw that, with the item's name as a label underneath.
- Give every item the same structure and size so they read as a list, one per column across the width.
- Use icon + title cards only for items that are pure names with nothing to show (for example a list of product features the brief does not explain).
