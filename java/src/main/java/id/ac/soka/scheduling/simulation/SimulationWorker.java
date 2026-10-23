package id.ac.soka.scheduling.simulation;

import com.fasterxml.jackson.databind.ObjectMapper;
import id.ac.soka.scheduling.algorithm.BaselineSchedulers;
import id.ac.soka.scheduling.algorithm.CsaScheduler;
import id.ac.soka.scheduling.algorithm.PhsScheduler;
import id.ac.soka.scheduling.data.GoCjRepository;
import id.ac.soka.scheduling.model.*;

import java.io.BufferedReader;
import java.io.InputStreamReader;
import java.nio.charset.StandardCharsets;
import java.nio.file.Path;
import java.time.Instant;
import java.util.*;

public class SimulationWorker {
    private static final ObjectMapper MAPPER = new ObjectMapper();

    public static void main(String[] args) {
        try {
            BufferedReader reader = new BufferedReader(new InputStreamReader(System.in, StandardCharsets.UTF_8));
            StringBuilder sb = new StringBuilder();
            String line;
            while ((line = reader.readLine()) != null) {
                sb.append(line).append("\n");
            }

            ScenarioConfig config = MAPPER.readValue(sb.toString(), ScenarioConfig.class);
            execute(config);
        } catch (Throwable t) {
            Map<String, Object> err = Map.of(
                "type", "error",
                "message", (t.getMessage() != null) ? t.getMessage() : t.toString()
            );
            try {
                System.out.println(MAPPER.writeValueAsString(err));
            } catch (Exception ignored) {}
            System.exit(1);
        }
    }

    public static void execute(ScenarioConfig config) throws Exception {
        GoCjRepository repo = new GoCjRepository();
        List<TaskSpec> tasks = repo.loadTasks(config.dataset(), config.taskCount());
        List<VmSpec> vms = ScenarioFactory.buildVmSpecs(config);
        int totalHosts = config.datacenters() * config.hostsPerDatacenter();
        String datasetSha256 = repo.getMetadata(config.dataset()).sha256();

        String jobId = System.getProperty("simulation.jobId", UUID.randomUUID().toString());
        Path resultsRoot = Path.of(System.getProperty("simulation.resultsRoot",
            SimulationJobService.resolveCachePath().toAbsolutePath().normalize().getParent().toString()));
        try (ExperimentCsv export = new ExperimentCsv(resultsRoot, jobId, config, datasetSha256)) {
            try {
                executeRuns(config, tasks, vms, totalHosts, datasetSha256, export);
            } catch (Exception e) {
                try {
                    export.fail(e);
                } catch (Exception persistenceError) {
                    e.addSuppressed(persistenceError);
                }
                throw e;
            }
        }
    }

    private static void executeRuns(ScenarioConfig config, List<TaskSpec> tasks, List<VmSpec> vms,
                                    int totalHosts, String datasetSha256, ExperimentCsv export) throws Exception {
        int totalRuns = config.algorithms().size() * config.runs();
        int completedRuns = 0;

        List<AlgorithmResult> results = new ArrayList<>();

        AlgorithmOptions options = new AlgorithmOptions(config.csa(), config.phs());

        for (String algo : config.algorithms()) {
            List<Map<String, Double>> singleRunMetricsList = new ArrayList<>();
            List<RunMetricRecord> runMetricRecords = new ArrayList<>();
            RepresentativeRun representativeRun = null;

            for (int r = 0; r < config.runs(); r++) {
                long runSeed = (config.seed() + r) & 0xFFFFFFFFL;

                Scheduler scheduler = switch (algo) {
                    case "CSA" -> new CsaScheduler(totalHosts);
                    case "PHS" -> new PhsScheduler(totalHosts);
                    case "FCFS" -> BaselineSchedulers.FCFS;
                    case "RR" -> BaselineSchedulers.RR;
                    case "SJF" -> BaselineSchedulers.SJF;
                    case "MinMin" -> BaselineSchedulers.MIN_MIN;
                    case "MaxMin" -> BaselineSchedulers.MAX_MIN;
                    default -> throw new IllegalArgumentException("Unknown algorithm: " + algo);
                };

                // Time the scheduling algorithm
                long startNs = System.nanoTime();
                SchedulePlan plan = scheduler.schedule(tasks, vms, options, runSeed);
                long elapsedNs = System.nanoTime() - startNs;
                double schedTimeMs = elapsedNs / 1_000_000.0;

                // Run real CloudSim simulation
                SimulationRunResult simResult = CloudSimRunner.runSimulation(tasks, vms, plan, config);
                Map<String, Double> metrics = MetricsCalculator.computeSingleRun(simResult.allocations(), vms, schedTimeMs);
                singleRunMetricsList.add(metrics);

                // Energy from decoded schedule
                DecodedSchedule dec = ScheduleDecoder.decode(tasks, vms, plan, totalHosts);
                export.append(algo, r, runSeed, metrics, dec.energyJoules());
                runMetricRecords.add(new RunMetricRecord(r, runSeed, metrics, dec.energyJoules()));

                if (r == 0) {
                    representativeRun = new RepresentativeRun(0, runSeed, vms, simResult.allocations());
                }

                completedRuns++;
                Map<String, Object> progress = Map.of(
                    "type", "progress",
                    "completedRuns", completedRuns,
                    "totalRuns", totalRuns,
                    "currentAlgorithm", algo,
                    "currentRun", r + 1
                );
                System.out.println(MAPPER.writeValueAsString(progress));
                System.out.flush();
            }

            Map<String, MetricValue> aggregatedMetrics = MetricsCalculator.aggregateRuns(singleRunMetricsList);
            results.add(new AlgorithmResult(algo, aggregatedMetrics, runMetricRecords, representativeRun));
        }

        export.complete();
        Map<String, Object> provenance = Map.of(
            "engine", ExperimentCsv.ENGINE,
            "engineVersion", ExperimentCsv.ENGINE_VERSION,
            "dataset", config.dataset(),
            "datasetSha256", datasetSha256,
            "timestampUtc", Instant.now().toString(),
            "modelRevision", ExperimentCsv.MODEL_REVISION,
            "seed", config.seed()
        );

        Map<String, Object> finalPayload = Map.of(
            "scenario", config,
            "provenance", provenance,
            "results", results,
            "exports", export.metadata()
        );

        Map<String, Object> resEvent = Map.of(
            "type", "result",
            "data", finalPayload
        );
        System.out.println(MAPPER.writeValueAsString(resEvent));
        System.out.flush();
    }
}
