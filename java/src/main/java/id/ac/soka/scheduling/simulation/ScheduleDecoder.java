package id.ac.soka.scheduling.simulation;

import id.ac.soka.scheduling.model.SchedulePlan;
import id.ac.soka.scheduling.model.TaskSpec;
import id.ac.soka.scheduling.model.VmSpec;

import java.util.*;

public class ScheduleDecoder {

    public static DecodedSchedule decode(
        List<TaskSpec> tasks,
        List<VmSpec> vms,
        SchedulePlan plan,
        int totalHosts
    ) {
        int n = tasks.size();
        int m = vms.size();

        int[] assignedVm = plan.assignedVm();
        int[] taskOrder = plan.taskOrder();
        double[] capacityFactors = plan.capacityFactors();

        if (assignedVm.length != n) {
            throw new IllegalArgumentException("assignedVm length (" + assignedVm.length + ") != task count (" + n + ")");
        }
        if (taskOrder.length != n) {
            throw new IllegalArgumentException("taskOrder length (" + taskOrder.length + ") != task count (" + n + ")");
        }
        if (capacityFactors.length != m) {
            throw new IllegalArgumentException("capacityFactors length (" + capacityFactors.length + ") != vm count (" + m + ")");
        }

        // Map task priority: priorityRank[taskId] = index in taskOrder
        int[] priorityRank = new int[n];
        for (int i = 0; i < n; i++) {
            priorityRank[taskOrder[i]] = i;
        }

        // Group tasks by assigned VM
        @SuppressWarnings("unchecked")
        List<TaskSpec>[] vmTasks = new List[m];
        for (int v = 0; v < m; v++) {
            vmTasks[v] = new ArrayList<>();
        }
        for (int i = 0; i < n; i++) {
            int v = assignedVm[i];
            if (v < 0 || v >= m) {
                throw new IllegalArgumentException("Invalid VM ID: " + v);
            }
            if (capacityFactors[v] <= 0.0) {
                throw new IllegalStateException("Task " + i + " assigned to inactive VM " + v);
            }
            vmTasks[v].add(tasks.get(i));
        }

        double[] startTimes = new double[n];
        double[] finishTimes = new double[n];
        int[] assignedPe = new int[n];
        double makespan = 0.0;
        long totalLengthMi = 0;

        for (TaskSpec task : tasks) {
            totalLengthMi += task.lengthMi();
        }

        // Simulate each VM independently
        for (int v = 0; v < m; v++) {
            List<TaskSpec> tList = vmTasks[v];
            if (tList.isEmpty()) {
                continue;
            }

            VmSpec vm = vms.get(v);
            double effectiveMips = vm.nominalMips() * capacityFactors[v];
            int pes = vm.pes();
            double[] peFreeTime = new double[pes];

            // Sublist is already sorted by arrival time since GoCJ tasks are sorted by arrival
            int unarrivedIdx = 0;
            int totalVmTasks = tList.size();
            int completedCount = 0;
            double now = 0.0;

            // Ready queue ordered by priorityRank (lowest rank = highest priority)
            PriorityQueue<TaskSpec> readyQueue = new PriorityQueue<>(
                Comparator.comparingInt(t -> priorityRank[t.id()])
            );

            while (completedCount < totalVmTasks) {
                // Advance time if readyQueue is empty
                if (readyQueue.isEmpty()) {
                    double minBusyPe = Double.POSITIVE_INFINITY;
                    boolean hasIdlePe = false;
                    for (int p = 0; p < pes; p++) {
                        if (peFreeTime[p] <= now) {
                            hasIdlePe = true;
                        } else if (peFreeTime[p] < minBusyPe) {
                            minBusyPe = peFreeTime[p];
                        }
                    }

                    if (hasIdlePe) {
                        // At least one PE is idle at 'now'. Jump to next arrival.
                        if (unarrivedIdx < totalVmTasks) {
                            now = Math.max(now, tList.get(unarrivedIdx).arrivalTime());
                        }
                    } else {
                        // All PEs are busy. Jump to next completion or arrival if sooner.
                        if (unarrivedIdx < totalVmTasks) {
                            double nextArrival = tList.get(unarrivedIdx).arrivalTime();
                            now = Math.min(minBusyPe, Math.max(now, nextArrival));
                        } else {
                            now = minBusyPe;
                        }
                    }
                }

                // Ingest all arrivals up to now
                while (unarrivedIdx < totalVmTasks && tList.get(unarrivedIdx).arrivalTime() <= now) {
                    readyQueue.add(tList.get(unarrivedIdx++));
                }

                // Dispatch to free PEs
                boolean dispatchedAny = false;
                while (!readyQueue.isEmpty()) {
                    // Find lowest PE index free at 'now'
                    int freePe = -1;
                    for (int p = 0; p < pes; p++) {
                        if (peFreeTime[p] <= now) {
                            freePe = p;
                            break;
                        }
                    }

                    if (freePe == -1) {
                        // No PEs free at 'now'
                        break;
                    }

                    TaskSpec nextTask = readyQueue.poll();
                    int tId = nextTask.id();
                    double duration = (double) nextTask.lengthMi() / effectiveMips;
                    double start = now;
                    double finish = now + duration;

                    startTimes[tId] = start;
                    finishTimes[tId] = finish;
                    assignedPe[tId] = freePe;
                    peFreeTime[freePe] = finish;
                    completedCount++;
                    dispatchedAny = true;

                    if (finish > makespan) {
                        makespan = finish;
                    }
                }

                if (!dispatchedAny && completedCount < totalVmTasks) {
                    // All PEs busy. Advance 'now' to next event (arrival or PE completion)
                    double minBusyPe = Double.POSITIVE_INFINITY;
                    for (int p = 0; p < pes; p++) {
                        if (peFreeTime[p] > now && peFreeTime[p] < minBusyPe) {
                            minBusyPe = peFreeTime[p];
                        }
                    }
                    if (unarrivedIdx < totalVmTasks) {
                        double nextArrival = tList.get(unarrivedIdx).arrivalTime();
                        if (nextArrival < minBusyPe) {
                            now = Math.max(now, nextArrival);
                        } else {
                            now = minBusyPe;
                        }
                    } else {
                        now = minBusyPe;
                    }
                }
            }
        }

        // Energy formula: H * 100 * makespan + (100.0 / 64000.0) * sum(lengthMi)
        double energyJoules = (totalHosts * 100.0 * makespan) + ((100.0 / 64000.0) * totalLengthMi);

        return new DecodedSchedule(startTimes, finishTimes, assignedPe, makespan, energyJoules);
    }
}
