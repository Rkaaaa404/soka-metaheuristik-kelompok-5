import React from 'react';
import { decodeSchedule } from '../../../web/js/algorithms/decoder.js';
import { FONT, fmt, mix, pulse, vmColor } from '../anim';
import type { Plan, Task, Vm } from '../types';

/** Where every task sits for one schedule: VM, PE sub-row, start, finish. */
export type Layout = {
  vm: number[]; pe: number[]; start: number[]; finish: number[];
  makespan: number; caps: number[];
};

/** Time axis that ignores outliers (a badly mutated clone shouldn't squash every other chart). */
export const robustAxis = (spans: number[], q = 0.85) => {
  const v = spans.filter(x => x > 0).sort((a, b) => a - b);
  if (!v.length) return 1;
  return v[Math.min(v.length - 1, Math.floor(v.length * q))] * 1.12;
};

export const layoutOf = (tasks: Task[], vms: Vm[], plan: Plan | undefined | null, hosts = 2): Layout | null => {
  if (!plan) return null;
  try {
    const d = decodeSchedule(tasks, vms, plan, hosts);
    return { vm: [...plan.assignedVm], pe: d.assignedPe, start: d.startTimes, finish: d.finishTimes, makespan: d.makespan, caps: [...plan.capacityFactors] };
  } catch {
    return null; // e.g. raw PHS probe with tasks on a switched-off VM
  }
};

type Props = {
  tasks: Task[]; vms: Vm[];
  from: Layout | null; to: Layout;
  /** 0→1 progress of the morph */
  t: number;
  /** fixed time axis (s) so bars visibly shrink when the schedule improves */
  axisMax: number;
  width: number; height: number;
  left?: number; top?: number;
  dim?: boolean;
};

/**
 * Gantt chart of one schedule. When `from` is given every task bar flies
 * from its old VM/PE/start to the new one, so you can see which tasks a
 * mutation or improvisation moved and how the makespan line reacts.
 */
export const TaskGantt: React.FC<Props> = ({ tasks, vms, from, to, t, axisMax, width, height, left = 0, top = 0, dim }) => {
  const headW = 96;
  const axisH = 22;
  const trackW = width - headW - 8;
  const laneGap = 6;
  const laneH = (height - axisH - laneGap * (vms.length - 1)) / vms.length;
  const X = (s: number) => headW + (s / axisMax) * trackW;
  const laneY = (v: number) => v * (laneH + laneGap);
  const peY = (v: number, p: number) => laneY(v) + 3 + p * ((laneH - 6) / vms[v].pes);
  const peH = (v: number) => (laneH - 6) / vms[v].pes - 2;
  const mk = mix(from?.makespan ?? to.makespan, to.makespan, t);
  const over = mk > axisMax;
  const mkX = Math.min(X(mk), headW + trackW);
  const LIFT = 16; // room above the lanes for tasks that hop between VMs

  return (
    <div style={{ position: 'absolute', left, top, width, height, opacity: dim ? 0.45 : 1 }}>
      {vms.map((vm, v) => {
        const c0 = from?.caps[v] ?? to.caps[v];
        const c1 = to.caps[v];
        const cap = mix(c0, c1, t);
        const off = cap < 0.25;
        return (
          <React.Fragment key={v}>
            <div style={{
              position: 'absolute', left: headW, top: laneY(v), width: trackW, height: laneH, borderRadius: 8,
              background: off ? 'repeating-linear-gradient(45deg, var(--surface-alt) 0 6px, #e3e1d9 6px 12px)' : 'var(--surface-alt)'
            }} />
            <div style={{ position: 'absolute', left: 0, top: laneY(v), width: headW - 8, height: laneH, display: 'flex', flexDirection: 'column', justifyContent: 'center' }}>
              <div style={{ font: `700 13px ${FONT.mono}`, color: 'var(--fg)', display: 'flex', alignItems: 'center', gap: 5 }}>
                <span style={{ width: 10, height: 10, borderRadius: 3, background: vmColor(v), display: 'inline-block' }} />VM {v}
              </div>
              <div style={{ font: `500 10px ${FONT.mono}`, color: off ? 'var(--error)' : 'var(--fg-faint)' }}>
                {off ? 'nonaktif' : `${vm.type[0]} · ${Math.round(vm.nominalMips * cap)}×${vm.pes}`}
              </div>
            </div>
          </React.Fragment>
        );
      })}
      <div style={{ position: 'absolute', left: headW, top: -LIFT, width: trackW, height: height - axisH + LIFT, overflow: 'hidden' }}>
      {tasks.map(task => {
        const i = task.id;
        const v1 = to.vm[i], p1 = to.pe[i];
        const v0 = from ? from.vm[i] : v1, p0 = from ? from.pe[i] : p1;
        const moved = from ? v0 !== v1 : false;
        // moved tasks lift out of their lane first, then travel (arc)
        const x = mix(X(from ? from.start[i] : to.start[i]), X(to.start[i]), t);
        const w = Math.max(3, mix(X(from ? from.finish[i] : to.finish[i]) - X(from ? from.start[i] : to.start[i]), X(to.finish[i]) - X(to.start[i]), t) - 1);
        const y = mix(peY(v0, p0), peY(v1, p1), t) - (moved ? pulse(t, 0, 1) * 10 : 0);
        const h = mix(peH(v0), peH(v1), t);
        const colorV = t < 0.5 ? v0 : v1;
        return (
          <div key={i} style={{
            position: 'absolute', left: x - headW, top: y + LIFT, width: w, height: Math.max(3, h), borderRadius: 3,
            background: vmColor(colorV), color: '#fff', font: `700 ${Math.min(11, Math.max(8, h * 0.55))}px ${FONT.mono}`,
            display: 'grid', placeItems: 'center', overflow: 'hidden', whiteSpace: 'nowrap',
            boxShadow: moved ? '0 0 0 2px var(--fg)' : 'inset 0 0 0 1px rgba(255,255,255,.35)', zIndex: moved ? 3 : 1
          }}>
            {w > 26 && h > 10 ? `t${i}` : ''}
          </div>
        );
      })}
      </div>
      {/* makespan marker */}
      <div style={{ position: 'absolute', left: mkX, top: -4, height: height - axisH + 8, borderLeft: '2px dashed var(--error)', zIndex: 4 }} />
      <div style={{
        position: 'absolute', left: mkX - 4, top: -24, translate: '-100% 0', font: `700 13px ${FONT.mono}`, color: 'var(--error)', whiteSpace: 'nowrap'
      }}>
        makespan {fmt(mk, 1)} s{over ? ' ›' : ''}
      </div>
      <div style={{ position: 'absolute', left: headW, top: height - axisH + 6, width: trackW, display: 'flex', justifyContent: 'space-between', font: `500 11px ${FONT.mono}`, color: 'var(--fg-faint)' }}>
        <span>0 s</span><span>{fmt(axisMax / 2, 0)} s</span><span>{fmt(axisMax, 0)} s</span>
      </div>
    </div>
  );
};
