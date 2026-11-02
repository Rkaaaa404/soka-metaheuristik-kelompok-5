import React from 'react';
import { useCurrentFrame } from 'remotion';
import { Mulberry32 } from '../../../../web/js/algorithms/rng.js';
import { FONT, mix, prog, pulse, vmColor } from '../../anim';
import { locate, makeTimeline } from '../../timing';
import type { GeneLayout, Row } from '../../primitives/GeneRows';
import { Staged, stageClock } from '../../primitives/Staged';
import { CapRow, Stage } from '../../primitives/ui';

/* Small deterministic illustrations (10 tasks, 4 VMs). The real algorithm runs in the Lab. */
export const FLOW_W = 720;
export const FLOW_H = 310;
export const SCENE = 156;
export const flowTimeline = () => makeTimeline(Array(6).fill(SCENE));

const T = 10, M = 4;
const rnd = (seed: number): number[] => { const r = new Mulberry32(seed); return Array.from({ length: T }, () => r.nextInt(M)); };
const L: GeneLayout = { width: 690, rowH: 34, n: T, labelW: 92, valueW: 100, showDigits: true };
const Lc: GeneLayout = { ...L, rowH: 31 };

type Scene = { stages: Row[][]; layout?: GeneLayout; stagger?: number; overlay?: (local: number, dur: number) => React.ReactNode };

/* ------------------------------ CSA ------------------------------ */
const P = [rnd(1), rnd(2), rnd(3), rnd(4)];
const F = [0.91, 0.78, 1.06, 0.84];
const mutate = (g: number[], idx: number[], by = 1) => g.map((v, i) => (idx.includes(i) ? (v + by) % M : v));
const ab = (i: number, extra: Partial<Row> = {}): Row => ({ key: `ab${i}`, label: `Ab${i}`, genes: P[i], ...extra });
const order = [1, 3, 0, 2];
const K1 = [mutate(P[1], [4]), mutate(P[1], [7]), mutate(P[1], [1])];
const K2 = mutate(P[3], [1, 5, 8], 2);
const clone = (id: string, label: string, genes: number[], parent: string, extra: Partial<Row> = {}): Row =>
  ({ key: id, label, genes, cls: 'clone', spawnFrom: parent, ...extra });

const CSA: Scene[] = [
  { stagger: 0.15, stages: [P.map((_, i) => ab(i))] },
  {
    stages: [P.map((_, i) => ab(i, { value: `F = ${F[i]}` }))],
    overlay: (local, dur) => P.map((_, i) => {
      const w = prog(local, 10 + i * 8, dur * 0.6 + i * 8) * (1 / (1 + F[i])) * 90;
      return <div key={i} style={{ position: 'absolute', left: 20 + L.width - 94, top: 16 + 16 + i * L.rowH + L.rowH - 5, width: w, height: 4, borderRadius: 2, background: 'var(--csa)' }} />;
    })
  },
  { stages: [order.map((i, r) => ab(i, { value: `F = ${F[i]}`, cls: r < 2 ? 'sel' : 'out', badge: r < 2 ? `#${r + 1}` : undefined }))] },
  {
    layout: Lc,
    stages: [[
      ab(1, { cls: 'sel', badge: '#1', value: '→ 3 klon' }),
      clone('k1', 'klon', P[1], 'ab1'), clone('k2', 'klon', P[1], 'ab1'), clone('k3', 'klon', P[1], 'ab1'),
      ab(3, { cls: 'sel', badge: '#2', value: '→ 1 klon' }),
      clone('k4', 'klon', P[3], 'ab3')
    ]],
    stagger: 0.08
  },
  {
    layout: Lc,
    stages: [[
      ab(1, { cls: 'sel', badge: '#1', value: 'p kecil' }),
      clone('k1', 'klon', K1[0], 'ab1', { mark: [4], value: '1 gen' }), clone('k2', 'klon', K1[1], 'ab1', { mark: [7], value: '1 gen' }), clone('k3', 'klon', K1[2], 'ab1', { mark: [1], value: '1 gen' }),
      ab(3, { cls: 'sel', badge: '#2', value: 'p besar' }),
      clone('k4', 'klon', K2, 'ab3', { mark: [1, 5, 8], value: '3 gen' })
    ]]
  },
  {
    layout: { ...Lc, rowH: 29 },
    stages: [
      [
        clone('k1', 'klon', K1[0], 'ab1', { cls: 'sel', value: 'F = 0.71' }), ab(1, { cls: 'sel', value: 'F = 0.78' }),
        clone('k2', 'klon', K1[1], 'ab1', { cls: 'sel', value: 'F = 0.80' }), ab(3, { cls: 'sel', value: 'F = 0.84' }),
        ab(0, { cls: 'out', value: 'F = 0.91' }), clone('k3', 'klon', K1[2], 'ab1', { cls: 'out', value: 'F = 0.95' }),
        ab(2, { cls: 'out', value: 'F = 1.06' }), clone('k4', 'klon', K2, 'ab3', { cls: 'out', value: 'F = 1.12' })
      ],
      [
        clone('k1', 'Ab4', K1[0], 'ab1', { cls: '', value: 'F = 0.71', badge: '★' }), ab(1, { value: 'F = 0.78' }),
        clone('k2', 'Ab5', K1[1], 'ab1', { cls: '', value: 'F = 0.80' }), ab(3, { value: 'F = 0.84' })
      ]
    ]
  }
];

