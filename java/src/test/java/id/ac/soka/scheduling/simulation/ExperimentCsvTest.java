package id.ac.soka.scheduling.simulation;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import id.ac.soka.scheduling.algorithm.BaselineSchedulers;
import id.ac.soka.scheduling.model.SchedulePlan;
import id.ac.soka.scheduling.model.TaskSpec;
import id.ac.soka.scheduling.model.VmSpec;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;

import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.List;
import java.util.Map;

import static org.junit.jupiter.api.Assertions.*;

class ExperimentCsvTest {
    private static final ObjectMapper MAPPER = new ObjectMapper();
    @TempDir Path root;

    @Test
    void persistsActualCloudSimRunBeforeExperimentCompletes() throws Exception {
        ScenarioConfig config = config();
        List<TaskSpec> tasks = List.of(new TaskSpec(0, 1000, 1, 1.0), new TaskSpec(1, 2000, 2, 1.0));
        List<VmSpec> vms = List.of(new VmSpec(0, 0, 0, "Medium", 1000.0, 1, 1024, 1000, 10000));
        Path directory = root.resolve("actual-run");
        try (ExperimentCsv export = new ExperimentCsv(root, "actual-run", config, "dataset-hash")) {
            for (int run = 0; run < config.runs(); run++) {
                long seed = config.seed() + run;
                SchedulePlan plan = BaselineSchedulers.FCFS.schedule(tasks, vms, null, seed);
                SimulationRunResult simulation = CloudSimRunner.runSimulation(tasks, vms, plan, config);
                Map<String, Double> metrics = MetricsCalculator.computeSingleRun(simulation.allocations(), vms, 1.5);
                export.append("FCFS", run, seed, metrics, ScheduleDecoder.decode(tasks, vms, plan, 1).energyJoules());
                assertEquals(run + 2, Files.readAllLines(directory.resolve("metrik.csv")).size());
                JsonNode status = MAPPER.readTree(directory.resolve("status.json").toFile());
                assertEquals("RUNNING", status.path("status").asText());
                assertEquals(run + 1, status.path("completedRuns").asInt());
                assertFalse(status.path("complete").asBoolean());
            }
            export.complete();
            assertEquals(directory.resolve("metrik.csv").toString(), export.metadata().get("metricsCsv"));
        }
        List<String> lines = Files.readAllLines(directory.resolve("metrik.csv"));
        assertEquals("jobId,algorithm,runIndex,runSeed,rowStatus,makespan,averageWaitingTime,averageExecutionTime,averageTurnaroundTime,throughput,resourceUtilization,degreeOfImbalance,totalCost,schedulingTime,energyJoules,energySource,scenarioSeed,dataset,datasetSha256,engine,engineVersion,modelRevision,timestampUtc,scenarioJson", lines.getFirst());
        assertTrue(lines.get(1).startsWith("actual-run,FCFS,0,42,COMPLETED,"));
        assertTrue(lines.get(2).startsWith("actual-run,FCFS,1,43,COMPLETED,"));
        assertTrue(lines.get(1).contains(",decoded-schedule-estimate,42,fixture.csv,dataset-hash,CloudSim,7.0.1,gocj-v1,"));
        String escapedScenario = "\"" + MAPPER.writeValueAsString(config).replace("\"", "\"\"") + "\"";
        assertTrue(lines.get(1).endsWith(escapedScenario));
        assertTrue(MAPPER.readTree(directory.resolve("status.json").toFile()).path("complete").asBoolean());
    }

    @Test
    void preservesPartialRowsAndNeverReusesJobDirectory() throws Exception {
        Path directory = root.resolve("partial");
        try (ExperimentCsv export = new ExperimentCsv(root, "partial", config(), "hash")) {
            export.append("FCFS", 0, 42, fixtureMetrics(), 20.0);
            assertThrows(IOException.class, export::complete);
            export.fail(new IllegalStateException("Second run failed"));
        }
        byte[] saved = Files.readAllBytes(directory.resolve("metrik.csv"));
        JsonNode status = MAPPER.readTree(directory.resolve("status.json").toFile());
        assertEquals("FAILED", status.path("status").asText());
        assertEquals(1, status.path("completedRuns").asInt());
        assertEquals(2, status.path("totalRuns").asInt());
        assertFalse(status.path("complete").asBoolean());
        assertThrows(IOException.class, () -> new ExperimentCsv(root, "partial", config(), "hash"));
        assertArrayEquals(saved, Files.readAllBytes(directory.resolve("metrik.csv")));
    }

    @Test
    void propagatesLocalPersistenceFailures() throws Exception {
        Path blockedRoot = root.resolve("not-a-directory");
        Files.writeString(blockedRoot, "occupied");
        assertThrows(IOException.class, () -> new ExperimentCsv(blockedRoot, "job", config(), "hash"));

        Path directory = root.resolve("status-failure");
        try (ExperimentCsv export = new ExperimentCsv(root, "status-failure", config(), "hash")) {
            Files.delete(directory.resolve("status.json"));
            Files.createDirectory(directory.resolve("status.json"));
            assertThrows(IOException.class, () -> export.append("FCFS", 0, 42, fixtureMetrics(), 20.0));
            assertTrue(Files.isDirectory(directory.resolve("status.json")));
            assertEquals(2, Files.readAllLines(directory.resolve("metrik.csv")).size());
        }
    }

    private static ScenarioConfig config() {
        return new ScenarioConfig("fixture.csv", List.of("FCFS"), 2, 1, 1, 1,
            new VmDistribution(0, 1, 0), 2, 42L, null, null);
    }

    private static Map<String, Double> fixtureMetrics() {
        return MetricsCalculator.computeSingleRun(List.of(), List.of(), 0.0);
    }
}
