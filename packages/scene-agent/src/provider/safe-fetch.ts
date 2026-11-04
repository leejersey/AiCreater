// Request-time destination check for a model endpoint a person configured (SSRF), mirroring
// services/workflow/destination.py: resolve the host, require every address to be public, connect to the checked
// address (TLS still verifies the host name), never follow redirects.
// LLM_FAKE_IP_CIDR (e.g. 198.18.0.0/15) accepts a local proxy's fake-IP range; unset where no such proxy runs.
import {lookup} from 'node:dns/promises';
import {request} from 'node:https';
import {BlockList,isIP} from 'node:net';
import {ProviderError} from './types';

const PRIVATE=new BlockList();
for(const [net,bits] of [['0.0.0.0',8],['10.0.0.0',8],['100.64.0.0',10],['127.0.0.0',8],['169.254.0.0',16],['172.16.0.0',12],['192.0.0.0',24],
 ['192.0.2.0',24],['192.88.99.0',24],['192.168.0.0',16],['198.18.0.0',15],['198.51.100.0',24],['203.0.113.0',24],['224.0.0.0',4],['240.0.0.0',4]] as const)
 PRIVATE.addSubnet(net,bits,'ipv4');
for(const [net,bits] of [['::',128],['::1',128],['64:ff9b::',96],['64:ff9b:1::',48],['100::',64],['2001::',23],['2001:db8::',32],['2002::',16],
 ['fc00::',7],['fe80::',10],['ff00::',8]] as const)
 PRIVATE.addSubnet(net,bits,'ipv6');

function allowedRanges(env:Record<string,string|undefined>):BlockList{
 const list=new BlockList();
 for(const part of (env.LLM_FAKE_IP_CIDR??'').split(',').map(p=>p.trim()).filter(Boolean)){
  const [net,bits]=part.split('/');const family=isIP(net);
  if(!family||!/^\d{1,3}$/.test(bits??''))throw new ProviderError('request','invalid LLM_FAKE_IP_CIDR');
  list.addSubnet(net,Number(bits),family===6?'ipv6':'ipv4');
 }
 return list;
}

export function publicAddress(address:string,allowed=new BlockList()):boolean{
 let text=address.split('%')[0];
 const mapped=/^::ffff:(\d+\.\d+\.\d+\.\d+)$/i.exec(text);if(mapped)text=mapped[1];
 const family=isIP(text)===6?'ipv6':'ipv4';
 if(!isIP(text))return false;
 return allowed.check(text,family)||!PRIVATE.check(text,family);
}

type Resolve=(host:string)=>Promise<{address:string;family:number}[]>;
const systemResolve:Resolve=host=>lookup(host,{all:true});

/** The first resolved address of host, after every resolved address passed the check. */
export async function checkedAddress(host:string,resolve:Resolve=systemResolve,env:Record<string,string|undefined>=process.env):Promise<{address:string;family:number}>{
 const allowed=allowedRanges(env);
 let answers;
 try{answers=await resolve(host);}catch{throw new ProviderError('unavailable','model endpoint did not resolve');}
 if(!answers.length||!answers.every(a=>publicAddress(a.address,allowed)))throw new ProviderError('destination','model endpoint does not resolve to a public address');
 return answers[0];
}

const MAX_BODY=4*1024*1024;
/** A fetch for OpenAI-compatible POSTs that connects only to a checked public address. */
export function safeFetch(resolve:Resolve=systemResolve,env:Record<string,string|undefined>=process.env):typeof fetch{
 return (async(input:string|URL|Request,init?:RequestInit)=>{
  const url=new URL(typeof input==='string'||input instanceof URL?input:input.url);
  if(url.protocol!=='https:'||!url.hostname)throw new ProviderError('destination','model endpoint must be https');
  const host=url.hostname.replace(/^\[|\]$/g,'');
  const target=await checkedAddress(host,resolve,env);
  return await new Promise<Response>((resolveResponse,reject)=>{
   const headers:Record<string,string>={};new Headers(init?.headers).forEach((value,key)=>{headers[key]=value;});
   const req=request({host:target.address,family:target.family,port:url.port||443,path:url.pathname+url.search,method:init?.method??'GET',
    servername:isIP(host)?undefined:host,headers:{...headers,host:url.host},signal:init?.signal??undefined},res=>{
    const chunks:Buffer[]=[];let size=0;
    res.on('data',(chunk:Buffer)=>{size+=chunk.length;if(size>MAX_BODY){req.destroy(new ProviderError('response','response exceeds 4 MiB'));return;}chunks.push(chunk);});
    res.on('end',()=>{
     const responseHeaders=new Headers();
     for(const [key,value] of Object.entries(res.headers))if(value!==undefined)responseHeaders.set(key,Array.isArray(value)?value.join(', '):String(value));
     // Redirects are answered as they are (not followed); the provider treats them as a rejected request.
     resolveResponse(new Response(res.statusCode===204||res.statusCode===304?null:Buffer.concat(chunks),{status:res.statusCode??502,headers:responseHeaders}));
    });
    res.on('error',reject);
   });
   req.on('error',reject);
   if(init?.body)req.write(typeof init.body==='string'?init.body:Buffer.from(init.body as ArrayBuffer));
   req.end();
  });
 }) as typeof fetch;
}
