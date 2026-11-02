import React from 'react';
import { FONT, mix, prog, pulse, vmColor } from '../anim';

/**
 * One schedule drawn as a row of coloured genes (gene i = VM of task i).
 * Rows are keyed: a row that exists in both `from` and `to` glides to its
 * new position, genes whose VM changed flip over to the new colour, rows
 * only in `to` spawn (from the row named in `spawnFrom`, e.g. a clone's
 * parent) and rows only in `from` slide out.
 */
export type RowCls = '' | 'sel' | 'out' | 'clone' | 'worst' | 'accept' | 'reject' | 'probe';
export type Row = {
  key: string;
  label: string;
  genes: number[];
  cls?: RowCls;
  badge?: string;
  value?: string;
  hl?: boolean;
  spawnFrom?: string;
  /** capacity factor per VM; genes on a VM with factor 0 are hatched */
  caps?: number[];
  /** gene indices to keep outlined once settled (e.g. mutated) */
  mark?: number[];
  /** gene indices taken from a donor (crossbreed), drawn with an underline */
  donor?: number[];
  /** [low, high) cut points drawn as vertical bars */
  cut?: [number, number];
  /** horizontal offset (px) and extra opacity factor, e.g. for shake / fade */
  dx?: number;
  fade?: number;
};

export type GeneLayout = { width: number; rowH: number; labelW?: number; valueW?: number; n: number; showDigits?: boolean };

const OPACITY: Record<RowCls, number> = { '': 1, sel: 1, out: 0.28, clone: 1, worst: 1, accept: 1, reject: 0.55, probe: 1 };
const TINT: Partial<Record<RowCls, string>> = {
  sel: 'var(--csa-soft)', worst: 'var(--error-soft)', accept: 'var(--primary-soft)', reject: 'var(--error-soft)', probe: 'var(--phs-soft)'
};
const LABEL_COLOR: Partial<Record<RowCls, string>> = {
  sel: 'var(--csa)', clone: 'var(--accent)', worst: 'var(--error)', accept: 'var(--success)', reject: 'var(--error)', probe: 'var(--phs)'
};

export const geneGeom = (L: GeneLayout) => {
  const labelW = L.labelW ?? 112;
  const valueW = L.valueW ?? 128;
  const area = L.width - labelW - valueW;
  const cell = area / Math.max(1, L.n);
  const gap = cell > 14 ? 2 : 1;
  const size = Math.min(cell - gap, L.rowH - 4);
  return { labelW, valueW, cell, gap, size };
};

type Props = {
  from: Row[] | null;
  to: Row[];
  /** 0→1: movement of rows */
  t: number;
  /** 0→1: gene flips (staggered left→right); defaults to t */
  flip?: number;
  layout: GeneLayout;
  /** current frame, for subtle highlight pulses */
  frame?: number;
  top?: number;
  left?: number;
  hideHeader?: boolean;
  /** fraction of `t` by which consecutive spawning rows are delayed */
  spawnStagger?: number;
};

export const GeneRows: React.FC<Props> = ({ from, to, t, flip = t, layout, top = 0, left = 0, hideHeader, spawnStagger = 0 }) => {
  const g = geneGeom(layout);
  const srcIdx = new Map((from ?? []).map((r, i) => [r.key, i]));
  const dstKeys = new Set(to.map(r => r.key));
  const headerH = hideHeader ? 0 : 16;
  const y = (i: number) => headerH + i * layout.rowH;
  const digits = layout.showDigits ?? (g.size >= 15);

  const items: React.ReactNode[] = [];
  const spawnCount = to.filter(r => !srcIdx.has(r.key)).length;
  const st = spawnCount > 1 ? Math.min(spawnStagger, 0.7 / (spawnCount - 1)) : 0;
  const span = 1 - (spawnCount - 1) * st;
  let spawned = 0;
  to.forEach((r, i) => {
    const si = srcIdx.get(r.key);
    const src = si !== undefined ? from![si] : null;
    let y0: number, op0: number;
    let rt = t;
    if (src) { y0 = y(si!); op0 = OPACITY[src.cls ?? ''] * (src.fade ?? 1); }
    else {
      rt = Math.min(1, Math.max(0, (t - spawned++ * st) / span));
      const sp = r.spawnFrom !== undefined ? srcIdx.get(r.spawnFrom) : undefined;
      y0 = sp !== undefined ? y(sp) : y(i) + layout.rowH * 0.6;
      op0 = 0;
    }
    const yy = mix(y0, y(i), rt);
    const op = mix(op0, OPACITY[r.cls ?? ''] * (r.fade ?? 1), rt);
    items.push(
      <RowView key={r.key} row={r} src={src} g={g} layout={layout} y={yy} opacity={op} t={rt} flip={flip} digits={digits} />
    );
  });
  (from ?? []).forEach((r, i) => {
    if (dstKeys.has(r.key)) return;
    items.push(
      <RowView key={`${r.key}~out`} row={r} src={null} g={g} layout={layout} y={y(i)} opacity={(1 - t) * OPACITY[r.cls ?? ''] * (r.fade ?? 1)}
        t={1} flip={1} digits={digits} exitDx={-60 * t} />
    );
  });

  return (
    <div style={{ position: 'absolute', left, top, width: layout.width }}>
      {!hideHeader && (
        <div style={{ position: 'absolute', left: g.labelW, top: 0, display: 'flex', font: `600 10px ${FONT.mono}`, color: 'var(--fg-faint)' }}>
          {Array.from({ length: layout.n }, (_, i) => (
            <div key={i} style={{ width: g.cell, textAlign: 'center', overflow: 'hidden' }}>
              {g.cell >= 18 || i % Math.ceil(18 / g.cell) === 0 ? `t${i}` : ''}
            </div>
          ))}
        </div>
      )}
      {items}
    </div>
  );
};

