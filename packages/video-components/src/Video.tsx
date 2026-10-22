import React, {useEffect, useMemo, useState} from 'react';
import {AbsoluteFill, Audio, Sequence, staticFile, useCurrentFrame, delayRender, continueRender, cancelRender} from 'remotion';
import '@fontsource/noto-sans-sc/400.css';
import '@fontsource/noto-serif-sc/600.css';
import type {Scene, VideoProject} from '../../video-schema/src/types';
import {layoutElements, wrapText, hasGraphicStyle} from './layout';
import {motifLayout} from './motifs';
import {funnelTextBoxes,isSemanticFunnel} from './FunnelDiagram';
import {diagramBoxes} from './TeachingDiagrams';
import {demonstrationTextBoxes} from './demonstrations';
import {PaletteContext, palettes, paletteFor, usePalette, useVisualStyle, VisualStyleContext, validateVisualStyle, isPaperSlide, type VisualStyleId, type VisualStyleSnapshot, visualStyles} from './theme';
import {SceneGraphics} from './SceneGraphics';
import {Caption} from './captions';
import {blendCamera, cameraTransform, PAPER_CAMERA_FRAMES, sceneCamera, smoothstep} from './motion';
import {CodeLesson, codeFont} from './CodeLesson';
import {StateLesson, stateBoxes} from './StateLesson';
import {TimelineLesson} from './TimelineLesson';
import {DataChart} from './DataChart';

export type VideoProps = {project?: VideoProject; audioUrls?: Record<string, string>; visualStyle?: VisualStyleId; visualStyleSnapshot?:VisualStyleSnapshot; draftPreview?:boolean; seriesTitle?: string};
const palette = palettes.tech_explainer;

function paperBackground(base: string) {
  return {
    backgroundColor: base,
    backgroundImage: [
      'radial-gradient(circle at 18% 22%, rgba(0,0,0,0.035) 0 1px, transparent 1.5px)',
      'radial-gradient(circle at 72% 68%, rgba(0,0,0,0.03) 0 1px, transparent 1.5px)',
      'repeating-linear-gradient(0deg, transparent, transparent 3px, rgba(0,0,0,0.012) 3px, rgba(0,0,0,0.012) 4px)',
    ].join(','),
  };
}

function SceneView({scene, audioSrc, imageSources, index, count, seriesTitle, frame, playAudio=true}: {scene: Scene; audioSrc?: string; imageSources:Record<string,string>; index: number; count: number; seriesTitle?: string; frame: number; playAudio?: boolean}) {
  const palette = usePalette();
  const style = useVisualStyle();
  const paper = isPaperSlide(style),mechanism=!!style.presentation;
  const caption = scene.captions.find(c => frame >= c.start_frame && frame < c.end_frame);
  const header = mechanism?(seriesTitle||'机制演示').slice(0,36):'AI CREATER / KNOWLEDGE STUDIO';
  return <AbsoluteFill style={{...(paper ? paperBackground(palette.background) : {backgroundColor: palette.background}), color: palette.text, fontFamily: '"Noto Sans SC"', fontWeight: 400}} data-paper-slide={paper || undefined}>
    {!paper && <div style={{position: 'absolute', top: 64, left: 80, right: 80, display: 'flex', justifyContent: 'space-between', fontSize: mechanism?24:32, color: palette.muted}}>
      <span data-series-header>{header}</span><span data-page-number>{String(index + 1).padStart(2, '0')} / {String(count).padStart(2, '0')}</span>
    </div>}
    {scene.type === 'code_walkthrough' && <CodeLesson scene={scene} frame={frame}/>}
    {scene.type === 'state_diagram' && <StateLesson scene={scene} frame={frame}/>}
    {scene.type === 'data_chart' && <DataChart scene={scene} frame={frame}/>}
    {scene.type === 'execution_timeline' && <TimelineLesson scene={scene} frame={frame}/>}
    <SceneGraphics scene={scene} frame={frame} imageSources={imageSources}/>
    {caption && <Caption text={caption.text} wide={mechanism}/>}
    {playAudio&&audioSrc&&<Sequence from={scene.narration.audio_start_frame} layout="none"><Audio src={audioSrc}/></Sequence>}
  </AbsoluteFill>;
}

