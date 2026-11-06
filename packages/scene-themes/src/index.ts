// Scene themes: one per course. A theme is colors, fonts and a few character knobs; scenes read them from the `theme` prop
// and never hard-code their own, so a course can be re-rendered in another theme without generating its scenes again.
import {readFileSync,readdirSync} from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';

export type ThemeColors={
 background:string;surface:string;surface2:string;
 foreground:string;muted:string;faint:string;rule:string;
 accent:string;accentSoft:string;secondary:string;
 positive:string;negative:string;
};
export type Decoration='none'|'grid'|'grain'|'scanlines';
export type SceneTheme={
 schemaVersion:'scene-theme:1';id:string;version:number;name:string;nameZh:string;descriptionZh:string;
 mood:string[];bestFor:string[];dark:boolean;
 colors:ThemeColors;
 fonts:{display:FontFamily;body:FontFamily;mono:FontFamily};
 shape:{radius:number;ruleWidth:number;ruleDash:string};
 decoration:Decoration;
 caption:{background:string;foreground:string};
};
/** What a Scene receives as `theme`: the five original keys first, so scenes written before themes still render. */
export type SceneThemeProps=ThemeColors&{fontDisplay:string;fontBody:string;fontMono:string;radius:number;ruleWidth:number;ruleDash:string;dark:boolean};
export const SCENE_THEME_PROPS_TYPE='{background:string;foreground:string;muted:string;accent:string;secondary:string;surface:string;surface2:string;faint:string;rule:string;accentSoft:string;positive:string;negative:string;fontDisplay:string;fontBody:string;fontMono:string;radius:number;ruleWidth:number;ruleDash:string;dark:boolean}';

// Only bundled fonts: rendering is offline. Each entry is the @fontsource stylesheet(s) and the fallback stack.
export const FONTS={
 'Noto Sans SC':{css:['@fontsource/noto-sans-sc/400.css'],weight:400,stack:'"Noto Sans SC", sans-serif'},
 'Noto Serif SC':{css:['@fontsource/noto-serif-sc/400.css','@fontsource/noto-serif-sc/700.css'],weight:400,stack:'"Noto Serif SC", "Noto Sans SC", serif'},
 'LXGW WenKai':{css:['@fontsource/lxgw-wenkai/500.css'],weight:500,stack:'"LXGW WenKai", "Noto Sans SC", cursive'},
 'JetBrains Mono':{css:['@fontsource/jetbrains-mono/400.css'],weight:400,stack:'"JetBrains Mono", "Noto Sans SC", monospace'},
} as const;
export type FontFamily=keyof typeof FONTS;
export const DEFAULT_THEME_ID='blueprint';
const DECORATIONS:Decoration[]=['none','grid','grain','scanlines'];
const COLOR_KEYS:(keyof ThemeColors)[]=['background','surface','surface2','foreground','muted','faint','rule','accent','accentSoft','secondary','positive','negative'];
const HEX=/^#[0-9a-f]{6}([0-9a-f]{2})?$/;

function rgb(hex:string):[number,number,number,number]{
 return [1,3,5,7].map(i=>i<hex.length?parseInt(hex.slice(i,i+2),16):255) as [number,number,number,number];
}
/** `top` (may be translucent) composited over the opaque `bottom`. */
function over(top:string,bottom:[number,number,number]):[number,number,number]{
 const [r,g,b,a]=rgb(top),k=a/255;
 return [r*k+bottom[0]*(1-k),g*k+bottom[1]*(1-k),b*k+bottom[2]*(1-k)];
}
function luminance([r,g,b]:[number,number,number]){
 const f=(c:number)=>{c/=255;return c<=0.03928?c/12.92:((c+0.055)/1.055)**2.4;};
 return 0.2126*f(r)+0.7152*f(g)+0.0722*f(b);
}
/** WCAG contrast ratio of `fg` over `bg`; translucent colors are composited over `background` (the opaque stage) first. */
export function contrast(fg:string,bg:string,background=bg):number{
 const stage=rgb(background).slice(0,3) as [number,number,number];
 const under=over(bg,stage),top=over(fg,under);
 const [a,b]=[luminance(top),luminance(under)];
 return (Math.max(a,b)+0.05)/(Math.min(a,b)+0.05);
}

