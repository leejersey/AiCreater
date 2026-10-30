import React from 'react';
import {teachingComponents} from './teaching-capabilities';
import type {SvgNode} from './motion-assembly';
import {sceneTheme} from './theme';

export const teachingComponentVersion='teaching-components:3' as const;
export const teachingPayloadBounds=Object.freeze({x:0,y:0,width:108,height:92});
type Kind=keyof typeof teachingComponents;
type Point={x:number;y:number};
type Box=Point&{width:number;height:number};
export type TeachingAsset={version:typeof teachingComponentVersion;kind:Kind;state:string;bounds:Box;
 presentation:'full'|'payload';back:SvgNode[];front:SvgNode[];obstacles:Box[];solids:Box[];ports:Record<string,Point>;receiving?:Box;
 gateway?:{side:'top'|'left';spanStart:number;spanEnd:number};
 text:{box:Box;size:number;baselineOffset:number;lineHeight:number;lines:string[]}};
const fail=(reason:string):never=>{throw Error('teaching_component: '+reason);};
const node=(tag:string,attrs:SvgNode['attrs']):SvgNode=>({tag,attrs});
const path=(d:string,stroke='accent',fill='none',strokeWidth=2)=>node('path',{d,stroke,fill,strokeWidth,strokeLinejoin:'round',strokeLinecap:'round'});
const rect=(box:Box,stroke='accent',fill='background')=>node('rect',{...box,stroke,fill,strokeWidth:2});
const circle=(cx:number,cy:number,r:number,fill='background',stroke='accent')=>node('circle',{cx,cy,r,fill,stroke,strokeWidth:2});
const box=(x:number,y:number,width:number,height:number):Box=>({x,y,width,height});
function stateMarker(state:string,x:number,y:number):SvgNode[]{
 if(['idle','empty','waiting'].includes(state))return [circle(x,y,7)];
 if(['error','rejected'].includes(state))return [path(`M ${x-6} ${y-6} L ${x+6} ${y+6} M ${x+6} ${y-6} L ${x-6} ${y+6}`,'secondary')];
 if(['selected','complete','full'].includes(state))return [path(`M ${x-7} ${y} L ${x-2} ${y+5} L ${x+8} ${y-6}`)];
 if(state==='stored')return [rect(box(x-7,y-2,14,11)),path(`M ${x-4} ${y-2} V ${y-8} H ${x+4} V ${y-2}`)];
 if(state==='emitting')return [path(`M ${x-9} ${y} H ${x+8} M ${x+2} ${y-6} L ${x+8} ${y} L ${x+2} ${y+6}`)];
 return [circle(x,y,4,'accent'),path(`M ${x-9} ${y+5} A 10 10 0 1 1 ${x+9} ${y-5}`)];
}

