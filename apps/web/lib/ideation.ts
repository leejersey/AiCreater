// Topic ideation on the new-video page: angles for a topic, one chosen, its outline edited inside the card.
// Pure state helpers (kept in the local draft) and the same limits the API checks (services/workflow/ideation.py).

export const STRUCTURES = {problem:'问题驱动',journey:'旅程 / 流程',compare:'对比',myth:'误区纠正',howto:'实操',history:'演进 / 历史',story:'故事'} as const;
export const DEPTHS = {intro:'入门',intermediate:'进阶',advanced:'深入'} as const;
export type Structure = keyof typeof STRUCTURES;
export type Depth = keyof typeof DEPTHS;
export type Angle = {title:string;hook:string;audience:string;takeaway:string;structure:Structure;depth:Depth;duration_min:number;chapters:string[];scope:'single'};
export type Section = {title:string;points:string[];picture:string;seconds:number};
export type Outline = {sections:Section[]};
/** batches: each "发散 / 换一批" result; extras: cards from the person's own direction or a merge. */
export type IdeationDraft = {batches:Angle[][];extras:Angle[];chosen:Angle|null;outline:Outline|null;history:Outline[]};

export const MAX_CHAPTER_SECONDS = 110, MAX_TOTAL_SECONDS = 780, MAX_HISTORY = 10;
export const emptyIdeation = (): IdeationDraft => ({batches:[],extras:[],chosen:null,outline:null,history:[]});

export const angleTags = (a:Angle) => `${STRUCTURES[a.structure]} · ${DEPTHS[a.depth]} · 约 ${a.duration_min} 分钟 · ${a.chapters.length} 章`;
export const sameAngle = (a:Angle|null|undefined,b:Angle|null|undefined) => !!a && !!b && JSON.stringify(a)===JSON.stringify(b);
/** Every title shown so far: "换一批" asks the model to avoid them. */
export const shownTitles = (s:IdeationDraft) => [...s.batches.flat(),...s.extras].map(a=>a.title).slice(-30);

export const addBatch = (s:IdeationDraft,angles:Angle[]):IdeationDraft => ({...s,batches:[...s.batches,angles]});
export const addExtra = (s:IdeationDraft,angle:Angle):IdeationDraft => ({...s,extras:[...s.extras,angle]});
/** Choosing (another) angle starts its outline afresh. */
export const choose = (s:IdeationDraft,angle:Angle|null):IdeationDraft => ({...s,chosen:angle,outline:null,history:[]});
/** A new outline from the model (or an edit); the previous one stays reachable with undo. */
export function setOutline(s:IdeationDraft,outline:Outline,remember=true):IdeationDraft {
  return {...s,outline,history:remember&&s.outline?[...s.history,s.outline].slice(-MAX_HISTORY):s.history};
}
export function undo(s:IdeationDraft):IdeationDraft {
  if(!s.history.length)return s;
  return {...s,outline:s.history[s.history.length-1],history:s.history.slice(0,-1)};
}

// Editing the outline in place (no model call) ----------------------------------------------------------------------
export function updateSection(o:Outline,i:number,patch:Partial<Section>):Outline {
  return {sections:o.sections.map((s,k)=>k===i?{...s,...patch}:s)};
}
export function moveSection(o:Outline,i:number,by:-1|1):Outline {
  const j=i+by;if(j<0||j>=o.sections.length)return o;
  const sections=[...o.sections];[sections[i],sections[j]]=[sections[j],sections[i]];return {sections};
}
export const removeSection = (o:Outline,i:number):Outline => o.sections.length<=1?o:{sections:o.sections.filter((_,k)=>k!==i)};
export const addSection = (o:Outline):Outline => o.sections.length>=20?o:{sections:[...o.sections,{title:'新的一章',points:['要点'],picture:'',seconds:30}]};

/** Target length from the free-text hint ("3分钟", "90秒", "2 min"), in seconds; undefined if it cannot be read. */
export function targetSeconds(hint:string|undefined):number|undefined {
  const m=/(\d+(?:\.\d+)?)\s*(分钟|分|min|m|秒|s)?/i.exec(hint??'');
  if(!m)return undefined;
  const n=Number(m[1]),unit=(m[2]??'分钟').toLowerCase();
  return Math.round(['秒','s'].includes(unit)?n:n*60);
}
export const totalSeconds = (o:Outline) => o.sections.reduce((n,s)=>n+(Number.isFinite(s.seconds)?s.seconds:0),0);

