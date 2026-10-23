package id.ac.soka.scheduling;

import id.ac.soka.scheduling.algorithm.BaselineSchedulers;
import id.ac.soka.scheduling.model.SchedulePlan;
import id.ac.soka.scheduling.model.TaskAllocation;
import id.ac.soka.scheduling.model.TaskSpec;
import id.ac.soka.scheduling.model.VmSpec;
import id.ac.soka.scheduling.simulation.*;
import org.junit.jupiter.api.Test;

import java.util.List;
import java.util.Map;

import static org.junit.jupiter.api.Assertions.*;

public class SimulationSemanticsTest {

    @Test
    public void testPhysicalSemanticsFixture() {
        // Satu VM 1 PE 1000 MIPS; task (1000 MI, a=1), (2000 MI, a=1), (1000 MI, a=5), FCFS.
        // Output CloudSim: start [1,2,5], finish [2,4,6], makespan 6 s, mean waiting 1/3 s, execution 4/3 s, turnaround 5/3 s, throughput 0.5 task/s, utilization 66.6667%, DI 0, cost 0.04 G$.
        List<TaskSpec> tasks = List.of(
            new TaskSpec(0, 1000, 1, 1.0),
            new TaskSpec(1, 2000, 2, 1.0),
            new TaskSpec(2, 1000, 3, 5.0)
        );
        List<VmSpec> vms = List.of(
            new VmSpec(0, 0, 0, "Medium", 1000.0, 1, 1024, 1000, 10000)
        );

        SchedulePlan plan = BaselineSchedulers.FCFS.schedule(tasks, vms, null, 42L);
        ScenarioConfig config = new ScenarioConfig("test.csv", List.of("FCFS"), 3, 1, 1, 1, new VmDistribution(0, 1, 0), 1, 42L, null, null);

        SimulationRunResult simResult = CloudSimRunner.runSimulation(tasks, vms, plan, config);
        List<TaskAllocation> allocs = simResult.allocations();

        assertEquals(3, allocs.size());

        // Verify start and finish times
        assertEquals(1.0, allocs.get(0).start(), 0.01);
        assertEquals(2.0, allocs.get(0).finish(), 0.01);

        assertEquals(2.0, allocs.get(1).start(), 0.01);
        assertEquals(4.0, allocs.get(1).finish(), 0.01);

        assertEquals(5.0, allocs.get(2).start(), 0.01);
        assertEquals(6.0, allocs.get(2).finish(), 0.01);

        Map<String, Double> metrics = MetricsCalculator.computeSingleRun(allocs, vms, 10.0);

        assertEquals(6.0, metrics.get(MetricsCalculator.MAKESPAN), 0.01);
        assertEquals(1.0 / 3.0, metrics.get(MetricsCalculator.AVG_WAITING_TIME), 0.01);
        assertEquals(4.0 / 3.0, metrics.get(MetricsCalculator.AVG_EXECUTION_TIME), 0.01);
        assertEquals(5.0 / 3.0, metrics.get(MetricsCalculator.AVG_TURNAROUND_TIME), 0.01);
        assertEquals(0.5, metrics.get(MetricsCalculator.THROUGHPUT), 0.01);
        assertEquals(66.6667, metrics.get(MetricsCalculator.RESOURCE_UTILIZATION), 0.01);
        assertEquals(0.0, metrics.get(MetricsCalculator.DEGREE_OF_IMBALANCE), 0.01);
        assertEquals(0.04, metrics.get(MetricsCalculator.TOTAL_COST), 0.001);

        // Verify decoder prediction matches CloudSim within tolerance
        DecodedSchedule decoded = ScheduleDecoder.decode(tasks, vms, plan, 1);
        assertEquals(metrics.get(MetricsCalculator.MAKESPAN), decoded.makespan(), 0.01);
        for (int i = 0; i < 3; i++) {
            assertEquals(allocs.get(i).start(), decoded.startTimes()[i], 0.01);
            assertEquals(allocs.get(i).finish(), decoded.finishTimes()[i], 0.01);
        }
    }

    @Test
    public void testMultiPeConcurrentExecution() {
        // VM 2 PE 1000 MIPS dan dua task 1000 MI tiba t=1: keduanya mulai t=1 selesai t=2; bukan selesai t=1.5.
        List<TaskSpec> tasks = List.of(
            new TaskSpec(0, 1000, 1, 1.0),
            new TaskSpec(1, 1000, 1, 1.0)
        );
        List<VmSpec> vms = List.of(
            new VmSpec(0, 0, 0, "Medium", 1000.0, 2, 1024, 1000, 10000)
        );

        SchedulePlan plan = BaselineSchedulers.FCFS.schedule(tasks, vms, null, 42L);
        ScenarioConfig config = new ScenarioConfig("test.csv", List.of("FCFS"), 2, 1, 1, 1, new VmDistribution(0, 1, 0), 1, 42L, null, null);

        SimulationRunResult simResult = CloudSimRunner.runSimulation(tasks, vms, plan, config);
        List<TaskAllocation> allocs = simResult.allocations();

        assertEquals(2, allocs.size());
        assertEquals(1.0, allocs.get(0).start(), 0.01);
        assertEquals(2.0, allocs.get(0).finish(), 0.01);
        assertEquals(1.0, allocs.get(1).start(), 0.01);
        assertEquals(2.0, allocs.get(1).finish(), 0.01);

        DecodedSchedule dec = ScheduleDecoder.decode(tasks, vms, plan, 1);
        assertEquals(2.0, dec.makespan(), 0.01);
        assertEquals(1.0, dec.startTimes()[0], 0.01);
        assertEquals(2.0, dec.finishTimes()[0], 0.01);
        assertEquals(1.0, dec.startTimes()[1], 0.01);
        assertEquals(2.0, dec.finishTimes()[1], 0.01);
    }

    @Test
    public void testPhsCapacityFactorHalf() {
        // Factor 0.5 doubles execution time
        List<TaskSpec> tasks = List.of(new TaskSpec(0, 1000, 1, 0.0));
        List<VmSpec> vms = List.of(new VmSpec(0, 0, 0, "Small", 1000.0, 1, 512, 500, 10000));
        SchedulePlan plan = new SchedulePlan(new int[]{0}, new int[]{0}, new double[]{0.5});

        ScenarioConfig config = new ScenarioConfig("test.csv", List.of("PHS"), 1, 1, 1, 1, new VmDistribution(1, 0, 0), 1, 42L, null, null);
        SimulationRunResult simResult = CloudSimRunner.runSimulation(tasks, vms, plan, config);
        assertEquals(2.0, simResult.allocations().get(0).finish(), 0.01);
        assertEquals(2.0, simResult.allocations().get(0).cpuTime(), 0.01);

        DecodedSchedule dec = ScheduleDecoder.decode(tasks, vms, plan, 1);
        assertEquals(2.0, dec.makespan(), 0.01);
    }
}
