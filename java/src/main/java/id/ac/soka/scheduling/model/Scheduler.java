package id.ac.soka.scheduling.model;

import java.util.List;

/**
 * Common interface for all scheduling algorithms (baselines, CSA, PHS).
 */
public interface Scheduler {
    /**
     * Produces a complete schedule plan for the given tasks and VMs.
     * All tasks must be scheduled exactly once.
     * Assignments must only target active VMs (capacityFactors > 0).
     */
    SchedulePlan schedule(List<TaskSpec> tasks, List<VmSpec> vms, AlgorithmOptions options, long seed);
}