function fail(id:string,message:string):never{throw Error(`theme ${id}: ${message}`);}
function text(id:string,value:unknown,label:string,max=200):string{
 if(typeof value!=='string'||!value.trim()||value.length>max)fail(id,`invalid ${label}`);
 return value;
}
function texts(id:string,value:unknown,label:string):string[]{
 if(!Array.isArray(value)||!value.length||value.length>8)fail(id,`invalid ${label}`);
 return value.map(v=>text(id,v,label,40));
}

/** Parses and checks a theme: shape, bundled fonts, and the readability rules (contrast against its own background). */
export function parseTheme(value:unknown):SceneTheme{
 if(!value||typeof value!=='object'||Array.isArray(value))throw Error('theme: expected an object');
 const row=value as Record<string,unknown>;
 const id=typeof row.id==='string'&&/^[a-z][a-z0-9-]{1,39}$/.test(row.id)?row.id:fail(String(row.id),'invalid id');
 const keys=['schemaVersion','id','version','name','nameZh','descriptionZh','mood','bestFor','dark','colors','fonts','shape','decoration','caption'];
 if(Object.keys(row).some(k=>!keys.includes(k))||keys.some(k=>!(k in row)))fail(id,'unexpected or missing fields');
 if(row.schemaVersion!=='scene-theme:1')fail(id,'unsupported schemaVersion');
 if(!Number.isInteger(row.version)||Number(row.version)<1)fail(id,'invalid version');
 if(typeof row.dark!=='boolean')fail(id,'invalid dark');
 const colors=row.colors as Record<string,unknown>;
 if(!colors||typeof colors!=='object'||Object.keys(colors).length!==COLOR_KEYS.length)fail(id,'colors must have exactly '+COLOR_KEYS.join(', '));
 for(const key of COLOR_KEYS)if(typeof colors[key]!=='string'||!HEX.test(colors[key] as string))fail(id,`color ${key} must be #rrggbb or #rrggbbaa`);
 const c=colors as ThemeColors;
 for(const key of ['background','surface','surface2','foreground','muted','accent','secondary','positive','negative'] as const)
  if(c[key].length!==7)fail(id,`color ${key} must be opaque`);
 const fonts=row.fonts as Record<string,unknown>;
 if(!fonts||typeof fonts!=='object'||Object.keys(fonts).sort().join()!=='body,display,mono')fail(id,'fonts must be display, body, mono');
 for(const [role,family] of Object.entries(fonts))if(typeof family!=='string'||!(family in FONTS))fail(id,`font ${role} is not a bundled font (${Object.keys(FONTS).join(', ')})`);
 const shape=row.shape as Record<string,unknown>;
 if(!shape||typeof shape!=='object'||Object.keys(shape).sort().join()!=='radius,ruleDash,ruleWidth'||
  !Number.isInteger(shape.radius)||Number(shape.radius)<0||Number(shape.radius)>48||
  !Number.isInteger(shape.ruleWidth)||Number(shape.ruleWidth)<1||Number(shape.ruleWidth)>4||
  typeof shape.ruleDash!=='string'||!/^(none|\d{1,2} \d{1,2})$/.test(shape.ruleDash))fail(id,'invalid shape');
 if(!DECORATIONS.includes(row.decoration as Decoration))fail(id,`decoration must be one of ${DECORATIONS.join(', ')}`);
 const caption=row.caption as Record<string,unknown>;
 if(!caption||typeof caption!=='object'||Object.keys(caption).sort().join()!=='background,foreground'||
  typeof caption.background!=='string'||!HEX.test(caption.background)||typeof caption.foreground!=='string'||!HEX.test(caption.foreground)||caption.foreground.length!==7)fail(id,'invalid caption colors');
 // Readability: body text 4.5:1, labels and highlight colors 3:1 against the stage, captions 4.5:1 on their bar.
 const bg=c.background;
 if(contrast(c.foreground,bg)<4.5)fail(id,'foreground contrast below 4.5:1');
 for(const key of ['muted','accent','secondary','positive','negative'] as const)
  if(contrast(c[key],bg)<3)fail(id,`${key} contrast below 3:1`);
 for(const key of ['surface','surface2'] as const)
  if(contrast(c.foreground,c[key])<4.5)fail(id,`foreground on ${key} contrast below 4.5:1`);
 if(contrast(caption.foreground as string,caption.background as string,bg)<4.5)fail(id,'caption contrast below 4.5:1');
 if(c.accentSoft.length!==9||c.accentSoft.slice(0,7)!==c.accent)fail(id,'accentSoft must be the accent with transparency');
 return{schemaVersion:'scene-theme:1',id,version:Number(row.version),name:text(id,row.name,'name',40),nameZh:text(id,row.nameZh,'nameZh',20),
  descriptionZh:text(id,row.descriptionZh,'descriptionZh'),mood:texts(id,row.mood,'mood'),bestFor:texts(id,row.bestFor,'bestFor'),dark:row.dark,
  colors:{...c},fonts:fonts as SceneTheme['fonts'],shape:shape as SceneTheme['shape'],decoration:row.decoration as Decoration,caption:caption as SceneTheme['caption']};
}

