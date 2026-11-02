import React, { useMemo } from 'react';
import { useCurrentFrame } from 'remotion';
import { FONT, fmt, mix, prog, pulse, shake } from '../../anim';
import { locate, makeTimeline } from '../../timing';
import { GeneRows, geneGeom, type Row } from '../../primitives/GeneRows';
import { TaskGantt, layoutOf, robustAxis, type Layout } from '../../primitives/TaskGantt';
import { CapRow, Pill, Stage, Title, VmLegend } from '../../primitives/ui';
import type { AlgoFrame, Cand, LabProps } from '../../types';

const DUR: Record<string, number> = { INIT: 70, HARMONY_GENERATION: 56, IMPROVISATION_AND_REPAIR: 80, MEMORY_UPDATE: 70, FINISHED: 80 };
export const phsTimeline = (p: LabProps) => makeTimeline(p.frames.map(f => DUR[f.phase] ?? 60));

const METHOD_ID: Record<string, string> = {
  'Random Permutation': 'acak', 'HM Memory Copy': 'salin HM', 'Two-Point Crossbreed': 'crossbreed 2 titik',
  'Random Allocation': 'acak', 'Resource HM Copy': 'salin HM', 'Interleaved Crossbreed': 'crossbreed selang-seling'
};

/** Worst entry of the memory the current rhythm writes to (taken before the update). */
const worstIdx = (hm: Cand[]) => hm.reduce((w, e, i) => (e.makespan > hm[w].makespan ? i : w), 0);

function hmRows(s: AlgoFrame, opts: { worst?: number; accepted?: boolean; best?: number } = {}): Row[] {
  return s.scheduleHm!.map((e, i) => ({
    key: `hs-${i}`, label: e.isHeftSeed ? `HM${i} HEFT` : `HM${i}`, genes: e.assignedVm, caps: e.capacityFactors,
    value: `${fmt(e.makespan, 1)} s`,
    cls: i === opts.worst ? (opts.accepted ? 'accept' : 'worst') : '',
    badge: opts.best !== undefined && Math.abs(e.makespan - opts.best) < 1e-9 ? '★' : undefined
  }));
}

/** The probe shown at the top: raw (generation) or after improvisation + repair. */
const probeOf = (s: AlgoFrame): Cand | null =>
  s.phase === 'HARMONY_GENERATION' ? (s.candidate as Cand) : s.probe ?? null;

