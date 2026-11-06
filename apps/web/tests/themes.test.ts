import test from 'node:test';
import assert from 'node:assert/strict';
import {parseThemes,suggestedTheme,themeName} from '../lib/themes';
import {parseVisualJobs,restyleOf,renderedTheme,videoTaskStatus} from '../lib/visual-workbench';
import {readDraft} from '../lib/drafts';

const theme=(id:string,extra={})=>({id,name:id,name_zh:id==='blueprint'?'蓝图':id==='chalk-garden'?'黑板':'纸刊',description_zh:'说明',mood:['dark'],best_for:['技术'],dark:true,default:id==='blueprint',
 preview:{background:'#0e1a2e',surface:'#142441',foreground:'#d6e5ff',accent:'#4dd2ff'},...extra});

test('themes are parsed strictly and suggested by teaching style',()=>{
 const themes=parseThemes([theme('blueprint'),theme('chalk-garden'),theme('paper-press')]);
 assert.equal(suggestedTheme(themes,'popular'),'chalk-garden');
 assert.equal(suggestedTheme(themes,'technical'),'blueprint');
 assert.equal(suggestedTheme(parseThemes([theme('blueprint'),theme('paper-press')]),'popular'),'blueprint'); // falls back to the default
 assert.equal(themeName(themes,'paper-press'),'纸刊');
 for(const bad of [[],[theme('blueprint'),theme('blueprint')],[theme('paper-press')],[theme('blueprint',{preview:{background:'red'}})],[theme('Blue Print')]])
  assert.throws(()=>parseThemes(bad));
});

test('restyle jobs are read with their Agent version and theme',()=>{
 const pid='p1';
 const jobs=parseVisualJobs({jobs:[
  {id:'r1',project_id:pid,scene_id:'s1',kind:'restyle',state:'succeeded',current:true,input_summary:{agent_id:'a1',theme_id:'paper-press'},result:{video:'video.mp4',srt:'video.srt'}},
  {id:'r0',project_id:pid,scene_id:'s1',kind:'restyle',state:'succeeded',current:false,input_summary:{agent_id:'a1',theme_id:'chalk-garden'},result:{video:'video.mp4',srt:'video.srt'}},
 ]},pid);
 assert.equal(restyleOf(jobs,'a1')?.id,'r1');
 assert.equal(restyleOf(jobs,'a2'),undefined);
 assert.equal(renderedTheme(jobs[0],'blueprint'),'paper-press');
 assert.equal(videoTaskStatus(jobs[0]),'新主题预览已渲染');
 assert.throws(()=>parseVisualJobs({jobs:[{id:'r2',project_id:pid,scene_id:'s1',kind:'restyle',state:'queued',input_summary:{}}]},pid));
 assert.throws(()=>parseVisualJobs({jobs:[{id:'r3',project_id:pid,scene_id:'s1',kind:'restyle',state:'queued',input_summary:{agent_id:'a1',theme_id:'../x'}}]},pid));
 // Jobs from before themes have no theme_id: the default.
 assert.equal(renderedTheme({...jobs[0],theme_id:undefined},'blueprint'),'blueprint');
});

test('a course draft keeps a valid theme choice',()=>{
 const scope={kind:'course' as const,projectId:'',sceneId:'',label:'新建'};
 const raw=(theme_id:string)=>JSON.stringify({version:1,revision:0,updatedAt:1,label:'新建',data:{title:'a',source:'b',theme_id}});
 assert.equal(readDraft(raw('paper-press'),scope)?.data.theme_id,'paper-press');
 assert.equal(readDraft(raw('../x'),scope),null);
});

