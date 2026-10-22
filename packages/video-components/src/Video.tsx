import React, {useEffect, useMemo, useState} from 'react';
import {AbsoluteFill, Audio, Sequence, staticFile, useCurrentFrame, delayRender, continueRender, cancelRender} from 'remotion';
import '@fontsource/noto-sans-sc/400.css';
import type {Scene, VideoProject} from '../../video-schema/src/types';
import {layoutElements, wrapText, hasGraphicStyle} from './layout';
import {motifLayout} from './motifs';
import {funnelTextBoxes,isSemanticFunnel} from './FunnelDiagram';
import {diagramBoxes} from './TeachingDiagrams';
import {demonstrationTextBoxes} from './demonstrations';
import {PaletteContext, palettes, usePalette, useVisualStyle, VisualStyleContext, validateVisualStyle, isPaperSlide, type VisualStyleId, type VisualStyleSnapshot, visualStyles} from './theme';
import {SceneGraphics} from './SceneGraphics';
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

function SceneView({scene, audioSrc, imageSources, index, count, seriesTitle}: {scene: Scene; audioSrc?: string; imageSources:Record<string,string>; index: number; count: number; seriesTitle?: string}) {
  const frame = useCurrentFrame();
  const palette = usePalette();
  const style = useVisualStyle();
  const paper = isPaperSlide(style),mechanism=!!style.presentation;
  const caption = scene.captions.find(c => frame >= c.start_frame && frame < c.end_frame);
  const header = mechanism?(seriesTitle||'机制演示').slice(0,36):paper
    ? `—— ◆ ${(seriesTitle || '知识讲解').slice(0, 24)} ◆ ——`
    : 'AI CREATER / KNOWLEDGE STUDIO';
  return <AbsoluteFill style={{...(paper ? paperBackground(palette.background) : {backgroundColor: palette.background}), color: palette.text, fontFamily: '"Noto Sans SC"', fontWeight: 400}} data-paper-slide={paper || undefined}>
    <div style={{position: 'absolute', top: 64, left: 80, right: 80, display: 'flex', justifyContent: 'space-between', fontSize: mechanism?24:paper ? 28 : 32, color: palette.muted}}>
      <span data-series-header={paper || undefined}>{header}</span><span>{String(index + 1).padStart(2, '0')} / {String(count).padStart(2, '0')}</span>
    </div>
    {scene.type === 'code_walkthrough' && <CodeLesson scene={scene} frame={frame}/>}
    {scene.type === 'state_diagram' && <StateLesson scene={scene} frame={frame}/>}
    {scene.type === 'data_chart' && <DataChart scene={scene} frame={frame}/>}
    {scene.type === 'execution_timeline' && <TimelineLesson scene={scene} frame={frame}/>}
    <SceneGraphics scene={scene} frame={frame} imageSources={imageSources}/>
    {caption && <div style={{position: 'absolute', left: 96, right: 96, top: mechanism?930:920, height: 128, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: mechanism?36:44, lineHeight: 1.35, textAlign: 'center', whiteSpace: 'pre', background: mechanism?'transparent':palette.caption, color: mechanism?palette.text:palette.captionText, borderRadius: paper ? 8 : 16}}>{wrapText(caption.text, mechanism?30:22).join('\n')}</div>}
    {audioSrc&&<Sequence from={scene.narration.audio_start_frame} layout="none"><Audio src={audioSrc}/></Sequence>}
  </AbsoluteFill>;
}

export function Video({project, audioUrls, visualStyle,visualStyleSnapshot,draftPreview=false, seriesTitle}: VideoProps) {
  const style=useMemo(()=>validateVisualStyle(project,visualStyle,visualStyleSnapshot),[project,visualStyle,visualStyleSnapshot]);
  const [handle] = useState(() => delayRender('Loading bundled Chinese font'));
  useEffect(() => {
    const text = (project ? project.scenes.map(s => [s.code?.source ?? '', s.chart?JSON.stringify(s.chart):'', s.structure?.name ?? '', (s.timeline?.lanes ?? []).map(l => l.label).join(''), ...s.elements.map(e => e.content + (e.source_label ?? '') + (e.output ?? '') + (e.variables ?? []).map(v => v.name + v.value).join('') + (e.items ?? []).map(item => item.key + item.value).join('')), ...s.captions.map(c => c.text)].join('')).join('') : '先运行示例生成命令') + '讲稿侧注对话消息上下文与状态均讲稿示意当前初始更新后处理阶段片段流程与参数仅为不执行真实工具不代表真实推理结果层级示意不表示数量比例机制演示分层演示过程演示对话演示同一对象逐步推进从原稿看进入下一层的条件原稿衔接当前层下一层现在还不能据此认定示意人工编排同稿同音轨静音画面草稿临时时序非配音对齐步骤结论稿中来源 · 代码讲解当前步骤等待开始变量状态教学快照输出结果尚无数组对象栈空顶不执行正在的项最后进入最先取出TOP执行时间线毫秒示意非性能实测实线虚线菱形短事件空心条段重叠仅代表任务不保证并行配音轴独立CPU0123456789 ms → /—'+(style.presentation?(seriesTitle??''):'');
    let cancelled = false;
    document.fonts.load('400 44px "Noto Sans SC"', text).then(() => {
      if (cancelled) return;
      const canvas = document.createElement('canvas');
      const ctx = canvas.getContext('2d')!;
      const custom=style!==visualStyles.legacy;
      for (const scene of project?.scenes ?? []) {
        const demo=scene.images?undefined:demonstrationTextBoxes(scene,style),teaching=diagramBoxes(scene),funnel=isSemanticFunnel(scene),semantic=!!demo||!!teaching||funnel;
        const boxes=demo??teaching??(funnel?funnelTextBoxes(scene):(motifLayout(scene,style.layout)??layoutElements(scene,style.layout)));
        for (const box of boxes) {
          const graphic=!semantic&&hasGraphicStyle(scene.elements.find(e=>e.id===box.id)!);
          const padding=scene.images?16:graphic?style.card.graphicPadding:scene.type==='flow_diagram'?style.card.flowPadding:style.card.padding;
          ctx.font = `400 ${box.fontSize}px "Noto Sans SC"`;
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
  return <PaletteContext.Provider value={palettes[project.theme]}><VisualStyleContext.Provider value={style}><AbsoluteFill>{project.scenes.map((scene, i) => {
    const from = offset; offset += scene.duration_frames;
    return <Sequence key={scene.id} from={from} durationInFrames={scene.duration_frames}>
      <SceneView scene={scene} imageSources={imageSources} seriesTitle={seriesTitle} audioSrc={draftPreview?undefined:audioUrls?.[scene.narration.audio_asset_id] ?? staticFile(assets.get(scene.narration.audio_asset_id)!.storage_key)} index={i} count={project.scenes.length}/>
    </Sequence>;
  })}{draftPreview&&<div style={{position:'absolute',...(style.presentation?{top:112,padding:'4px 12px'}:{bottom:24,padding:'8px 16px'}),right:48,borderRadius:8,fontFamily:'"Noto Sans SC"',fontSize:24,color:palettes[project.theme].muted,background:palettes[project.theme].background}}>静音画面草稿 · 临时时序，非配音对齐</div>}</AbsoluteFill></VisualStyleContext.Provider></PaletteContext.Provider>;
}
