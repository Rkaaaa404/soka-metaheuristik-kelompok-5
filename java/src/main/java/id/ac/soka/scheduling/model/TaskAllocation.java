package id.ac.soka.scheduling.model;

public record TaskAllocation(
    int taskId,
    int vmId,
    int datacenterIndex,
    int hostIndex,
    double arrival,
    double start,
    double finish,
    double cpuTime,
    int sla
) {}
