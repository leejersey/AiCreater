import React from 'react';
import type {Scene} from '../../video-schema/src/types';
import {usePalette,useVisualStyle,visualStyles} from './theme';
import {dedicatedReveal} from './dedicated-style';
import {wrapText} from './layout';
import {entranceAtFrame} from './motion';

// Exact decimal sum of JSON numbers; percentages below explicitly round to two decimals.
export function decimalTotal(values:number[]):string {
  const parts=values.map(v=>{const [base,e='0']=String(v).split('e'),[a,b='']=base.split('.');return {n:BigInt(a+b),scale:b.length-Number(e)};});
  const scale=Math.max(0,...parts.map(p=>p.scale)),sum=parts.reduce((n,p)=>n+p.n*BigInt(10)**BigInt(scale-p.scale),BigInt(0));
  const text=sum.toString().padStart(scale+1,'0');return scale?`${text.slice(0,-scale)}.${text.slice(-scale)}`.replace(/\.?0+$/,''):text;
}
export function DataChart({scene,frame}:{scene:Scene;frame:number}){
  const c=scene.chart!,p=usePalette(),style=useVisualStyle(),legacy=style===visualStyles.legacy,rows=c.data,starts=new Map(scene.animations.map(a=>[a.target,a]));
  const visible=rows.map(r=>frame>starts.get(r.element_id)!.start_frame),all=rows.every(r=>frame>=starts.get(r.element_id)!.start_frame+starts.get(r.element_id)!.duration_frames);
  const values=rows.flatMap(r=>r.values),max=Math.max(...values)||1,total=rows.reduce((n,r)=>n+r.values[0],0),colors=[p.source,p.secondary,p.accent,p.warning];
  const left=270,right=1760,top=310,bottom=770,width=right-left,height=bottom-top;
  const opacity=(i:number)=>{const a=starts.get(rows[i].element_id)!;return entranceAtFrame(frame,a.start_frame,a.duration_frames).opacity;};
  const label=(s:string,x:number,y:number,size=28,anchor:'start'|'middle'|'end'='middle',wrap=true,center=false)=>{
    const lines=wrap?wrapText(s,8):[s];return <text x={x} y={y-(center?(lines.length-1)*size*1.25/2:0)} fill={p.text} fontSize={size} textAnchor={anchor}>{lines.map((line,i)=><tspan key={i} x={x} dy={i?size*1.25:0}>{line}</tspan>)}</text>;
  };
  const x=(i:number)=>left+(i+.5)*width/rows.length,y=(v:number)=>bottom-v/max*height;
  const ordinary=c.kind==='bar'||c.kind==='line';
  return <svg width={1920} height={1080} style={{position:'absolute'}} data-chart={c.kind}>
    <text x={80} y={190} fill={p.text} fontSize={48}>{c.title}</text><text x={80} y={237} fill={p.muted} fontSize={26}>{c.kind==='matrix'?'矩阵':c.kind==='proportion'?'部分 / 整体':'单系列'} · 单位：{c.unit}</text>
    <rect x={80} y={268} width={1760} height={620} rx={legacy?20:style.card.radius} fill={style.card.outline?p.background:p.card} {...(!legacy?{stroke:p.accent,strokeWidth:style.card.borderWidth}:{})}/>
    {ordinary&&<><path d={`M ${left} ${top} V ${bottom} H ${right}`} fill="none" stroke={p.muted} strokeWidth={2}/>{[0,1,2,3,4].map(i=><g key={i}><path d={`M ${left} ${bottom-i*height/4} H ${right}`} fill="none" stroke={p.muted} strokeOpacity={.2}/><text x={left-18} y={bottom-i*height/4+8} fill={p.muted} fontSize={24} textAnchor="end">{Number((max*i/4).toPrecision(4))}</text></g>)}</>}
    {c.kind==='bar'&&rows.map((r,i)=>visible[i]&&<g key={r.element_id} opacity={opacity(i)} style={legacy?undefined:dedicatedReveal(scene,frame,style,r.element_id)}><rect x={x(i)-width/rows.length*.25} y={y(r.values[0])} width={width/rows.length*.5} height={Math.max(0,bottom-y(r.values[0]))} rx={legacy?8:style.card.radius} fill={style.card.outline?'none':colors[i%4]} {...(!legacy?{stroke:colors[i%4],strokeWidth:style.card.borderWidth}:{})}/>{label(String(r.values[0]),x(i),y(r.values[0])-16,26,'middle',false)}</g>)}
    {c.kind==='line'&&rows.map((r,i)=>visible[i]&&<g key={r.element_id} opacity={opacity(i)} style={legacy?undefined:dedicatedReveal(scene,frame,style,r.element_id)}>{i>0&&visible[i-1]&&<path d={`M ${x(i-1)} ${y(rows[i-1].values[0])} L ${x(i)} ${y(r.values[0])}`} fill="none" stroke={p.source} strokeWidth={5}/>}<circle cx={x(i)} cy={y(r.values[0])} r={9} fill={p.card} stroke={p.source} strokeWidth={4}/>{label(String(r.values[0]),x(i),y(r.values[0])-20,26,'middle',false)}</g>)}
    {ordinary&&rows.map((r,i)=><g key={r.element_id}>{label(r.label,x(i),820,26)}</g>)}
    {c.kind==='proportion'&&all&&<><text x={140} y={340} fill={p.text} fontSize={32}>合计 {decimalTotal(rows.map(r=>r.values[0]))} {c.unit}</text>{rows.map((r,i)=>{const a=rows.slice(0,i).reduce((n,r)=>n+r.values[0],0)/total,b=r.values[0]/total;return <rect key={r.element_id} x={140+a*1640} y={380} width={b*1640} height={100} fill={colors[i%4]}/>;})}{rows.map((r,i)=><g key={r.element_id}>{label(r.label,x(i),560,28)}{label(`${r.values[0]} ${c.unit}`,x(i),620,24,'middle',false)}{label(`${Math.round(r.values[0]/total*10000)/100}%`,x(i),680,30,'middle',false)}</g>)}<text x={140} y={820} fill={p.muted} fontSize={24}>百分比四舍五入至两位小数；颜色不是因果或效果证明</text></>}
    {c.kind==='matrix'&&<>{c.columns!.map((name,j)=><g key={name}>{label(name,390+(j+.5)*1340/c.columns!.length,310,25)}</g>)}{rows.map((r,i)=>{const h=460/rows.length,cy=345+i*h;return <g key={r.element_id}>{label(r.label,340,cy+h/2+8,25,'end',true,true)}{visible[i]&&r.values.map((v,j)=><g key={j} opacity={opacity(i)} style={legacy?undefined:dedicatedReveal(scene,frame,style,r.element_id)}><rect x={390+j*1340/c.columns!.length} y={cy+5} width={1340/c.columns!.length-12} height={h-10} rx={legacy?8:style.card.radius} fill={p.source} opacity={.10+.25*v/max}/>{label(String(v),390+(j+.5)*1340/c.columns!.length-6,cy+h/2+8,26,'middle',false)}</g>)}</g>;})}<text x={140} y={855} fill={p.muted} fontSize={24}>固定色阶 0 → {max} {c.unit} · 颜色与原值同时读取</text></>}
    <text x={80} y={915} fill={p.muted} fontSize={26}>用户所述来源：{c.source_note} · 数据已人工确认，非独立事实核实</text>
  </svg>;
}
