import React from 'react';
import {wrapText} from './layout';

const inkOutline = [[-2, 0], [2, 0], [0, -2], [0, 2], [-2, -2], [2, -2], [-2, 2], [2, 2], [-3, 0], [3, 0], [0, -3], [0, 3]]
  .map(([x, y]) => `${x}px ${y}px 0 #000000`).join(', ');

/** Borderless white fill, black outline, bottom center. */
export function Caption({text, wide=false}: {text: string; wide?: boolean}) {
  return <div data-caption style={{position: 'absolute', left: 80, right: 80, bottom: 48, display: 'flex', alignItems: 'flex-end', justifyContent: 'center', fontSize: wide ? 36 : 44, lineHeight: 1.35, textAlign: 'center', whiteSpace: 'pre', background: 'transparent', color: '#ffffff', WebkitTextStroke: '2px #000000', paintOrder: 'stroke fill', textShadow: inkOutline, fontFamily: '"Noto Sans SC"', fontWeight: 400}}>{wrapText(text, wide ? 30 : 22).join('\n')}</div>;
}
