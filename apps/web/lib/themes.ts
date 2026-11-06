import type {TeachingStyle} from './teaching-style';

export type ThemeSummary={id:string;name:string;name_zh:string;description_zh:string;mood:string[];best_for:string[];dark:boolean;default:boolean;
 preview:{background:string;surface:string;foreground:string;accent:string}};
const object=(v:unknown):v is Record<string,unknown>=>!!v&&typeof v==='object'&&!Array.isArray(v);
const color=(v:unknown):v is string=>typeof v==='string'&&/^#[0-9a-f]{6}$/.test(v);
const words=(v:unknown,max:number):v is string[]=>Array.isArray(v)&&v.length<=max&&v.every(w=>typeof w==='string'&&w.length<=40);
const invalid=()=>new Error('主题列表无效，请刷新页面。');

export function parseThemes(value:unknown):ThemeSummary[]{
 if(!Array.isArray(value)||!value.length||value.length>40)throw invalid();
 const ids=new Set<string>();
 const themes=value.map(v=>{
  if(!object(v)||typeof v.id!=='string'||!/^[a-z][a-z0-9-]{1,39}$/.test(v.id)||ids.has(v.id)||typeof v.name!=='string'||typeof v.name_zh!=='string'||
   typeof v.description_zh!=='string'||v.description_zh.length>200||!words(v.mood,8)||!words(v.best_for,8)||typeof v.dark!=='boolean'||typeof v.default!=='boolean'||
   !object(v.preview)||!['background','surface','foreground','accent'].every(k=>color((v.preview as Record<string,unknown>)[k])))throw invalid();
  ids.add(v.id);
  const p=v.preview as Record<string,string>;
  return{id:v.id,name:v.name,name_zh:v.name_zh,description_zh:v.description_zh,mood:v.mood,best_for:v.best_for,dark:v.dark,default:v.default,
   preview:{background:p.background,surface:p.surface,foreground:p.foreground,accent:p.accent}};
 });
 if(themes.filter(t=>t.default).length!==1)throw invalid();
 return themes;
}
// A first suggestion; the person always picks. Words in the manuscript decide when they clearly point one way,
// otherwise the teaching style does. No model call.
const SUGGESTED:Record<TeachingStyle,string>={popular:'chalk-garden',technical:'blueprint'};
const SIGNALS:[string,RegExp,string][]=[
 ['terminal-green',/```|代码|命令行?|终端|编程|脚本|函数|python|javascript|typescript|\bgit\b|shell|bash|npm|pip|安装依赖/gi,'文稿里有代码和命令'],
 ['swiss-ikb',/数据|统计|图表|指标|百分比|增长率|同比|环比|分布|\d+(?:\.\d+)?\s*%/g,'文稿以数据和统计为主'],
 ['paper-press',/历史|文学|哲学|读书|小说|诗|文化|艺术|人物|思想/g,'文稿偏人文社科'],
 ['warm-keynote',/产品|用户|功能|发布|体验|上线|版本更新/g,'文稿在介绍产品'],
 ['blueprint',/架构|系统|原理|机制|模块|算法|协议|网络|检索|模型/g,'文稿在拆解技术原理'],
];
export function suggestTheme(themes:ThemeSummary[],style:TeachingStyle,text=''):{id:string;reason:string}{
 const scored=SIGNALS.filter(([id])=>themes.some(t=>t.id===id)).map(([id,pattern,reason])=>({id,reason,hits:(text.match(pattern)??[]).length}))
  .sort((a,b)=>b.hits-a.hits);
 // Clear only: at least three hits and ahead of the runner-up.
 if(scored[0]&&scored[0].hits>=3&&scored[0].hits>(scored[1]?.hits??0))return{id:scored[0].id,reason:scored[0].reason};
 const id=themes.find(t=>t.id===SUGGESTED[style])?.id??themes.find(t=>t.default)!.id;
 return{id,reason:style==='technical'?'按「知识干货」推荐':'按「通俗科普」推荐'};
}
export function suggestedTheme(themes:ThemeSummary[],style:TeachingStyle,text=''):string{return suggestTheme(themes,style,text).id;}
export function themeName(themes:ThemeSummary[],id:string|undefined):string{
 return themes.find(t=>t.id===id)?.name_zh??id??'默认';
}
