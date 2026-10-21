import type {Scene, Element} from '../../video-schema/src/types';
import {visualStyles, type StyleTokens} from './theme';

export type ElementBox = {id: string; x: number; y: number; width: number; height: number; fontSize: number; lines: string[]; routing?: 'grid'};
export const hasGraphicStyle = (e: Element) => e.icon !== undefined || e.step !== undefined || e.highlight !== undefined || e.source_label !== undefined || e.panel_style !== undefined;

export function wrapText(text: string, width: number): string[] {
  return text.split('\n').flatMap(line => {
    const points = [...line];
    return Array.from({length: Math.max(1, Math.ceil(points.length / width))}, (_, i) => points.slice(i * width, (i + 1) * width).join(''));
  });
}

export function orderFlowElements(scene: Scene): Element[] {
  const remaining = new Map(scene.elements.map(e => [e.id, e]));
  const result: Element[] = [];
  while (remaining.size) {
    const next = [...remaining.values()].find(e => !(scene.edges ?? []).some(edge => edge.to === e.id && remaining.has(edge.from)));
    if (!next) throw new Error('Flow graph must be acyclic');
    result.push(next); remaining.delete(next.id);
  }
  return result;
}

function cardStrip(elements: Element[], layout: StyleTokens['layout'], graphic: boolean): ElementBox[] {
  const count = elements.length;
  const columns = Math.min(3, Math.max(1, count <= 3 ? count : Math.ceil(count / 2)));
  const rows = Math.ceil(count / columns);
  const width = 520;
  const height = graphic ? (rows === 1 ? 320 : 300) : (rows === 1 ? 260 : 240);
  const fontSize = graphic ? (rows === 1 ? 32 : 30) : (rows === 1 ? 36 : 32);
  const wrap = graphic ? (rows === 1 ? 14 : 12) : (rows === 1 ? 12 : 10);
  const left = (1920 - (columns * width + (columns - 1) * layout.columnGap)) / 2;
  const top = rows === 1 ? 340 : 220;
  return elements.map((e, i) => ({
    id: e.id,
    x: left + (i % columns) * (width + layout.columnGap),
    y: top + Math.floor(i / columns) * (height + layout.rowGap),
    width,
    height,
    fontSize,
    lines: wrapText(e.content, wrap),
  }));
}