export const PhsRun: React.FC<LabProps> = props => {
  const { frames, tasks, vms, totalHosts = 2 } = props;
  const frame = useCurrentFrame();
  const tl = useMemo(() => phsTimeline(props), [frames]);
  // Gantt focus: HEFT seed → (raw probe is not executable yet) → repaired probe → best
  const layouts = useMemo(() => {
    const out: (Layout | null)[] = [];
    frames.forEach((f, i) => {
      const plan = f.phase === 'INIT' ? f.candidate : f.phase === 'FINISHED' ? f.best : f.probe;
      out.push(layoutOf(tasks, vms, plan, totalHosts) ?? out[i - 1] ?? null);
    });
    return out;
  }, [frames, tasks, vms]);
  const axisMax = useMemo(() => robustAxis(layouts.map(l => l?.makespan ?? 0), 0.5), [layouts]);

  if (!frames.length) return <Stage>{null}</Stage>;
  const { index, local, dur } = locate(tl, Math.min(frame, tl.total - 1));
  const s = frames[index];
  const prev = index > 0 ? frames[index - 1] : null;
  const isSched = s.rhythm === 'Schedule';
  const hms = s.scheduleHm!.length;

  const listW = 744;
  const rowH = Math.max(14, Math.min(30, Math.floor(200 / hms)));
  const L = { width: listW, rowH, n: tasks.length };
  const g = geneGeom(L);

  /* ---------- memory rows ---------- */
  const t = prog(local, 2, dur * 0.6);
  let worst = -1;
  if (s.phase === 'MEMORY_UPDATE' && prev) worst = worstIdx(isSched ? prev.scheduleHm! : prev.resourceHm!);
  const prevRows = prev ? hmRows(prev) : null;
  // In MEMORY_UPDATE the slot first lights up red, then (if accepted) takes the probe's genes.
  const swapT = prog(local, dur * 0.45, dur * 0.85);
  const curRows = s.phase === 'MEMORY_UPDATE' && isSched
    ? hmRows(swapT > 0 ? s : prev!, { worst, accepted: s.accepted && swapT > 0 })
    : hmRows(s, { best: s.phase === 'FINISHED' ? s.best!.makespan : undefined });
  const hmT = s.phase === 'MEMORY_UPDATE' ? (swapT > 0 ? swapT : prog(local, 2, dur * 0.3)) : t;
  const hmFrom = s.phase === 'MEMORY_UPDATE' && swapT > 0 ? hmRows(prev!, { worst }) : s.phase === 'INIT' ? null : prevRows;

  /* ---------- probe ---------- */
  const probe = probeOf(s);
  const prevProbe = prev && s.phase !== 'HARMONY_GENERATION' ? probeOf(prev) : null;
  let probeRow: Row | null = null;
  let probeDx = 0, probeDy = 0, probeOp = 1;
  if (probe) {
    const changed = prevProbe ? probe.assignedVm.map((v, i) => (v !== prevProbe.assignedVm[i] ? i : -1)).filter(i => i >= 0) : [];
    probeRow = {
      key: 'probe', label: 'probe', genes: probe.assignedVm, caps: probe.capacityFactors, cls: 'probe',
      mark: s.phase === 'IMPROVISATION_AND_REPAIR' ? changed : [],
      value: s.phase === 'HARMONY_GENERATION' ? 'belum dinilai' : `${fmt(probe.makespan, 1)} s`
    };
    if (s.phase === 'MEMORY_UPDATE') {
      if (s.accepted && isSched) {
        // probe drops into the worst slot of the schedule memory
        const fly = prog(local, dur * 0.3, dur * 0.62);
        probeDy = fly * (HM_TOP + 16 + worst * rowH - PROBE_ROW_TOP);
        probeOp = 1 - prog(local, dur * 0.42, dur * 0.52);
        probeRow.cls = 'accept';
      } else if (!s.accepted) {
        probeDx = shake(local, dur * 0.25, dur * 0.6, 10);
        probeRow.cls = 'reject';
      } else {
        probeRow.cls = 'accept';
      }
    }
  }
  const probeFrom = prevProbe ? { ...probeRow!, genes: prevProbe.assignedVm, caps: prevProbe.capacityFactors } : null;
  const probeT = s.phase === 'IMPROVISATION_AND_REPAIR' ? prog(local, dur * 0.1, dur * 0.85, x => x) : t;

  /* ---------- resource memory ---------- */
  const resWorst = s.phase === 'MEMORY_UPDATE' && !isSched ? worst : -1;
  const resT = s.phase === 'MEMORY_UPDATE' ? swapT : t;

  /* ---------- phenotype ---------- */
  const lay = layouts[index];
  const prevLay = index > 0 ? layouts[index - 1] : null;
  const gt = s.phase === 'IMPROVISATION_AND_REPAIR' ? prog(local, dur * 0.3, dur * 0.9) : prog(local, 4, dur * 0.6);
  const ops = s.operations ?? [];
  const beat = (on: boolean) => (on ? 1 + 0.12 * pulse(local % 20, 0, 12) : 1);

  return (
    <Stage>
      {/* rhythm drums */}
      <div style={{ position: 'absolute', left: 24, top: 14, display: 'flex', gap: 8 }}>
        <Pill color="var(--c0)" solid={isSched} style={{ scale: `${beat(isSched && s.phase !== 'INIT' && s.phase !== 'FINISHED')}` }}>● ritme jadwal</Pill>
        <Pill color="var(--phs)" solid={s.rhythm === 'Resource'} style={{ scale: `${beat(s.rhythm === 'Resource')}` }}>● ritme resource</Pill>
      </div>
      <VmLegend vms={vms} style={{ left: 330, top: 20 }} />

      {/* probe block */}
      <div style={{ position: 'absolute', left: 24, top: 52, width: listW - 8, height: 132, borderRadius: 12, border: '1.5px dashed var(--border-strong)', opacity: probe ? 1 : 0.4 }} />
      <div style={{ position: 'absolute', left: 38, top: 60, display: 'flex', gap: 8, alignItems: 'center', font: `700 13px ${FONT.sans}` }}>
        {s.phase === 'HARMONY_GENERATION' && <>
          <span>Probe baru · jadwal:</span><Pill color="var(--phs)" style={{ opacity: prog(local, 0, 10) }}>{METHOD_ID[s.scheduleMethod!] ?? s.scheduleMethod}</Pill>
          <span>resource:</span><Pill color="var(--phs)" style={{ opacity: prog(local, 8, 18) }}>{METHOD_ID[s.resourceMethod!] ?? s.resourceMethod}</Pill>
        </>}
        {s.phase === 'IMPROVISATION_AND_REPAIR' && <span>Improvisasi ×{ops.length} pada ritme {isSched ? 'jadwal' : 'resource'} + repair</span>}
        {s.phase === 'MEMORY_UPDATE' && <span style={{ color: s.accepted ? 'var(--success)' : 'var(--error)' }}>
          {s.accepted ? `Diterima ✓ ${fmt(s.probeMakespan, 1)} s < ${fmt(s.worstMakespan, 1)} s → ganti HM${worst} (terburuk)` : `Ditolak ✕ ${fmt(s.probeMakespan, 1)} s ≥ ${fmt(s.worstMakespan, 1)} s (terburuk)`}
        </span>}
        {(s.phase === 'INIT' || s.phase === 'FINISHED') && <span style={{ color: 'var(--fg-muted)' }}>{s.phase === 'INIT' ? 'Probe dibangkitkan tiap iterasi' : 'Iterasi selesai'}</span>}
      </div>
      {probeRow && (
        <div style={{ position: 'absolute', left: 0, top: 0, translate: `${probeDx}px ${probeDy}px`, opacity: probeOp }}>
          <GeneRows from={probeFrom ? [probeFrom] : null} to={[probeRow]} t={probeT} hideHeader top={PROBE_ROW_TOP} left={16} layout={L} />
        </div>
      )}
      {probe && (
        <div style={{ position: 'absolute', left: 16 + g.labelW, top: PROBE_ROW_TOP + rowH + 6, display: 'flex', gap: 10, alignItems: 'center' }}>
          <span style={{ font: `600 11px ${FONT.mono}`, color: 'var(--fg-muted)' }}>kapasitas</span>
          <CapRow from={prevProbe?.capacityFactors} to={probe.capacityFactors} t={probeT} cell={22} height={20} />
        </div>
      )}
      {probe && (
        <div style={{ position: 'absolute', left: 38, top: PROBE_ROW_TOP + rowH + 34, width: listW - 40 }}>
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
            {s.phase === 'IMPROVISATION_AND_REPAIR' && ops.map((o, i) => (
              <span key={i} style={{
                font: `600 10.5px ${FONT.mono}`, padding: '1px 7px', borderRadius: 6, background: 'var(--phs-soft)', color: 'var(--phs)', whiteSpace: 'nowrap',
                opacity: prog(local, 6 + i * (dur * 0.6 / Math.max(1, ops.length)), 14 + i * (dur * 0.6 / Math.max(1, ops.length)))
              }}>{o}</span>
            ))}
          </div>
        </div>
      )}

      {/* schedule memory */}
      <Title style={{ left: 24, top: HM_TOP - 26 }} sub={isSched && s.phase === 'MEMORY_UPDATE' ? 'ditulis iterasi ini' : undefined}>Harmony Memory · Jadwal</Title>
      <GeneRows from={hmFrom} to={curRows} t={hmT} top={HM_TOP} left={16} layout={L} spawnStagger={s.phase === 'INIT' ? 0.12 : 0} />

      {/* resource memory */}
      <Title style={{ left: 24, top: HM_TOP + 16 + hms * rowH + 14 }} sub={!isSched && s.phase === 'MEMORY_UPDATE' ? 'ditulis iterasi ini' : undefined}>Harmony Memory · Resource</Title>
      {s.resourceHm!.map((e, i) => {
        const before = s.phase === 'MEMORY_UPDATE' ? prev!.resourceHm![i] : prev?.resourceHm?.[i];
        const top = HM_TOP + 16 + hms * rowH + 44 + i * Math.min(30, rowH + 2);
        const appear = s.phase === 'INIT' ? prog(local, i * 6, i * 6 + 20) : 1;
        const isW = i === resWorst;
        return (
          <div key={i} style={{ position: 'absolute', left: 22, top, display: 'flex', alignItems: 'center', gap: 10, opacity: appear,
            background: isW ? (s.accepted && swapT > 0 ? 'var(--primary-soft)' : 'var(--error-soft)') : 'transparent', borderRadius: 6, padding: '1px 6px' }}>
            <span style={{ width: 56, font: `700 12px ${FONT.mono}`, color: isW ? (s.accepted ? 'var(--success)' : 'var(--error)') : 'var(--fg-muted)' }}>HM{i}</span>
            <CapRow from={before?.capacityFactors} to={e.capacityFactors} t={resT} cell={22} height={Math.min(22, rowH - 4)} />
            <span style={{ font: `600 12px ${FONT.mono}`, color: 'var(--fg-muted)' }}>{fmt(e.makespan, 1)} s</span>
          </div>
        );
      })}

      {/* phenotype */}
      <div style={{ position: 'absolute', left: 784, top: 12, bottom: 12, width: 1, background: 'var(--border)' }} />
      <Title style={{ left: 808, top: 16 }} sub={s.phase === 'HARMONY_GENERATION' ? 'probe mentah: tunggu repair' : undefined}>
        {s.phase === 'INIT' ? 'Seed HEFT dieksekusi' : s.phase === 'FINISHED' ? 'Harmoni terbaik' : s.phase === 'HARMONY_GENERATION' ? 'Jadwal sebelumnya' : 'Probe dieksekusi'}
      </Title>
      {lay && <TaskGantt tasks={tasks} vms={vms} from={s.phase === 'HARMONY_GENERATION' ? null : prevLay} to={lay} t={s.phase === 'HARMONY_GENERATION' ? 1 : gt}
        axisMax={axisMax} width={452} height={480} left={808} top={124} dim={s.phase === 'HARMONY_GENERATION'} />}
      {s.phase === 'MEMORY_UPDATE' && (
        <div style={{
          position: 'absolute', left: 1034, top: 340, translate: '-50% -50%', rotate: '-8deg', scale: `${mix(1.6, 1, prog(local, 4, 18))}`, opacity: prog(local, 4, 12),
          padding: '10px 22px', borderRadius: 14, border: `4px solid ${s.accepted ? 'var(--success)' : 'var(--error)'}`, color: s.accepted ? 'var(--success)' : 'var(--error)',
          font: `800 34px ${FONT.display}`, background: 'var(--surface)', zIndex: 10
        }}>
          {s.accepted ? 'DITERIMA' : 'DITOLAK'}
        </div>
      )}
      <div style={{ position: 'absolute', left: 808, top: 628, width: 452, font: `500 14px ${FONT.sans}`, color: 'var(--fg-muted)', lineHeight: 1.4 }}>
        Terbaik sejauh ini: <b style={{ color: 'var(--phs)' }}>{fmt(s.best!.makespan, 1)} s</b>
        {frames[0].candidate && <> · HEFT {fmt(frames[0].candidate.makespan, 1)} s</>}
      </div>
    </Stage>
  );
};

const PROBE_ROW_TOP = 88;
const HM_TOP = 226;
