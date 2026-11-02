import React from 'react';
import { FONT, mix, vmColor } from '../anim';

/** Capacity factor per VM as little fill bars (0 / 50 / 100 %), morphing from → to. */
export const CapRow: React.FC<{
  from?: number[] | null; to: number[]; t: number; cell?: number; height?: number; highlight?: number[]; style?: React.CSSProperties; quiet?: boolean;
}> = ({ from, to, t, cell = 26, height = 26, highlight = [], style, quiet }) => (
  <div style={{ display: 'flex', gap: 3, ...style }}>
    {to.map((c1, v) => {
      const c0 = from?.[v] ?? c1;
      const c = mix(c0, c1, t);
      const changed = c0 !== c1;
      return (
        <div key={v} style={{
          position: 'relative', width: cell, height, borderRadius: 5, overflow: 'hidden',
          background: c < 0.02 ? 'repeating-linear-gradient(45deg,#cfcfc8 0 3px,#e9e8e2 3px 6px)' : 'var(--surface-alt)',
          boxShadow: (changed && !quiet) || highlight.includes(v) ? `0 0 0 2px var(--fg)` : 'inset 0 0 0 1px var(--border)'
        }}>
          <div style={{ position: 'absolute', left: 0, right: 0, bottom: 0, height: `${c * 100}%`, background: vmColor(v), opacity: 0.9 }} />
          <div style={{ position: 'absolute', inset: 0, display: 'grid', placeItems: 'center', font: `700 ${Math.max(8, cell * 0.36)}px ${FONT.mono}`, color: c > 0.4 ? '#fff' : 'var(--fg-muted)' }}>
            {Math.round(c * 100)}
          </div>
        </div>
      );
    })}
  </div>
);

export const Title: React.FC<{ children: React.ReactNode; sub?: React.ReactNode; style?: React.CSSProperties }> = ({ children, sub, style }) => (
  <div style={{ position: 'absolute', font: `700 17px ${FONT.display}`, color: 'var(--fg)', whiteSpace: 'nowrap', ...style }}>
    {children}{sub && <span style={{ font: `500 12px ${FONT.mono}`, color: 'var(--fg-faint)', marginLeft: 10 }}>{sub}</span>}
  </div>
);

export const VmLegend: React.FC<{ vms: { type: string }[]; style?: React.CSSProperties }> = ({ vms, style }) => (
  <div style={{ position: 'absolute', display: 'flex', gap: 10, font: `600 11px ${FONT.mono}`, color: 'var(--fg-muted)', ...style }}>
    {vms.map((v, i) => (
      <span key={i} style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
        <span style={{ width: 10, height: 10, borderRadius: 3, background: vmColor(i) }} />VM{i} {v.type[0]}
      </span>
    ))}
  </div>
);

export const Pill: React.FC<{ children: React.ReactNode; color?: string; solid?: boolean; style?: React.CSSProperties }> = ({ children, color = 'var(--fg)', solid, style }) => (
  <span style={{
    display: 'inline-flex', alignItems: 'center', gap: 6, padding: '3px 10px', borderRadius: 999, font: `700 12px ${FONT.mono}`,
    border: `1.5px solid ${color}`, background: solid ? color : 'var(--surface)', color: solid ? '#fff' : color, whiteSpace: 'nowrap', ...style
  }}>{children}</span>
);

/** Full-frame background matching the deck's cards. */
export const Stage: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <div style={{ position: 'absolute', inset: 0, background: 'var(--surface)', fontFamily: FONT.sans, color: 'var(--fg)', overflow: 'hidden' }}>
    {children}
  </div>
);
