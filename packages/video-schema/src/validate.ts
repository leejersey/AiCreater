import Ajv from 'ajv';
import schema from '../schema.json';
import type {VideoProject} from './types';

export type ValidationError = {path: string; code: string; message: string};
const checkStructure = new Ajv({allErrors: true, strict: false}).compile<VideoProject>(schema);

export function validateProject(input: unknown): ValidationError[] {
  if (!checkStructure(input)) {
    return (checkStructure.errors ?? []).map(e => ({path: e.instancePath || '/', code: e.keyword, message: e.message ?? 'invalid value'}));
  }
  const project = input;
  const errors: ValidationError[] = [];
  const fail = (path: string, code: string, message: string) => errors.push({path, code, message});
  const unique = (ids: string[], path: string) => {
    if (new Set(ids).size !== ids.length) fail(path, 'duplicate_id', 'IDs must be unique');
  };
  unique(project.assets.map(a => a.id), '/assets');
  unique(project.scenes.map(s => s.id), '/scenes');
  if (project.scenes.reduce((sum, s) => sum + s.duration_frames, 0) > 9000) fail('/scenes', 'duration_limit', 'Video exceeds five minutes');
  if (project.scenes.reduce((sum, s) => sum + [...s.narration.text].length, 0) > 4000) fail('/scenes', 'text_limit', 'Narration exceeds 4000 code points');
  const assets = new Map(project.assets.map(a => [a.id, a]));

  project.scenes.forEach((scene, i) => {
    const path = `/scenes/${i}`;
    const asset = assets.get(scene.narration.audio_asset_id);
    if (!asset) fail(`${path}/narration/audio_asset_id`, 'missing_asset', 'Audio asset does not exist');
    else if (scene.duration_frames !== 12 + Math.ceil(asset.duration_ms * 30 / 1000)) fail(`${path}/duration_frames`, 'audio_duration', 'Scene must contain audio plus six frames at each end');
    const text = [...scene.narration.text];
    if (!scene.narration.text.trim()) fail(`${path}/narration/text`, 'blank_text', 'Narration is blank');
    unique(scene.elements.map(e => e.id), `${path}/elements`);
    const ids = new Set(scene.elements.map(e => e.id));
    if (scene.elements.filter(e => e.role === 'topic').length > 1) fail(`${path}/elements`, 'topic_count', 'Only one topic title is allowed per scene');
    scene.elements.forEach((element, j) => {
      if (!element.content.trim()) fail(`${path}/elements/${j}/content`, 'blank_text', 'Label is blank');
      if (element.highlight && (element.highlight.text_start >= element.highlight.text_end || element.highlight.text_end > [...element.content].length)) fail(`${path}/elements/${j}/highlight`, 'invalid_highlight', 'Highlight must fit content code points');
      if (element.source_label !== undefined && (!element.source_label.trim() || !scene.narration.text.includes(element.source_label) || /[\p{Cc}\p{Cf}\p{Zl}\p{Zp}]/u.test(element.source_label))) fail(`${path}/elements/${j}/source_label`, 'invalid_source_label', 'Source label must be visible literal narration text');
      if (element.role === 'topic' && element.panel_style === 'conclusion') fail(`${path}/elements/${j}/panel_style`, 'topic_conclusion', 'A conclusion cannot be an early topic');
      const {text_start: start, text_end: end} = element.cue;
      if (start >= end || end > text.length || !text.slice(start, end).join('').trim()) fail(`${path}/elements/${j}/cue`, 'invalid_cue', 'Cue must reference a nonblank code-point interval in narration');
      if(scene.type==='concept'&&!text.slice(start,end).join('').includes(element.content))fail(`${path}/elements/${j}/content`,'concept_excerpt','Concept content must be a literal excerpt of its cue');
    });
    if(scene.type==='concept'&&(scene.elements.filter(e=>e.concept_role==='definition').length!==1||scene.elements.filter(e=>e.concept_role==='summary').length>1))fail(`${path}/elements`,'concept_roles','Exactly one definition and at most one summary required');
    if(scene.type==='data_chart'){
      const c=scene.chart!,rows=c.data,labels=rows.map(r=>r.label),plain=(s:string)=>s.trim()&&!/[\p{Cc}\p{Cf}\p{Zl}\p{Zp}]/u.test(s);
      if(rows.length!==scene.elements.length||rows.some((r,j)=>r.element_id!==scene.elements[j].id))fail(`${path}/chart/data`,'chart_binding','Chart rows must bind every element once in order');
      if(new Set(labels).size!==labels.length||![c.title,c.unit,c.source_note,...labels,...c.columns??[]].every(plain))fail(`${path}/chart`,'chart_text','Chart labels must be visible and unique');
      if(rows.some(r=>r.values.some(v=>!Number.isFinite(v))))fail(`${path}/chart/data`,'chart_values','Finite numbers required');
      if(c.kind==='matrix'&&rows.some(r=>r.values.length!==c.columns!.length))fail(`${path}/chart/data`,'chart_dimensions','Matrix rows must match columns');
      if(c.kind==='proportion'&&rows.reduce((n,r)=>n+r.values[0],0)<=0)fail(`${path}/chart/data`,'chart_total','Proportion total must be positive');
    }
    if (scene.type === 'execution_timeline') {
      const timeline = scene.timeline!, lanes = timeline.lanes.map(l => l.id);
      unique(lanes, `${path}/timeline/lanes`);
      if (timeline.lanes.some(l => !l.label.trim() || /[\p{Cc}\p{Cf}\p{Zl}\p{Zp}]/u.test(l.label))) fail(`${path}/timeline/lanes`, 'timeline_text', 'Lane labels must be visible text');
      scene.elements.forEach((step, j) => {
        const event = step.event!;
        if (!lanes.includes(event.lane_id)) fail(`${path}/elements/${j}/event`, 'timeline_reference', 'Event lane does not exist');
        if (event.start_ms >= event.end_ms || event.end_ms > timeline.duration_ms) fail(`${path}/elements/${j}/event`, 'timeline_range', 'Event must fit the illustrative axis');
        if (scene.elements.slice(0, j).some(e => e.event!.lane_id === event.lane_id && e.event!.start_ms < event.end_ms && event.start_ms < e.event!.end_ms)) fail(`${path}/elements/${j}/event`, 'timeline_overlap', 'Events in one task lane cannot overlap');
      });
      if (lanes.some(id => !scene.elements.some(e => e.event!.lane_id === id))) fail(`${path}/timeline/lanes`, 'timeline_empty_lane', 'Each lane needs an event');
    }
    if (scene.type === 'state_diagram') {
      const plain = (s: string) => s.trim() && !/[\p{Cc}\p{Cf}\p{Zl}\p{Zp}]/u.test(s);
      if (!plain(scene.structure!.name)) fail(`${path}/structure/name`, 'state_text', 'Structure name must be visible text');
      scene.elements.forEach((step, j) => {
        const items = step.items!, keys = items.map(item => item.key), itemIds = items.map(item => item.id);
        unique(itemIds, `${path}/elements/${j}/items`);
        if (new Set(keys).size !== keys.length || (scene.structure!.kind !== 'object' && keys.some((key, n) => key !== String(n)))) fail(`${path}/elements/${j}/items`, 'state_keys', 'Keys must be unique; array/stack indexes must be consecutive');
        if (items.some(item => !plain(item.key) || !plain(item.value))) fail(`${path}/elements/${j}/items`, 'state_text', 'State keys and values must be visible text');
        if (step.active_item_ids!.some(id => !itemIds.includes(id))) fail(`${path}/elements/${j}/active_item_ids`, 'state_reference', 'Highlight must reference current items');
      });
    }
    if (scene.type === 'code_walkthrough') {
      const source = scene.code!.source;
      const lines = source.split('\n');
      if (!source.trim() || lines.length > 16 || lines.some(l => [...l].reduce((n, c) => n + (c.codePointAt(0)! < 128 ? 1 : 2), 0) > 48) || /[\p{Cc}\p{Cf}\p{Zl}\p{Zp}]/u.test(source.replaceAll('\n', ''))) fail(`${path}/code/source`, 'code_layout', 'Code must fit 16 lines / 48 display units without invisible controls');
      const plain=(s:string,empty=false)=>(empty||s.trim())&&!/[\p{Cc}\p{Cf}\p{Zl}\p{Zp}]/u.test(s);
      if(scene.code!.array_name!==undefined&&!plain(scene.code!.array_name))fail(`${path}/code/array_name`,'code_state_text','Array name must be visible');
      scene.elements.forEach((step, j) => {
        if(scene.code!.array_name!==undefined){
          const items=step.array_items!,pointers=step.pointers!,ids=items.map(v=>v.id);
          if(new Set(ids).size!==ids.length||items.some((v,n)=>v.key!==String(n)))fail(`${path}/elements/${j}/array_items`,'code_state_items','Unique IDs and consecutive indexes required');
          if(new Set(pointers.map(v=>v.name)).size!==pointers.length||pointers.some(v=>!ids.includes(v.item_id)))fail(`${path}/elements/${j}/pointers`,'code_state_pointer','Unique pointers must reference current items');
          if(step.loop&&step.loop.current>step.loop.total)fail(`${path}/elements/${j}/loop`,'code_state_loop','Current round cannot exceed total');
          if(![step.content,...items.map(v=>v.value),...pointers.map(v=>v.name),...step.variables!.flatMap(v=>[v.name,v.value])].every(s=>plain(s))||![step.input!,step.output!].every(s=>plain(s,true)))fail(`${path}/elements/${j}`,'code_state_text','Visible snapshot text required');
        }
        if (step.code_lines!.some(line => line > lines.length)) fail(`${path}/elements/${j}/code_lines`, 'invalid_line', 'Code line does not exist');
        const names = step.variables!.map(v => v.name);
        if (new Set(names).size !== names.length || names.some(n => !n.trim())) fail(`${path}/elements/${j}/variables`, 'invalid_variables', 'Variable names must be nonblank and unique');
      });
    }
    if (scene.type === 'code_walkthrough' || scene.type === 'state_diagram' || scene.type === 'execution_timeline' || scene.type === 'data_chart' || scene.type === 'concept') {
      let previous = -1;
      scene.elements.forEach((step, j) => {
        if (step.cue.text_start <= previous) fail(`${path}/elements/${j}/cue`, 'step_order', 'Teaching steps must follow narration order');
        previous = step.cue.text_start;
      });
      const starts = new Map(scene.animations.map(a => [a.target, a.start_frame]));
      const times = scene.elements.map(e => starts.get(e.id));
      if (times.every(t => t !== undefined) && times.some((t, j) => j > 0 && times[j - 1]! >= t!)) fail(`${path}/animations`, 'step_order', 'Teaching step times must increase strictly');
    }
    const targets = scene.animations.map(a => a.target);
    if (new Set(targets).size !== targets.length || targets.length !== ids.size || targets.some(t => !ids.has(t))) fail(`${path}/animations`, 'animation_targets', 'Each element needs exactly one entrance animation');
    scene.animations.forEach((a, j) => {
      if (a.start_frame + a.duration_frames > scene.duration_frames) fail(`${path}/animations/${j}`, 'frame_range', 'Animation exceeds scene');
    });
    let previousEnd = 0;
    scene.captions.forEach((caption, j) => {
      if (caption.start_frame >= caption.end_frame || caption.end_frame > scene.duration_frames - 6 || caption.start_frame < previousEnd) fail(`${path}/captions/${j}`, 'frame_range', 'Caption is empty, overlapping or outside audio range');
      previousEnd = caption.end_frame;
      const lines = caption.text.split('\n');
      if (!caption.text.trim() || lines.length > 2 || lines.some(line => !line.trim() || [...line].length > (lines.length === 1 ? 44 : 22)) || /[\r\t\u0000-\u0009\u000b-\u001f]/.test(caption.text)) fail(`${path}/captions/${j}/text`, 'caption_layout', 'Caption must fit two nonblank lines of 22 code points');
    });
    if (scene.type === 'flow_diagram') {
      const edges = scene.edges ?? [];
      const keys = edges.map(e => `${e.from}:${e.to}`);
      if (new Set(keys).size !== keys.length) fail(`${path}/edges`, 'duplicate_edge', 'Duplicate edges');
      const graph = new Map(scene.elements.map(e => [e.id, [] as string[]]));
      edges.forEach((e, j) => {
        if (!ids.has(e.from) || !ids.has(e.to) || e.from === e.to) fail(`${path}/edges/${j}`, 'invalid_edge', 'Edges must connect distinct existing elements');
        else graph.get(e.from)!.push(e.to);
      });
      const active = new Set<string>(); const visited = new Set<string>();
      const visit = (id: string): boolean => {
        if (active.has(id)) return true;
        if (visited.has(id)) return false;
        active.add(id);
        if (graph.get(id)!.some(visit)) return true;
        active.delete(id); visited.add(id); return false;
      };
      if ([...ids].some(visit)) fail(`${path}/edges`, 'cycle', 'Flow graph must be acyclic');
    }
  });
  return errors;
}

export function parseProject(input: unknown): VideoProject {
  const errors = validateProject(input);
  if (errors.length) throw new Error(JSON.stringify({code: 'invalid_dsl', validation_errors: errors}, null, 2));
  return input as VideoProject;
}
