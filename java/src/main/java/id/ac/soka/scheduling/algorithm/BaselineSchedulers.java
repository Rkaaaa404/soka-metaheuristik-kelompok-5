package id.ac.soka.scheduling.algorithm;

import id.ac.soka.scheduling.model.AlgorithmOptions;
import id.ac.soka.scheduling.model.SchedulePlan;
import id.ac.soka.scheduling.model.Scheduler;
import id.ac.soka.scheduling.model.TaskSpec;
import id.ac.soka.scheduling.model.VmSpec;

import java.util.*;

public final class BaselineSchedulers {

    private BaselineSchedulers() {}

    private static double[] fullCapacityFactors(int m) {
        double[] factors = new double[m];
        Arrays.fill(factors, 1.0);
        return factors;
    }

    // 1. FCFS
    public static final Scheduler FCFS = (tasks, vms, options, seed) -> {
        int n = tasks.size();
        int m = vms.size();

        // Sort tasks by (arrival, id)
        List<TaskSpec> sorted = new ArrayList<>(tasks);
        sorted.sort(Comparator.comparingDouble(TaskSpec::arrivalTime).thenComparingInt(TaskSpec::id));

        int[] taskOrder = new int[n];
        int[] assignedVm = new int[n];

        // Track free time per VM PE: peFree[v][p]
        double[][] peFree = new double[m][];
        for (int v = 0; v < m; v++) {
            peFree[v] = new double[vms.get(v).pes()];
        }

        for (int i = 0; i < n; i++) {
            TaskSpec task = sorted.get(i);
            int tId = task.id();
            taskOrder[i] = tId;

            // Find slot with earliest feasible start: max(arrival, peFree[v][p])
            // Tie break: earliest start, then VM ID, then PE index
            double earliestStart = Double.POSITIVE_INFINITY;
            int bestV = -1;
            int bestP = -1;

            for (int v = 0; v < m; v++) {
                int pes = vms.get(v).pes();
                for (int p = 0; p < pes; p++) {
                    double start = Math.max(task.arrivalTime(), peFree[v][p]);
                    if (start < earliestStart) {
                        earliestStart = start;
                        bestV = v;
                        bestP = p;
                    }
                }
            }

            assignedVm[tId] = bestV;
            double duration = (double) task.lengthMi() / vms.get(bestV).nominalMips();
            peFree[bestV][bestP] = earliestStart + duration;
        }

        return new SchedulePlan(taskOrder, assignedVm, fullCapacityFactors(m));
    };

    // 2. Round Robin
    public static final Scheduler RR = (tasks, vms, options, seed) -> {
        int n = tasks.size();
        int m = vms.size();

        List<TaskSpec> sorted = new ArrayList<>(tasks);
        sorted.sort(Comparator.comparingDouble(TaskSpec::arrivalTime).thenComparingInt(TaskSpec::id));

        int[] taskOrder = new int[n];
        int[] assignedVm = new int[n];

        for (int i = 0; i < n; i++) {
            TaskSpec task = sorted.get(i);
            taskOrder[i] = task.id();
            assignedVm[task.id()] = i % m;
        }

        return new SchedulePlan(taskOrder, assignedVm, fullCapacityFactors(m));
    };

    // 3. Shortest Job First (non-preemptive event list)
    public static final Scheduler SJF = (tasks, vms, options, seed) -> {
        int n = tasks.size();
        int m = vms.size();

        int[] taskOrder = new int[n];
        int[] assignedVm = new int[n];

        // Free time per VM PE
        double[][] peFree = new double[m][];
        for (int v = 0; v < m; v++) {
            peFree[v] = new double[vms.get(v).pes()];
        }

        // Sublist of unstarted tasks
        List<TaskSpec> unstarted = new ArrayList<>(tasks);
        // Sort initially by arrival time, then length, then id
        unstarted.sort(Comparator.comparingDouble(TaskSpec::arrivalTime)
            .thenComparingLong(TaskSpec::lengthMi)
            .thenComparingInt(TaskSpec::id));

        boolean[] scheduled = new boolean[n];
        int scheduledCount = 0;
        double now = 0.0;

        while (scheduledCount < n) {
            // Find free slots at 'now'
            List<Slot> freeSlots = new ArrayList<>();
            double minBusyPe = Double.POSITIVE_INFINITY;
            for (int v = 0; v < m; v++) {
                int pes = vms.get(v).pes();
                for (int p = 0; p < pes; p++) {
                    if (peFree[v][p] <= now) {
                        freeSlots.add(new Slot(v, p));
                    } else if (peFree[v][p] < minBusyPe) {
                        minBusyPe = peFree[v][p];
                    }
                }
            }

            // Find ready tasks at 'now'
            TaskSpec shortestReady = null;
            double earliestUnarrived = Double.POSITIVE_INFINITY;

            for (TaskSpec t : unstarted) {
                if (scheduled[t.id()]) continue;
                if (t.arrivalTime() <= now) {
                    if (shortestReady == null ||
                        t.lengthMi() < shortestReady.lengthMi() ||
                        (t.lengthMi() == shortestReady.lengthMi() && t.id() < shortestReady.id())) {
                        shortestReady = t;
                    }
                } else if (t.arrivalTime() < earliestUnarrived) {
                    earliestUnarrived = t.arrivalTime();
                }
            }

            if (freeSlots.isEmpty() || shortestReady == null) {
                // Advance 'now'
                if (freeSlots.isEmpty()) {
                    now = minBusyPe;
                } else {
                    now = Math.max(now, earliestUnarrived);
                }
                continue;
            }

            // Between free slots, choose VM with earliest finish for shortestReady
            // Tie-break: earliest finish, tie VM ID, tie PE index
            double bestFinish = Double.POSITIVE_INFINITY;
            Slot bestSlot = null;
            for (Slot slot : freeSlots) {
                double finish = now + ((double) shortestReady.lengthMi() / vms.get(slot.v).nominalMips());
                if (finish < bestFinish ||
                    (finish == bestFinish && (slot.v < bestSlot.v || (slot.v == bestSlot.v && slot.p < bestSlot.p)))) {
                    bestFinish = finish;
                    bestSlot = slot;
                }
            }

            int tId = shortestReady.id();
            assignedVm[tId] = bestSlot.v;
            taskOrder[scheduledCount++] = tId;
            scheduled[tId] = true;
            peFree[bestSlot.v][bestSlot.p] = bestFinish;
        }

        return new SchedulePlan(taskOrder, assignedVm, fullCapacityFactors(m));
    };

