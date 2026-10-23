package id.ac.soka.scheduling;

import id.ac.soka.scheduling.algorithm.BaselineSchedulers;
import id.ac.soka.scheduling.algorithm.CsaScheduler;
import id.ac.soka.scheduling.algorithm.PhsScheduler;
import id.ac.soka.scheduling.model.*;
import id.ac.soka.scheduling.simulation.MetricsCalculator;
import org.junit.jupiter.api.Test;

import java.util.*;

import static org.junit.jupiter.api.Assertions.*;

public class AlgorithmInvariantTest {

    @Test
    public void testSingleTaskSingleVmBoundary() {
        List<TaskSpec> tasks = List.of(new TaskSpec(0, 500, 1, 0.0));
        List<VmSpec> vms = List.of(new VmSpec(0, 0, 0, "Small", 500.0, 1, 512, 500, 10000));
        AlgorithmOptions options = AlgorithmOptions.defaults();

        // CSA
        CsaScheduler csa = new CsaScheduler(1);
        SchedulePlan csaPlan = csa.schedule(tasks, vms, options, 42L);
        assertEquals(1, csaPlan.taskOrder().length);
        assertEquals(0, csaPlan.taskOrder()[0]);
        assertEquals(0, csaPlan.assignedVm()[0]);

        // PHS
        PhsScheduler phs = new PhsScheduler(1);
        SchedulePlan phsPlan = phs.schedule(tasks, vms, options, 42L);
        assertEquals(1, phsPlan.taskOrder().length);
        assertEquals(0, phsPlan.taskOrder()[0]);
        assertEquals(0, phsPlan.assignedVm()[0]);
        assertTrue(phsPlan.capacityFactors()[0] > 0.0);
    }

    @Test
    public void testCsaArchiveNonDominated() {
        CsaScheduler.ParetoArchive archive = new CsaScheduler.ParetoArchive();
        CsaScheduler.Candidate c1 = new CsaScheduler.Candidate(0, new int[]{0});
        c1.makespan = 10.0;
        c1.energy = 100.0;
        archive.update(c1);

        CsaScheduler.Candidate c2 = new CsaScheduler.Candidate(1, new int[]{0});
        c2.makespan = 12.0;
        c2.energy = 120.0; // dominated by c1
        archive.update(c2);

        assertEquals(1, archive.getMembers().size());
        assertEquals(0, archive.getMembers().get(0).id);

        CsaScheduler.Candidate c3 = new CsaScheduler.Candidate(2, new int[]{0});
        c3.makespan = 8.0;
        c3.energy = 150.0; // non-dominated tradeoff
        archive.update(c3);

        assertEquals(2, archive.getMembers().size());
    }

    @Test
    public void testBaselinesDifferentiate() {
        // Differentiating fixture
        List<TaskSpec> tasks = List.of(
            new TaskSpec(0, 10000, 1, 0.0),
            new TaskSpec(1, 1000, 1, 0.0),
            new TaskSpec(2, 5000, 1, 1.0)
        );
        List<VmSpec> vms = List.of(
            new VmSpec(0, 0, 0, "Small", 500.0, 1, 512, 500, 10000),
            new VmSpec(1, 0, 0, "Large", 2000.0, 1, 2048, 1000, 10000)
        );

        SchedulePlan fcfs = BaselineSchedulers.FCFS.schedule(tasks, vms, null, 1L);
        SchedulePlan rr = BaselineSchedulers.RR.schedule(tasks, vms, null, 1L);
        SchedulePlan sjf = BaselineSchedulers.SJF.schedule(tasks, vms, null, 1L);

        // FCFS puts task 0 on fastest start (VM 0 or 1)
        // RR puts task 0 on VM 0, task 1 on VM 1, task 2 on VM 0
        // SJF starts task 1 (shortest ready at t=0) before task 0
        assertEquals(1, sjf.taskOrder()[0], "SJF should schedule shortest task first");
        assertEquals(0, fcfs.taskOrder()[0], "FCFS should schedule task 0 first");
        assertNotEquals(Arrays.toString(fcfs.assignedVm()), Arrays.toString(rr.assignedVm()));
    }

    @Test
    public void testMetricsAggregation() {
        // Run fixture [1, 3] -> mean 2, sample SD sqrt(2)
        Map<String, Double> run1 = Map.of(
            MetricsCalculator.MAKESPAN, 1.0,
            MetricsCalculator.AVG_WAITING_TIME, 0.0,
            MetricsCalculator.AVG_EXECUTION_TIME, 0.0,
            MetricsCalculator.AVG_TURNAROUND_TIME, 0.0,
            MetricsCalculator.THROUGHPUT, 0.0,
            MetricsCalculator.RESOURCE_UTILIZATION, 0.0,
            MetricsCalculator.DEGREE_OF_IMBALANCE, 0.0,
            MetricsCalculator.TOTAL_COST, 0.0,
            MetricsCalculator.SCHEDULING_TIME, 0.0
        );
        Map<String, Double> run2 = Map.of(
            MetricsCalculator.MAKESPAN, 3.0,
            MetricsCalculator.AVG_WAITING_TIME, 0.0,
            MetricsCalculator.AVG_EXECUTION_TIME, 0.0,
            MetricsCalculator.AVG_TURNAROUND_TIME, 0.0,
            MetricsCalculator.THROUGHPUT, 0.0,
            MetricsCalculator.RESOURCE_UTILIZATION, 0.0,
            MetricsCalculator.DEGREE_OF_IMBALANCE, 0.0,
            MetricsCalculator.TOTAL_COST, 0.0,
            MetricsCalculator.SCHEDULING_TIME, 0.0
        );

        Map<String, MetricValue> agg = MetricsCalculator.aggregateRuns(List.of(run1, run2));
        MetricValue mv = agg.get(MetricsCalculator.MAKESPAN);
        assertEquals(2.0, mv.mean(), 1e-9);
        assertEquals(Math.sqrt(2.0), mv.stddev(), 1e-9);

        // Single run should yield 0 stddev
        Map<String, MetricValue> singleAgg = MetricsCalculator.aggregateRuns(List.of(run1));
        assertEquals(1.0, singleAgg.get(MetricsCalculator.MAKESPAN).mean(), 1e-9);
        assertEquals(0.0, singleAgg.get(MetricsCalculator.MAKESPAN).stddev(), 1e-9);
    }
}
