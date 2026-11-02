import React from 'react';
import { Mulberry32 } from '../../../../web/js/algorithms/rng.js';
import { fmt, mix, prog, pulse } from '../../anim';
import { SvgStage, storyTimeline, txt, useStory } from './common';

/* Slide 3: fitness landscape — explore vs exploit vs balanced. */
export const LANDSCAPE_W = 1280, LANDSCAPE_H = 520;
const STEP = 180;
export const landscapeTimeline = () => storyTimeline(3, STEP);

const f = (x: number) => 70
  - 38 * Math.exp(-((x - 0.18) ** 2) / 0.004)
  - 52 * Math.exp(-((x - 0.72) ** 2) / 0.002)
  - 30 * Math.exp(-((x - 0.45) ** 2) / 0.006)
  + 8 * Math.sin(x * 22);

const W = 640, H = 260, top = 20, bottom = 230;
const ys = Array.from({ length: 201 }, (_, i) => f(i / 200));
const lo = Math.min(...ys), hi = Math.max(...ys);
const Y = (v: number) => bottom - (v - lo) / (hi - lo) * (bottom - top);
const X = (x: number) => 20 + x * (W - 40);
const curve = ys.map((v, i) => `${i ? 'L' : 'M'}${X(i / 200).toFixed(1)},${Y(v).toFixed(1)}`).join('');

const TICK = 13; // frames per search move (~0.42 s)
const AGENTS = 7;
type Mode = 'explore' | 'exploit' | 'balance';

/** Precomputed, seeded trajectories → identical on every play/seek. */
function simulate(mode: Mode, seed: number) {
  const rng = new Mulberry32(seed);
  const ticks = Math.ceil(STEP / TICK) + 1;
  let xs = Array.from({ length: AGENTS }, (_, i) => 0.05 + i * 0.14);
  let best: number | null = null;
  const pos: number[][] = [xs];
  const bests: (number | null)[] = [null];
  for (let k = 1; k < ticks; k++) {
    xs = xs.map(x => {
      let n = x;
      if (mode === 'explore') n = rng.nextDouble();
      else if (mode === 'exploit') {
        const c = Math.min(1, Math.max(0, x + (rng.nextDouble() - 0.5) * 0.04));
        if (f(c) < f(x)) n = c;
      } else {
        const r = rng.nextDouble();
        const base = r < 0.25 ? rng.nextDouble() : (best ?? x) + (rng.nextDouble() - 0.5) * 0.08;
        const c = Math.min(1, Math.max(0, base));
        if (r < 0.25 || f(c) < f(x)) n = c;
      }
      return n;
    });
    for (const x of xs) if (best === null || f(x) < f(best)) best = x;
    pos.push(xs);
    bests.push(best);
  }
  return { pos, bests };
}
const SIMS = { explore: simulate('explore', 7), exploit: simulate('exploit', 11), balance: simulate('balance', 5) };

export const Landscape: React.FC = () => {
  const { step, local } = useStory(landscapeTimeline());
  const mode = (['explore', 'exploit', 'balance'] as Mode[])[step - 1];
  const sim = SIMS[mode];
  const k = Math.floor(local / TICK);
  const p = prog(local - k * TICK, 0, TICK * 0.8);
  const a = sim.pos[k], b = sim.pos[Math.min(k + 1, sim.pos.length - 1)];
  const best = sim.bests[k + 1 < sim.bests.length && p > 0.9 ? k + 1 : k];

  return (
    <SvgStage w={W} h={H}>
      <defs>
        <linearGradient id="lg" x1="0" x2="0" y1="0" y2="1">
          <stop offset="0" stopColor="var(--primary-soft)" stopOpacity={0.2} /><stop offset="1" stopColor="var(--primary-soft)" />
        </linearGradient>
      </defs>
      <path d={`${curve} L${X(1)},${H} L${X(0)},${H} Z`} fill="url(#lg)" />
      <path d={curve} fill="none" stroke="var(--fg)" strokeWidth={2} />
      <text x={X(0.72)} y={H - 6} textAnchor="middle" style={txt.lbl}>optimum global</text>
      <text x={X(0.18)} y={H - 6} textAnchor="middle" style={txt.sub}>optimum lokal</text>
      <text x={16} y={14} style={txt.sub}>↑ makespan (lebih rendah = lebih baik)</text>
      {a.map((x0, i) => {
        const x1 = b[i];
        const x = mix(x0, x1, p);
        const jump = Math.abs(x1 - x0) > 0.06 ? pulse(p, 0, 1) * Math.min(60, Math.abs(x1 - x0) * 140) : 0;
        return (
          <g key={i}>
            {jump > 0 && <line x1={X(x0)} x2={X(x)} y1={Y(f(x0)) - 7} y2={Y(f(x)) - 7 - jump} stroke="var(--primary)" strokeOpacity={0.25} strokeDasharray="2 3" />}
            <circle cx={X(x)} cy={Y(f(x)) - 7 - jump} r={7} fill="var(--primary)" stroke="var(--surface)" strokeWidth={2} />
          </g>
        );
      })}
      {best !== null && (
        <g transform={`translate(${X(best)} ${Y(f(best)) - 26})`}>
          <path d="M0,-9 L2.6,-3 9,-3 4,1 6,8 0,4 -6,8 -4,1 -9,-3 -2.6,-3Z" fill="var(--accent)" />
        </g>
      )}
      <text x={W - 20} y={14} textAnchor="end" style={txt.lbl}>{best !== null ? `terbaik: ${fmt(f(best), 1)}` : ''}</text>
    </SvgStage>
  );
};
