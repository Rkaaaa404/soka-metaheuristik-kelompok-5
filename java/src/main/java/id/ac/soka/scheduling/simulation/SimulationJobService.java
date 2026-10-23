package id.ac.soka.scheduling.simulation;

import com.fasterxml.jackson.databind.ObjectMapper;

import java.io.*;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.Paths;
import java.util.*;
import java.util.concurrent.*;
import java.util.concurrent.atomic.AtomicBoolean;
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
        this.cachePath = cachePath.toAbsolutePath().normalize();
    }

    static Path resolveCachePath() {
        if (Files.isDirectory(Paths.get("java", "src", "main"))) {
            return Paths.get("java", "build", "results", "default.json");
        }
        if (Files.isDirectory(Paths.get("..", "java", "src", "main"))) {
            return Paths.get("..", "java", "build", "results", "default.json");
        }
        return Paths.get("build", "results", "default.json");
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
                if (cached != null && cached.containsKey("scenario")) {
                    ScenarioConfig cachedScenario = MAPPER.convertValue(cached.get("scenario"), ScenarioConfig.class);
                    if (cachedScenario != null && isDefaultConfig(cachedScenario)) {
                        return cached;
                    }
                }
            } catch (Exception ignored) {}
        }
        return null;
    }

    private void startWorkerProcess(JobState job) {
        Thread workerThread = new Thread(() -> {
            Path directory = cachePath.getParent().resolve(job.jobId);
            ScheduledExecutorService watchdog = Executors.newSingleThreadScheduledExecutor();
            AtomicBoolean timedOut = new AtomicBoolean();
            Map<String, Object> result = null;
            String terminalStatus = "FAILED";
            try {
                String javaBin = ProcessHandle.current().info().command().orElse("java");
                String classPath = System.getProperty("java.class.path");
                ProcessBuilder pb = new ProcessBuilder(
                    javaBin,
                    "-Dsimulation.jobId=" + job.jobId,
                    "-Dsimulation.resultsRoot=" + cachePath.getParent(),
                    "-cp",
                    classPath,
                    "id.ac.soka.scheduling.App",
                    "--worker"
                );
                pb.redirectError(ProcessBuilder.Redirect.INHERIT);

                Process process = pb.start();
                job.process = process;
                watchdog.schedule(() -> {
                    if (process.isAlive()) {
                        timedOut.set(true);
                        process.destroyForcibly();
                    }
                }, TIMEOUT_SECONDS, TimeUnit.SECONDS);

                try (OutputStream os = process.getOutputStream()) {
                    os.write(MAPPER.writeValueAsBytes(job.config));
                    os.flush();
                }

                try (BufferedReader reader = new BufferedReader(new InputStreamReader(process.getInputStream(), StandardCharsets.UTF_8))) {
                    String line;
                    while ((line = reader.readLine()) != null) {
                        if (line.isBlank()) continue;
                        Map<String, Object> event;
                        try {
                            @SuppressWarnings("unchecked")
                            Map<String, Object> parsed = MAPPER.readValue(line, Map.class);
                            event = parsed;
                        } catch (com.fasterxml.jackson.core.JsonProcessingException e) {
                            // CloudSim may also write ordinary log lines to stdout.
                            continue;
                        }
                        if (event == null) continue;
                        String type = (String) event.get("type");
                        if ("progress".equals(type)) {
                            job.completedRuns = ((Number) event.get("completedRuns")).intValue();
                            job.currentAlgorithm = (String) event.get("currentAlgorithm");
                            job.currentRun = ((Number) event.get("currentRun")).intValue();
                        } else if ("result".equals(type)) {
                            @SuppressWarnings("unchecked")
                            Map<String, Object> data = (Map<String, Object>) event.get("data");
                            result = data;
                        } else if ("error".equals(type)) {
                            job.error = Map.of(
                                "code", "SIMULATION_FAILED",
                                "message", event.getOrDefault("message", "Simulation failed")
                            );
                        }
                    }
                }

                int exitCode = process.waitFor();
                if (timedOut.get()) {
                    terminalStatus = "TIMED_OUT";
                    job.error = Map.of("code", "TIMED_OUT",
                        "message", "Simulation job timed out after " + TIMEOUT_SECONDS + " seconds.");
                } else if (exitCode == 0 && result != null && job.error == null && job.completedRuns == job.totalRuns) {
                    terminalStatus = "SUCCEEDED";
                } else if (job.error == null) {
                    job.error = Map.of("code", "WORKER_CRASHED",
                        "message", "Simulation worker exited with code " + exitCode + " without a complete persisted result.");
                }
            } catch (Throwable t) {
                job.error = Map.of("code", "INTERNAL_ERROR",
                    "message", (t.getMessage() != null) ? t.getMessage() : t.toString());
            } finally {
                watchdog.shutdownNow();
                Process process = job.process;
                if (process != null && process.isAlive()) {
                    process.destroyForcibly();
                    try {
                        process.waitFor();
                    } catch (InterruptedException e) {
                        Thread.currentThread().interrupt();
                    }
                }
                if (timedOut.get()) {
                    terminalStatus = "TIMED_OUT";
                    job.error = Map.of("code", "TIMED_OUT",
                        "message", "Simulation job timed out after " + TIMEOUT_SECONDS + " seconds.");
                }
                try {
                    if (Files.isDirectory(directory)) {
                        Path statusPath = directory.resolve("status.json");
                        if (!"SUCCEEDED".equals(terminalStatus) && Files.isRegularFile(statusPath)) {
                            try {
                                var persistedStatus = MAPPER.readTree(statusPath.toFile());
                                if (persistedStatus != null) {
                                    int persistedRuns = persistedStatus.path("completedRuns").asInt(0);
                                    job.completedRuns = Math.max(job.completedRuns, Math.min(job.totalRuns, persistedRuns));
                                }
                            } catch (com.fasterxml.jackson.core.JsonProcessingException e) {
                                // A killed worker can leave partial JSON. Keep the acknowledged
                                // count and replace it with the known FAILED/TIMED_OUT state.
                            }
                        }
                        if ("SUCCEEDED".equals(terminalStatus) && !Files.isRegularFile(directory.resolve("metrik.csv"))) {
                            throw new IOException("Completed experiment has no local metrics CSV: " + directory);
                        }
                        ExperimentCsv.writeStatus(directory, job.jobId, terminalStatus, job.completedRuns, job.totalRuns,
                            job.error == null ? null : String.valueOf(job.error.get("message")));
                    } else if ("SUCCEEDED".equals(terminalStatus)) {
                        throw new IOException("Completed experiment has no local export directory: " + directory);
                    }
                } catch (IOException e) {
                    terminalStatus = "FAILED";
                    job.error = Map.of("code", "PERSISTENCE_FAILED",
                        "message", "Cannot persist experiment export status: " + e.getMessage());
                }
                if ("SUCCEEDED".equals(terminalStatus)) {
                    job.result = result;
                    if (isDefaultConfig(job.config)) saveDefaultCache(result);
                } else {
                    Map<String, Object> error = new LinkedHashMap<>(job.error == null
                        ? Map.of("code", "SIMULATION_FAILED", "message", "Experiment did not complete.") : job.error);
                    error.put("completedRuns", job.completedRuns);
                    error.put("totalRuns", job.totalRuns);
                    error.put("note", "Partial exports contain completed runs only, not a successful full experiment. Consult status.json; an interrupted write may leave an incomplete final row.");
                    if (Files.exists(directory.resolve("metrik.csv"))) {
                        error.put("exports", Map.of("metricsCsv", directory.resolve("metrik.csv").toString(),
                            "statusJson", directory.resolve("status.json").toString()));
                    }
                    job.error = error;
                }
                // Publish terminal state only after the worker exits and export status is persisted.
                job.status = terminalStatus;
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
