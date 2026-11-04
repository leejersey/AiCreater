export const DEFAULT_BASE_URL='https://api.deepseek.com',DEFAULT_MODEL='deepseek-flash';
export type ModelSettingsStatus={configured:boolean;base_url:string;model:string};
export function parseModelSettings(value:unknown):ModelSettingsStatus {
  const invalid=()=>new Error('模型配置响应无效，请重新读取；不会自动提交配置。');
  if(!value||typeof value!=='object'||Array.isArray(value))throw invalid();
  const data=value as Record<string,unknown>;
  if(Object.keys(data).some(key=>!['configured','base_url','model'].includes(key))||typeof data.configured!=='boolean'||typeof data.base_url!=='string'||data.base_url.length>2048||
    typeof data.model!=='string'||!/^[\x21-\x7e]{1,200}$/.test(data.model))throw invalid();
  try{
    const url=new URL(data.base_url);
    if(url.protocol!=='https:'||!url.hostname||url.username||url.password||/[?#\s\\]/.test(data.base_url))throw invalid();
  }catch{throw invalid();}
  return {configured:data.configured,base_url:data.base_url,model:data.model};
}