/* ------------------------------ PHS ------------------------------ */
const HM = [rnd(11), rnd(12), rnd(13)];
const RM = [[1, 1, 1, 1], [1, 0.5, 0, 1], [0, 1, 0.5, 1]];
const A = rnd(21);
const CROSS = A.map((v, i) => (i >= 3 && i < 7 ? HM[1][i] : v));
const AFTER = (() => { const b = [...HM[1]]; b[2] = (b[2] + 1) % M; [b[6], b[8]] = [b[8], b[6]]; return b; })();
const OFF1 = [1, 0, 1, 1];
const REPAIRED = HM[1].map(v => (v === 1 ? 0 : v));
const PROBE = rnd(31);
const hm = (i: number, extra: Partial<Row> = {}): Row => ({ key: `hm${i}`, label: i ? `HM${i}` : 'HEFT', genes: HM[i], ...extra });

const capBlock = (top: number, rows: { label: string; from?: number[]; to: number[] }[], t: number, quiet = false, left = 130) => (
  <div style={{ position: 'absolute', left, top, display: 'grid', gap: 6 }}>
    {rows.map((r, i) => (
      <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
        <span style={{ width: 130, font: `600 12px ${FONT.mono}`, color: 'var(--fg-muted)' }}>{r.label}</span>
        <CapRow from={r.from} to={r.to} t={t} cell={30} height={26} quiet={quiet} />
      </div>
    ))}
  </div>
);

const PHS: Scene[] = [
  {
    stagger: 0.15, stages: [HM.map((_, i) => hm(i))],
    overlay: (local, dur) => capBlock(196, RM.map((c, i) => ({ label: `Resource HM${i}`, from: [0, 0, 0, 0], to: c })), prog(local, dur * 0.3, dur * 0.6), true)
  },
  {
    layout: L,
    stages: [
      [{ key: 'a', label: 'acak', genes: A }, hm(1)],
      [{ key: 'a', label: 'acak', genes: A }, hm(1), { key: 'p', label: 'probe', genes: A, cls: 'probe', spawnFrom: 'a', cut: [3, 7] }],
      [{ key: 'a', label: 'acak', genes: A }, hm(1), { key: 'p', label: 'probe', genes: CROSS, cls: 'probe', cut: [3, 7], donor: [3, 4, 5, 6], value: 'tengah ← HM1' }]
    ]
  },
  { stages: [[]], overlay: (local) => <RhythmStrip local={local} /> },
  {
    stages: [
      [{ key: 'b', label: 'sebelum', genes: HM[1] }],
      [{ key: 'b', label: 'sebelum', genes: HM[1] }, { key: 's', label: 'sesudah', genes: HM[1], spawnFrom: 'b' }],
      [{ key: 'b', label: 'sebelum', genes: HM[1] }, { key: 's', label: 'sesudah', genes: AFTER, mark: [2, 6, 8], value: 'reassign + swap' }]
    ],
    overlay: (local, dur) => {
      const { k, t } = stageClock(local, dur, 3);
      const ct = k < 2 ? 0 : t;
      return capBlock(150, [{ label: 'deactivate VM 1', from: [1, 1, 1, 1], to: [1, 0, 1, 1] }, { label: 'reduce VM 3', from: [1, 1, 1, 1], to: [1, 1, 1, 0.5] }], ct);
    }
  },
  {
    stages: [
      [{ key: 'p', label: 'probe', genes: HM[1], caps: OFF1, value: 'VM 1 mati' }],
      [{ key: 'p', label: 'repair', genes: REPAIRED, caps: OFF1, cls: 'accept', mark: HM[1].map((v, i) => (v === 1 ? i : -1)).filter(i => i >= 0), value: '→ VM aktif' }]
    ],
    overlay: () => capBlock(110, [{ label: 'kapasitas', to: OFF1 }], 1)
  },
  {
    stages: [
      [hm(0, { value: '298 s' }), hm(1, { value: '312 s' }), hm(2, { value: '355 s' }), { key: 'p', label: 'probe', genes: PROBE, cls: 'probe', value: '286 s' }],
      [hm(0, { value: '298 s' }), hm(1, { value: '312 s' }), hm(2, { value: '355 s · terburuk', cls: 'worst' }), { key: 'p', label: 'probe', genes: PROBE, cls: 'probe', value: '286 s < 355 s' }],
      [hm(0, { value: '298 s' }), hm(1, { value: '312 s' }), { key: 'p', label: 'HM2 ✓', genes: PROBE, cls: 'accept', value: '286 s' }]
    ]
  }
];

