import {validProject} from './fixture';

export function imageProject() {
  const p = validProject();
  return {...p, assets: [...p.assets, {id:'toolbox',type:'image',storage_key:'images/toolbox.png',checksum:'a'.repeat(64),width:1024,height:1024}],
    scenes: p.scenes.map(s => ({...s, images:[{asset_id:'toolbox',element_id:'a',alt:'独立项目的工具箱'}]}))};
}