function SequencedScene(props: {scene: Scene; audioSrc?: string; imageSources:Record<string,string>; index: number; count: number; seriesTitle?: string}) {
  const frame = useCurrentFrame();
  return <SceneView {...props} frame={frame}/>;
}

function PaperStage({scenes, imageSources, seriesTitle, frame}: {scenes: Scene[]; imageSources: Record<string, string>; seriesTitle?: string; frame: number}) {
  let offset = 0, index = 0;
  for (let i = 0; i < scenes.length; i++) {
    if (frame < offset + scenes[i].duration_frames || i === scenes.length - 1) {index = i; break;}
    offset += scenes[i].duration_frames;
  }
  const scene = scenes[index];
  const local = Math.max(0, frame - offset);
  const previous = index > 0 ? scenes[index - 1] : undefined;
  const blending = !!previous && local <= PAPER_CAMERA_FRAMES;
  const camera = blending ? blendCamera(sceneCamera(previous!), sceneCamera(scene), local) : sceneCamera(scene);
  const fade = blending ? smoothstep(local / PAPER_CAMERA_FRAMES) : 1;
  return <AbsoluteFill data-paper-camera style={cameraTransform(camera)}>
    {blending && <AbsoluteFill style={{opacity: 1 - fade}}><SceneView scene={previous!} imageSources={imageSources} seriesTitle={seriesTitle} frame={previous!.duration_frames - 1} index={index - 1} count={scenes.length} playAudio={false}/></AbsoluteFill>}
    <AbsoluteFill style={{opacity: fade}}><SceneView scene={scene} imageSources={imageSources} seriesTitle={seriesTitle} frame={local} index={index} count={scenes.length} playAudio={false}/></AbsoluteFill>
  </AbsoluteFill>;
}

