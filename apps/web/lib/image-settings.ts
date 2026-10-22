export type ImageSettingsStatus={configured:boolean;base_url:string};
export function parseImageSettings(value:unknown):ImageSettingsStatus {
  const invalid=()=>new Error('图片配置响应无效，请重新读取；不会自动提交配置。');
  if(!value||typeof value!=='object'||Array.isArray(value))throw invalid();
  const data=value as Record<string,unknown>;
  if(Object.keys(data).some(key=>!['configured','base_url'].includes(key))||typeof data.configured!=='boolean'||typeof data.base_url!=='string'||data.base_url.length>2048)throw invalid();
  try{
    const url=new URL(data.base_url);
    if(url.protocol!=='https:'||!url.hostname||url.username||url.password||/[?#\s\\]/.test(data.base_url))throw invalid();
  }catch{throw invalid();}
  return {configured:data.configured,base_url:data.base_url};
}
