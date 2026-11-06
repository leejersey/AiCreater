import test from 'node:test';
import assert from 'node:assert/strict';
import {existsSync,readFileSync} from 'node:fs';
import path from 'node:path';
import {builtinThemes,contrast,DEFAULT_THEME_ID,FONTS,jobTheme,parseTheme,sceneThemeProps,themeFonts,THEMES_DIR} from '../src/index';
import {sceneTheme} from '../../custom-scenes/src/theme';

const blueprint=()=>JSON.parse(readFileSync(path.join(THEMES_DIR,'blueprint.json'),'utf8'));

test('every built-in theme passes the readability rules, and there are dark and light ones',()=>{
 const themes=builtinThemes();
 assert.equal(themes.size,6);
 assert.ok([...themes.values()].filter(t=>t.dark).length>=2&&[...themes.values()].filter(t=>!t.dark).length>=2);
 for(const theme of themes.values())assert.ok(contrast(theme.colors.foreground,theme.colors.background)>=4.5,theme.id);
});

test('the default theme keeps the colors every scene was rendered with before themes',()=>{
 const props=sceneThemeProps(builtinThemes().get(DEFAULT_THEME_ID)!);
 for(const [key,value] of Object.entries(sceneTheme))assert.equal(props[key as keyof typeof props],value,key);
 assert.equal(jobTheme(undefined).id,DEFAULT_THEME_ID);
 assert.deepEqual(themeFonts(jobTheme(undefined)).css,['@fontsource/noto-sans-sc/400.css','@fontsource/jetbrains-mono/400.css']);
});

test('contrast follows WCAG and composites translucent colors over the stage',()=>{
 assert.equal(Math.round(contrast('#000000','#ffffff')),21);
 assert.equal(contrast('#ffffff','#ffffff'),1);
 // A see-through black bar on white is lighter than solid black.
 assert.ok(contrast('#ffffff','#00000080','#ffffff')<contrast('#ffffff','#000000'));
});

test('unreadable or malformed themes are rejected with the rule that failed',()=>{
 const cases:[(t:any)=>void,RegExp][]=[
  [t=>{t.colors.foreground='#1a2a3e';},/foreground contrast/],
  [t=>{t.colors.accent='#14304a';},/accent contrast/],
  [t=>{t.colors.accentSoft='#ff00001a';},/accentSoft/],
  [t=>{t.caption.background='#d6e5ffee';},/caption contrast/],
  [t=>{t.fonts.body='Comic Sans';},/bundled font/],
  [t=>{t.colors.extra='#ffffff';},/colors must have exactly/],
  [t=>{t.colors.background='blue';},/#rrggbb/],
  [t=>{t.decoration='sparkles';},/decoration/],
  [t=>{t.shape.ruleDash='4,4';},/shape/],
  [t=>{t.style='x';},/unexpected/],
 ];
 for(const [change,error] of cases){const theme=blueprint();change(theme);assert.throws(()=>parseTheme(theme),error);}
});

test('every bundled font stylesheet is installed',()=>{
 for(const font of Object.values(FONTS))for(const css of font.css)assert.ok(existsSync(path.join(THEMES_DIR,'../../../node_modules',css)),css);
});

test('non-default themes put scene text in their body font, keeping monospace text and the default theme as they were',async()=>{
 const {fontOverrideCss}=await import('../src/index');
 const themes=builtinThemes();
 assert.equal(fontOverrideCss(themes.get('blueprint')!),'');
 const css=fontOverrideCss(themes.get('paper-press')!);
 assert.match(css,/^svg text:not\(\[font-family\*="mono" i\]\):not\(\[style\*="mono" i\]\):not\(\[font-family\*="courier" i\]\):not\(\[style\*="courier" i\]\)\{font-family:"Noto Serif SC", "Noto Sans SC", serif !important\}$/);
});
