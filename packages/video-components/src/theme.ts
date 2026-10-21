import {createContext,useContext} from 'react';
import type {VideoProject} from '../../video-schema/src/types';
import visualStyles from './visual-styles.json';

export {visualStyles};
export type StyleTokens = typeof visualStyles.legacy & {presentation?:'mechanism'|'mechanism_focus'};
const mechanismStyle:StyleTokens={...visualStyles.mechanism,presentation:'mechanism'};
const focusStyle:StyleTokens={...visualStyles.mechanism_focus,presentation:'mechanism_focus'};
export type VisualStyleId = keyof typeof visualStyles;
export function getVisualStyle(id: unknown = 'legacy'): StyleTokens {
  if(typeof id!=='string'||!Object.hasOwn(visualStyles,id))throw new Error('invalid_visual_style');
  return id==='mechanism'?mechanismStyle:id==='mechanism_focus'?focusStyle:visualStyles[id as VisualStyleId];
}
export type VisualStyleSnapshot={id:VisualStyleId;tokens:StyleTokens};
const ranges:Record<string,[number,number]>={
  'card.radius':[0,40],'card.borderWidth':[0,4],'card.padding':[0,24],'card.flowPadding':[0,24],'card.graphicPadding':[0,24],
  'layout.columnGap':[0,80],'layout.rowGap':[0,48],'layout.flowRowGap':[0,24],
  'arrow.width':[1,4],'typography.lineHeight':[1,1.5],'typography.graphicGap':[0,16],'entrance.distance':[0,24],
};
function styleValue(value:unknown,model:unknown,key=''):unknown{
  const fail=()=>{throw new Error('invalid_visual_style_snapshot');};
  if(model&&typeof model==='object'){
    if(!value||typeof value!=='object'||Array.isArray(value))return fail();
    const keys=Object.keys(model),record=value as Record<string,unknown>;
    if(Object.keys(record).length!==keys.length||keys.some(k=>!Object.hasOwn(record,k)))return fail();
    return Object.fromEntries(Object.entries(model).map(([k,v])=>[k,styleValue(record[k],v,key?key+'.'+k:k)]));
  }
  if(typeof value!==typeof model)return fail();
  if(typeof value==='number'){
    const [min,max]=ranges[key]??[0,0];if(!Number.isFinite(value)||value<min||value>max)return fail();
  }else if(typeof value==='string'){
    if(key==='label'&&(!value.trim()||[...value].length>40||/[\x00-\x1f<>]/u.test(value)))return fail();
    if(key==='card.shadow'&&value!=='none'&&!/^0 (?:\d|1\d|2[0-4])px (?:\d|1\d|2[0-4])px #[0-9a-fA-F]{6}(?:[0-9a-fA-F]{2})?$/.test(value))return fail();
    const choices:Record<string,string[]>={'arrow.path':['orthogonal','curve'],'arrow.head':['filled','open'],'entrance.kind':['slide','wipe']};
    if(choices[key]&&!choices[key].includes(value))return fail();
  }
  return value;
}
export function validateVisualStyle(project: VideoProject | undefined, id?:unknown, snapshot?:unknown): StyleTokens {
  let style=getVisualStyle(id);
  if(snapshot!==undefined){
    if(!snapshot||typeof snapshot!=='object'||Array.isArray(snapshot)||Object.keys(snapshot).length!==2)throw new Error('invalid_visual_style_snapshot');
    const frozen=snapshot as Record<string,unknown>;
    if(typeof frozen.id!=='string'||!Object.hasOwn(frozen,'tokens'))throw new Error('invalid_visual_style_snapshot');
    getVisualStyle(frozen.id);
    if(id!==undefined&&id!==frozen.id)throw new Error('invalid_visual_style_mismatch');
    style=styleValue(frozen.tokens,visualStyles.legacy) as StyleTokens;
    if(frozen.id==='mechanism'||frozen.id==='mechanism_focus')style={...style,presentation:frozen.id};
    if(frozen.id==='legacy'){
      if(JSON.stringify(style)!==JSON.stringify(visualStyles.legacy))throw new Error('legacy_visual_style_changed');
      style=visualStyles.legacy;
    }
  }
  if(style!==visualStyles.legacy){
    const unsupported=project?.scenes.find(s=>!['title_reveal','card_sequence','flow_diagram','comparison_panel','concept','code_walkthrough','state_diagram','execution_timeline','data_chart'].includes(s.type));
    if(unsupported)throw new Error(`visual_style_not_supported: ${unsupported.type}`);
  }
  return style;
}
export const VisualStyleContext=createContext<StyleTokens>(visualStyles.legacy);
export const useVisualStyle=()=>useContext(VisualStyleContext);
/** Paper-slide chrome is identified by frozen label so old snapshots without extra keys stay valid. */
export const isPaperSlide=(style:StyleTokens)=>style.label==='纸质幻灯';

export const THEMES: Record<VideoProject['theme'],string> = {
  tech_explainer:'原版深色（兼容）',tech_multicolor:'深色科技',light_teaching:'浅色教学',color_infographic:'彩色信息图',
};
// Legacy values stay exact so old snapshots do not silently change appearance.
export const palettes = {
  tech_explainer:{background:'#101a2c',card:'#182a43',text:'#f4f7ff',muted:'#9bb0cf',accent:'#69e3c4',secondary:'#bca0ff',caption:'#080e19',captionText:'#f4f7ff',selected:'#203e4c',source:'#69e3c4',warning:'#f4b95d'},
  tech_multicolor:{background:'#11192b',card:'#1b2940',text:'#f2f6ff',muted:'#a8b8ce',accent:'#68ddbe',secondary:'#bd9cfb',caption:'#080f1c',captionText:'#f2f6ff',selected:'#254c46',source:'#72acff',warning:'#f4b95d'},
  light_teaching:{background:'#f5f2eb',card:'#fffdfa',text:'#202a39',muted:'#5b6674',accent:'#15776a',secondary:'#7750bb',caption:'#202a39',captionText:'#ffffff',selected:'#e3f1ed',source:'#315bce',warning:'#95540a'},
  color_infographic:{background:'#fff3db',card:'#fffdf7',text:'#242c42',muted:'#5e6073',accent:'#007569',secondary:'#8139b8',caption:'#242c42',captionText:'#ffffff',selected:'#dcf0e6',source:'#3158db',warning:'#a24807'},
};
export type Palette = typeof palettes.tech_explainer;
export const PaletteContext=createContext<Palette>(palettes.tech_explainer);
export const usePalette=()=>useContext(PaletteContext);
