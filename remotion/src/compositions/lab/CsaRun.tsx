import React, { useMemo } from 'react';
import { useCurrentFrame } from 'remotion';
import { FONT, fmt, prog } from '../../anim';
import { locate, makeTimeline } from '../../timing';
import { GeneRows, type Row } from '../../primitives/GeneRows';
import { TaskGantt, layoutOf, robustAxis, type Layout } from '../../primitives/TaskGantt';
import { Pill, Stage, Title, VmLegend } from '../../primitives/ui';
import type { AlgoFrame, Cand, LabProps } from '../../types';

export const LAB_W = 1280;
export const LAB_H = 720;

const DUR: Record<string, number> = { INIT: 70, SELECTION: 50, CLONING: 64, MUTATION: 80, SURVIVOR: 84, FINISHED: 80 };
export const csaTimeline = (p: LabProps) => makeTimeline(p.frames.map(f => DUR[f.phase] ?? 50));

const key = (c: Cand) => `ab-${c.id}`;
const val = (c: Cand) => `${fmt(c.makespan, 1)} s · F ${c.fitness?.toFixed(3) ?? '–'}`;

/** Row lists for step i. Several entries = the step plays them one after another. */
function stagesFor(frames: AlgoFrame[], i: number): Row[][] {
  const s = frames[i];
  const prev = frames[i - 1];
  const hl = s.candidate?.id;
  const base = (c: Cand, extra: Partial<Row> = {}): Row => ({
    key: key(c), label: `Ab${c.id}`, genes: c.assignedVm, value: val(c), hl: c.id === hl, ...extra
  });

  switch (s.phase) {
    case 'SELECTION': {
      const rank = new Map(s.parents!.map(p => [p.id, p.rank!]));
      return [s.population!.map(c => rank.has(c.id) ? base(c, { cls: 'sel', badge: `#${rank.get(c.id)}` }) : base(c, { cls: 'out' }))];
    }
    case 'CLONING':
    case 'MUTATION': {
      // clone ids are assigned in the MUTATION frame, in the same order
      const mutFrame = s.phase === 'MUTATION' ? s : frames[i + 1];
      const mutated = mutFrame?.phase === 'MUTATION' ? mutFrame.mutatedClones! : [];
      const groups = s.phase === 'CLONING' ? s.cloneGroups! : prev!.cloneGroups!;
      const rows: Row[] = [];
      let j = 0;
      groups.forEach((g, r) => {
        rows.push(base(g.parent, { cls: 'sel', badge: `#${r + 1}`, hl: false }));
        g.clones.forEach((c, k) => {
          const m = mutated[j++];
          const id = m?.id;
          const k2 = id !== undefined ? `ab-${id}` : `cl-${g.parent.id}-${k}`;
          if (s.phase === 'CLONING' || !m) {
            rows.push({ key: k2, label: `klon ${k + 1}`, genes: c.assignedVm, cls: 'clone', spawnFrom: key(g.parent), value: `p_mut ${(c.mutationRate * 100).toFixed(1)}%` });
          } else {
            rows.push({
              key: k2, label: `Ab${id} ←#${r + 1}`, genes: m.assignedVm, cls: 'clone', mark: m.mutatedIndices, hl: id === hl,
              value: `${m.mutatedIndices!.length} gen · ${fmt(m.makespan, 1)} s`
            });
          }
        });
      });
      return [rows];
    }
    case 'SURVIVOR': {
      if (prev?.phase !== 'MUTATION') return [s.population!.map(c => base(c))];
      const alive = new Set(s.population!.map(c => c.id));
      const pool = [...prev.population!, ...prev.mutatedClones!].sort((a, b) => a.fitness! - b.fitness! || a.id! - b.id!);
      return [
        pool.map(c => base(c, alive.has(c.id) ? { cls: 'sel', hl: false } : { cls: 'out', hl: false })),
        s.population!.map(c => base(c))
      ];
    }
    case 'FINISHED':
      return [s.population!.map(c => base(c, { hl: false, cls: c.id === s.best?.id ? 'sel' : '', badge: c.id === s.best?.id ? '★' : undefined }))];
    default:
      return [s.population!.map(c => base(c))];
  }
}

const TITLE: Record<string, string> = {
  INIT: 'Populasi awal', SELECTION: 'Seleksi: urutkan menurut F', CLONING: 'Kloning: parent → klon',
  MUTATION: 'Hipermutasi klon', SURVIVOR: 'Survivor: P terbaik bertahan', FINISHED: 'Selesai'
};

