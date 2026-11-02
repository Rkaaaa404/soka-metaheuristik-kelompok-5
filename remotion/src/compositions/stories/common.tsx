import React from 'react';
import { useCurrentFrame } from 'remotion';
import { FONT, prog } from '../../anim';
import { locate, makeTimeline, type Timeline } from '../../timing';

export const storyTimeline = (steps: number, dur: number) => makeTimeline(Array(steps).fill(dur));

/**
 * Story steps are cumulative (like the old ge1..geN classes): `reached(k)`
 * is 0 before step k, eases 0→1 while step k plays in, and stays 1 after.
 */
export const useStory = (tl: Timeline, inFrames = 42) => {
  const frame = useCurrentFrame();
  const { index, local, dur } = locate(tl, Math.min(frame, tl.total - 1));
  const step = index + 1;
  const t = prog(local, 0, inFrames);
  const reached = (k: number, a = 0, b = inFrames) => (step > k ? 1 : step === k ? prog(local, a, b) : 0);
  return { frame, step, local, dur, t, reached };
};

/** SVG canvas that keeps the original scene coordinates and scales to the composition. */
export const SvgStage: React.FC<{ w: number; h: number; children: React.ReactNode }> = ({ w, h, children }) => (
  <div style={{ position: 'absolute', inset: 0, background: 'var(--surface)' }}>
    <svg viewBox={`0 0 ${w} ${h}`} width="100%" height="100%" style={{ display: 'block' }}>{children}</svg>
  </div>
);

export const txt = {
  lbl: { font: `700 12px ${FONT.sans}`, fill: 'var(--fg)' },
  sub: { font: `500 10.5px ${FONT.mono}`, fill: 'var(--fg-muted)' },
  tok: { font: `700 10px ${FONT.mono}`, fill: '#fff' },
  mk: { font: `700 11px ${FONT.mono}`, fill: 'var(--error)' }
} satisfies Record<string, React.CSSProperties>;