export function sceneThemeProps(theme:SceneTheme):SceneThemeProps{
 return{...theme.colors,fontDisplay:FONTS[theme.fonts.display].stack,fontBody:FONTS[theme.fonts.body].stack,fontMono:FONTS[theme.fonts.mono].stack,
  radius:theme.shape.radius,ruleWidth:theme.shape.ruleWidth,ruleDash:theme.shape.ruleDash,dark:theme.dark};
}
/** The @fontsource stylesheets a render of this theme imports, and the faces to wait for. */
export function themeFonts(theme:SceneTheme){
 const families=[...new Set([theme.fonts.display,theme.fonts.body,theme.fonts.mono,'Noto Sans SC' as FontFamily])];
 return{css:[...new Set(families.flatMap(f=>FONTS[f].css))],faces:families.map(f=>`${FONTS[f].weight} 40px "${f}"`)};
}

export const THEMES_DIR=path.join(path.dirname(fileURLToPath(import.meta.url)),'..','themes');
let registry:Map<string,SceneTheme>|undefined;
/** The built-in themes, keyed by id; each file is named after its theme's id. */
export function builtinThemes():Map<string,SceneTheme>{
 if(registry)return registry;
 const themes=new Map<string,SceneTheme>();
 for(const name of readdirSync(THEMES_DIR).filter(n=>n.endsWith('.json')).sort()){
  const theme=parseTheme(JSON.parse(readFileSync(path.join(THEMES_DIR,name),'utf8')));
  if(name!==theme.id+'.json')throw Error(`theme file ${name} must be named ${theme.id}.json`);
  themes.set(theme.id,theme);
 }
 if(!themes.has(DEFAULT_THEME_ID))throw Error('the default theme is missing');
 return registry=themes;
}
/** A job's frozen theme, or the default for jobs created before themes existed. */
export function jobTheme(value:unknown):SceneTheme{
 return value===undefined||value===null?builtinThemes().get(DEFAULT_THEME_ID)!:parseTheme(value);
}
/** Everything a render host needs from a theme, as plain JSON for a generated bundle entry. */
/** CSS that puts scene text in the theme's body font, for scenes written before themes with a font of their own.
 * Monospace text (font names with "mono" or "Courier") keeps its font. Empty for the default theme, so every video made
 * before themes renders exactly as it was confirmed. */
export function fontOverrideCss(theme:SceneTheme):string{
 if(theme.id===DEFAULT_THEME_ID)return '';
 const keep=['mono','courier'].flatMap(k=>[`:not([font-family*="${k}" i])`,`:not([style*="${k}" i])`]).join('');
 return `svg text${keep}{font-family:${FONTS[theme.fonts.body].stack} !important}`;
}
export function hostTheme(theme:SceneTheme){
 return{props:sceneThemeProps(theme),decoration:theme.decoration,caption:theme.caption,faces:themeFonts(theme).faces,fontCss:fontOverrideCss(theme)};
}
/** `import '…css';` lines for a generated bundle entry: the theme's bundled fonts. */
export function fontImports(theme:SceneTheme):string{
 return themeFonts(theme).css.map(css=>`import ${JSON.stringify(css)};`).join('');
}
