package id.ac.soka.scheduling.model;

import java.util.Map;

public record RunMetricRecord(
    int runIndex,
    long seed,
    Map<String, Double> metrics,
    double energyJoules
) {}
