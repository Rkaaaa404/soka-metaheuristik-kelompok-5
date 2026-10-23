package id.ac.soka.scheduling.algorithm;

import id.ac.soka.scheduling.model.AlgorithmOptions;
import id.ac.soka.scheduling.model.SchedulePlan;
import id.ac.soka.scheduling.model.Scheduler;
import id.ac.soka.scheduling.model.TaskSpec;
import id.ac.soka.scheduling.model.VmSpec;
import id.ac.soka.scheduling.simulation.DecodedSchedule;
import id.ac.soka.scheduling.simulation.ScheduleDecoder;
import id.ac.soka.scheduling.util.Mulberry32;

import java.util.*;

/**
 * PHS (Polyrhythmic Harmony Search) - Fixed Inventory Adaptation.
 * Dual Harmony Memory: Schedule HM and Resource HM.
 */
public class PhsScheduler implements Scheduler {
    private final int totalHosts;

    public PhsScheduler(int totalHosts) {
        this.totalHosts = totalHosts;
    }

    public static class Solution {
        public final int[] taskOrder;
        public final int[] assignedVm;
        public final double[] capacityFactors;
        public double makespan;

        public Solution(int[] taskOrder, int[] assignedVm, double[] capacityFactors, double makespan) {
            this.taskOrder = taskOrder.clone();
            this.assignedVm = assignedVm.clone();
            this.capacityFactors = capacityFactors.clone();
            this.makespan = makespan;
        }

        public SchedulePlan toPlan() {
            return new SchedulePlan(taskOrder, assignedVm, capacityFactors);
        }
    }

