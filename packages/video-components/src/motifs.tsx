import React from 'react';
import type {Scene} from '../../video-schema/src/types';
import type {StyleTokens} from './theme';
import {usePalette} from './theme';
import {layoutElements, type ElementBox, wrapText} from './layout';

export type MotifId = 'default' | 'funnel' | 'dialogue_split' | 'means_row' | 'schematic';

export function normalizeMotif(scene: Scene): MotifId {
  const raw = typeof scene.motif === 'string' ? scene.motif : 'default';
  if (raw === 'funnel' || raw === 'dialogue_split' || raw === 'means_row' || raw === 'schematic') return raw;
  return 'default';
}

/** Drop invalid motifs before schema/visual checks (provider coerce). */
export function coerceSceneMotif(scene: Record<string, unknown>): void {
  const type = scene.type;
  const motif = scene.motif;
  if (motif === undefined || motif === 'default') {
    if (motif === 'default') scene.motif = 'default';
    return;
  }
  const soft = type === 'title_reveal' || type === 'card_sequence' || type === 'flow_diagram' || type === 'comparison_panel' || type === 'concept';
  if (!soft || typeof motif !== 'string' || !['funnel', 'dialogue_split', 'means_row', 'schematic'].includes(motif)) {
    delete scene.motif;
    return;
  }
  const elements = Array.isArray(scene.elements) ? scene.elements : [];
  const n = elements.length;
  const ok =
    (motif === 'funnel' && n >= 2 && n <= 3 && (type === 'card_sequence' || type === 'flow_diagram')) ||
    (motif === 'dialogue_split' && n >= 2 && n <= 4 && type === 'card_sequence') ||
    (motif === 'means_row' && n >= 2 && n <= 3 && type === 'card_sequence') ||
    (motif === 'schematic' && n >= 1 && n <= 4 && (type === 'card_sequence' || type === 'concept' || type === 'flow_diagram'));
  if (!ok) delete scene.motif;
}

export function motifLayout(scene: Scene, layout: StyleTokens['layout']): ElementBox[] | null {
  const motif = normalizeMotif(scene);
  if (motif === 'default') return null;
  const elements = scene.elements;
  if (motif === 'funnel') {
    const widths = elements.length === 2 ? [1200, 720] : [1280, 960, 640];
    const height = 150;
    const gap = layout.rowGap;
    const total = elements.length * height + (elements.length - 1) * gap;
    const top = 200 + Math.max(0, (620 - total) / 2);
    return elements.map((e, i) => {
      const width = widths[i] ?? 640;
      return {
        id: e.id,
        x: (1920 - width) / 2,
        y: top + i * (height + gap),
        width,
        height,
        fontSize: 32,
        lines: wrapText(e.content, 18),
      };
    });
  }
  if (motif === 'dialogue_split') {
    const leftCount = Math.ceil(elements.length / 2);
    const left = elements.slice(0, leftCount);
    const right = elements.slice(leftCount);
    const boxes: ElementBox[] = [];
    left.forEach((e, i) => {
      boxes.push({
        id: e.id, x: 100, y: 200 + i * 220, width: 720, height: 180, fontSize: 30, lines: wrapText(e.content, 16),
      });
    });
    right.forEach((e, i) => {
      boxes.push({
        id: e.id, x: 920, y: 220 + i * 240, width: 860, height: 220, fontSize: 32, lines: wrapText(e.content, 18),
      });
    });
    return boxes;
  }
  if (motif === 'means_row') {
    const n = elements.length;
    const width = Math.min(520, (1760 - (n - 1) * layout.columnGap) / n);
    const left = (1920 - (n * width + (n - 1) * layout.columnGap)) / 2;
    return elements.map((e, i) => ({
      id: e.id,
      x: left + i * (width + layout.columnGap),
      y: 280,
      width,
      height: 360,
      fontSize: 32,
      lines: wrapText(e.content, 12),
    }));
  }
  if (motif === 'schematic') {
    // Labels on the right; glyph drawn by MotifDecor on the left.
    const height = Math.min(160, Math.floor(700 / Math.max(1, elements.length)));
    const gap = layout.rowGap;
    const top = 200;
    return elements.map((e, i) => ({
      id: e.id,
      x: 780,
      y: top + i * (height + gap),
      width: 1000,
      height,
      fontSize: 32,
      lines: wrapText(e.content, 20),
    }));
  }
  return layoutElements(scene, layout);
}

export function MotifDecor({scene, boxes}: {scene: Scene; boxes: ElementBox[]; frame: number}) {
  const motif = normalizeMotif(scene);
  const palette = usePalette();
  if (motif === 'default') return null;
  if (motif === 'funnel') {
    return <svg width={1920} height={1080} style={{position: 'absolute'}} aria-hidden="true" data-motif="funnel">
      {boxes.map((b, i) => i < boxes.length - 1 ? (
        <polygon key={b.id} points={`${b.x},${b.y + b.height} ${b.x + b.width},${b.y + b.height} ${boxes[i + 1].x + boxes[i + 1].width},${boxes[i + 1].y} ${boxes[i + 1].x},${boxes[i + 1].y}`}
          fill="none" stroke={palette.muted} strokeWidth={2} strokeDasharray="6 8" opacity={0.5}/>
      ) : null)}
    </svg>;
  }
  if (motif === 'dialogue_split') {
    return <svg width={1920} height={1080} style={{position: 'absolute'}} aria-hidden="true" data-motif="dialogue_split">
      <rect x={900} y={180} width={900} height={640} rx={12} fill="none" stroke={palette.muted} strokeWidth={2} strokeDasharray="4 8" opacity={0.4}/>
      <text x={920} y={210} fill={palette.muted} fontSize={22} fontFamily='"Noto Sans SC"'>对话状态档案</text>
    </svg>;
  }
  if (motif === 'schematic') {
    const nodes = [
      [220, 320], [220, 480], [220, 640],
      [420, 400], [420, 560],
      [620, 480],
    ];
    return <svg width={1920} height={1080} style={{position: 'absolute'}} aria-hidden="true" data-motif="schematic">
      <text x={200} y={250} fill={palette.muted} fontSize={22} fontFamily='"Noto Sans SC"'>示意 · 结构</text>
      {nodes.map(([x, y], i) => <circle key={i} cx={x} cy={y} r={18} fill={i >= 5 ? 'none' : palette.card} stroke={i >= 5 ? palette.warning : palette.accent} strokeWidth={3}/>)}
      <line x1={238} y1={320} x2={402} y2={400} stroke={palette.muted} strokeWidth={2}/>
      <line x1={238} y1={480} x2={402} y2={400} stroke={palette.muted} strokeWidth={2}/>
      <line x1={238} y1={480} x2={402} y2={560} stroke={palette.muted} strokeWidth={2}/>
      <line x1={238} y1={640} x2={402} y2={560} stroke={palette.muted} strokeWidth={2}/>
      <line x1={438} y1={400} x2={602} y2={480} stroke={palette.muted} strokeWidth={2}/>
      <line x1={438} y1={560} x2={602} y2={480} stroke={palette.muted} strokeWidth={2}/>
    </svg>;
  }
  if (motif === 'means_row') {
    return <svg width={1920} height={1080} style={{position: 'absolute'}} aria-hidden="true" data-motif="means_row"/>;
  }
  return null;
}