export const CsaRun: React.FC<LabProps> = props => {
  const { frames, tasks, vms, totalHosts = 2 } = props;
  const frame = useCurrentFrame();
  const tl = useMemo(() => csaTimeline(props), [frames]);
  const layouts = useMemo(() => frames.map(f => layoutOf(tasks, vms, f.candidate ?? f.best, totalHosts)), [frames, tasks, vms]);
  const axisMax = useMemo(() => robustAxis(layouts.map(l => l?.makespan ?? 0)), [layouts]);
  const maxRows = useMemo(() => {
    let m = 1;
    frames.forEach(f => {
      const clones = (f.cloneGroups ?? []).reduce((a, g) => a + g.clones.length + 1, 0);
      m = Math.max(m, f.population?.length ?? 0, clones, (f.population?.length ?? 0) + (f.mutatedClones?.length ?? 0));
    });
    return m;
  }, [frames]);

  if (!frames.length) return <Stage>{null}</Stage>;
  const { index, local, dur } = locate(tl, Math.min(frame, tl.total - 1));
  const s = frames[index];

  // rows: chain prevStep.final → stage0 → stage1 …
  const stages = stagesFor(frames, index);
  const prevFinal = index > 0 ? stagesFor(frames, index - 1).at(-1)! : null;
  const seg = dur / stages.length;
  const k = Math.min(stages.length - 1, Math.floor(local / seg));
  const segLocal = local - k * seg;
  const t = prog(segLocal, 2, seg * 0.62);
  const flip = s.phase === 'MUTATION' ? prog(local, dur * 0.1, dur * 0.8, x => x) : t;
  const from = k === 0 ? prevFinal : stages[k - 1];

  const listW = 744;
  const rowH = Math.max(10, Math.min(34, Math.floor((LAB_H - 70 - 20) / maxRows)));

  // phenotype: focused candidate as a Gantt chart
  const lay = layouts[index] as Layout;
  const prevLay = index > 0 ? layouts[index - 1] : null;
  const gt = s.phase === 'MUTATION' ? prog(local, dur * 0.35, dur * 0.9) : prog(local, 4, dur * 0.6);
  const cand = s.candidate ?? s.best!;
  const prevCand = index > 0 ? (frames[index - 1].candidate ?? frames[index - 1].best) : null;
  const moved = prevCand ? cand.assignedVm.filter((v, i) => prevCand.assignedVm[i] !== v).length : 0;
  const delta = prevCand ? cand.makespan - prevCand.makespan : 0;

  return (
    <Stage>
      <Title style={{ left: 24, top: 16 }} sub="baris = jadwal · kotak = VM tiap task">{TITLE[s.phase]}</Title>
      <VmLegend vms={vms} style={{ left: 24, top: 44 }} />
      <GeneRows from={from} to={stages[k]} t={t} flip={flip} top={66} left={16} layout={{ width: listW, rowH, n: tasks.length, valueW: 176 }}
        spawnStagger={s.phase === 'INIT' ? 0.08 : s.phase === 'CLONING' ? 0.03 : 0} />

      <div style={{ position: 'absolute', left: 784, top: 12, bottom: 12, width: 1, background: 'var(--border)' }} />
      <Title style={{ left: 808, top: 16 }} sub={s.phase === 'FINISHED' ? 'solusi terbaik' : 'kandidat yang disorot'}>
        Ab{cand.id} dieksekusi
      </Title>
      <div style={{ position: 'absolute', left: 808, top: 46, display: 'flex', gap: 8 }}>
        <Pill color="var(--csa)">F {cand.fitness?.toFixed(3)}</Pill>
        <Pill color="var(--fg-muted)">energi {fmt((cand.energy ?? 0) / 1000, 1)} kJ</Pill>
        {prevCand && moved > 0 && <Pill color="var(--accent)" style={{ opacity: prog(local, 6, 20) }}>{moved} task pindah VM</Pill>}
      </div>
      {lay && <TaskGantt tasks={tasks} vms={vms} from={prevLay} to={lay} t={gt} axisMax={axisMax} width={452} height={480} left={808} top={124} />}
      <div style={{ position: 'absolute', left: 808, top: 628, width: 452, font: `500 14px ${FONT.sans}`, color: 'var(--fg-muted)', lineHeight: 1.4 }}>
        {prevCand && Math.abs(delta) > 1e-9
          ? <span>Makespan <b style={{ color: delta < 0 ? 'var(--success)' : 'var(--error)' }}>{delta < 0 ? '▼' : '▲'} {fmt(Math.abs(delta), 1)} s</b> dibanding kandidat sebelumnya.</span>
          : <span>Batang = task pada VM/PE-nya; garis merah = task terakhir selesai (makespan).</span>}
      </div>
    </Stage>
  );
};
