package id.ac.soka.scheduling.model;

import java.util.List;
import java.util.Map;

public record AlgorithmResult(
    String algorithm,
    Map<String, MetricValue> metrics,
    List<RunMetricRecord> runMetrics,
    RepresentativeRun representativeRun
) {}