    @Override
    public SchedulePlan schedule(List<TaskSpec> tasks, List<VmSpec> vms, AlgorithmOptions options, long seed) {
        int n = tasks.size();
        int m = vms.size();

        AlgorithmOptions.PhsOptions phsOpt = (options != null && options.phs() != null)
            ? options.phs()
            : AlgorithmOptions.PhsOptions.defaults();

        int hms = phsOpt.memorySize();
        int iterations = phsOpt.iterations();
        int improvisations = phsOpt.improvisations();

        Mulberry32 rng = new Mulberry32(seed);

        // 1. Build Entry 0: HEFT seed for DAG without edges
        Solution seedSol = buildHeftSeed(tasks, vms, totalHosts);

        List<Solution> scheduleHm = new ArrayList<>(hms);
        List<Solution> resourceHm = new ArrayList<>(hms);

        scheduleHm.add(seedSol);
        resourceHm.add(seedSol);

        Solution bestSolution = seedSol;

        // 2. Initialize remaining entries (1 .. hms - 1)
        for (int i = 1; i < hms; i++) {
            // Generate resource first
            double[] cap = generateRandomResource(m, rng);
            List<Integer> activeVms = getActiveVmIndices(cap);

            // Permutation Fisher-Yates from N-1 down to 1
            int[] order = new int[n];
            for (int j = 0; j < n; j++) order[j] = j;
            for (int j = n - 1; j > 0; j--) {
                int k = rng.nextInt(j + 1);
                int tmp = order[j];
                order[j] = order[k];
                order[k] = tmp;
            }

            int[] assign = new int[n];
            for (int j = 0; j < n; j++) {
                assign[j] = activeVms.get(rng.nextInt(activeVms.size()));
            }

            Solution sol = evaluateAndBuild(tasks, vms, order, assign, cap, totalHosts);
            scheduleHm.add(sol);
            resourceHm.add(sol);

            if (sol.makespan < bestSolution.makespan) {
                bestSolution = sol;
            }
        }

        // Total capacity budget TC = sum(nominalMips * pes)
        double totalCapacityBudget = 0.0;
        for (VmSpec vm : vms) {
            totalCapacityBudget += vm.totalNominalMips();
        }

        // 3. Main Iterations
        for (int iter = 0; iter < iterations; iter++) {
            // A. Candidate Schedule
            int sBranch = rng.nextInt(3); // 0=random, 1=copy, 2=crossbreed
            int[] candOrder;
            int[] candAssign;

            if (sBranch == 0) {
                candOrder = randomPermutation(n, rng);
                candAssign = new int[n];
                for (int j = 0; j < n; j++) {
                    candAssign[j] = rng.nextInt(m);
                }
            } else if (sBranch == 1) {
                Solution donor = scheduleHm.get(rng.nextInt(hms));
                candOrder = donor.taskOrder.clone();
                candAssign = donor.assignedVm.clone();
            } else {
                // Crossbreed
                int[] aOrder = randomPermutation(n, rng);
                int[] aAssign = new int[n];
                for (int j = 0; j < n; j++) aAssign[j] = rng.nextInt(m);

                Solution b = scheduleHm.get(rng.nextInt(hms));
                if (n <= 1) {
                    candOrder = aOrder;
                    candAssign = aAssign;
                } else {
                    int b1 = rng.nextInt(n + 1);
                    int b2 = rng.nextInt(n);
                    if (b2 >= b1) b2++;
                    int low = Math.min(b1, b2);
                    int high = Math.max(b1, b2);

                    candOrder = new int[n];
                    candAssign = new int[n];
                    boolean[] used = new boolean[n];

                    // Outer parts from A
                    for (int j = 0; j < low; j++) {
                        candOrder[j] = aOrder[j];
                        candAssign[aOrder[j]] = aAssign[aOrder[j]];
                        used[aOrder[j]] = true;
                    }
                    for (int j = high; j < n; j++) {
                        candOrder[j] = aOrder[j];
                        candAssign[aOrder[j]] = aAssign[aOrder[j]];
                        used[aOrder[j]] = true;
                    }

                    // Middle from B
                    int fillIdx = low;
                    for (int j = 0; j < n; j++) {
                        int bTask = b.taskOrder[j];
                        if (!used[bTask]) {
                            candOrder[fillIdx] = bTask;
                            candAssign[bTask] = b.assignedVm[bTask];
                            used[bTask] = true;
                            fillIdx++;
                        }
                    }
                }
            }

            // B. Candidate Resource
            int rBranch = rng.nextInt(3); // 0=random, 1=copy, 2=crossbreed
            double[] candCap;
            if (rBranch == 0) {
                candCap = generateRandomResource(m, rng);
            } else if (rBranch == 1) {
                candCap = resourceHm.get(rng.nextInt(hms)).capacityFactors.clone();
            } else {
                // Crossbreed Resource
                double[] aCap = generateRandomResource(m, rng);
                double[] bCap = resourceHm.get(rng.nextInt(hms)).capacityFactors;

                List<Integer> aActive = getActiveVmIndices(aCap);
                List<Integer> bActive = getActiveVmIndices(bCap);

                candCap = new double[m];
                double currentBudget = 0.0;
                int aIdx = 0;
                int bIdx = 0;
                boolean takeA = true;

                while (aIdx < aActive.size() || bIdx < bActive.size()) {
                    int candidateVm = -1;
                    double donorFactor = 1.0;

                    if (takeA && aIdx < aActive.size()) {
                        candidateVm = aActive.get(aIdx++);
                        donorFactor = aCap[candidateVm];
                        takeA = false;
                    } else if (!takeA && bIdx < bActive.size()) {
                        candidateVm = bActive.get(bIdx++);
                        donorFactor = bCap[candidateVm];
                        takeA = true;
                    } else if (aIdx < aActive.size()) {
                        candidateVm = aActive.get(aIdx++);
                        donorFactor = aCap[candidateVm];
                    } else {
                        candidateVm = bActive.get(bIdx++);
                        donorFactor = bCap[candidateVm];
                    }

                    if (candCap[candidateVm] == 0.0) {
                        VmSpec spec = vms.get(candidateVm);
                        double addCap = spec.totalNominalMips() * donorFactor;
                        if (currentBudget + addCap <= totalCapacityBudget) {
                            candCap[candidateVm] = donorFactor;
                            currentBudget += addCap;
                        } else if (donorFactor == 1.0 && currentBudget + (spec.totalNominalMips() * 0.5) <= totalCapacityBudget) {
                            candCap[candidateVm] = 0.5;
                            currentBudget += spec.totalNominalMips() * 0.5;
                        }
                    }
                }

                // If empty, activate VM 0
                if (getActiveVmIndices(candCap).isEmpty()) {
                    candCap[0] = 1.0;
                }
            }

            // Rhythm: Even iter = Schedule rhythm; Odd iter = Resource rhythm
            boolean isScheduleRhythm = (iter % 2 == 0);

            if (isScheduleRhythm) {
                List<Integer> activeVms = getActiveVmIndices(candCap);
                for (int imp = 0; imp < improvisations; imp++) {
                    if (rng.nextBoolean()) {
                        // Reassign one task to another active VM
                        if (activeVms.size() > 1) {
                            int t = rng.nextInt(n);
                            int curVm = candAssign[t];
                            int curIdx = activeVms.indexOf(curVm);
                            if (curIdx >= 0) {
                                int pick = rng.nextInt(activeVms.size() - 1);
                                if (pick >= curIdx) pick++;
                                candAssign[t] = activeVms.get(pick);
                            } else {
                                candAssign[t] = activeVms.get(rng.nextInt(activeVms.size()));
                            }
                        }
                    } else {
                        // Swap two positions in permutation
                        if (n > 1) {
                            int p1 = rng.nextInt(n);
                            int p2 = rng.nextInt(n - 1);
                            if (p2 >= p1) p2++;
                            int tmp = candOrder[p1];
                            candOrder[p1] = candOrder[p2];
                            candOrder[p2] = tmp;
                        }
                    }
                }
            } else {
                // Resource rhythm
                for (int imp = 0; imp < improvisations; imp++) {
                    List<Integer> active = getActiveVmIndices(candCap);
                    List<Integer> inactive = new ArrayList<>();
                    List<Integer> fullActive = new ArrayList<>();
                    for (int v = 0; v < m; v++) {
                        if (candCap[v] == 0.0) inactive.add(v);
                        else if (candCap[v] == 1.0) fullActive.add(v);
                    }

                    List<Integer> legalOps = new ArrayList<>(3);
                    if (active.size() > 1) legalOps.add(1); // Deactivate
                    if (!inactive.isEmpty()) legalOps.add(2); // Activate
                    if (!fullActive.isEmpty()) legalOps.add(3); // Reduce

                    if (!legalOps.isEmpty()) {
                        int op = legalOps.get(rng.nextInt(legalOps.size()));
                        if (op == 1) {
                            candCap[active.get(rng.nextInt(active.size()))] = 0.0;
                        } else if (op == 2) {
                            candCap[inactive.get(rng.nextInt(inactive.size()))] = 1.0;
                        } else {
                            candCap[fullActive.get(rng.nextInt(fullActive.size()))] = 0.5;
                        }
                    }
                }
            }

            // Repair invalid assignments pointing to inactive VMs
            repairAssignments(tasks, vms, candAssign, candCap);

            // Evaluate probe
            Solution probe = evaluateAndBuild(tasks, vms, candOrder, candAssign, candCap, totalHosts);

            // Memory update for chosen rhythm
            List<Solution> targetHm = isScheduleRhythm ? scheduleHm : resourceHm;
            int worstIdx = 0;
            double worstMakespan = targetHm.get(0).makespan;
            for (int i = 1; i < hms; i++) {
                if (targetHm.get(i).makespan > worstMakespan) {
                    worstMakespan = targetHm.get(i).makespan;
                    worstIdx = i;
                }
            }

            if (probe.makespan < worstMakespan) {
                targetHm.set(worstIdx, probe);
            }

            if (probe.makespan < bestSolution.makespan) {
                bestSolution = probe;
            }
        }

        return bestSolution.toPlan();
    }

