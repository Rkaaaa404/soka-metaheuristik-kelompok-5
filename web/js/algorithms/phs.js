import { decodeSchedule } from './decoder.js';
import { Mulberry32 } from './rng.js';

export function* phsStepGenerator(tasks, vms, options = {}, seed = 42, totalHosts = 2) {
  const n = tasks.length;
  const m = vms.length;

  const hms = options.memorySize || 4;
  const maxIter = options.iterations || 10;
  const improvisations = options.improvisations || 3;

  const rng = new Mulberry32(seed);

  function evaluate(taskOrder, assignedVm, capacityFactors) {
    const plan = { taskOrder, assignedVm, capacityFactors };
    const dec = decodeSchedule(tasks, vms, plan, totalHosts);
    return {
      taskOrder: [...taskOrder],
      assignedVm: [...assignedVm],
      capacityFactors: [...capacityFactors],
      makespan: dec.makespan,
      energy: dec.energyJoules
    };
  }

  // 1. Build HEFT Seed (Entry 0)
  const sumMips = vms.reduce((acc, v) => acc + v.nominalMips, 0);
  const meanMips = sumMips / m;
  const heftTasks = [...tasks].sort((a, b) => {
    const da = a.lengthMi / meanMips;
    const db = b.lengthMi / meanMips;
    return db - da || a.id - b.id;
  });

  const heftOrder = heftTasks.map(t => t.id);
  const heftAssign = new Array(n);
  const heftCap = new Array(m).fill(1.0);
  const peFree = vms.map(v => new Array(v.pes).fill(0.0));

  for (let i = 0; i < n; i++) {
    const task = heftTasks[i];
    let bestFinish = Infinity;
    let bestV = -1;
    let bestP = -1;

    for (let v = 0; v < m; v++) {
      const pes = vms[v].pes;
      const mips = vms[v].nominalMips;
      for (let p = 0; p < pes; p++) {
        const start = Math.max(task.arrivalTime, peFree[v][p]);
        const finish = start + (task.lengthMi / mips);
        if (finish < bestFinish || (finish === bestFinish && (bestV === -1 || v < bestV || (v === bestV && p < bestP)))) {
          bestFinish = finish;
          bestV = v;
          bestP = p;
        }
      }
    }

    heftAssign[task.id] = bestV;
    peFree[bestV][bestP] = bestFinish;
  }

  const seedSol = evaluate(heftOrder, heftAssign, heftCap);
  seedSol.isHeftSeed = true;
  let scheduleHm = [seedSol];
  let resourceHm = [seedSol];
  let bestSolution = seedSol;

  // 2. Initialize remaining entries
  for (let i = 1; i < hms; i++) {
    const cap = generateRandomResource(m, rng);
    const activeVms = getActiveVmIndices(cap);

    const order = randomPermutation(n, rng);
    const assign = new Array(n);
    for (let j = 0; j < n; j++) {
      assign[j] = activeVms[rng.nextInt(activeVms.length)];
    }

    const sol = evaluate(order, assign, cap);
    scheduleHm.push(sol);
    resourceHm.push(sol);

    if (sol.makespan < bestSolution.makespan) bestSolution = sol;
  }

  yield {
    phase: "INIT",
    iteration: 0,
    maxIterations: maxIter,
    scheduleHm: [...scheduleHm],
    resourceHm: [...resourceHm],
    candidate: seedSol,
    best: bestSolution,
    message: `Dual Harmony Memory diinisialisasi: Entry 0 berbasis seed HEFT (resource penuh), Entry 1..${hms - 1} dibangkitkan acak.`
  };

  const totalCapacityBudget = vms.reduce((acc, v) => acc + (v.nominalMips * v.pes), 0);

  // 3. Iteration loop
  for (let iter = 0; iter < maxIter; iter++) {
    const isScheduleRhythm = (iter % 2 === 0);
    const rhythmName = isScheduleRhythm ? "Schedule" : "Resource";

    // Candidate schedule
    const sBranch = rng.nextInt(3);
    let candOrder;
    let candAssign;
    let sMethod = "Random";

    if (sBranch === 0) {
      sMethod = "Random Permutation";
      candOrder = randomPermutation(n, rng);
      candAssign = Array.from({ length: n }, () => rng.nextInt(m));
    } else if (sBranch === 1) {
      sMethod = "HM Memory Copy";
      const donor = scheduleHm[rng.nextInt(hms)];
      candOrder = [...donor.taskOrder];
      candAssign = [...donor.assignedVm];
    } else {
      sMethod = "Two-Point Crossbreed";
      const aOrder = randomPermutation(n, rng);
      const aAssign = Array.from({ length: n }, () => rng.nextInt(m));
      const b = scheduleHm[rng.nextInt(hms)];

      if (n <= 1) {
        candOrder = aOrder;
        candAssign = aAssign;
      } else {
        const b1 = rng.nextInt(n + 1);
        let b2 = rng.nextInt(n);
        if (b2 >= b1) b2++;
        const low = Math.min(b1, b2);
        const high = Math.max(b1, b2);

        candOrder = new Array(n);
        candAssign = new Array(n);
        const used = new Array(n).fill(false);

        for (let j = 0; j < low; j++) {
          candOrder[j] = aOrder[j];
          candAssign[aOrder[j]] = aAssign[aOrder[j]];
          used[aOrder[j]] = true;
        }
        for (let j = high; j < n; j++) {
          candOrder[j] = aOrder[j];
          candAssign[aOrder[j]] = aAssign[aOrder[j]];
          used[aOrder[j]] = true;
        }

        let fillIdx = low;
        for (let j = 0; j < n; j++) {
          const bTask = b.taskOrder[j];
          if (!used[bTask]) {
            candOrder[fillIdx] = bTask;
            candAssign[bTask] = b.assignedVm[bTask];
            used[bTask] = true;
            fillIdx++;
          }
        }
      }
    }

    // Candidate Resource
    const rBranch = rng.nextInt(3);
    let candCap;
    let rMethod = "Random";

    if (rBranch === 0) {
      rMethod = "Random Allocation";
      candCap = generateRandomResource(m, rng);
    } else if (rBranch === 1) {
      rMethod = "Resource HM Copy";
      candCap = [...resourceHm[rng.nextInt(hms)].capacityFactors];
    } else {
      rMethod = "Interleaved Crossbreed";
      const aCap = generateRandomResource(m, rng);
      const bCap = resourceHm[rng.nextInt(hms)].capacityFactors;
      const aActive = getActiveVmIndices(aCap);
      const bActive = getActiveVmIndices(bCap);

      candCap = new Array(m).fill(0.0);
      let curBudget = 0.0;
      let aIdx = 0, bIdx = 0;
      let takeA = true;

      while (aIdx < aActive.length || bIdx < bActive.length) {
        let candidateVm = -1;
        let donorFactor = 1.0;
        if (takeA && aIdx < aActive.length) {
          candidateVm = aActive[aIdx++];
          donorFactor = aCap[candidateVm];
          takeA = false;
        } else if (!takeA && bIdx < bActive.length) {
          candidateVm = bActive[bIdx++];
          donorFactor = bCap[candidateVm];
          takeA = true;
        } else if (aIdx < aActive.length) {
          candidateVm = aActive[aIdx++];
          donorFactor = aCap[candidateVm];
        } else {
          candidateVm = bActive[bIdx++];
          donorFactor = bCap[candidateVm];
        }

        if (candCap[candidateVm] === 0.0) {
          const spec = vms[candidateVm];
          const addCap = spec.nominalMips * spec.pes * donorFactor;
          if (curBudget + addCap <= totalCapacityBudget) {
            candCap[candidateVm] = donorFactor;
            curBudget += addCap;
          } else if (donorFactor === 1.0 && curBudget + (spec.nominalMips * spec.pes * 0.5) <= totalCapacityBudget) {
            candCap[candidateVm] = 0.5;
            curBudget += spec.nominalMips * spec.pes * 0.5;
          }
        }
      }
      if (getActiveVmIndices(candCap).length === 0) candCap[0] = 1.0;
    }

    yield {
      phase: "HARMONY_GENERATION",
      iteration: iter + 1,
      maxIterations: maxIter,
      rhythm: rhythmName,
      scheduleMethod: sMethod,
      resourceMethod: rMethod,
      candidate: {
        taskOrder: [...candOrder],
        assignedVm: [...candAssign],
        capacityFactors: [...candCap]
      },
      scheduleHm: [...scheduleHm],
      resourceHm: [...resourceHm],
      best: bestSolution,
      message: `Iterasi ${iter + 1}: Ritme aktif adalah [${rhythmName}]. Kandidat harmoni awal dibangkitkan.`
    };

    // Rhythm Improvisation
    const opLog = [];
    if (isScheduleRhythm) {
      const activeVms = getActiveVmIndices(candCap);
      for (let imp = 0; imp < improvisations; imp++) {
        if (rng.nextBoolean()) {
          if (activeVms.length > 1) {
            const t = rng.nextInt(n);
            const curVm = candAssign[t];
            const curIdx = activeVms.indexOf(curVm);
            const pick = curIdx >= 0 ? rng.nextInt(activeVms.length - 1) : rng.nextInt(activeVms.length);
            const targetIdx = (curIdx >= 0 && pick >= curIdx) ? pick + 1 : pick;
            candAssign[t] = activeVms[targetIdx];
            opLog.push(`Reassign task ${t} ke VM ${activeVms[targetIdx]}`);
          }
        } else {
          if (n > 1) {
            const p1 = rng.nextInt(n);
            let p2 = rng.nextInt(n - 1);
            if (p2 >= p1) p2++;
            const tmp = candOrder[p1];
            candOrder[p1] = candOrder[p2];
            candOrder[p2] = tmp;
            opLog.push(`Swap posisi urutan [${p1}] ↔ [${p2}]`);
          }
        }
      }
    } else {
      for (let imp = 0; imp < improvisations; imp++) {
        const active = getActiveVmIndices(candCap);
        const inactive = [];
        const fullActive = [];
        for (let v = 0; v < m; v++) {
          if (candCap[v] === 0.0) inactive.push(v);
          else if (candCap[v] === 1.0) fullActive.push(v);
        }

        const legalOps = [];
        if (active.length > 1) legalOps.push(1);
        if (inactive.length > 0) legalOps.push(2);
        if (fullActive.length > 0) legalOps.push(3);

        if (legalOps.length > 0) {
          const op = legalOps[rng.nextInt(legalOps.length)];
          if (op === 1) {
            const v = active[rng.nextInt(active.length)];
            candCap[v] = 0.0;
            opLog.push(`Deactivate VM ${v}`);
          } else if (op === 2) {
            const v = inactive[rng.nextInt(inactive.length)];
            candCap[v] = 1.0;
            opLog.push(`Activate VM ${v} (faktor 1.0)`);
          } else {
            const v = fullActive[rng.nextInt(fullActive.length)];
            candCap[v] = 0.5;
            opLog.push(`Reduce kapasitas VM ${v} (faktor 1.0 → 0.5)`);
          }
        }
      }
    }

    // Repair invalid assignments
    repairAssignments(tasks, vms, candAssign, candCap);
    const probe = evaluate(candOrder, candAssign, candCap);

    yield {
      phase: "IMPROVISATION_AND_REPAIR",
      iteration: iter + 1,
      maxIterations: maxIter,
      rhythm: rhythmName,
      operations: opLog,
      probe,
      scheduleHm: [...scheduleHm],
      resourceHm: [...resourceHm],
      best: bestSolution,
      message: `${improvisations} improvisasi diterapkan pada ritme ${rhythmName}. Penugasan direparasi ke VM aktif.`
    };

    // Memory update
    const targetHm = isScheduleRhythm ? scheduleHm : resourceHm;
    let worstIdx = 0;
    let worstMakespan = targetHm[0].makespan;
    for (let i = 1; i < hms; i++) {
      if (targetHm[i].makespan > worstMakespan) {
        worstMakespan = targetHm[i].makespan;
        worstIdx = i;
      }
    }

    const accepted = probe.makespan < worstMakespan;
    if (accepted) {
      targetHm[worstIdx] = probe;
    }
    if (probe.makespan < bestSolution.makespan) {
      bestSolution = probe;
    }

    yield {
      phase: "MEMORY_UPDATE",
      iteration: iter + 1,
      maxIterations: maxIter,
      rhythm: rhythmName,
      accepted,
      probe,
      worstMakespan,
      probeMakespan: probe.makespan,
      scheduleHm: [...scheduleHm],
      resourceHm: [...resourceHm],
      best: bestSolution,
      message: accepted
        ? `Probe diterima! Makespan ${probe.makespan.toFixed(2)}s menggantikan entry terburuk HM ${rhythmName} (${worstMakespan.toFixed(2)}s).`
        : `Probe ditolak (${probe.makespan.toFixed(2)}s ≥ ${worstMakespan.toFixed(2)}s). HM ${rhythmName} tidak berubah.`
    };
  }

  yield {
    phase: "FINISHED",
    iteration: maxIter,
    maxIterations: maxIter,
    best: bestSolution,
    scheduleHm: [...scheduleHm],
    resourceHm: [...resourceHm],
    message: `Iterasi PHS selesai. Solusi terbaik menghasilkan makespan ${bestSolution.makespan.toFixed(2)}s.`
  };
}