export function Video({project, audioUrls, visualStyle,visualStyleSnapshot,draftPreview=false, seriesTitle}: VideoProps) {
  const style=useMemo(()=>validateVisualStyle(project,visualStyle,visualStyleSnapshot),[project,visualStyle,visualStyleSnapshot]);
  const [handle] = useState(() => delayRender('Loading bundled Chinese font'));
  useEffect(() => {
    const text = (project ? project.scenes.map(s => [s.code?.source ?? '', s.chart?JSON.stringify(s.chart):'', s.structure?.name ?? '', (s.timeline?.lanes ?? []).map(l => l.label).join(''), ...s.elements.map(e => e.content + (e.source_label ?? '') + (e.output ?? '') + (e.variables ?? []).map(v => v.name + v.value).join('') + (e.items ?? []).map(item => item.key + item.value).join('')), ...s.captions.map(c => c.text)].join('')).join('') : '先运行示例生成命令') + '讲稿侧注对话消息上下文与状态均讲稿示意当前初始更新后处理阶段片段流程与参数仅为不执行真实工具不代表真实推理结果层级示意不表示数量比例机制演示分层演示过程演示对话演示同一对象逐步推进从原稿看进入下一层的条件原稿衔接当前层下一层现在还不能据此认定示意人工编排同稿同音轨静音画面草稿临时时序非配音对齐步骤结论稿中来源 · 代码讲解当前步骤等待开始变量状态教学快照输出结果尚无数组对象栈空顶不执行正在的项最后进入最先取出TOP执行时间线毫秒示意非性能实测实线虚线菱形短事件空心条段重叠仅代表任务不保证并行配音轴独立CPU0123456789 ms → /—'+(style.presentation?(seriesTitle??''):'');
    let cancelled = false;
    Promise.all([
      document.fonts.load('400 44px "Noto Sans SC"', text),
      isPaperSlide(style) ? document.fonts.load('600 44px "Noto Serif SC"', text) : Promise.resolve(),
    ]).then(() => {
      if (cancelled) return;
      const canvas = document.createElement('canvas');
      const ctx = canvas.getContext('2d')!;
      const custom=style!==visualStyles.legacy;
      const paper=isPaperSlide(style);
      for (const scene of project?.scenes ?? []) {
        if (scene.vector) continue;
        const demo=scene.images?undefined:demonstrationTextBoxes(scene,style),teaching=diagramBoxes(scene),funnel=isSemanticFunnel(scene),semantic=!!demo||!!teaching||funnel;
        const boxes=demo??teaching??(funnel?funnelTextBoxes(scene):(motifLayout(scene,style.layout)??layoutElements(scene,style.layout)));
        for (const box of boxes) {
          const element=scene.elements.find(e=>e.id===box.id)!;
          const graphic=!semantic&&hasGraphicStyle(element);
          const padding=scene.images?16:graphic?style.card.graphicPadding:scene.type==='flow_diagram'?style.card.flowPadding:style.card.padding;
          const serif=paper&&(scene.type==='title_reveal'||element.role==='topic');
          ctx.font = `${serif?600:400} ${box.fontSize}px ${serif?'"Noto Serif SC"':'"Noto Sans SC"'}`;
          if (box.lines.some(line => ctx.measureText(line).width > box.width - (semantic?0:custom?Math.max(48,2*(padding+style.card.borderWidth)):48))) throw new Error(`layout_overflow: ${scene.id}/${box.id}`);
          const contentHeight=(scene.images?.some(b=>b.element_id===box.id)?192:0)+box.lines.length*box.fontSize*(semantic?1.35:style.typography.lineHeight)+(scene.type==='concept'?22*style.typography.lineHeight+style.typography.graphicGap:graphic?64+2*style.typography.graphicGap:0);
          if((semantic||custom||scene.type==='concept')&&contentHeight>box.height-(semantic?0:2*(padding+style.card.borderWidth)))throw new Error(`layout_overflow: ${scene.id}/${box.id}/height`);
        }
      }
      for (const scene of project?.scenes ?? []) if (scene.code) {
        ctx.font = `400 32px ${codeFont}`;
        if (scene.code.source.split('\n').some(line => ctx.measureText(line).width > 972)) throw new Error(`layout_overflow: ${scene.id}/code`);
      }
      for (const scene of project?.scenes ?? []) if (scene.structure) {
        const kind = scene.structure.kind;
        for (const step of scene.elements) {
          ctx.font = '400 32px "Noto Sans SC"';
          if (wrapText(step.content, 16).some(line => ctx.measureText(line).width > 568)) throw new Error(`layout_overflow: ${scene.id}/step`);
          for (const box of stateBoxes(kind, step.items!)) {
            ctx.font = '400 32px "Noto Sans SC"';
            if (box.valueLines.some(line => ctx.measureText(line).width > box.width - 52 - (kind === 'stack' ? box.keyWidth + 32 : 0))) throw new Error(`layout_overflow: ${scene.id}/${box.id}`);
            ctx.font = '400 26px "Noto Sans SC"';
            const label = (kind === 'object' ? box.key : `[${box.key}]`) + (box.top ? ' · 栈顶 TOP' : '') + ' · 当前';
            const available = box.keyWidth;
            if (ctx.measureText(label).width > available) throw new Error(`layout_overflow: ${scene.id}/${box.id}/key (${ctx.measureText(label).width.toFixed(1)}px > ${available}px)`);
          }
        }
      }
      for (const scene of project?.scenes ?? []) if (scene.timeline) {
        ctx.font = '400 32px "Noto Sans SC"';
        if (scene.timeline.lanes.some(l => wrapText(l.label, 6).some(line => ctx.measureText(line).width > 200))) throw new Error(`layout_overflow: ${scene.id}/lane`);
        if (scene.elements.some(e => wrapText(e.content, 16).some(line => ctx.measureText(line).width > 568))) throw new Error(`layout_overflow: ${scene.id}/step`);
        ctx.font = '400 28px "Noto Sans SC"';
        if (scene.timeline.lanes.some(l => ctx.measureText('执行 / ' + l.label).width > 568)) throw new Error(`layout_overflow: ${scene.id}/phase`);
      }
      for (const scene of project?.scenes ?? []) if(scene.chart){
        ctx.font='400 26px "Noto Sans SC"';
        const width=scene.chart.kind==='matrix'?1340/scene.chart.columns!.length-12:1490/scene.chart.data.length-20;
        for(const row of scene.chart.data){
          if(row.values.some(v=>ctx.measureText(String(v)+(scene.chart!.kind==='proportion'?' '+scene.chart!.unit:'')).width>width))throw new Error(`layout_overflow: ${scene.id}/chart/value`);
        }
      }
      continueRender(handle);
    }).catch(cancelRender);
    return () => {cancelled = true;};
  }, [project, handle, style, visualStyle,seriesTitle]);
  if (!project) return <AbsoluteFill style={{background: palette.background, color: palette.text, fontSize: 48, justifyContent: 'center', alignItems: 'center', fontFamily: '"Noto Sans SC"'}}>先运行 npm run demo:create，再用示例 props 打开 Studio。</AbsoluteFill>;
  let offset = 0;
  const assets = new Map(project.assets.map(a => [a.id, a]));
  const imageSources=Object.fromEntries(project.assets.filter(a=>a.type==='image').map(a=>[a.id,audioUrls?.[a.id]??staticFile(a.storage_key)]));
  const paper=isPaperSlide(style);
  const colors=paletteFor(style, project.theme);
  const audioSrc=(scene: Scene)=>draftPreview?undefined:audioUrls?.[scene.narration.audio_asset_id] ?? staticFile(assets.get(scene.narration.audio_asset_id)!.storage_key);
  return <PaletteContext.Provider value={colors}><VisualStyleContext.Provider value={style}><AbsoluteFill>{paper?<>
    {project.scenes.map((scene, i) => {
      const from = offset; offset += scene.duration_frames;
      const src=audioSrc(scene);
      return src?<Sequence key={scene.id} from={from+scene.narration.audio_start_frame} durationInFrames={scene.duration_frames-scene.narration.audio_start_frame} layout="none"><Audio src={src}/></Sequence>:null;
    })}
    <PaperFilm scenes={project.scenes} imageSources={imageSources} seriesTitle={seriesTitle}/>
  </>:project.scenes.map((scene, i) => {
    const from = offset; offset += scene.duration_frames;
    return <Sequence key={scene.id} from={from} durationInFrames={scene.duration_frames}>
      <SequencedScene scene={scene} imageSources={imageSources} seriesTitle={seriesTitle} audioSrc={audioSrc(scene)} index={i} count={project.scenes.length}/>
    </Sequence>;
  })}{draftPreview&&<div style={{position:'absolute',...(style.presentation?{top:112,padding:'4px 12px'}:{bottom:24,padding:'8px 16px'}),right:48,borderRadius:8,fontFamily:'"Noto Sans SC"',fontSize:24,color:colors.muted,background:colors.background}}>静音画面草稿 · 临时时序，非配音对齐</div>}</AbsoluteFill></VisualStyleContext.Provider></PaletteContext.Provider>;
}

function PaperFilm({scenes, imageSources, seriesTitle}: {scenes: Scene[]; imageSources: Record<string, string>; seriesTitle?: string}) {
  const frame = useCurrentFrame();
  return <PaperStage scenes={scenes} imageSources={imageSources} seriesTitle={seriesTitle} frame={frame}/>;
}