    private static void repairAssignments(
        List<TaskSpec> tasks,
        List<VmSpec> vms,
        int[] assignedVm,
        double[] capacityFactors
    ) {
        int n = tasks.size();
        int m = vms.size();

        // Sort tasks by (arrival, id)
        List<TaskSpec> sorted = new ArrayList<>(tasks);
        sorted.sort(Comparator.comparingDouble(TaskSpec::arrivalTime).thenComparingInt(TaskSpec::id));

        // Slot free times per VM PE
        double[][] peFree = new double[m][];
        for (int v = 0; v < m; v++) {
            peFree[v] = new double[vms.get(v).pes()];
        }

        for (TaskSpec task : sorted) {
            int tId = task.id();
            int currentVm = assignedVm[tId];

            if (capacityFactors[currentVm] > 0.0) {
                // Valid assignment: keep it and reserve earliest available slot on this VM
                int bestP = 0;
                double minFree = peFree[currentVm][0];
                for (int p = 1; p < vms.get(currentVm).pes(); p++) {
                    if (peFree[currentVm][p] < minFree) {
                        minFree = peFree[currentVm][p];
                        bestP = p;
                    }
                }
                double start = Math.max(task.arrivalTime(), minFree);
                double dur = (double) task.lengthMi() / (vms.get(currentVm).nominalMips() * capacityFactors[currentVm]);
                peFree[currentVm][bestP] = start + dur;
            } else {
                // Inactive VM: move to active slot with smallest max(arrival, free) + length / effectiveMips
                double bestComp = Double.POSITIVE_INFINITY;
                int bestV = -1;
                int bestP = -1;

                for (int v = 0; v < m; v++) {
                    if (capacityFactors[v] <= 0.0) continue;
                    double effMips = vms.get(v).nominalMips() * capacityFactors[v];
                    int pes = vms.get(v).pes();
                    for (int p = 0; p < pes; p++) {
                        double start = Math.max(task.arrivalTime(), peFree[v][p]);
                        double comp = start + ((double) task.lengthMi() / effMips);
                        if (comp < bestComp ||
                            (comp == bestComp && (bestV == -1 || v < bestV || (v == bestV && p < bestP)))) {
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

    private static Solution evaluateAndBuild(
        List<TaskSpec> tasks,
        List<VmSpec> vms,
        int[] order,
        int[] assign,
        double[] cap,
        int totalHosts
    ) {
        SchedulePlan plan = new SchedulePlan(order, assign, cap);
        DecodedSchedule dec = ScheduleDecoder.decode(tasks, vms, plan, totalHosts);
        return new Solution(order, assign, cap, dec.makespan());
    }

    private static Solution buildHeftSeed(List<TaskSpec> tasks, List<VmSpec> vms, int totalHosts) {
        int n = tasks.size();
        int m = vms.size();

        double sumMips = 0.0;
        for (VmSpec vm : vms) sumMips += vm.nominalMips();
        double meanMips = sumMips / m;

        // HEFT priority: descending mean execution time = lengthMi / meanMips
        List<TaskSpec> sorted = new ArrayList<>(tasks);
        sorted.sort((a, b) -> {
            double da = (double) a.lengthMi() / meanMips;
            double db = (double) b.lengthMi() / meanMips;
            int cmp = Double.compare(db, da); // descending
            return (cmp != 0) ? cmp : Integer.compare(a.id(), b.id());
        });

        int[] taskOrder = new int[n];
        int[] assignedVm = new int[n];
        double[] cap = new double[m];
        Arrays.fill(cap, 1.0);

        double[][] peFree = new double[m][];
        for (int v = 0; v < m; v++) {
            peFree[v] = new double[vms.get(v).pes()];
        }

        for (int i = 0; i < n; i++) {
            TaskSpec task = sorted.get(i);
            int tId = task.id();
            taskOrder[i] = tId;

            double bestFinish = Double.POSITIVE_INFINITY;
            int bestV = -1;
            int bestP = -1;

            for (int v = 0; v < m; v++) {
                int pes = vms.get(v).pes();
                double mips = vms.get(v).nominalMips();
                for (int p = 0; p < pes; p++) {
                    double start = Math.max(task.arrivalTime(), peFree[v][p]);
                    double finish = start + ((double) task.lengthMi() / mips);
                    if (finish < bestFinish ||
                        (finish == bestFinish && (bestV == -1 || v < bestV || (v == bestV && p < bestP)))) {
                        bestFinish = finish;
                        bestV = v;
                        bestP = p;
                    }
                }
            }

            assignedVm[tId] = bestV;
            peFree[bestV][bestP] = bestFinish;
        }

        return evaluateAndBuild(tasks, vms, taskOrder, assignedVm, cap, totalHosts);
    }

    private static double[] generateRandomResource(int m, Mulberry32 rng) {
        double[] cap = new double[m];
        for (int v = 0; v < m; v++) {
            if (rng.nextBoolean()) {
                cap[v] = rng.nextBoolean() ? 0.5 : 1.0;
            }
        }
        boolean hasActive = false;
        for (double c : cap) {
            if (c > 0.0) {
                hasActive = true;
                break;
            }
        }
        if (!hasActive) {
            cap[0] = 1.0;
        }
        return cap;
    }

    private static List<Integer> getActiveVmIndices(double[] cap) {
        List<Integer> list = new ArrayList<>(cap.length);
        for (int i = 0; i < cap.length; i++) {
            if (cap[i] > 0.0) {
                list.add(i);
            }
        }
        return list;
    }

    private static int[] randomPermutation(int n, Mulberry32 rng) {
        int[] arr = new int[n];
        for (int i = 0; i < n; i++) arr[i] = i;
        for (int i = n - 1; i > 0; i--) {
            int k = rng.nextInt(i + 1);
            int tmp = arr[i];
            arr[i] = arr[k];
            arr[k] = tmp;
        }
        return arr;
    }
}