function repairAssignments(tasks, vms, assignedVm, capacityFactors) {
  const n = tasks.length;
  const m = vms.length;

  const sorted = [...tasks].sort((a, b) => a.arrivalTime - b.arrivalTime || a.id - b.id);
  const peFree = vms.map(v => new Array(v.pes).fill(0.0));

  for (const task of sorted) {
    const tId = task.id;
    const currentVm = assignedVm[tId];

    if (capacityFactors[currentVm] > 0.0) {
      let bestP = 0;
      let minFree = peFree[currentVm][0];
      for (let p = 1; p < vms[currentVm].pes; p++) {
        if (peFree[currentVm][p] < minFree) {
          minFree = peFree[currentVm][p];
          bestP = p;
        }
      }
      const start = Math.max(task.arrivalTime, minFree);
      const dur = task.lengthMi / (vms[currentVm].nominalMips * capacityFactors[currentVm]);
      peFree[currentVm][bestP] = start + dur;
    } else {
      let bestComp = Infinity;
      let bestV = -1;
      let bestP = -1;

      for (let v = 0; v < m; v++) {
        if (capacityFactors[v] <= 0.0) continue;
        const effMips = vms[v].nominalMips * capacityFactors[v];
        const pes = vms[v].pes;
        for (let p = 0; p < pes; p++) {
          const start = Math.max(task.arrivalTime, peFree[v][p]);
          const comp = start + (task.lengthMi / effMips);
          if (comp < bestComp || (comp === bestComp && (bestV === -1 || v < bestV || (v === bestV && p < bestP)))) {
            bestComp = comp;
            bestV = v;
            bestP = p;
          }
        }
      }
      assignedVm[tId] = bestV;
      peFree[bestV][bestP] = bestComp;
    }
  }
}

function generateRandomResource(m, rng) {
  const cap = new Array(m).fill(0.0);
  for (let v = 0; v < m; v++) {
    if (rng.nextBoolean()) {
      cap[v] = rng.nextBoolean() ? 0.5 : 1.0;
    }
  }
  if (!cap.some(c => c > 0.0)) cap[0] = 1.0;
  return cap;
}

function getActiveVmIndices(cap) {
  const res = [];
  for (let i = 0; i < cap.length; i++) {
    if (cap[i] > 0.0) res.push(i);
  }
  return res;
}

function randomPermutation(n, rng) {
  const arr = Array.from({ length: n }, (_, i) => i);
  for (let i = n - 1; i > 0; i--) {
    const k = rng.nextInt(i + 1);
    const tmp = arr[i];
    arr[i] = arr[k];
    arr[k] = tmp;
  }
  return arr;
}
