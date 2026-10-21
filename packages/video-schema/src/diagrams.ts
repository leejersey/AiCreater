import type {Scene} from './types';

type DiagramScene=Pick<Scene,'type'|'motif'|'elements'|'dialogue'|'process'|'funnel'|'edges'> & {narration:{text:string};visual_actions?:{kind:string;target:string;to?:string;source?:string}[]};
export function diagramErrors(scene:DiagramScene){
 const errors:{path:string;code:string;message:string}[]=[];
 const fail=(field:string,message:string)=>errors.push({path:`/${field}`,code:'diagram_binding',message});
 const d=scene.dialogue,p=scene.process,f=scene.funnel;
 if(f){
  const field='funnel',all=new Map(scene.elements.map(e=>[e.id,e]));
  if(!Array.isArray(f.layers)||!Array.isArray(f.notes)||f.notes.some(n=>!n||typeof n.element_id!=='string')){fail(field,'Explicit layer and note groups required');return errors;}
  const ids=[...f.layers,...f.notes.map(n=>n.element_id)];
  if(d||p||scene.motif!=='funnel'||!['card_sequence','flow_diagram'].includes(scene.type)||f.layers.length<2||f.layers.length>3||f.notes.length<1||f.notes.length>3)fail(field,'Unsupported funnel shape');
  if(ids.length!==all.size||new Set(ids).size!==ids.length||ids.some(id=>!all.has(id)))fail(field,'Bind every element exactly once');
  for(const n of f.notes)if(n.target!==undefined&&!f.layers.includes(n.target)||n.direction!==undefined&&!['up','down'].includes(n.direction)||n.target!==undefined&&n.direction!==undefined)fail(field,'Note target or direction is invalid');
  for(const e of scene.elements){
   const quote=Array.from(scene.narration.text).slice(e.cue.text_start,e.cue.text_end).join('');
   if(e.role||!quote.includes(e.content)||f.layers.includes(e.id)&&Array.from(e.content).length>12||e.source_label&&!quote.includes(e.source_label))fail(field,'Funnel labels and notes must fit and quote their own cue');
  }
  if(f.layers.some((id,i)=>i>0&&all.has(id)&&all.has(f.layers[i-1])&&all.get(id)!.cue.text_start<all.get(f.layers[i-1])!.cue.text_start))fail(field,'Layers must follow narration order');
  if(scene.visual_actions?.some(a=>a.kind==='connect'&&(!f.layers.includes(a.target)||!f.layers.includes(a.to!))))fail(field,'Explicit connections must join layers; notes use their target');
  return errors;
 }
 if(!d&&!p)return errors;
 if(d&&p){fail('dialogue','Only one diagram binding is allowed');return errors;}
 const field=d?'dialogue':'process';
 if(d&&(!Array.isArray(d.messages)||typeof d.state!=='string')||p&&(!Array.isArray(p.stages)||!Array.isArray(p.details))){fail(field,'Explicit element ID groups required');return errors;}
 const ids=d?[...d.messages,d.state]:[...p!.stages,...p!.details];
 const all=new Map(scene.elements.map(e=>[e.id,e]));
 if(ids.length!==all.size||new Set(ids).size!==ids.length||ids.some(id=>!all.has(id)))fail(field,'Bind every element exactly once');
 if(d?.context_messages!==undefined){
  const contexts=d.context_messages;
  if(!Array.isArray(contexts)||contexts.some(id=>typeof id!=='string')){fail(field,'Context roles must be element IDs');return errors;}
  const updates=new Set(scene.visual_actions?.filter(a=>a.kind==='update').map(a=>a.source));
  if(scene.visual_actions?.some(a=>a.kind==='connect'&&(updates.has(a.target)||updates.has(a.to)))||new Set(contexts).size!==contexts.length||contexts.some(id=>!d.messages.includes(id)||updates.has(id))||d.messages.filter(id=>!updates.has(id)&&!contexts.includes(id)).length<1)fail(field,'Context roles must be evidence, with a current message');
 }
 if(d&&(scene.type!=='card_sequence'||scene.motif!=='dialogue_split'||d.messages.length<1||d.messages.length>3)||p&&(scene.type!=='flow_diagram'||scene.motif&&scene.motif!=='default'||p.stages.length<2||p.stages.length>4||p.details.length>2))fail(field,'Unsupported diagram shape');
 for(const e of scene.elements){
  const quote=Array.from(scene.narration.text).slice(e.cue.text_start,e.cue.text_end).join('');
  if(e.source_label&&(!quote.includes(e.source_label)||p?.stages.includes(e.id)&&Array.from(e.source_label).length>8))fail(field,'Source label must fit and quote its own cue');
  if(e.role||!quote.includes(e.content))fail(field,'Diagram labels must be literal source excerpts, not early topics');
  if(d&&e.id===d.state&&Array.from(e.content).length>16||p&&p.stages.includes(e.id)&&Array.from(e.content).length>24)fail(field,'State or stage label exceeds capacity');
 }
 const ordered=d?.messages??p!.stages;
 if(ordered.some((id,i)=>i>0&&all.has(id)&&all.has(ordered[i-1])&&all.get(id)!.cue.text_start<all.get(ordered[i-1])!.cue.text_start))fail(field,'Display groups must follow narration order');
 if(p&&scene.type==='flow_diagram'&&scene.edges?.some(e=>!p.stages.includes(e.from)||!p.stages.includes(e.to)))fail(field,'Process edges must connect stages');
 return errors;
}
