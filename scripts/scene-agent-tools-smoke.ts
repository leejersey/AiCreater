// Runs the scene-agent tools for real (Remotion + Chrome, no model) on the reviewed RAG scene,
// then on a deliberately broken variant, and prints what a model would see.
import {readFile} from 'node:fs/promises';
import path from 'node:path';
import {repositoryRoot} from '../packages/custom-scenes/src/files';
import {RemotionStillRenderer} from '../packages/scene-agent/src/render/stills';
import {buildTools,executeTool} from '../packages/scene-agent/src/tools/index';
import type {ToolContext} from '../packages/scene-agent/src/tools/types';
import {createWorkspace,SCENE_FILE} from '../packages/scene-agent/src/workspace';
import {textOf} from '../packages/scene-agent/src/provider/types';

async function main(){
 const example=path.join(repositoryRoot,'examples/custom-scenes/reviewed-rag');
 const brief=JSON.parse(await readFile(path.join(example,'brief.json'),'utf8'));
 const source=await readFile(path.join(example,'Scene.tsx'),'utf8');
 const dir=path.join(repositoryRoot,'output/scene-agent/smoke-'+new Date().toISOString().replace(/[:.]/g,'-'));
 const workspace=await createWorkspace(dir,{brief,skillDir:path.join(repositoryRoot,'packages/scene-agent/skill'),initialSource:source});
 const context:ToolContext={workspace,renderer:new RemotionStillRenderer(workspace.brief,undefined,workspace.cues,workspace.kit),capabilities:{vision:true,parallelToolCalls:true,contextTokens:128000,maxOutputTokens:8192,promptCache:true,appendOnlyHistory:false}};
 const tools=buildTools(context.capabilities);
 let n=0;
 const call=async(name:string,args:unknown={})=>{
  const started=Date.now();
  const result=await executeTool(tools,{id:`smoke-${n++}`,name,arguments:args},context);
  const images=result.content.filter(p=>p.type==='image').length;
  console.log(`\n=== ${name} ${JSON.stringify(args).slice(0,120)} → ${result.isError?'ERROR':'ok'} in ${((Date.now()-started)/1000).toFixed(1)}s${images?`, ${images} images`:''}\n${textOf(result.content)}`);
 };
 try{
  console.log('workspace:',dir);
  await call('typecheck');
  await call('render_stills');
  await call('audit_scene');
  await call('view_frames',{frames:[0]});
  // Push the first label below the caption-safe line; the audit must report it.
  const broken=source.replace(/<text([^>]*?)\sy=\{?["']?(\d+)["']?\}?/,(m,attrs)=>`<text${attrs} y={1040}`);
  if(broken===source)throw Error('smoke: could not find a <text y=…> to break');
  await call('write_file',{path:SCENE_FILE,content:broken});
  await call('audit_scene'); // must refuse: source changed
  await call('render_stills');
  await call('audit_scene');
 }finally{await context.renderer.close();}
}
main().catch(error=>{console.error(error);process.exitCode=1;});
