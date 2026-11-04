import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createElement} from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
import {parseModelSettings} from '../lib/model-settings';
import {ModelSettings} from '../app/account/ModelSettings';

test('model settings parser accepts status only, never keys or malformed responses',()=>{
  for(const configured of [false,true])assert.deepEqual(parseModelSettings({configured,base_url:'https://api.example.com/v1',model:'qwen-plus'}),{configured,base_url:'https://api.example.com/v1',model:'qwen-plus'});
  const ok={configured:true,base_url:'https://api.example.com',model:'m'};
  for(const value of [null,[],{}, {...ok,configured:'yes'},{...ok,base_url:'http://localhost'},{...ok,base_url:'https://user:pass@api.example.com'},
    {...ok,base_url:'https://api.example.com?key=secret'},{...ok,api_key:'never-return-key'},{...ok,model:''},{...ok,model:'a b'},{...ok,model:'模型'},
    {configured:true,base_url:'https://api.example.com'}])assert.throws(()=>parseModelSettings(value));
});

test('personal model settings renders the three fields, DeepSeek defaults and no automatic request',()=>{
  const html=renderToStaticMarkup(createElement(ModelSettings));
  for(const text of ['模型配置','Base URL','模型 ID','API Key','type="password"','autoComplete="off"','保存配置','不调用模型','https://api.deepseek.com','deepseek-flash','正在读取'])
    assert.ok(html.includes(text),text);
  for(const text of ['sk-','GPT Image','生图'])assert.ok(!html.includes(text),text);
});

test('the Agent confirm names the model the job will freeze, and jobs show it back',async()=>{
  const {visualAgentAction}=await import('../lib/visual-workbench-actions');
  const {parseVisualJobs}=await import('../lib/visual-workbench');
  assert.match(String(visualAgentAction('s',1).confirmation.message),/服务端 DeepSeek/);
  const own=String(visualAgentAction('s',1,{configured:true,model:'qwen-plus'}).confirmation.message);
  assert.match(own,/你在个人中心配置的 qwen-plus，费用由你的服务商收取/);
  assert.match(own,/提交后再修改模型配置，这个任务会停止/);
  const base={id:'a1',project_id:'p',scene_id:'s',kind:'agent',state:'queued',result:null};
  const [job]=parseVisualJobs({jobs:[{...base,input_summary:{model:'deepseek-flash-thinking',max_turns:25,llm:{source:'account',model:'qwen-plus'}}}]},'p');
  assert.deepEqual(job.agent?.llm,{source:'account',model:'qwen-plus'});
  assert.throws(()=>parseVisualJobs({jobs:[{...base,input_summary:{model:'m',max_turns:25,llm:{source:'mine',model:'x'}}}]},'p'));
});
