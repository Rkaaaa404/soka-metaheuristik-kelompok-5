package id.ac.soka.scheduling.simulation;

import com.fasterxml.jackson.databind.ObjectMapper;

import java.io.IOException;
import java.nio.ByteBuffer;
import java.nio.channels.FileChannel;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.StandardOpenOption;
import java.time.Instant;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

/** Per-job export: only flushed, completed CloudSim runs are recorded. */
final class ExperimentCsv implements AutoCloseable {
    static final String ENGINE = "CloudSim";
    static final String ENGINE_VERSION = "7.0.1";
    static final String MODEL_REVISION = "gocj-v1";
    private static final ObjectMapper MAPPER = new ObjectMapper();

    private final String jobId;
    private final ScenarioConfig config;
    private final Path directory;
    private final String datasetSha256;
    private final String scenarioJson;
    private final FileChannel channel;
    private int completedRuns;

    ExperimentCsv(Path resultsRoot, String jobId, ScenarioConfig config, String datasetSha256) throws IOException {
        this.jobId = jobId;
        this.config = config;
        this.datasetSha256 = datasetSha256;
        this.scenarioJson = MAPPER.writeValueAsString(config);
        this.directory = resultsRoot.resolve(jobId).toAbsolutePath().normalize();
        Files.createDirectories(directory.getParent());
        // Refuse to reuse an existing job directory, even if its export is incomplete.
        Files.createDirectory(directory);
        this.channel = FileChannel.open(directory.resolve("metrik.csv"), StandardOpenOption.CREATE_NEW, StandardOpenOption.WRITE);
        try {
            List<Object> header = new ArrayList<>(List.of("jobId", "algorithm", "runIndex", "runSeed", "rowStatus"));
            header.addAll(MetricsCalculator.ALL_METRIC_KEYS);
            header.addAll(List.of("energyJoules", "energySource", "scenarioSeed", "dataset", "datasetSha256",
                "engine", "engineVersion", "modelRevision", "timestampUtc", "scenarioJson"));
            writeRow(header);
            channel.force(true);
            writeStatus(directory, jobId, "RUNNING", 0, totalRuns(), null);
        } catch (IOException | RuntimeException e) {
            try {
                channel.close();
            } catch (IOException closeError) {
                e.addSuppressed(closeError);
            }
            throw e;
        }
    }

    void append(String algorithm, int runIndex, long runSeed, Map<String, Double> metrics, double energyJoules) throws IOException {
        List<Object> row = new ArrayList<>(List.of(jobId, algorithm, runIndex, runSeed, "COMPLETED"));
        for (String key : MetricsCalculator.ALL_METRIC_KEYS) {
            Double value = metrics.get(key);
            if (value == null || !Double.isFinite(value)) {
                throw new IOException("Missing or non-finite completed-run metric: " + key);
            }
            row.add(value);
        }
        if (!Double.isFinite(energyJoules)) {
            throw new IOException("Non-finite completed-run energy");
        }
        row.addAll(List.of(energyJoules, "decoded-schedule-estimate", config.seed(), config.dataset(), datasetSha256,
            ENGINE, ENGINE_VERSION, MODEL_REVISION, Instant.now().toString(), scenarioJson));
        writeRow(row);
        // Persist each run before acknowledging it to the API or starting the next run.
        channel.force(true);
        completedRuns++;
        writeStatus(directory, jobId, "RUNNING", completedRuns, totalRuns(), null);
    }

    void complete() throws IOException {
        if (completedRuns != totalRuns()) {
            throw new IOException("Incomplete experiment: " + completedRuns + " of " + totalRuns() + " runs persisted");
        }
        channel.close();
        writeStatus(directory, jobId, "SUCCEEDED", completedRuns, totalRuns(), null);
    }

    void fail(Throwable failure) throws IOException {
        writeStatus(directory, jobId, "FAILED", completedRuns, totalRuns(), failure.toString());
    }

    Map<String, Object> metadata() {
        return Map.of("metricsCsv", directory.resolve("metrik.csv").toString(),
            "statusJson", directory.resolve("status.json").toString(), "completedRuns", completedRuns);
    }

    private int totalRuns() {
        return config.algorithms().size() * config.runs();
    }

    private void writeRow(List<Object> values) throws IOException {
        StringBuilder row = new StringBuilder();
        for (Object value : values) {
            if (!row.isEmpty()) row.append(',');
            String text = String.valueOf(value);
            if (text.indexOf(',') >= 0 || text.indexOf('"') >= 0 || text.indexOf('\r') >= 0 || text.indexOf('\n') >= 0) {
                row.append('"').append(text.replace("\"", "\"\"")).append('"');
            } else {
                row.append(text);
            }
        }
        row.append("\r\n");
        ByteBuffer bytes = StandardCharsets.UTF_8.encode(row.toString());
        long start = channel.position();
        try {
            while (bytes.hasRemaining()) channel.write(bytes);
        } catch (IOException e) {
            try {
                channel.truncate(start);
                channel.position(start);
                channel.force(true);
            } catch (IOException rollbackError) {
                e.addSuppressed(rollbackError);
            }
            throw e;
        }
    }

    static void writeStatus(Path directory, String jobId, String status, int completedRuns, int totalRuns, String message) throws IOException {
        Map<String, Object> data = new LinkedHashMap<>();
        data.put("jobId", jobId);
        data.put("status", status);
        data.put("completedRuns", completedRuns);
        data.put("totalRuns", totalRuns);
        data.put("complete", "SUCCEEDED".equals(status) && completedRuns == totalRuns);
        data.put("metricsCsv", directory.resolve("metrik.csv").toAbsolutePath().normalize().toString());
        data.put("timestampUtc", Instant.now().toString());
        data.put("note", "Only COMPLETED run rows are recorded. Treat the experiment as complete only when status is SUCCEEDED; a failed write may leave an incomplete final row.");
        if (message != null) data.put("message", message);
        byte[] bytes = MAPPER.writerWithDefaultPrettyPrinter().writeValueAsBytes(data);
        // Worker and parent write sequentially. Updating the stable file avoids
        // Windows rename/delete-sharing failures; interrupted JSON is incomplete.
        try (FileChannel statusFile = FileChannel.open(directory.resolve("status.json"),
            StandardOpenOption.CREATE, StandardOpenOption.TRUNCATE_EXISTING, StandardOpenOption.WRITE)) {
            ByteBuffer buffer = ByteBuffer.wrap(bytes);
            while (buffer.hasRemaining()) statusFile.write(buffer);
            statusFile.force(true);
        }
    }

    @Override
    public void close() throws IOException {
        channel.close();
    }
}
