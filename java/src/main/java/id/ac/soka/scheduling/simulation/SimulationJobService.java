package id.ac.soka.scheduling.simulation;

import com.fasterxml.jackson.databind.ObjectMapper;

import java.io.*;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.Paths;
import java.util.*;
import java.util.concurrent.*;
import java.util.concurrent.atomic.AtomicReference;

public class SimulationJobService {
    private static final ObjectMapper MAPPER = new ObjectMapper();
    private static final long TIMEOUT_SECONDS = 900;

    public static class JobState {
        public final String jobId;
        public final ScenarioConfig config;
        public volatile String status = "RUNNING"; // RUNNING, SUCCEEDED, FAILED, TIMED_OUT
        public volatile int completedRuns = 0;
        public volatile int totalRuns = 0;
        public volatile String currentAlgorithm = "";
        public volatile int currentRun = 0;
        public volatile Map<String, Object> result = null;
        public volatile Map<String, Object> error = null;
        public volatile Process process = null;

        public JobState(String jobId, ScenarioConfig config) {
            this.jobId = jobId;
            this.config = config;
            this.totalRuns = config.algorithms().size() * config.runs();
        }
    }

    private final AtomicReference<JobState> activeJob = new AtomicReference<>(null);
    private final Map<String, JobState> jobHistory = new ConcurrentHashMap<>();
    private final Path cachePath;

    public SimulationJobService() {
        this(resolveCachePath());
    }

    public SimulationJobService(Path cachePath) {
        this.cachePath = cachePath;
    }

    private static Path resolveCachePath() {
        Path p = Paths.get("build", "results", "default.json");
        if (!Files.exists(p.getParent()) && Paths.get("..", "java", "build", "results").toFile().exists()) {
            return Paths.get("..", "java", "build", "results", "default.json");
        }
        return p;
    }

    public synchronized JobState submitJob(ScenarioConfig config) {
        JobState current = activeJob.get();
        if (current != null && "RUNNING".equals(current.status)) {
            throw new IllegalStateException("SIMULATION_BUSY");
        }

        String jobId = UUID.randomUUID().toString();
        JobState job = new JobState(jobId, config);
        activeJob.set(job);
        jobHistory.put(jobId, job);

        startWorkerProcess(job);
        return job;
    }

    public JobState getJob(String jobId) {
        JobState job = jobHistory.get(jobId);
        if (job == null) {
            throw new NoSuchElementException("Job not found: " + jobId);
        }
        return job;
    }

    public synchronized Map<String, Object> getCachedDefault() {
        if (Files.exists(cachePath)) {
            try {
                byte[] bytes = Files.readAllBytes(cachePath);
                @SuppressWarnings("unchecked")
                Map<String, Object> cached = MAPPER.readValue(bytes, Map.class);
                return cached;
            } catch (Exception ignored) {}
        }
        return null;
    }

