package id.ac.soka.scheduling.simulation;

import id.ac.soka.scheduling.model.MetricValue;
import id.ac.soka.scheduling.model.TaskAllocation;
import id.ac.soka.scheduling.model.VmSpec;

import java.util.*;

public class MetricsCalculator {
    public static final double COST_PER_SEC = 0.01;

    public static final String MAKESPAN = "makespan";
    public static final String AVG_WAITING_TIME = "averageWaitingTime";
    public static final String AVG_EXECUTION_TIME = "averageExecutionTime";
    public static final String AVG_TURNAROUND_TIME = "averageTurnaroundTime";
    public static final String THROUGHPUT = "throughput";
    public static final String RESOURCE_UTILIZATION = "resourceUtilization";
    public static final String DEGREE_OF_IMBALANCE = "degreeOfImbalance";
    public static final String TOTAL_COST = "totalCost";
    public static final String SCHEDULING_TIME = "schedulingTime";

    public static final List<String> ALL_METRIC_KEYS = List.of(
        MAKESPAN,
        AVG_WAITING_TIME,
        AVG_EXECUTION_TIME,
        AVG_TURNAROUND_TIME,
        THROUGHPUT,
        RESOURCE_UTILIZATION,
        DEGREE_OF_IMBALANCE,
        TOTAL_COST,
        SCHEDULING_TIME
    );

    public static final Map<String, String> METRIC_UNITS = Map.of(
        MAKESPAN, "detik",
        AVG_WAITING_TIME, "detik",
        AVG_EXECUTION_TIME, "detik",
        AVG_TURNAROUND_TIME, "detik",
        THROUGHPUT, "task/detik",
        RESOURCE_UTILIZATION, "%",
        DEGREE_OF_IMBALANCE, "",
        TOTAL_COST, "G$",
        SCHEDULING_TIME, "ms"
    );

    public static Map<String, Double> computeSingleRun(
        List<TaskAllocation> allocations,
        List<VmSpec> inventoryVms,
        double schedulingTimeMs
    ) {
        int n = allocations.size();
        int m = inventoryVms.size();

        double maxFinish = 0.0;
        double sumWaiting = 0.0;
        double sumExecution = 0.0;
        double sumTurnaround = 0.0;
        double sumCpuCost = 0.0;

        // Load per VM: L_j = sum(duration) / pes
        double[] vmDurationSum = new double[m];
        for (TaskAllocation alloc : allocations) {
            double a = alloc.arrival();
            double s = alloc.start();
            double f = alloc.finish();
            double d = alloc.cpuTime();

            if (f > maxFinish) {
                maxFinish = f;
            }

            double waiting = Math.max(0.0, s - a);
            double turnaround = Math.max(0.0, f - a);

            sumWaiting += waiting;
            sumExecution += d;
            sumTurnaround += turnaround;
            sumCpuCost += d * COST_PER_SEC;

            if (alloc.vmId() >= 0 && alloc.vmId() < m) {
                vmDurationSum[alloc.vmId()] += d;
            }
        }

        double makespan = maxFinish;
        double avgWaiting = (n > 0) ? sumWaiting / n : 0.0;
        double avgExecution = (n > 0) ? sumExecution / n : 0.0;
        double avgTurnaround = (n > 0) ? sumTurnaround / n : 0.0;
        double throughput = (makespan > 0.0) ? (double) n / makespan : 0.0;

        // Resource utilization & Degree of Imbalance
        double[] lj = new double[m];
        double sumLj = 0.0;
        double maxLj = 0.0;
        double minLj = Double.POSITIVE_INFINITY;

        for (int j = 0; j < m; j++) {
            int pes = inventoryVms.get(j).pes();
            lj[j] = vmDurationSum[j] / pes;
            sumLj += lj[j];
            if (lj[j] > maxLj) {
                maxLj = lj[j];
            }
            if (lj[j] < minLj) {
                minLj = lj[j];
            }
        }
        if (m == 0 || minLj == Double.POSITIVE_INFINITY) {
            minLj = 0.0;
        }

        double meanLj = (m > 0) ? sumLj / m : 0.0;
        double degreeOfImbalance = (meanLj > 0.0) ? (maxLj - minLj) / meanLj : 0.0;
        double resourceUtilization = (makespan > 0.0 && m > 0) ? 100.0 * (meanLj / makespan) : 0.0;

        Map<String, Double> map = new LinkedHashMap<>();
        map.put(MAKESPAN, makespan);
        map.put(AVG_WAITING_TIME, avgWaiting);
        map.put(AVG_EXECUTION_TIME, avgExecution);
        map.put(AVG_TURNAROUND_TIME, avgTurnaround);
        map.put(THROUGHPUT, throughput);
        map.put(RESOURCE_UTILIZATION, resourceUtilization);
        map.put(DEGREE_OF_IMBALANCE, degreeOfImbalance);
        map.put(TOTAL_COST, sumCpuCost);
        map.put(SCHEDULING_TIME, schedulingTimeMs);

        return map;
    }

    public static Map<String, MetricValue> aggregateRuns(List<Map<String, Double>> runs) {
        int r = runs.size();
        if (r == 0) {
            throw new IllegalArgumentException("No runs to aggregate");
        }

        Map<String, MetricValue> result = new LinkedHashMap<>();
        for (String key : ALL_METRIC_KEYS) {
            double sum = 0.0;
            for (Map<String, Double> run : runs) {
                sum += run.getOrDefault(key, 0.0);
            }
            double mean = sum / r;

            double stddev = 0.0;
            if (r > 1) {
                double sqDiffSum = 0.0;
                for (Map<String, Double> run : runs) {
                    double diff = run.getOrDefault(key, 0.0) - mean;
                    sqDiffSum += diff * diff;
                }
                stddev = Math.sqrt(sqDiffSum / (r - 1));
            }

            result.put(key, new MetricValue(mean, stddev, METRIC_UNITS.getOrDefault(key, "")));
        }

        return result;
    }
}
