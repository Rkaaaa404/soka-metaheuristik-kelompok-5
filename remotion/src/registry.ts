import type React from 'react';
import type { Timeline } from './timing';
import { CsaRun, LAB_H, LAB_W, csaTimeline } from './compositions/lab/CsaRun';
import { PhsRun, phsTimeline } from './compositions/lab/PhsRun';
import { CsaFlow, PhsFlow, FLOW_H, FLOW_W, flowTimeline } from './compositions/flows/Flows';
import { Problem, PROBLEM_H, PROBLEM_W, problemTimeline } from './compositions/stories/Problem';
import { Landscape, LANDSCAPE_H, LANDSCAPE_W, landscapeTimeline } from './compositions/stories/Landscape';
import { Immune, IMMUNE_H, IMMUNE_W, immuneTimeline } from './compositions/stories/Immune';
import { Jazz, JAZZ_H, JAZZ_W, jazzTimeline } from './compositions/stories/Jazz';

export type Entry = {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  component: React.FC<any>;
  width: number;
  height: number;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  timeline: (props: any) => Timeline;
};

export const FPS = 30;

export const REGISTRY: Record<string, Entry> = {
  'csa-run': { component: CsaRun, width: LAB_W, height: LAB_H, timeline: csaTimeline },
  'phs-run': { component: PhsRun, width: LAB_W, height: LAB_H, timeline: phsTimeline },
  'csa-flow': { component: CsaFlow, width: FLOW_W, height: FLOW_H, timeline: flowTimeline },
  'phs-flow': { component: PhsFlow, width: FLOW_W, height: FLOW_H, timeline: flowTimeline },
  problem: { component: Problem, width: PROBLEM_W, height: PROBLEM_H, timeline: problemTimeline },
  landscape: { component: Landscape, width: LANDSCAPE_W, height: LANDSCAPE_H, timeline: landscapeTimeline },
  immune: { component: Immune, width: IMMUNE_W, height: IMMUNE_H, timeline: immuneTimeline },
  jazz: { component: Jazz, width: JAZZ_W, height: JAZZ_H, timeline: jazzTimeline }
};
