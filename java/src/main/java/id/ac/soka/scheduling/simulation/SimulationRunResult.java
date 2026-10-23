package id.ac.soka.scheduling.simulation;

import id.ac.soka.scheduling.model.TaskAllocation;

import java.util.List;

public record SimulationRunResult(
    List<TaskAllocation> allocations,
    double workloadEpoch
) {}