type RowViewProps = {
  row: Row; src: Row | null; g: ReturnType<typeof geneGeom>; layout: GeneLayout;
  y: number; opacity: number; t: number; flip: number; digits: boolean; exitDx?: number;
};

const RowView: React.FC<RowViewProps> = ({ row, src, g, layout, y, opacity, t, flip, digits, exitDx = 0 }) => {
  const cls = row.cls ?? '';
  const prevCls = src?.cls ?? cls;
  const tint = t < 0.5 ? TINT[prevCls] : TINT[cls];
  const tintOp = (prevCls === cls ? 1 : Math.abs(t - 0.5) * 2) * (tint ? 1 : 0);
  const n = row.genes.length;
  const mark = new Set(row.mark ?? []);
  const donor = new Set(row.donor ?? []);
  const fontSize = Math.max(9, Math.min(13, layout.rowH * 0.42));

  return (
    <div style={{ position: 'absolute', left: exitDx + (row.dx ?? 0), top: y, width: layout.width, height: layout.rowH, opacity }}>
      <div style={{
        position: 'absolute', inset: '1px 0', borderRadius: 6, background: tint ?? 'transparent', opacity: tintOp * 0.85,
        outline: row.hl ? '2px solid var(--fg)' : 'none', outlineOffset: -1
      }} />
      <div style={{
        position: 'absolute', left: 6, top: 0, height: layout.rowH, width: g.labelW - 8, display: 'flex', alignItems: 'center', gap: 4,
        font: `${cls === 'sel' || cls === 'worst' ? 700 : 600} ${fontSize}px ${FONT.mono}`, color: LABEL_COLOR[cls] ?? 'var(--fg-muted)',
        whiteSpace: 'nowrap', overflow: 'hidden', textDecoration: cls === 'out' ? 'line-through' : 'none'
      }}>
        {row.badge && (
          <span style={{ background: LABEL_COLOR[cls] ?? 'var(--fg)', color: '#fff', borderRadius: 4, padding: '0 4px', fontSize: fontSize - 1 }}>{row.badge}</span>
        )}
        {row.label}
      </div>
      {row.genes.map((v, i) => {
        const old = src?.genes[i];
        const changed = old !== undefined && old !== v;
        // staggered flip: each changed gene turns over inside its own window
        const delay = n > 1 ? (i / (n - 1)) * 0.45 : 0;
        const lp = changed ? prog(flip, delay, delay + 0.4) : 1;
        const shown = changed && lp < 0.5 ? old! : v;
        const sy = changed ? Math.abs(Math.cos(lp * Math.PI)) : 1;
        const ring = changed ? pulse(lp, 0.45, 1) : 0;
        const capsNow = (changed && lp < 0.5 ? src?.caps : row.caps) ?? row.caps;
        const off = capsNow ? capsNow[shown] === 0 : false;
        const outlined = mark.has(i) && lp >= 0.5;
        return (
          <div key={i} style={{
            position: 'absolute', left: g.labelW + i * g.cell + (g.cell - g.size) / 2, top: (layout.rowH - g.size) / 2,
            width: g.size, height: g.size, borderRadius: Math.min(5, g.size / 4),
            background: off ? 'repeating-linear-gradient(45deg,#cfcfc8 0 3px,#e9e8e2 3px 6px)' : vmColor(shown),
            color: off ? 'var(--fg-muted)' : '#fff', font: `700 ${Math.max(8, g.size * 0.5)}px ${FONT.mono}`,
            display: 'grid', placeItems: 'center', scale: `1 ${Math.max(0.04, sy)}`,
            boxShadow: outlined || ring > 0 ? `0 0 0 ${2 + ring * 3}px var(--fg)` : donor.has(i) ? 'inset 0 -3px 0 var(--fg)' : 'none',
            zIndex: changed ? 2 : 1
          }}>
            {digits ? shown : ''}
          </div>
        );
      })}
      {row.cut?.map((c, k) => (
        <div key={k} style={{
          position: 'absolute', left: g.labelW + c * g.cell - 2, top: -3, width: 3, height: layout.rowH + 6, borderRadius: 2, background: 'var(--phs)'
        }} />
      ))}
      <div style={{
        position: 'absolute', right: 4, top: 0, height: layout.rowH, width: g.valueW - 8, display: 'flex', alignItems: 'center', justifyContent: 'flex-end',
        font: `600 ${fontSize}px ${FONT.mono}`, color: 'var(--fg-muted)', whiteSpace: 'nowrap'
      }}>
        {row.value}
      </div>
    </div>
  );
};