    private void startWorkerProcess(JobState job) {
        Thread workerThread = new Thread(() -> {
            try {
                String javaBin = ProcessHandle.current().info().command().orElse("java");
                String classPath = System.getProperty("java.class.path");

                ProcessBuilder pb = new ProcessBuilder(
                    javaBin,
                    "-cp",
                    classPath,
                    "id.ac.soka.scheduling.App",
                    "--worker"
                );
                pb.redirectError(ProcessBuilder.Redirect.INHERIT);

                Process process = pb.start();
                job.process = process;

                // Send request JSON to stdin
                try (OutputStream os = process.getOutputStream()) {
                    byte[] jsonBytes = MAPPER.writeValueAsBytes(job.config);
                    os.write(jsonBytes);
                    os.flush();
                }

                // Read NDJSON output
                ScheduledExecutorService watchdog = Executors.newSingleThreadScheduledExecutor();
                watchdog.schedule(() -> {
                    if (process.isAlive()) {
                        process.destroyForcibly();
                        job.status = "TIMED_OUT";
                        job.error = Map.of(
                            "code", "TIMED_OUT",
                            "message", "Simulation job timed out after " + TIMEOUT_SECONDS + " seconds."
                        );
                    }
                }, TIMEOUT_SECONDS, TimeUnit.SECONDS);

                try (BufferedReader reader = new BufferedReader(new InputStreamReader(process.getInputStream(), StandardCharsets.UTF_8))) {
                    String line;
                    while ((line = reader.readLine()) != null) {
                        if (line.isBlank()) continue;
                        try {
                            @SuppressWarnings("unchecked")
                            Map<String, Object> event = MAPPER.readValue(line, Map.class);
                            String type = (String) event.get("type");
                            if ("progress".equals(type)) {
                                job.completedRuns = (int) event.get("completedRuns");
                                job.totalRuns = (int) event.get("totalRuns");
                                job.currentAlgorithm = (String) event.get("currentAlgorithm");
                                job.currentRun = (int) event.get("currentRun");
                            } else if ("result".equals(type)) {
                                @SuppressWarnings("unchecked")
                                Map<String, Object> data = (Map<String, Object>) event.get("data");
                                job.result = data;
                                job.status = "SUCCEEDED";

                                // If default config, cache atomically
                                if (isDefaultConfig(job.config)) {
                                    saveDefaultCache(data);
                                }
                            } else if ("error".equals(type)) {
                                job.status = "FAILED";
                                job.error = Map.of(
                                    "code", "SIMULATION_FAILED",
                                    "message", event.getOrDefault("message", "Simulation failed")
                                );
                            }
                        } catch (Exception e) {
                            // Non-json line, ignore
                        }
                    }
                }

                int exitCode = process.waitFor();
                watchdog.shutdownNow();

                if (exitCode != 0 && !"SUCCEEDED".equals(job.status) && !"TIMED_OUT".equals(job.status)) {
                    job.status = "FAILED";
                    if (job.error == null) {
                        job.error = Map.of(
                            "code", "WORKER_CRASHED",
                            "message", "Simulation worker process exited with code " + exitCode
                        );
                    }
                }
            } catch (Throwable t) {
                job.status = "FAILED";
                job.error = Map.of(
                    "code", "INTERNAL_ERROR",
                    "message", (t.getMessage() != null) ? t.getMessage() : t.toString()
                );
            }
        }, "WorkerThread-" + job.jobId);

        workerThread.setDaemon(true);
        workerThread.start();
    }

    private boolean isDefaultConfig(ScenarioConfig config) {
        ScenarioConfig def = ScenarioConfig.defaults();
        return Objects.equals(config.dataset(), def.dataset()) &&
               config.taskCount() == def.taskCount() &&
               config.datacenters() == def.datacenters() &&
               config.hostsPerDatacenter() == def.hostsPerDatacenter() &&
               config.vmsPerDatacenter() == def.vmsPerDatacenter() &&
               Objects.equals(config.vmDistribution(), def.vmDistribution()) &&
               config.runs() == def.runs() &&
               config.seed() == def.seed() &&
               config.algorithms().size() == def.algorithms().size() &&
               new HashSet<>(config.algorithms()).containsAll(def.algorithms());
    }

    private synchronized void saveDefaultCache(Map<String, Object> data) {
        try {
            if (cachePath.getParent() != null) {
                Files.createDirectories(cachePath.getParent());
            }
            Path temp = cachePath.resolveSibling(cachePath.getFileName().toString() + ".tmp");
            byte[] bytes = MAPPER.writerWithDefaultPrettyPrinter().writeValueAsBytes(data);
            Files.write(temp, bytes);
            Files.move(temp, cachePath, java.nio.file.StandardCopyOption.REPLACE_EXISTING, java.nio.file.StandardCopyOption.ATOMIC_MOVE);
        } catch (Exception ignored) {}
    }
}
