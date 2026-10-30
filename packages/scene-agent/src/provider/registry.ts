// Builds providers from models.json. Swapping models is a config change, not a code change.
import {readFileSync} from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {AnthropicProvider,type AnthropicClientLike,type AnthropicConfig} from './anthropic';
import {OpenAICompatibleProvider,type Transport} from './openai-compatible';
import {ProviderError,type Capabilities,type Provider} from './types';

export type Budget={maxTurns:number;maxOutputTokensTotal:number};
export type ModelEntry={
 adapter:'openai-compatible'|'anthropic';
 model:string;
 apiKeyEnv:string;
 baseUrl?:string;
 capabilities:Capabilities;
 budget:Budget;
 extraBody?:Record<string,unknown>;
 echoReasoning?:boolean;
 effort?:AnthropicConfig['effort'];
 fallbacks?:'default';
};

export const defaultModelsFile=path.join(path.dirname(fileURLToPath(import.meta.url)),'../../models.json');

const CAPABILITY_KEYS:[keyof Capabilities,'boolean'|'number'][]=[['vision','boolean'],['parallelToolCalls','boolean'],['contextTokens','number'],['maxOutputTokens','number'],['promptCache','boolean'],['appendOnlyHistory','boolean']];

export function parseModels(value:unknown):Record<string,ModelEntry>{
 if(!value||typeof value!=='object'||Array.isArray(value))throw Error('models: expected an object of model entries');
 const out:Record<string,ModelEntry>={};
 for(const [name,raw] of Object.entries(value as Record<string,any>)){
  const fail=(why:string)=>{throw Error(`models.${name}: ${why}`);};
  if(raw?.adapter!=='openai-compatible'&&raw?.adapter!=='anthropic')fail('adapter must be openai-compatible or anthropic');
  for(const key of ['model','apiKeyEnv'])if(typeof raw[key]!=='string'||!raw[key])fail(`${key} is required`);
  if(raw.adapter==='openai-compatible'&&(typeof raw.baseUrl!=='string'||!/^https:\/\//.test(raw.baseUrl)))fail('baseUrl must be an https URL');
  for(const [key,type] of CAPABILITY_KEYS)if(typeof raw.capabilities?.[key]!==type)fail(`capabilities.${key} must be a ${type}`);
  for(const key of ['maxTurns','maxOutputTokensTotal'])if(!Number.isInteger(raw.budget?.[key])||raw.budget[key]<1)fail(`budget.${key} must be a positive integer`);
  out[name]=raw as ModelEntry;
 }
 return out;
}

export function loadModels(file=defaultModelsFile):Record<string,ModelEntry>{
 return parseModels(JSON.parse(readFileSync(file,'utf8')));
}

export type ProviderDeps={env?:Record<string,string|undefined>;transport?:Transport;anthropicClient?:AnthropicClientLike};

export function createProvider(name:string,models:Record<string,ModelEntry>,deps:ProviderDeps={}):Provider{
 const entry=models[name];
 if(!entry)throw Error(`unknown model "${name}"; configured: ${Object.keys(models).join(', ')}`);
 const apiKey=(deps.env??process.env)[entry.apiKeyEnv]?.trim();
 if(!apiKey)throw new ProviderError('auth',`environment variable ${entry.apiKeyEnv} is not set`);
 if(entry.adapter==='anthropic')
  return new AnthropicProvider({name,model:entry.model,apiKey,capabilities:entry.capabilities,effort:entry.effort,fallbacks:entry.fallbacks,baseUrl:entry.baseUrl},deps.anthropicClient);
 return new OpenAICompatibleProvider({name,baseUrl:entry.baseUrl!,model:entry.model,apiKey,capabilities:entry.capabilities,extraBody:entry.extraBody,echoReasoning:entry.echoReasoning},deps.transport);
}
