export type Task = { id: number; datasetId?: number; lengthMi: number; arrivalTime: number; sla?: number };
export type Vm = { id: number; type: string; nominalMips: number; pes: number };

export type Plan = { taskOrder: number[]; assignedVm: number[]; capacityFactors: number[] };
export type Cand = Plan & {
  id?: number; makespan: number; energy?: number; fitness?: number; affinity?: number;
  isHeftSeed?: boolean; rank?: number; mutatedIndices?: number[]; mutationRate?: number; parentId?: number;
};

/** Loose shape of a frame yielded by csaStepGenerator / phsStepGenerator. */
export type AlgoFrame = {
  phase: string; message: string;
  generation?: number; maxGenerations?: number; iteration?: number; maxIterations?: number;
  population?: Cand[]; parents?: Cand[]; archive?: Cand[];
  cloneGroups?: { parent: Cand; clones: (Partial<Cand> & { assignedVm: number[]; mutationRate: number })[] }[];
  mutatedClones?: Cand[];
  candidate?: Cand; best?: Cand; probe?: Cand;
  scheduleHm?: Cand[]; resourceHm?: Cand[]; rhythm?: 'Schedule' | 'Resource';
  scheduleMethod?: string; resourceMethod?: string; operations?: string[];
  accepted?: boolean; worstMakespan?: number; probeMakespan?: number;
};

export type LabProps = { frames: AlgoFrame[]; tasks: Task[]; vms: Vm[]; totalHosts?: number };
