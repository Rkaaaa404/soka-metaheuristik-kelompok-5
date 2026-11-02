// Studio-only sample input: the first 16 GoCJ tasks + the deck's default Lab parameters.
import { csaStepGenerator } from '../../web/js/algorithms/csa.js';
import { phsStepGenerator } from '../../web/js/algorithms/phs.js';
import gocj from '../../web/data/gocj/GoCJ_Dataset_1000.json';
import type { AlgoFrame, LabProps, Task, Vm } from './types';

const VM_TYPES: Record<string, Omit<Vm, 'id'>> = {
  S: { type: 'Small', nominalMips: 500, pes: 1 },
  M: { type: 'Medium', nominalMips: 1000, pes: 2 },
  L: { type: 'Large', nominalMips: 2000, pes: 4 }
};
const tasks: Task[] = (gocj as { tasks: Task[] }).tasks.slice(0, 16).map((t, i) => ({ ...t, id: i, datasetId: t.id }));
const vms: Vm[] = ['S', 'M', 'L', 'S', 'M'].map((k, i) => ({ id: i, ...VM_TYPES[k] }));

export const sampleCsa: LabProps = {
  tasks, vms, frames: [...csaStepGenerator(tasks, vms, { population: 6, selected: 3, generations: 12, beta: 1, timeWeight: 0.5 }, 7, 2)] as AlgoFrame[]
};
export const samplePhs: LabProps = {
  tasks, vms, frames: [...phsStepGenerator(tasks, vms, { memorySize: 4, iterations: 20, improvisations: 3 }, 7, 2)] as AlgoFrame[]
};
