/**
 * Analytical event-driven decoder matching Java ScheduleDecoder.
 */
export function decodeSchedule(tasks, vms, plan, totalHosts) {
  const n = tasks.length;
  const m = vms.length;
  const { taskOrder, assignedVm, capacityFactors } = plan;

  const priorityRank = new Array(n);
  for (let i = 0; i < n; i++) {
    priorityRank[taskOrder[i]] = i;
  }

  const vmTasks = Array.from({ length: m }, () => []);
  for (let i = 0; i < n; i++) {
    const v = assignedVm[i];
    if (v < 0 || v >= m) throw new Error(`Invalid VM ID: ${v}`);
    if (capacityFactors[v] <= 0.0) throw new Error(`Task ${i} assigned to inactive VM ${v}`);
    vmTasks[v].push(tasks[i]);
  }

  const startTimes = new Array(n).fill(0);
  const finishTimes = new Array(n).fill(0);
  const assignedPe = new Array(n).fill(0);
  let makespan = 0.0;
  let totalLengthMi = 0;

  for (let i = 0; i < n; i++) {
    totalLengthMi += tasks[i].lengthMi;
  }

  for (let v = 0; v < m; v++) {
    const tList = vmTasks[v];
    if (tList.length === 0) continue;

    const vm = vms[v];
    const effectiveMips = vm.nominalMips * capacityFactors[v];
    const pes = vm.pes;
    const peFreeTime = new Array(pes).fill(0.0);

    let unarrivedIdx = 0;
    const totalVmTasks = tList.length;
    let completedCount = 0;
    let now = 0.0;
    const readyQueue = [];

    while (completedCount < totalVmTasks) {
      if (readyQueue.length === 0) {
        let minBusyPe = Infinity;
        let hasIdlePe = false;
        for (let p = 0; p < pes; p++) {
          if (peFreeTime[p] <= now) {
            hasIdlePe = true;
          } else if (peFreeTime[p] < minBusyPe) {
            minBusyPe = peFreeTime[p];
          }
        }

        if (hasIdlePe) {
          if (unarrivedIdx < totalVmTasks) {
            now = Math.max(now, tList[unarrivedIdx].arrivalTime);
          }
        } else {
          if (unarrivedIdx < totalVmTasks) {
            now = Math.min(minBusyPe, Math.max(now, tList[unarrivedIdx].arrivalTime));
          } else {
            now = minBusyPe;
          }
        }
      }

      while (unarrivedIdx < totalVmTasks && tList[unarrivedIdx].arrivalTime <= now) {
        readyQueue.push(tList[unarrivedIdx++]);
        readyQueue.sort((a, b) => priorityRank[a.id] - priorityRank[b.id]);
      }

      let dispatchedAny = false;
      while (readyQueue.length > 0) {
        let freePe = -1;
        for (let p = 0; p < pes; p++) {
          if (peFreeTime[p] <= now) {
            freePe = p;
            break;
          }
        }

        if (freePe === -1) break;

        const nextTask = readyQueue.shift();
        const tId = nextTask.id;
        const duration = nextTask.lengthMi / effectiveMips;
        const start = now;
        const finish = now + duration;

        startTimes[tId] = start;
        finishTimes[tId] = finish;
        assignedPe[tId] = freePe;
        peFreeTime[freePe] = finish;
        completedCount++;
        dispatchedAny = true;

        if (finish > makespan) makespan = finish;
      }

      if (!dispatchedAny && completedCount < totalVmTasks) {
        let minBusyPe = Infinity;
        for (let p = 0; p < pes; p++) {
          if (peFreeTime[p] > now && peFreeTime[p] < minBusyPe) {
            minBusyPe = peFreeTime[p];
          }
        }
        if (unarrivedIdx < totalVmTasks) {
          const nextArrival = tList[unarrivedIdx].arrivalTime;
          now = nextArrival < minBusyPe ? Math.max(now, nextArrival) : minBusyPe;
        } else {
          now = minBusyPe;
        }
      }
    }
  }

  const energyJoules = (totalHosts * 100.0 * makespan) + ((100.0 / 64000.0) * totalLengthMi);

  return {
    startTimes,
    finishTimes,
    assignedPe,
    makespan,
    energyJoules
  };
}
