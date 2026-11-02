import React from 'react';
import { mix, prog, pulse } from '../../anim';
import { SvgStage, storyTimeline, txt, useStory } from './common';

/* Slide 2: queue → random mapping → smart mapping (same data as before). */
const P_TASKS = [83, 95, 91, 30, 15, 62, 48, 120, 40, 70].map((k, i) => ({ id: i, mi: k * 1000 }));
const P_VMS = [{ name: 'Small', mips: 500 }, { name: 'Medium', mips: 1000 }, { name: 'Large', mips: 2000 }];
const RANDOM_MAP = [0, 0, 1, 0, 2, 0, 1, 0, 2, 1];

function lpt() {
  const free = P_VMS.map(() => 0);
  const map: number[] = [];
  [...P_TASKS].sort((a, b) => b.mi - a.mi).forEach(t => {
    let best = 0, bestEnd = Infinity;
    P_VMS.forEach((v, j) => { const end = free[j] + t.mi / v.mips; if (end < bestEnd) { bestEnd = end; best = j; } });
    map[t.id] = best; free[best] = bestEnd;
  });
  return map;
}
function layout(map: number[]) {
  const free = P_VMS.map(() => 0);
  const pos: { v: number; start: number; dur: number }[] = [];
  P_TASKS.forEach(t => {
    const v = map[t.id];
    const dur = t.mi / P_VMS[v].mips;
    pos[t.id] = { v, start: free[v], dur };
    free[v] += dur;
  });
  return { pos, makespan: Math.max(...free), load: free };
}
export const R = layout(RANDOM_MAP);
export const S = layout(lpt());

export const PROBLEM_W = 1280, PROBLEM_H = 660;
export const problemTimeline = () => storyTimeline(3, 150);

const X0 = 150, W = 470, scale = W / R.makespan;
const laneY = (v: number) => 78 + v * 80;
const GAIN_W = 132;

type Box = { x: number; y: number; w: number };
const queueBox = (id: number): Box => ({ x: X0 + id * 47, y: 26, w: 42 });
const laneBox = (L: typeof R, id: number): Box => {
  const p = L.pos[id];
  return { x: X0 + p.start * scale, y: laneY(p.v) + 14, w: Math.max(8, p.dur * scale - 2) };
};

export const Problem: React.FC = () => {
  const { step, local, reached } = useStory(problemTimeline());
  // tasks travel one after another (stagger 4 frames)
  const each = (id: number) => (a: number, b: number) => reached(step, a + id * 4, b + id * 4);

  const mkVisible = step === 1 ? 0 : step === 2 ? prog(local, 70, 90) : 1;
  const mkSpan = step === 3 ? mix(R.makespan, S.makespan, prog(local, 30, 90)) : R.makespan;
  const overloaded = step === 2 ? pulse(local % 40, 0, 40) * prog(local, 70, 90) : 0;
  const gain = Math.round((1 - S.makespan / R.makespan) * 100);

  return (
    <SvgStage w={640} h={330}>
      <text x={X0 - 10} y={42} textAnchor="end" style={txt.lbl}>Antrean</text>
      {P_VMS.map((v, i) => (
        <g key={i} transform={`translate(${X0 - 6} ${laneY(i)})`}>
          <rect x={0} y={6} width={W + 12} height={44} rx={8} fill="var(--surface-alt)" />
          {i === 0 && <rect x={0} y={6} width={W + 12} height={44} rx={8} fill="var(--error-soft)" opacity={overloaded} />}
          <text x={-4} y={26} textAnchor="end" style={txt.lbl}>VM {v.name}</text>
          <text x={-4} y={40} textAnchor="end" style={txt.sub}>{v.mips} MIPS</text>
        </g>
      ))}
      {P_TASKS.map(t => {
        const e = each(t.id);
        let a: Box, b: Box, p: number;
        if (step === 1) { b = queueBox(t.id); a = { ...b, x: -60 }; p = e(0, 40); }
        else if (step === 2) { a = queueBox(t.id); b = laneBox(R, t.id); p = e(0, 40); }
        else { a = laneBox(R, t.id); b = laneBox(S, t.id); p = e(20, 70); }
        const moved = step === 3 && R.pos[t.id].v !== S.pos[t.id].v;
        const x = mix(a.x, b.x, p), w = mix(a.w, b.w, p);
        const y = mix(a.y, b.y, p) - (moved || step === 2 ? pulse(p, 0, 1) * 16 : 0);
        return (
          <g key={t.id} transform={`translate(${x} ${y})`}>
            <rect width={w} height={22} rx={4} fill={`var(--c${t.id % 8})`} stroke={moved && p > 0 && p < 1 ? 'var(--fg)' : 'none'} strokeWidth={2} />
            {w >= 22 && <text x={w / 2} y={15} textAnchor="middle" style={txt.tok}>T{t.id}</text>}
          </g>
        );
      })}
      <g transform={`translate(${X0 + mkSpan * scale} 0)`} opacity={mkVisible}>
        <line y1={70} y2={330} stroke="var(--error)" strokeWidth={2} strokeDasharray="5 4" />
        <text y={64} textAnchor="end" style={txt.mk}>makespan {Math.round(mkSpan)} s</text>
      </g>
      {step === 3 && (
        // pill sized for "NN% lebih cepat" in 11px mono (~6.6px/char) + 14px padding each side
        <g opacity={prog(local, 90, 105)} transform={`translate(${X0 + S.makespan * scale + 12} 292)`}>
          <rect width={GAIN_W} height={26} rx={13} fill="var(--success)" />
          <text x={GAIN_W / 2} y={17.5} textAnchor="middle" style={{ ...txt.tok, fontSize: 11 }}>{gain}% lebih cepat</text>
        </g>
      )}
    </SvgStage>
  );
};