test('the Agent panel says when a version was drawn in an older theme, and offers a free re-render',async()=>{
 const {createElement}=await import('react');
 const {renderToStaticMarkup}=await import('react-dom/server');
 const {ThemeNotice}=await import('../app/VisualWorkbench');
 const themes=parseThemes([theme('blueprint'),theme('chalk-garden'),theme('paper-press')]);
 const [agent]=parseVisualJobs({jobs:[{id:'a1',project_id:'p',scene_id:'s',kind:'agent',state:'succeeded',current:true,
  input_summary:{model:'deepseek-flash-thinking',max_turns:25,theme_id:'blueprint'},
  result:{status:'passed',turns:6,requests_dispatched:6,finish_by:'model',usage:{outputTokens:1},sha256:'a'.repeat(64),video:'video.mp4',srt:'video.srt',frames:['stills/frame-1.png']}}]},'p');
 const html=(props:Record<string,unknown>)=>renderToStaticMarkup(createElement(ThemeNotice,{projectId:'p',job:agent,themes,courseTheme:'paper-press',now:0,updatedAt:0,disabled:false,
  onRestyle(){},onRefresh(){},onCancel(){},...props} as never));
 assert.equal(html({courseTheme:'blueprint'}),'');
 assert.match(html({}),/这个版本按「蓝图」主题渲染，课程现在是「纸刊」/);
 assert.match(html({}),/按「纸刊」重渲染预览（免费）/);
 const [done]=parseVisualJobs({jobs:[{id:'r1',project_id:'p',scene_id:'s',kind:'restyle',state:'succeeded',current:true,input_summary:{agent_id:'a1',theme_id:'paper-press'},result:{video:'video.mp4',srt:'video.srt'}}]},'p');
 const shown=html({restyle:done});
 assert.match(shown,/<video[^>]+\/visual\/r1\/files\/video\.mp4/);
 assert.doesNotMatch(shown,/重渲染预览（免费）/);
});

test('the manuscript decides the suggestion when its words clearly point one way',async()=>{
 const {suggestTheme}=await import('../lib/themes');
 const ids=['blueprint','chalk-garden','paper-press','terminal-green','swiss-ikb','warm-keynote'].map(id=>theme(id));
 const themes=parseThemes(ids);
 assert.deepEqual(suggestTheme(themes,'popular','先安装依赖：```bash\npip install uv\n```，然后在终端运行命令，再写一个函数。'),{id:'terminal-green',reason:'文稿里有代码和命令'});
 assert.equal(suggestTheme(themes,'popular','今年数据显示增长率 12%，同比上升 3.5%，各指标分布如下图表。').id,'swiss-ikb');
 assert.equal(suggestTheme(themes,'technical','唐代诗人与文化思想，以及宋代文学的历史。').id,'paper-press');
 // Too few or tied signals: the teaching style decides.
 assert.deepEqual(suggestTheme(themes,'popular','今天聊聊一个有趣的问题。'),{id:'chalk-garden',reason:'按「通俗科普」推荐'});
 assert.equal(suggestTheme(themes,'technical','').id,'blueprint');
});

test('a version drawn with another accent is not the course look, and says which accent',async()=>{
 const {createElement}=await import('react');
 const {renderToStaticMarkup}=await import('react-dom/server');
 const {ThemeNotice}=await import('../app/VisualWorkbench');
 const {sameLook}=await import('../lib/visual-workbench');
 const themes=parseThemes([theme('blueprint'),theme('paper-press')]);
 const [agent]=parseVisualJobs({jobs:[{id:'a1',project_id:'p',scene_id:'s',kind:'agent',state:'succeeded',current:true,
  input_summary:{model:'deepseek-flash-thinking',max_turns:25,theme_id:'paper-press'},
  result:{status:'passed',turns:6,requests_dispatched:6,finish_by:'model',usage:{outputTokens:1},sha256:'a'.repeat(64),video:'video.mp4',srt:'video.srt',frames:['stills/frame-1.png']}}]},'p');
 assert.equal(sameLook(agent,'blueprint','paper-press',null),true);
 assert.equal(sameLook(agent,'blueprint','paper-press','#1f4e9c'),false);
 const html=renderToStaticMarkup(createElement(ThemeNotice,{projectId:'p',job:agent,themes,courseTheme:'paper-press',courseAccent:'#1f4e9c',now:0,updatedAt:0,disabled:false,onRestyle(){},onRefresh(){},onCancel(){}} as never));
 assert.match(html,/这个版本按「纸刊」主题渲染，课程现在是「纸刊 · 强调色 #1f4e9c」/);
 assert.throws(()=>parseVisualJobs({jobs:[{id:'x',project_id:'p',scene_id:'s',kind:'restyle',state:'queued',input_summary:{agent_id:'a1',theme_id:'paper-press',theme_accent:'red'}}]},'p'));
});
