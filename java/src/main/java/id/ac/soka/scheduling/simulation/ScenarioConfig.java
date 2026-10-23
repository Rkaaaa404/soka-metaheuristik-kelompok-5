package id.ac.soka.scheduling.simulation;

import com.fasterxml.jackson.annotation.JsonCreator;
import com.fasterxml.jackson.annotation.JsonIgnoreProperties;
import com.fasterxml.jackson.annotation.JsonProperty;
import id.ac.soka.scheduling.model.AlgorithmOptions;

import java.util.ArrayList;
import java.util.HashSet;
import java.util.List;
import java.util.Set;

@JsonIgnoreProperties(ignoreUnknown = false)
public record ScenarioConfig(
    String dataset,
    List<String> algorithms,
    int taskCount,
    int datacenters,
    int hostsPerDatacenter,
    int vmsPerDatacenter,
    VmDistribution vmDistribution,
    int runs,
    long seed,
    AlgorithmOptions.CsaOptions csa,
    AlgorithmOptions.PhsOptions phs
) {
    public static final Set<String> ALLOWED_ALGORITHMS = Set.of(
        "CSA", "PHS", "FCFS", "RR", "SJF", "MinMin", "MaxMin"
    );

    @JsonCreator
    public static ScenarioConfig create(
        @JsonProperty("dataset") String dataset,
        @JsonProperty("algorithms") List<String> algorithms,
        @JsonProperty("taskCount") Integer taskCount,
        @JsonProperty("datacenters") Integer datacenters,
        @JsonProperty("hostsPerDatacenter") Integer hostsPerDatacenter,
        @JsonProperty("vmsPerDatacenter") Integer vmsPerDatacenter,
        @JsonProperty("vmDistribution") VmDistribution vmDistribution,
        @JsonProperty("runs") Integer runs,
        @JsonProperty("seed") Long seed,
        @JsonProperty("csa") AlgorithmOptions.CsaOptions csa,
        @JsonProperty("phs") AlgorithmOptions.PhsOptions phs
    ) {
        return new ScenarioConfig(
            dataset != null ? dataset : "GoCJ_Dataset_1000.csv",
            algorithms != null ? algorithms : List.of("CSA", "PHS", "FCFS", "RR", "SJF", "MinMin", "MaxMin"),
            taskCount != null ? taskCount : 1000,
            datacenters != null ? datacenters : 2,
            hostsPerDatacenter != null ? hostsPerDatacenter : 5,
            vmsPerDatacenter != null ? vmsPerDatacenter : 5,
            vmDistribution != null ? vmDistribution : new VmDistribution(2, 2, 1),
            runs != null ? runs : 5,
            seed != null ? seed : 42L,
            csa != null ? csa : AlgorithmOptions.CsaOptions.defaults(),
            phs != null ? phs : AlgorithmOptions.PhsOptions.defaults()
        );
    }

    public ScenarioConfig {
        if (dataset == null || dataset.isBlank()) dataset = "GoCJ_Dataset_1000.csv";
        if (algorithms == null) algorithms = List.of("CSA", "PHS", "FCFS", "RR", "SJF", "MinMin", "MaxMin");
        else algorithms = List.copyOf(algorithms);
        if (vmDistribution == null) vmDistribution = new VmDistribution(2, 2, 1);
        if (csa == null) csa = AlgorithmOptions.CsaOptions.defaults();
        if (phs == null) phs = AlgorithmOptions.PhsOptions.defaults();

        validate(dataset, algorithms, taskCount, datacenters, hostsPerDatacenter, vmsPerDatacenter, vmDistribution, runs, seed);
    }

    private static void validate(
        String dataset,
        List<String> algorithms,
        int taskCount,
        int datacenters,
        int hostsPerDatacenter,
        int vmsPerDatacenter,
        VmDistribution vmDistribution,
        int runs,
        long seed
    ) {
        if (dataset == null || dataset.isBlank()) {
            throw new IllegalArgumentException("dataset must not be blank");
        }
        if (algorithms == null || algorithms.isEmpty()) {
            throw new IllegalArgumentException("algorithms list must not be empty");
        }
        Set<String> seen = new HashSet<>();
        for (String algo : algorithms) {
            if (!ALLOWED_ALGORITHMS.contains(algo)) {
                throw new IllegalArgumentException("Unknown algorithm: " + algo);
            }
            if (!seen.add(algo)) {
                throw new IllegalArgumentException("Duplicate algorithm in list: " + algo);
            }
        }
        if (taskCount < 1) {
            throw new IllegalArgumentException("taskCount must be at least 1, got: " + taskCount);
        }
        if (datacenters < 1 || datacenters > 10) {
            throw new IllegalArgumentException("datacenters must be 1..10, got: " + datacenters);
        }
        if (hostsPerDatacenter < 1 || hostsPerDatacenter > 50) {
            throw new IllegalArgumentException("hostsPerDatacenter must be 1..50, got: " + hostsPerDatacenter);
        }
        if (vmsPerDatacenter < 1 || vmsPerDatacenter > 100) {
            throw new IllegalArgumentException("vmsPerDatacenter must be 1..100, got: " + vmsPerDatacenter);
        }
        if (vmDistribution == null) {
            throw new IllegalArgumentException("vmDistribution must not be null");
        }
        if (vmDistribution.total() != vmsPerDatacenter) {
            throw new IllegalArgumentException(
                "VM distribution sum (" + vmDistribution.total() +
                ") must equal vmsPerDatacenter (" + vmsPerDatacenter + ")"
            );
        }
        if (runs < 1 || runs > 10) {
            throw new IllegalArgumentException("runs must be 1..10, got: " + runs);
        }
        if (seed < 0 || seed > 0xFFFFFFFFL) {
            throw new IllegalArgumentException("seed must be uint32 (0..4294967295), got: " + seed);
        }
    }

    public static ScenarioConfig defaults() {
        return create(null, null, null, null, null, null, null, null, null, null, null);
    }
}
