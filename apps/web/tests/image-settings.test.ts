import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createElement} from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
import {parseImageSettings} from '../lib/image-settings';
import {ImageSettings} from '../app/account/ImageSettings';

test('image settings parser accepts status only, never keys or malformed responses',()=>{
  for(const configured of [false,true])assert.deepEqual(parseImageSettings({configured,base_url:'https://api.example.com/v1'}),{configured,base_url:'https://api.example.com/v1'});
  for(const value of [null,[],{}, {configured:'yes',base_url:'https://api.example.com'},
    {configured:true,base_url:'http://localhost'}, {configured:true,base_url:'https://user:pass@api.example.com'},
    {configured:true,base_url:'https://api.example.com?key=secret'},
    {configured:true,base_url:'https://api.example.com',api_key:'never-return-key'}])assert.throws(()=>parseImageSettings(value));
});

test('personal image settings renders accessible password field and no automatic image request',()=>{
  const html=renderToStaticMarkup(createElement(ImageSettings));
  for(const text of ['GPT Image 2','Base URL','API Key','type="password"','autoComplete="off"','保存配置','不会调用生图','正在读取'])assert.ok(html.includes(text),text);
  assert.ok(!html.includes('sk-'));
});