    private record Slot(int v, int p) {}

    // 4. MinMin
    public static final Scheduler MIN_MIN = (tasks, vms, options, seed) ->
        runMinMax(tasks, vms, false);

    // 5. MaxMin
    public static final Scheduler MAX_MIN = (tasks, vms, options, seed) ->
        runMinMax(tasks, vms, true);

    private static SchedulePlan runMinMax(List<TaskSpec> tasks, List<VmSpec> vms, boolean isMaxMin) {
        int n = tasks.size();
        int m = vms.size();

        int[] taskOrder = new int[n];
        int[] assignedVm = new int[n];

        double[][] peFree = new double[m][];
        for (int v = 0; v < m; v++) {
            peFree[v] = new double[vms.get(v).pes()];
        }

        boolean[] scheduled = new boolean[n];
        double[] bestCompletion = new double[n];
        int[] bestVm = new int[n];
        int[] bestPe = new int[n];

        // Initial compute best slot for all tasks
        for (int i = 0; i < n; i++) {
            computeBestSlot(tasks.get(i), vms, peFree, i, bestCompletion, bestVm, bestPe);
        }

        for (int step = 0; step < n; step++) {
            int selectedTask = -1;
            double targetMetric = isMaxMin ? Double.NEGATIVE_INFINITY : Double.POSITIVE_INFINITY;

            for (int i = 0; i < n; i++) {
                if (scheduled[i]) continue;
                double comp = bestCompletion[i];
                if (isMaxMin) {
                    if (comp > targetMetric || (comp == targetMetric && (selectedTask == -1 || i < selectedTask))) {
                        targetMetric = comp;
                        selectedTask = i;
                    }
                } else {
                    if (comp < targetMetric || (comp == targetMetric && (selectedTask == -1 || i < selectedTask))) {
                        targetMetric = comp;
                        selectedTask = i;
                    }
                }
            }

            // Commit selectedTask
            scheduled[selectedTask] = true;
            int commitVm = bestVm[selectedTask];
            int commitPe = bestPe[selectedTask];
            assignedVm[selectedTask] = commitVm;
            taskOrder[step] = selectedTask;
            peFree[commitVm][commitPe] = bestCompletion[selectedTask];

            // Recompute only tasks whose bestVm was commitVm
            for (int i = 0; i < n; i++) {
                if (!scheduled[i] && bestVm[i] == commitVm) {
                    computeBestSlot(tasks.get(i), vms, peFree, i, bestCompletion, bestVm, bestPe);
                }
            }
        }

        return new SchedulePlan(taskOrder, assignedVm, fullCapacityFactors(m));
    }

    private static void computeBestSlot(
        TaskSpec task,
        List<VmSpec> vms,
        double[][] peFree,
        int taskId,
        double[] bestCompletion,
        int[] bestVm,
        int[] bestPe
    ) {
        double minFinish = Double.POSITIVE_INFINITY;
        int chosenVm = -1;
        int chosenPe = -1;

        int m = vms.size();
        for (int v = 0; v < m; v++) {
            double mips = vms.get(v).nominalMips();
            int pes = vms.get(v).pes();
            for (int p = 0; p < pes; p++) {
                double start = Math.max(task.arrivalTime(), peFree[v][p]);
                double finish = start + ((double) task.lengthMi() / mips);
                if (finish < minFinish ||
                    (finish == minFinish && (chosenVm == -1 || v < chosenVm || (v == chosenVm && p < chosenPe)))) {
                    minFinish = finish;
                    chosenVm = v;
                    chosenPe = p;
                }
            }
        }

        bestCompletion[taskId] = minFinish;
        bestVm[taskId] = chosenVm;
        bestPe[taskId] = chosenPe;
    }
}
