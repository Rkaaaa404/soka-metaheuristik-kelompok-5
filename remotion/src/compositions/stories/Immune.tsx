import React from 'react';
import { mix, prog, pulse } from '../../anim';
import { SvgStage, storyTimeline, txt, useStory } from './common';

/* Slide 4: immune clonal selection. */
export const IMMUNE_W = 1280, IMMUNE_H = 600;
export const immuneTimeline = () => storyTimeline(5, 140);

const CELLS = [
  { x: 80, y: 60, c: '#9fc6d9', a: 0.35 }, { x: 80, y: 150, c: '#a9d4b5', a: 0.7 }, { x: 80, y: 240, c: '#d9c49f', a: 0.2 },
  { x: 175, y: 85, c: '#7fbfae', a: 0.92, best: true }, { x: 175, y: 215, c: '#c9a9d4', a: 0.45 }
];
const CLONES = [
  ...[0, 1, 2, 3].map(i => ({ x: 430 + i * 50, y: 70, from: CELLS[3], c: '#7fbfae', r: 1, mut: i === 1 ? '#5fae9a' : null, mem: i === 1 })),
  ...[0, 1].map(i => ({ x: 430 + i * 50, y: 180, from: CELLS[1], c: '#a9d4b5', r: 2, mut: i === 0 ? '#e0b86b' : '#d98b7a', mem: false }))
];

/** Blend two #rrggbb colours. */
const blend = (a: string, b: string, t: number) => {
  const p = (h: string) => [1, 3, 5].map(i => parseInt(h.slice(i, i + 2), 16));
  const [x, y] = [p(a), p(b)];
  return `rgb(${x.map((v, i) => Math.round(mix(v, y[i], t))).join(',')})`;
};

const Cell: React.FC<{ x: number; y: number; fill: string; stroke?: string; sw?: number; scale?: number; rot?: number; opacity?: number; recColor?: string }> =
  ({ x, y, fill, stroke = 'var(--fg)', sw = 1.5, scale = 1, rot = 0, opacity = 1, recColor = 'var(--fg)' }) => (
    <g transform={`translate(${x} ${y}) rotate(${rot}) scale(${scale})`} opacity={opacity}>
      <circle r={19} fill={fill} stroke={stroke} strokeWidth={sw} />
      <path d="M0,-19 L0,-28 M0,-28 L-6,-34 M0,-28 L6,-34" stroke={recColor} strokeWidth={2.4} fill="none" strokeLinecap="round" />
    </g>
  );

export const Immune: React.FC = () => {
  const { step, local, frame, reached } = useStory(immuneTimeline());
  const r1 = reached(1), r2 = reached(2), r3 = reached(3), r4 = reached(4, 10, 60), r5 = reached(5);
  const antigenSpin = frame * 0.6;

  return (
    <SvgStage w={640} h={300}>
      <g transform={`translate(300 150) scale(${mix(0.2, 1, r1)}) rotate(${antigenSpin})`} opacity={r1}>
        <polygon
          points={Array.from({ length: 16 }, (_, i) => { const r = i % 2 ? 18 : 32; const a = i * Math.PI / 8; return `${(r * Math.cos(a)).toFixed(1)},${(r * Math.sin(a)).toFixed(1)}`; }).join(' ')}
          fill="var(--error)" opacity={0.85} />
      </g>
      <text x={300} y={200} textAnchor="middle" style={txt.lbl} opacity={r1}>antigen</text>

      {CELLS.map((c, i) => {
        const appear = step === 1 ? prog(local, 10 + i * 6, 30 + i * 6) : 1;
        const bx = c.best ? mix(c.x, 258, r2) : c.x;
        const by = c.best ? mix(c.y, 122, r2) : c.y;
        return (
          <g key={i} opacity={appear}>
            <Cell x={bx} y={by} fill={c.c} stroke={c.best && r2 > 0 ? 'var(--primary)' : 'var(--fg)'} sw={c.best ? mix(1.5, 3, r2) : 1.5} />
            <g transform={`translate(${c.x - 24} ${c.y + 26})`} opacity={c.best ? r2 * (1 - r2) * 4 : r2}>
              <rect width={48} height={5} rx={2} fill="var(--surface-alt)" />
              <rect width={48 * c.a * r2} height={5} rx={2} fill="var(--primary)" />
            </g>
          </g>
        );
      })}

      <text x={430} y={36} style={txt.lbl} opacity={r3}>rank 1 → 4 klon</text>
      <text x={430} y={146} style={txt.lbl} opacity={r3}>rank 2 → 2 klon</text>
      {CLONES.map((k, i) => {
        const p = reached(3, 6 + i * 5, 40 + i * 5);
        const from = k.from.best ? { x: 258, y: 122 } : k.from;
        const mut = k.mut ? r4 : 0;
        const wobble = step === 4 && k.r === 2 ? Math.sin(local * 0.5) * 8 * (1 - prog(local, 60, 100)) : 0;
        const mx = k.mem ? mix(k.x, 560, r5) : k.x;
        const my = k.mem ? mix(k.y, 262, r5) : k.y;
        return (
          <Cell key={i} x={mix(from.x, mx, p)} y={mix(from.y, my, p)} scale={mix(0.4, 1, p)} opacity={p * (k.mem ? 1 : mix(1, 0.25, r5))}
            fill={k.mut ? blend(k.c, k.mut, mut) : k.c} rot={wobble}
            stroke={k.mem && r5 > 0 ? 'var(--accent)' : 'var(--fg)'} sw={k.mem ? mix(1.5, 3, r5) : 1.5}
            recColor={k.r === 2 && r4 > 0.5 ? 'var(--error)' : 'var(--fg)'} />
        );
      })}
      <text x={430} y={118} style={txt.sub} opacity={r4}>mutasi kecil</text>
      <text x={430} y={228} style={txt.sub} opacity={r4}>mutasi besar</text>

      <g transform="translate(560 262)" opacity={r5}>
        <circle r={22 + pulse(local % 45, 0, 45) * 3 * r5} fill="none" stroke="var(--accent)" strokeWidth={3} strokeDasharray="4 3" />
        <text x={-30} y={5} textAnchor="end" style={txt.lbl}>sel memori</text>
      </g>
    </SvgStage>
  );
};
