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
// A first suggestion by teaching style; the person always picks.
const SUGGESTED:Record<TeachingStyle,string>={popular:'chalk-garden',technical:'blueprint'};
export function suggestedTheme(themes:ThemeSummary[],style:TeachingStyle):string{
 return themes.find(t=>t.id===SUGGESTED[style])?.id??themes.find(t=>t.default)!.id;
}
export function themeName(themes:ThemeSummary[],id:string|undefined):string{
 return themes.find(t=>t.id===id)?.name_zh??id??'默认';
}