const RhythmStrip: React.FC<{ local: number }> = ({ local }) => {
  const head = Math.floor(prog(local, 30, SCENE - 10, x => x) * 8);
  return (
    <div style={{ position: 'absolute', left: 20, top: 60, display: 'flex', gap: 10 }}>
      {Array.from({ length: 8 }, (_, i) => {
        const appear = prog(local, i * 3, i * 3 + 12);
        const active = i === Math.min(7, head) && local > 30;
        return (
          <div key={i} style={{
            width: 76, height: 86, borderRadius: 14, display: 'grid', placeItems: 'center', alignContent: 'center', color: '#fff',
            background: i % 2 ? 'var(--phs)' : 'var(--c0)', opacity: appear * (active || local <= 30 ? 1 : 0.45),
            scale: `${mix(0.6, 1, appear) * (active ? 1 + 0.08 * pulse(local % 15, 0, 15) : 1)}`,
            boxShadow: active ? '0 0 0 4px var(--fg)' : 'none'
          }}>
            <span style={{ font: `700 28px ${FONT.display}` }}>{i + 1}</span>
            <small style={{ font: `600 12px ${FONT.mono}`, opacity: 0.9 }}>{i % 2 ? 'resource' : 'jadwal'}</small>
          </div>
        );
      })}
      <div style={{ position: 'absolute', left: 0, top: 112, width: 680, font: `500 15px ${FONT.sans}`, color: 'var(--fg-muted)' }}>
        Ganjil → improvisasi <b style={{ color: 'var(--c0)' }}>jadwal</b> · genap → improvisasi <b style={{ color: 'var(--phs)' }}>resource</b>
      </div>
    </div>
  );
};

const Legend: React.FC = () => (
  <div style={{ position: 'absolute', right: 20, bottom: 14, display: 'flex', gap: 12, font: `600 12px ${FONT.mono}`, color: 'var(--fg-muted)' }}>
    {Array.from({ length: M }, (_, i) => (
      <span key={i} style={{ display: 'flex', alignItems: 'center', gap: 5 }}><span style={{ width: 11, height: 11, borderRadius: 3, background: vmColor(i) }} />VM {i}</span>
    ))}
  </div>
);

const makeFlow = (scenes: Scene[]): React.FC => () => {
  const frame = useCurrentFrame();
  const tl = flowTimeline();
  const { index, local, dur } = locate(tl, Math.min(frame, tl.total - 1));
  const sc = scenes[index];
  const before = index > 0 ? scenes[index - 1].stages.at(-1)! : null;
  return (
    <Stage>
      <Staged stages={sc.stages} before={before} local={local} dur={dur} layout={sc.layout ?? L} top={16} left={20} stagger={sc.stagger} />
      {sc.overlay?.(local, dur)}
      {index !== 2 && <Legend />}
    </Stage>
  );
};

export const CsaFlow = makeFlow(CSA);
export const PhsFlow = makeFlow(PHS);
