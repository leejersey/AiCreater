import React from 'react';
import type {Element} from '../../video-schema/src/types';
import type {ElementBox} from './layout';
import {usePalette,useVisualStyle,isPaperSlide} from './theme';

const paths: Record<NonNullable<Element['icon']>,string> = {
  document:'M7 3h10l6 6v20H7z M17 3v8h6 M11 15h8 M11 20h8 M11 25h5',
  search:'M24 24l6 6 M26 14a12 12 0 1 1-24 0 12 12 0 0 1 24 0',
  idea:'M10 24h12 M12 28h8 M10 21c0-5-5-5-5-11a11 11 0 0 1 22 0c0 6-5 6-5 11',
  code:'M10 8 2 16l8 8 M22 8l8 8-8 8 M19 4l-6 24',
  check:'M5 16l7 7L27 7',warning:'M16 3 2 29h28z M16 11v9 M16 24v1',
};
export function GraphicIcon({icon}:{icon:NonNullable<Element['icon']>}) {
  return <svg data-icon={icon} aria-hidden="true" width={32} height={32} viewBox="0 0 32 32"><path d={paths[icon]} fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round"/></svg>;
}
export function GraphicContent({element,box}:{element:Element;box:ElementBox}) {
  const p=usePalette(),style=useVisualStyle(),paper=isPaperSlide(style), color=element.panel_style==='conclusion'?p.accent:element.icon==='warning'?p.warning:element.icon==='search'?p.secondary:p.source;
  let position=0;
  return <div style={{width:'100%',display:'flex',flexDirection:'column',alignItems:'center',gap:style.typography.graphicGap,textAlign:'center'}}>
    <div style={{height:36,display:'flex',alignItems:'center',justifyContent:'center',gap:14,color}}>
      {element.icon&&<GraphicIcon icon={element.icon}/>}
      {element.step!==undefined&&<span data-step={element.step} style={{fontSize:24,border:`2px solid ${color}`,borderRadius:style.card.outline?2:18,padding:'1px 12px'}}>步骤 {element.step}</span>}
      {element.panel_style==='conclusion'&&!paper&&<span data-conclusion style={{fontSize:22,color}}>结论</span>}
    </div>
    <div style={{fontSize:box.fontSize,lineHeight:style.typography.lineHeight,whiteSpace:'pre'}}>{box.lines.map((line,i)=>{
      const chars=Array.from(line),start=position;position+=chars.length;
      return <React.Fragment key={i}>{i>0?'\n':''}{chars.map((char,j)=>{
        const marked=element.highlight&&start+j>=element.highlight.text_start&&start+j<element.highlight.text_end;
        return marked?<mark key={j} data-paper-highlight={paper||undefined} style={{color:paper?p.text:color,background:paper?'#ffe566':color+'18',borderBottom:paper?'none':`2px solid ${color}`}}>{char}</mark>:char;
      })}</React.Fragment>;
    })}</div>
    <div style={{height:28,fontSize:22,color:p.muted}}>{element.source_label&&!paper&&<span data-source-label={element.source_label}>稿中来源 · {element.source_label}</span>}</div>
  </div>;
}