function labelLayout(label:string,area:Box,sizes=[24,22,20,18,16],maximum=48):TeachingAsset['text']{
 if(typeof label!=='string'||!label.trim()||Array.from(label).length>maximum||/[\u0000-\u001f\u007f-\u009f]/u.test(label))fail('invalid label');
 // Conservative glyph advances. Browser glyph measurement remains a render-time gate.
 const glyphs=Array.from(label);
 if(glyphs.some(c=>!/^[\x20-\x7e\u3000-\u303f\u3400-\u9fff\uff01-\uff60]$/u.test(c)))fail('unsupported label glyph');
 let wrappedFallback:TeachingAsset['text']|undefined;
 for(const size of sizes){
  const lines:string[]=[];let line='',width=0;
  for(const c of glyphs){
   const advance=size*(c.charCodeAt(0)>127?1.1:/[MWmw@#%&]/.test(c)?1.25:0.95);
   if(width+advance>area.width&&line){lines.push(line);line='';width=0;}
   line+=c;width+=advance;
  }
  if(line)lines.push(line);
  const lineHeight=size*1.5,baselineOffset=size*1.2;
  if(lines.length*lineHeight<=area.height){
   const result={box:{...area},size,baselineOffset,lineHeight,lines};
   // Prefer an intact Latin word before falling back to readable character wrapping.
   const splitsWord=lines.some((line,i)=>i<lines.length-1&&/[a-z0-9]$/i.test(line)&&/^[a-z0-9]/i.test(lines[i+1]));
   if(!splitsWord)return result;
   wrappedFallback??=result;
  }
 }
 if(wrappedFallback)return wrappedFallback;
 return fail('label does not fit component text region');
}

export function teachingTitleLayout(title:string){
 return labelLayout(title,{x:80,y:40,width:1760,height:112},[32,28,24],80);
}

/** Fixed local geometry is shared by paint, ports and collision consumers. No model geometry. */
export function teachingAsset(kind:Kind,state:string,label:string):TeachingAsset{
 if(!Object.hasOwn(teachingComponents,kind))fail('unknown component');
 if(!(teachingComponents[kind].states as readonly string[]).includes(state))fail('unsupported state');
 let width=0,height=0,area=box(0,0,1,1),back:SvgNode[]=[],front:SvgNode[]=[],obstacles:Box[]=[],ports:Record<string,Point>={},receiving:Box|undefined,gateway:TeachingAsset['gateway'];
 const active=!['waiting','idle','empty'].includes(state),color=state==='rejected'||state==='error'?'secondary':'accent';
 switch(kind){
  case 'document':
   width=180;height=240;area=box(18,50,144,78);
   back=[path('M 2 2 H 140 L 178 40 V 238 H 2 Z',color,'background'),path('M 140 2 V 40 H 178',color),path('M 10 10 H 131 M 10 10 V 230 H 170','muted'),
    path('M 22 154 H 154 M 22 176 H 130 M 22 198 H 147',color)];
   obstacles=[box(0,0,180,240)];ports={grip:{x:90,y:0},center:{x:90,y:120}};
   break;
  case 'wallet':
   width=420;height=300;area=box(38,206,220,65);receiving=box(34,8,330,174);
   gateway={side:'top',spanStart:34,spanEnd:364};
   back=[path('M 12 146 V 82 Q 12 54 42 54 H 356 Q 390 54 390 86 V 260 Q 390 286 362 286 H 42 Q 12 286 12 260 Z','muted','background'),path('M 26 86 H 376','muted')];
   front=[path('M 12 132 Q 106 151 202 133 Q 296 115 390 132 V 268 Q 390 292 363 292 H 40 Q 12 292 12 268 Z','accent','background'),
    path('M 24 151 Q 108 168 204 150 Q 296 134 378 151 V 266 Q 378 278 363 278 H 40 Q 24 278 24 266 Z','muted'),
    path('M 338 192 H 399 Q 416 192 416 208 V 239 Q 416 254 399 254 H 338 Q 322 254 322 239 V 208 Q 322 192 338 192 Z','accent','background'),circle(345,223,7),path('M 385 203 V 244','muted')];
   obstacles=[box(12,152,306,140),box(322,192,96,64)];ports={input:{x:199,y:8},stored:{x:199,y:110},output:{x:364,y:80}};
   break;
  case 'classifier':
   width=360;height=260;area=box(88,18,184,64);receiving=box(6,82,344,144);
   gateway={side:'left',spanStart:88,spanEnd:220};
   back=[path('M 10 88 V 14 H 350 V 83 M 10 220 V 246 H 350 V 222','muted'),path('M 24 100 H 98 L 158 123 M 24 202 H 98 L 158 176','accent'),
    path('M 230 132 H 278 L 350 92 M 230 168 H 278 L 350 214','muted')];
   front=[path('M 158 110 H 222 V 190 H 158 Z','accent','background'),path('M 174 123 H 212 M 174 141 H 200 M 174 159 H 212','muted'),
    circle(206,177,5,active?'accent':'background'),path('M 335 82 H 355 V 102 H 335 Z','accent','background'),path('M 335 204 H 355 V 224 H 335 Z','secondary','background')];
   obstacles=[box(10,12,342,3),box(10,245,342,3),box(156,108,68,84)];ports={input:{x:6,y:150},keep:{x:350,y:92},discard:{x:350,y:214}};
   break;
  case 'loop-node':
   width=260;height=300;area=box(38,228,184,64);receiving=box(38,44,184,132);
   gateway={side:'left',spanStart:44,spanEnd:176};
   back=[path('M 36 44 L 130 8 L 224 44 M 224 176 L 130 212 L 36 176',color),circle(130,110,72,'background','muted'),
    path('M 59 88 A 75 75 0 0 1 182 46 M 181 35 L 184 48 L 170 47',color),path('M 200 133 A 75 75 0 0 1 78 174 M 79 185 L 75 172 L 89 174',color)];
   front=[path('M 14 44 H 38 M 14 176 H 38',color),path('M 222 44 H 246 M 222 176 H 246',color),circle(130,191,5,active?color:'background',color)];
   obstacles=[box(14,30,24,14),box(14,176,24,14),box(222,30,24,14),box(222,176,24,14),box(112,6,36,12),box(112,202,36,12)];ports={input:{x:38,y:110},output:{x:222,y:110},return:{x:130,y:44}};
   break;
  case 'container':
   width=320;height=260;area=box(38,190,244,54);receiving=box(32,8,256,172);
   gateway={side:'top',spanStart:32,spanEnd:288};
   back=[path('M 14 160 V 64 L 48 34 H 272 L 306 64 V 160','muted','background'),path('M 48 35 V 66 H 272 V 35','muted')];
   front=[path('M 14 126 L 70 145 H 250 L 306 126 V 245 H 14 Z','accent','background'),path('M 26 148 V 233 H 294 V 148','muted'),
    path('M 120 158 H 200 V 167 H 120 Z','accent','background')];
   obstacles=[box(14,170,294,77)];ports={input:{x:160,y:8},stored:{x:160,y:100},output:{x:288,y:80}};
   break;
  case 'indicator':
   width=240;height=160;area=box(16,10,208,66);
   back=[path('M 10 10 V 150 H 230 V 10','muted'),path('M 26 100 H 214 V 123 H 26 Z','muted','background'),
    ...[0,1,2,3].map(i=>rect(box(30+i*46,104,38,15),i===0||active?color:'muted',i===0||active?color:'background'))];
   front=[path('M 26 137 H 188','muted')];
   obstacles=[box(8,8,4,144),box(228,8,4,144),box(26,100,190,25)];ports={anchor:{x:120,y:150}};
   break;
 }
 const solids=obstacles.map(b=>({...b}));
 // Conservative shell envelopes block even unpainted corners; only named docks may enter.
 if(receiving){
  const r=receiving;
  obstacles=[box(0,0,width,r.y),box(0,r.y+r.height,width,height-r.y-r.height),box(0,r.y,r.x,r.height),box(r.x+r.width,r.y,width-r.x-r.width,r.height),...obstacles].filter(b=>b.width>0&&b.height>0);
 }
 front.push(...stateMarker(state,width-26,height-24));
 return {version:teachingComponentVersion,kind,state,presentation:'full',bounds:box(0,0,width,height),back,front,obstacles,solids,ports,...(receiving?{receiving,gateway}:{}),text:labelLayout(label,area)};
}

/** A native-size cargo presentation, not a scaled-down full document or a new identity. */
export function teachingPayloadAsset(state:string,label:string):TeachingAsset{
 teachingAsset('document',state,label);
 const color=state==='rejected'?'secondary':'accent',bounds={...teachingPayloadBounds};
 return {version:teachingComponentVersion,kind:'document',state,presentation:'payload',bounds,
  back:[path('M 2 2 H 86 L 106 22 V 90 H 2 Z',color,'background'),path('M 86 2 V 22 H 106',color),path('M 8 8 H 78 M 8 8 V 84 H 78','muted'),path('M 14 77 H 65',color)],
  front:stateMarker(state,94,82),obstacles:[{...bounds}],solids:[{...bounds}],ports:{grip:{x:54,y:0},center:{x:54,y:46}},text:labelLayout(label,box(10,22,88,50))};
}

/** Orthogonal host routes only; path solving and obstacle clearance belong to T5. */
export function teachingConnector(points:Point[]){
 if(!Array.isArray(points)||points.length<2||points.length>12||points.some(p=>!p||!Number.isFinite(p.x)||!Number.isFinite(p.y)||Math.abs(p.x)>10000||Math.abs(p.y)>10000))fail('invalid connector points');
 for(let i=1;i<points.length;i++)if((points[i].x!==points[i-1].x&&points[i].y!==points[i-1].y)||(points[i].x===points[i-1].x&&points[i].y===points[i-1].y))fail('connector must have nonzero orthogonal segments');
 return {version:teachingComponentVersion,points:points.map(p=>({...p})),d:points.map((p,i)=>`${i?'L':'M'} ${p.x} ${p.y}`).join(' ')};
}

export function TeachingComponent({id,kind,state,label,children,presentation='full',theme=sceneTheme}:{id:string;kind:Kind;state:string;label:string;children?:React.ReactNode;presentation?:'full'|'payload';theme?:typeof sceneTheme}){
 if(typeof id!=='string'||!/^[a-z][a-z0-9-]{0,63}$/.test(id))fail('invalid component identity');
 if(presentation!=='full'&&presentation!=='payload'||presentation==='payload'&&kind!=='document')fail('invalid host presentation');
 const asset=presentation==='payload'?teachingPayloadAsset(state,label):teachingAsset(kind,state,label),slot='teaching-'+id+'-slot';
 if(children!==undefined&&!asset.receiving)fail('component cannot receive payloads');
 const draw=(n:SvgNode,index:number):React.ReactNode=>React.createElement(n.tag,{...Object.fromEntries(Object.entries(n.attrs).map(([k,v])=>[k,(k==='fill'||k==='stroke')&&v!=='none'?theme[v as keyof typeof theme]:v])),key:index},n.text??n.children?.map(draw));
 return <g data-teaching-component={kind} data-component-version={asset.version} data-object={id} data-state={state}>
  {asset.receiving&&<defs><clipPath id={slot}><rect {...asset.receiving}/></clipPath></defs>}
  <g data-component-layer="back">{asset.back.map(draw)}</g>
  {children!==undefined&&<g data-component-layer="payload" clipPath={`url(#${slot})`}>{children}</g>}
  <g data-component-layer="front">{asset.front.map(draw)}</g>
  <g data-component-label={id} fill={theme.foreground} fontFamily='"Noto Sans SC", sans-serif' fontWeight={400} fontSize={asset.text.size} style={{letterSpacing:0}}>
   {asset.text.lines.map((line,i)=><text key={i} xmlSpace="preserve" style={{whiteSpace:'pre'}} x={asset.text.box.x} y={asset.text.box.y+asset.text.baselineOffset+i*asset.text.lineHeight}>{line}</text>)}
  </g>
 </g>;
}