/** Advice shown under the outline: too long for the hint, chapters the Agent cannot make in one piece. */
export function outlineWarnings(o:Outline,durationHint?:string):string[] {
  const out:string[]=[],total=totalSeconds(o),target=targetSeconds(durationHint);
  if(target&&total>target*1.2)out.push(`合计约 ${total} 秒，超过建议时长（约 ${target} 秒）`);
  o.sections.forEach((s,i)=>{if(s.seconds>MAX_CHAPTER_SECONDS)out.push(`第 ${i+1} 章约 ${s.seconds} 秒，超过 ${MAX_CHAPTER_SECONDS} 秒，建议拆成两章（Agent 每章最多 120 秒）`);});
  return out;
}

/** What must be fixed before the outline can drive the manuscript (the API checks the same limits). */
export function outlineProblems(o:Outline):string[] {
  const out:string[]=[],len=(t:string)=>Array.from(t.trim()).length;
  if(!o.sections.length||o.sections.length>20)out.push('大纲需要 1–20 章');
  o.sections.forEach((s,i)=>{
    const n=`第 ${i+1} 章`;
    if(!len(s.title)||len(s.title)>24)out.push(`${n}标题需要 1–24 字`);
    const points=s.points.filter(p=>p.trim());
    if(!points.length||points.length>4||points.some(p=>len(p)>60))out.push(`${n}需要 1–4 个要点，每个最多 60 字`);
    if(!len(s.picture)||len(s.picture)>80)out.push(`${n}的画面构想需要 1–80 字`);
    if(!Number.isInteger(s.seconds)||s.seconds<10||s.seconds>MAX_CHAPTER_SECONDS)out.push(`${n}秒数需要 10–${MAX_CHAPTER_SECONDS}`);
  });
  if(totalSeconds(o)>MAX_TOTAL_SECONDS)out.push(`合计最多 ${MAX_TOTAL_SECONDS} 秒`);
  return out;
}
const clean = (o:Outline):Outline => ({sections:o.sections.map(s=>({title:s.title.trim(),points:s.points.map(p=>p.trim()).filter(Boolean),picture:s.picture.trim(),seconds:s.seconds}))});

/** {angle, outline} for the manuscript call, once a chosen angle has a valid outline. */
export function toPlan(s:IdeationDraft):{angle:Angle;outline:Outline}|null {
  return s.chosen&&s.outline&&!outlineProblems(s.outline).length?{angle:s.chosen,outline:clean(s.outline)}:null;
}
/** What the project keeps about how it was conceived (a series would set scope / series_id). */
export function toOrigin(topic:string,notes:string,s:IdeationDraft) {
  const plan=toPlan(s);
  return plan&&topic.trim()?{topic:topic.trim(),notes:notes.trim(),...plan,scope:'single' as const,series_id:null}:undefined;
}

// Local-draft check --------------------------------------------------------------------------------------------------
const str = (v:unknown,max:number) => typeof v==='string'&&v.length<=max;
export function isAngle(v:unknown):v is Angle {
  const a=v as Angle;
  return !!a&&typeof a==='object'&&str(a.title,80)&&str(a.hook,160)&&str(a.audience,80)&&str(a.takeaway,120)&&a.structure in STRUCTURES&&
    a.depth in DEPTHS&&Number.isInteger(a.duration_min)&&Array.isArray(a.chapters)&&a.chapters.length<=8&&a.chapters.every(c=>str(c,48))&&a.scope==='single';
}
export function isOutline(v:unknown):v is Outline {
  const o=v as Outline;
  return !!o&&typeof o==='object'&&Array.isArray(o.sections)&&o.sections.length<=20&&o.sections.every(s=>!!s&&str(s.title,200)&&
    Array.isArray(s.points)&&s.points.length<=10&&s.points.every(p=>str(p,400))&&str(s.picture,400)&&typeof s.seconds==='number');
}
export function isIdeationDraft(v:unknown):v is IdeationDraft {
  const s=v as IdeationDraft;
  return !!s&&typeof s==='object'&&Array.isArray(s.batches)&&s.batches.length<=20&&s.batches.every(b=>Array.isArray(b)&&b.length<=6&&b.every(isAngle))&&
    Array.isArray(s.extras)&&s.extras.length<=20&&s.extras.every(isAngle)&&(s.chosen===null||isAngle(s.chosen))&&
    (s.outline===null||isOutline(s.outline))&&Array.isArray(s.history)&&s.history.length<=MAX_HISTORY&&s.history.every(isOutline);
}
