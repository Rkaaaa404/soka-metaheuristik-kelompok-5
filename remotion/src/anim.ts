import { Easing, interpolate } from 'remotion';

export const FPS = 30;
const CLAMP = { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' } as const;
export const easeOut = Easing.bezier(0.22, 0.75, 0.25, 1);
export const easeInOut = Easing.bezier(0.65, 0, 0.35, 1);

/** 0→1 progress of `f` across [a, b], eased and clamped. */
export const prog = (f: number, a: number, b: number, easing = easeOut) =>
  b <= a ? (f >= b ? 1 : 0) : interpolate(f, [a, b], [0, 1], { ...CLAMP, easing });

export const mix = (a: number, b: number, t: number) => a + (b - a) * t;

/** A short "pop" that rises and falls back over [a, b] (peak in the middle). */
export const pulse = (f: number, a: number, b: number) =>
  f < a || f > b ? 0 : Math.sin(((f - a) / (b - a)) * Math.PI);

/** Small damped shake used for rejections. */
export const shake = (f: number, a: number, b: number, amp = 8) =>
  f < a || f > b ? 0 : Math.sin((f - a) * 1.6) * amp * (1 - (f - a) / (b - a));

export const vmColor = (i: number) => `var(--c${((i % 8) + 8) % 8})`;

export const fmt = (n: number | undefined, d = 1) =>
  n === undefined || !Number.isFinite(n) ? '–'
    : n.toLocaleString('id-ID', { minimumFractionDigits: d, maximumFractionDigits: d });

export const FONT = {
  sans: 'var(--font-sans)',
  mono: 'var(--font-mono)',
  display: 'var(--font-display)'
};
