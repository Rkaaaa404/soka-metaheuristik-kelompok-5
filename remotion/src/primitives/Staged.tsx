import React from 'react';
import { prog } from '../anim';
import { GeneRows, type GeneLayout, type Row } from './GeneRows';

/**
 * Plays a list of row "stages" inside one scene: the scene's duration is
 * split evenly, each segment animates from the previous stage to the next
 * (first ~60% of the segment) and then holds.
 */
export const stageClock = (local: number, dur: number, count: number) => {
  const seg = dur / count;
  const k = Math.min(count - 1, Math.floor(local / seg));
  const t = prog(local - k * seg, 2, seg * 0.6);
  return { k, t, seg };
};

export const Staged: React.FC<{
  stages: Row[][]; before: Row[] | null; local: number; dur: number; layout: GeneLayout;
  top?: number; left?: number; stagger?: number; hideHeader?: boolean;
}> = ({ stages, before, local, dur, layout, top, left, stagger = 0, hideHeader }) => {
  const { k, t } = stageClock(local, dur, stages.length);
  const from = k === 0 ? before : stages[k - 1];
  return <GeneRows from={from} to={stages[k]} t={t} layout={layout} top={top} left={left} spawnStagger={stagger} hideHeader={hideHeader || stages[k].length === 0} />;
};
