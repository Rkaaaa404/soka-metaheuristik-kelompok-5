package id.ac.soka.scheduling.model;

import java.util.List;

public record RepresentativeRun(
    int runIndex,
    long seed,
    List<VmSpec> vms,
    List<TaskAllocation> allocations
) {}
