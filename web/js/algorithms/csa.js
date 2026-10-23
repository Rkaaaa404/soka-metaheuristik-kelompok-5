import { decodeSchedule } from './decoder.js';
import { Mulberry32 } from './rng.js';

export function* csaStepGenerator(tasks, vms, options = {}, seed = 42, totalHosts = 2) {
  const n = tasks.length;
  const m = vms.length;

  const p = options.population || 6;
  const k = options.selected || 3;
  const maxGen = options.generations || 10;
  const beta = options.beta || 1.0;
  const w = (options.timeWeight !== undefined) ? options.timeWeight : 0.5;

  const rng = new Mulberry32(seed);

  // Priority order by (arrival, id)
  const sortedTasks = [...tasks].sort((a, b) => a.arrivalTime - b.arrivalTime || a.id - b.id);
  const taskOrder = sortedTasks.map(t => t.id);
  const capacityFactors = new Array(m).fill(1.0);

  // Reference from Round Robin
  const rrAssignedVm = new Array(n);
  for (let i = 0; i < n; i++) {
    rrAssignedVm[sortedTasks[i].id] = i % m;
  }
  const rrDec = decodeSchedule(tasks, vms, { taskOrder, assignedVm: rrAssignedVm, capacityFactors }, totalHosts);
  const tRef = Math.max(1e-9, rrDec.makespan);
  const eRef = Math.max(1e-9, rrDec.energyJoules);

  function evaluate(assignedVm, id) {
    const plan = { taskOrder, assignedVm, capacityFactors };
    const dec = decodeSchedule(tasks, vms, plan, totalHosts);
    const fitness = (w * (dec.makespan / tRef)) + ((1.0 - w) * (dec.energyJoules / eRef));
    return {
      id,
      assignedVm: [...assignedVm],
      makespan: dec.makespan,
      energy: dec.energyJoules,
      fitness,
      affinity: 1.0 / (1.0 + fitness)
    };
  }

  function dominates(a, b) {
    return (a.makespan <= b.makespan && a.energy <= b.energy) &&
           (a.makespan < b.makespan || a.energy < b.energy);
  }

  let archive = [];
  function updateArchive(cand) {
    for (const m of archive) {
      if (dominates(m, cand)) return;
      if (m.makespan === cand.makespan && m.energy === cand.energy && m.id <= cand.id) return;
    }
    archive = archive.filter(m => !dominates(cand, m) && !(m.makespan === cand.makespan && m.energy === cand.energy && cand.id < m.id));
    archive.push(cand);
  }

  let candidateSeq = 0;
  let population = [];

  for (let i = 0; i < p; i++) {
    const genes = new Array(n);
    for (let j = 0; j < n; j++) genes[j] = rng.nextInt(m);
    const cand = evaluate(genes, candidateSeq++);
    population.push(cand);
    updateArchive(cand);
  }

  yield {
    phase: "INIT",
    generation: 0,
    maxGenerations: maxGen,
    population: [...population],
    archive: [...archive],
    best: getBestCandidate(archive, population),
    message: `Populasi awal ${p} antibodi dibangkitkan secara acak dan dievaluasi. Pareto Archive diinisialisasi.`
  };

  const pMin = 1.0 / n;
  const pMax = Math.min(1.0, 5.0 / n);

  for (let gen = 1; gen <= maxGen; gen++) {
    // 1. Selection
    population.sort((a, b) => a.fitness - b.fitness || a.id - b.id);
    const parents = population.slice(0, k);

    yield {
      phase: "SELECTION",
      generation: gen,
      maxGenerations: maxGen,
      population: [...population],
      parents: parents.map((pr, idx) => ({ ...pr, rank: idx + 1 })),
      archive: [...archive],
      best: getBestCandidate(archive, population),
      message: `Generasi ${gen}: ${k} parent terbaik (afinitas tertinggi/F terendah) dipilih untuk kloning.`
    };

    // 2. Cloning
    const cloneGroups = [];
    let allClones = [];
    for (let r = 1; r <= k; r++) {
      const parent = parents[r - 1];
      const numClones = Math.max(1, Math.floor(beta * p / r));
      const p_r = (k > 1) ? pMin + ((pMax - pMin) * (r - 1) / (k - 1)) : pMin;
      const grp = [];
      for (let c = 0; c < numClones; c++) {
        grp.push({
          parentId: parent.id,
          rank: r,
          mutationRate: p_r,
          assignedVm: [...parent.assignedVm]
        });
      }
      cloneGroups.push({ parent, clones: grp });
      allClones.push(...grp);
    }

    yield {
      phase: "CLONING",
      generation: gen,
      maxGenerations: maxGen,
      population: [...population],
      parents,
      cloneGroups,
      archive: [...archive],
      best: getBestCandidate(archive, population),
      message: `Parent rank tinggi menghasilkan lebih banyak clone secara proporsional (total ${allClones.length} clone).`
    };

    // 3. Hypermutation
    const mutatedClones = [];
    for (const cl of allClones) {
      const mutatedGenes = [...cl.assignedVm];
      const mutatedIndices = [];
      if (m > 1) {
        for (let j = 0; j < n; j++) {
          if (rng.nextDouble() < cl.mutationRate) {
            const oldVm = mutatedGenes[j];
            let pick = rng.nextInt(m - 1);
            if (pick >= oldVm) pick++;
            mutatedGenes[j] = pick;
            mutatedIndices.push(j);
          }
        }
      }
      const evaluatedClone = evaluate(mutatedGenes, candidateSeq++);
      mutatedClones.push({
        ...evaluatedClone,
        parentId: cl.parentId,
        rank: cl.rank,
        mutatedIndices
      });
      updateArchive(evaluatedClone);
    }

    yield {
      phase: "MUTATION",
      generation: gen,
      maxGenerations: maxGen,
      population: [...population],
      mutatedClones,
      archive: [...archive],
      best: getBestCandidate(archive, population),
      message: `Hipermutasi terbalik: parent afinitas rendah mendapat mutasi lebih agresif.`
    };

    // 4. Survivor Selection
    const pool = [...population, ...mutatedClones];
    pool.sort((a, b) => a.fitness - b.fitness || a.id - b.id);
    population = pool.slice(0, p);

    yield {
      phase: "SURVIVOR",
      generation: gen,
      maxGenerations: maxGen,
      population: [...population],
      archive: [...archive],
      best: getBestCandidate(archive, population),
      message: `Seleksi ${p} penyintas terbaik untuk generasi berikutnya. Pareto archive diperbarui.`
    };
  }

  yield {
    phase: "FINISHED",
    generation: maxGen,
    maxGenerations: maxGen,
    population: [...population],
    archive: [...archive],
    best: getBestCandidate(archive, population),
    message: `Optimasi CSA selesai setelah ${maxGen} generasi. Solusi terbaik dipilih dari Pareto Archive.`
  };
}

function getBestCandidate(archive, population) {
  let best = null;
  const source = archive.length > 0 ? archive : population;
  for (const c of source) {
    if (!best || c.fitness < best.fitness || (c.fitness === best.fitness && c.id < best.id)) {
      best = c;
    }
  }
  return best;
}
