'use client';
import type {ThemeSummary} from '../lib/themes';

/** A miniature of the theme: stage, one card, a heading line and the accent. Drawn from its four preview colors. */
function Swatch({theme}:{theme:ThemeSummary}){
 const {background,surface,foreground,accent}=theme.preview;
 return <svg className="theme-swatch" viewBox="0 0 160 90" aria-hidden="true">
  <rect width="160" height="90" fill={background}/>
  <rect x="12" y="12" width="70" height="8" rx="2" fill={foreground}/>
  <rect x="12" y="30" width="62" height="46" rx="6" fill={surface}/>
  <rect x="20" y="40" width="40" height="5" rx="2" fill={foreground} opacity="0.7"/>
  <rect x="20" y="51" width="30" height="5" rx="2" fill={foreground} opacity="0.45"/>
  <rect x="86" y="30" width="62" height="46" rx="6" fill={surface}/>
  <circle cx="117" cy="53" r="11" fill={accent}/>
 </svg>;
}

export function ThemePicker({themes,value,suggested,disabled,onChange}:{themes:ThemeSummary[];value:string;suggested?:string;disabled?:boolean;onChange:(id:string)=>void}){
 return <div className="theme-picker" role="radiogroup" aria-label="画面主题">
  {themes.map(theme=><button key={theme.id} type="button" role="radio" aria-checked={theme.id===value} disabled={disabled}
    className={`theme-card${theme.id===value?' selected':''}`} onClick={()=>onChange(theme.id)}>
   <Swatch theme={theme}/>
   <span className="theme-card-title">{theme.name_zh}{theme.id===suggested&&<em>推荐</em>}{theme.default&&<em className="muted">默认</em>}</span>
   <span className="theme-card-desc">{theme.description_zh}</span>
   <span className="theme-card-fit">适合：{theme.best_for.join(' · ')}</span>
  </button>)}
 </div>;
}