export function layoutElements(scene: Scene, layout: StyleTokens['layout'] = visualStyles.legacy.layout): ElementBox[] {
  if (scene.type === 'code_walkthrough' || scene.type === 'state_diagram' || scene.type === 'execution_timeline' || scene.type === 'data_chart') return [];
  if (scene.type === 'concept') {
    const support = scene.elements.filter(e => e.concept_role !== 'definition'), columns = Math.min(3, Math.max(1, support.length));
    const supportRows = Math.max(1, Math.ceil(support.length / Math.max(1, columns)));
    const supportHeight = 220;
    const defHeight = support.length ? (supportRows > 1 ? 220 : 240) : 320;
    const defY = support.length ? 140 : 280;
    const supportTop = defY + defHeight + Math.max(24, layout.rowGap);
    const left = (1920 - (columns * 480 + (columns - 1) * layout.columnGap)) / 2;
    return scene.elements.map(e => {
      if (e.concept_role === 'definition') {
        return {
          id: e.id, x: 200, y: defY, width: 1520, height: defHeight,
          fontSize: support.length ? (supportRows > 1 ? 42 : 48) : 58, lines: wrapText(e.content, 24),
        };
      }
      const i = support.indexOf(e);
      return {
        id: e.id,
        x: left + (i % columns) * (480 + layout.columnGap),
        y: supportTop + Math.floor(i / columns) * (supportHeight + layout.rowGap),
        width: 480, height: supportHeight, fontSize: 28, lines: wrapText(e.content, 14),
      };
    });
  }
  if (scene.type === 'comparison_panel') {
    const width = (1760 - layout.columnGap) / 2;
    return scene.elements.map((e, i) => ({
      id: e.id,
      x: i % 2 ? 80 + width + layout.columnGap : 80,
      y: 184 + Math.floor(i / 2) * Math.max(228, 200 + layout.rowGap),
      width,
      height: hasGraphicStyle(e) ? 224 : 208,
      fontSize: hasGraphicStyle(e) ? 32 : i < 2 ? 40 : 36,
      lines: wrapText(e.content, 20),
    }));
  }
  if (scene.type === 'title_reveal') {
    return scene.elements.map(e => ({
      id: e.id, x: 200, y: 320, width: 1520, height: 320,
      fontSize: hasGraphicStyle(e) ? 56 : 72,
      lines: wrapText(e.content, hasGraphicStyle(e) ? 20 : 15),
    }));
  }
  if (scene.type === 'flow_diagram') {
    const elements = orderFlowElements(scene);
    const graphic = elements.some(hasGraphicStyle);
    const n = elements.length;
    const gap = layout.flowRowGap;
    // Keep a single vertical column inside the safe preview band (~80..900).
    const bandTop = 80, bandBottom = 900, band = bandBottom - bandTop;
    let height = graphic ? 224 : 112;
    let step = height + gap;
    let span = (n - 1) * step + height;
    while (span > band && height > (graphic ? 100 : 72)) {
      height -= 4;
      step = height + gap;
      span = (n - 1) * step + height;
    }
    const fontSize=graphic&&height<160?26:32;
    if(graphic&&elements.some(e=>wrapText(e.content,20).length*fontSize*1.35+(hasGraphicStyle(e)?96:0)>height-32))
      return cardStrip(elements,layout,true).map(box=>({...box,routing:'grid'}));
    const width = graphic ? 1000 : 900;
    const x = (1920 - width) / 2;
    const top = bandTop + Math.max(0, (band - span) / 2);
    return elements.map((e, i) => ({
      id: e.id, x, y: top + i * step, width, height,
      fontSize,
      lines: wrapText(e.content, 20),
    }));
  }
  if (scene.type === 'card_sequence') {
    return cardStrip(scene.elements, layout, scene.elements.some(hasGraphicStyle));
  }
  // Fallback for unexpected soft types — keep prior grid behaviour.
  if (scene.elements.some(hasGraphicStyle)) {
    const columns = Math.min(3, scene.elements.length), rows = Math.ceil(scene.elements.length / columns);
    const left = (1920 - (columns * 520 + (columns - 1) * layout.columnGap)) / 2;
    return scene.elements.map((e, i) => ({
      id: e.id,
      x: left + (i % columns) * (520 + layout.columnGap),
      y: (rows === 1 ? 250 : 170) + Math.floor(i / columns) * (328 + layout.rowGap),
      width: 520, height: rows === 1 ? 364 : 336, fontSize: rows === 1 ? 40 : 36,
      lines: wrapText(e.content, rows === 1 ? 11 : 12),
    }));
  }
  const columns = Math.min(3, scene.elements.length);
  const rows = Math.ceil(scene.elements.length / columns);
  const left = (1920 - (columns * 520 + (columns - 1) * layout.columnGap)) / 2;
  const top = 190 + (2 - rows) * 146;
  return scene.elements.map((e, i) => ({
    id: e.id,
    x: left + (i % columns) * (520 + layout.columnGap),
    y: top + Math.floor(i / columns) * (260 + layout.rowGap),
    width: 520, height: 260, fontSize: hasGraphicStyle(e) ? 32 : 40,
    lines: wrapText(e.content, hasGraphicStyle(e) ? 14 : 10),
  }));
}

/** Vertical-stack orthogonal/curve arrows (single column). */
export function flowPath(from: ElementBox, to: ElementBox, index: number, routing: string = 'orthogonal'): string {
  const fromMidX = from.x + from.width / 2, toMidX = to.x + to.width / 2;
  if(from.routing==='grid'||to.routing==='grid'){
    const sameRow=from.y===to.y,down=to.y>from.y;
    const sy=sameRow||!down?from.y:from.y+from.height,ey=sameRow||down?to.y:to.y+to.height;
    const lane=sameRow?sy-16-index*3:(sy+ey)/2+index*2;
    return routing==='curve'?`M ${fromMidX} ${sy} C ${fromMidX} ${lane} ${toMidX} ${lane} ${toMidX} ${ey}`:`M ${fromMidX} ${sy} V ${lane} H ${toMidX} V ${ey}`;
  }
  if (routing === 'curve') {
    const lane = Math.min(fromMidX, toMidX) - 48 - index * 16;
    return `M ${from.x} ${from.y + from.height / 2} C ${lane} ${from.y + from.height / 2} ${lane} ${to.y + to.height / 2} ${to.x} ${to.y + to.height / 2}`;
  }
  const lane = Math.min(from.x, to.x) - 32 - index * 16;
  return `M ${from.x} ${from.y + from.height / 2} H ${lane} V ${to.y + to.height / 2} H ${to.x}`;
}
