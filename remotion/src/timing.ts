/** A timeline is a list of consecutive steps, each with its own length in frames. */
export type Timeline = { starts: number[]; durs: number[]; total: number };

export const makeTimeline = (durs: number[]): Timeline => {
  const starts: number[] = [];
  let t = 0;
  for (const d of durs) { starts.push(t); t += d; }
  return { starts, durs, total: Math.max(1, t) };
};

/** Index of the step that contains `frame` (binary search). */
export const stepAt = (tl: Timeline, frame: number): number => {
  let lo = 0, hi = tl.starts.length - 1;
  while (lo < hi) {
    const mid = (lo + hi + 1) >> 1;
    if (tl.starts[mid] <= frame) lo = mid; else hi = mid - 1;
  }
  return Math.max(0, lo);
};

/** Step index + frame relative to the start of that step. */
export const locate = (tl: Timeline, frame: number) => {
  const index = stepAt(tl, frame);
  return { index, local: frame - tl.starts[index], dur: tl.durs[index] };
};

/** Last frame of a step: everything has settled there. */
export const settledFrame = (tl: Timeline, i: number) => tl.starts[i] + tl.durs[i] - 1;
