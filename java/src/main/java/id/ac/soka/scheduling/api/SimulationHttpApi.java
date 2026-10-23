package id.ac.soka.scheduling.api;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.sun.net.httpserver.HttpExchange;
import com.sun.net.httpserver.HttpHandler;
import com.sun.net.httpserver.HttpServer;
import id.ac.soka.scheduling.data.DatasetMeta;
import id.ac.soka.scheduling.data.GoCjRepository;
import id.ac.soka.scheduling.model.TaskSpec;
import id.ac.soka.scheduling.simulation.InsufficientCapacityException;
import id.ac.soka.scheduling.simulation.ScenarioConfig;
import id.ac.soka.scheduling.simulation.SimulationJobService;

import java.io.*;
import java.net.InetSocketAddress;
import java.net.URLDecoder;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.Paths;
import java.util.*;

public class SimulationHttpApi {
    private static final ObjectMapper MAPPER = new ObjectMapper();
    private static final int MAX_BODY_BYTES = 64 * 1024;

    private final int port;
    private final GoCjRepository repo;
    private final SimulationJobService jobService;
    private final Path webRoot;
    private final Path docsRoot;

    private HttpServer server;

    public SimulationHttpApi(int port) {
        this(port, new GoCjRepository(), new SimulationJobService(), resolveWebRoot(), resolveDocsRoot());
    }

    public SimulationHttpApi(int port, GoCjRepository repo, SimulationJobService jobService, Path webRoot, Path docsRoot) {
        this.port = port;
        this.repo = repo;
        this.jobService = jobService;
        this.webRoot = webRoot;
        this.docsRoot = docsRoot;
    }

    private static Path resolveWebRoot() {
        Path[] paths = {
            Paths.get("web"),
            Paths.get("..", "web"),
            Paths.get("src", "main", "resources", "web")
        };
        for (Path p : paths) {
            if (Files.isDirectory(p)) return p;
        }
        return Paths.get("web");
    }

    private static Path resolveDocsRoot() {
        Path[] paths = {
            Paths.get("docs"),
            Paths.get("..", "docs")
        };
        for (Path p : paths) {
            if (Files.isDirectory(p)) return p;
        }
        return Paths.get("docs");
    }

    public void start() throws IOException {
        server = HttpServer.create(new InetSocketAddress("127.0.0.1", port), 0);

        // API endpoints
        server.createContext("/api/datasets", this::handleDatasets);
        server.createContext("/api/simulate", this::handleSimulate);
        server.createContext("/api/simulations/", this::handleSimulationStatus);
        server.createContext("/api/default-result", this::handleDefaultResult);

        // Docs / PDF route
        server.createContext("/docs/", this::handleDocs);

        // Static files (slides)
        server.createContext("/", this::handleStatic);

        server.setExecutor(null);
        server.start();
        System.out.println("HTTP Server started at http://localhost:" + port);
    }

    public void stop() {
        if (server != null) {
            server.stop(0);
        }
    }

    private void handleDatasets(HttpExchange exchange) throws IOException {
        if (!"GET".equalsIgnoreCase(exchange.getRequestMethod())) {
            sendError(exchange, 405, "METHOD_NOT_ALLOWED", "Only GET method is supported");
            return;
        }

        String path = exchange.getRequestURI().getPath();
        // Check if /api/datasets/{filename}/tasks
        if (path.startsWith("/api/datasets/") && path.contains("/tasks")) {
            String[] parts = path.split("/");
            if (parts.length >= 5) {
                String filename = parts[3];
                int limit = 8;
                String query = exchange.getRequestURI().getQuery();
                if (query != null && query.contains("limit=")) {
                    try {
                        String[] qParts = query.split("&");
                        for (String q : qParts) {
                            if (q.startsWith("limit=")) {
                                limit = Integer.parseInt(q.substring("limit=".length()));
                            }
                        }
                    } catch (Exception ignored) {}
                }
                limit = Math.max(1, Math.min(10000, limit));

                try {
                    List<TaskSpec> tasks = repo.loadTasks(filename, limit);
                    sendJson(exchange, 200, Map.of(
                        "dataset", filename,
                        "limit", limit,
                        "tasks", tasks
                    ));
                    return;
                } catch (IllegalArgumentException | NoSuchElementException e) {
                    sendError(exchange, 404, "DATASET_NOT_FOUND", e.getMessage());
                    return;
                }
            }
        }

        // List datasets
        List<DatasetMeta> datasets = repo.listDatasets();
        sendJson(exchange, 200, Map.of("datasets", datasets));
    }

    private void handleSimulate(HttpExchange exchange) throws IOException {
        if (!"POST".equalsIgnoreCase(exchange.getRequestMethod())) {
            sendError(exchange, 405, "METHOD_NOT_ALLOWED", "Only POST method is supported");
            return;
        }

        byte[] body = readRequestBody(exchange);
        if (body.length > MAX_BODY_BYTES) {
            sendError(exchange, 400, "REQUEST_TOO_LARGE", "Request payload exceeds 64 KiB");
            return;
        }

        ScenarioConfig config;
        try {
            config = MAPPER.readValue(body, ScenarioConfig.class);
        } catch (Exception e) {
            sendError(exchange, 400, "INVALID_REQUEST", "Malformed JSON request or invalid parameter: " + e.getMessage());
            return;
        }
        // Validate dataset whitelist and rowcount
        if (!repo.isWhitelisted(config.dataset())) {
            sendError(exchange, 404, "DATASET_NOT_FOUND", "Dataset not in whitelist: " + config.dataset());
            return;
        }
        try {
            DatasetMeta meta = repo.getMetadata(config.dataset());
            if (config.taskCount() > meta.rowCount()) {
                sendError(exchange, 400, "INVALID_TASK_COUNT", "taskCount (" + config.taskCount() + ") exceeds file row count (" + meta.rowCount() + ")");
                return;
            }
        } catch (Exception e) {
            sendError(exchange, 404, "DATASET_NOT_FOUND", e.getMessage());
            return;
        }

        // Check capacity beforehand
        try {
            id.ac.soka.scheduling.simulation.ScenarioFactory.buildVmSpecs(config);
        } catch (InsufficientCapacityException e) {
            sendError(exchange, 422, "INSUFFICIENT_CAPACITY", e.getMessage());
            return;
        } catch (Exception e) {
            sendError(exchange, 400, "INVALID_REQUEST", e.getMessage());
            return;
        }

        try {
            SimulationJobService.JobState job = jobService.submitJob(config);
            sendJson(exchange, 202, Map.of(
                "jobId", job.jobId,
                "status", job.status
            ));
        } catch (IllegalStateException e) {
            sendError(exchange, 409, "SIMULATION_BUSY", "A simulation job is currently in progress. Please wait.");
        } catch (Exception e) {
            sendError(exchange, 500, "INTERNAL_ERROR", e.getMessage());
        }
    }

    private void handleSimulationStatus(HttpExchange exchange) throws IOException {
        if (!"GET".equalsIgnoreCase(exchange.getRequestMethod())) {
            sendError(exchange, 405, "METHOD_NOT_ALLOWED", "Only GET method is supported");
            return;
        }

        String path = exchange.getRequestURI().getPath();
        String jobId = path.substring("/api/simulations/".length());
        if (jobId.isBlank()) {
            sendError(exchange, 400, "INVALID_JOB_ID", "Job ID must not be blank");
            return;
        }

        try {
            SimulationJobService.JobState job = jobService.getJob(jobId);
            Map<String, Object> resp = new LinkedHashMap<>();
            resp.put("jobId", job.jobId);
            resp.put("status", job.status);
            resp.put("completedRuns", job.completedRuns);
            resp.put("totalRuns", job.totalRuns);
            resp.put("currentAlgorithm", job.currentAlgorithm);
            resp.put("currentRun", job.currentRun);
            if ("SUCCEEDED".equals(job.status)) {
                resp.put("result", job.result);
            }
            if ("FAILED".equals(job.status) || "TIMED_OUT".equals(job.status)) {
                resp.put("error", job.error);
            }

            sendJson(exchange, 200, resp);
        } catch (NoSuchElementException e) {
            sendError(exchange, 404, "JOB_NOT_FOUND", "Simulation job not found: " + jobId + ". Please re-run.");
        }
    }

    private void handleDefaultResult(HttpExchange exchange) throws IOException {
        if (!"GET".equalsIgnoreCase(exchange.getRequestMethod())) {
            sendError(exchange, 405, "METHOD_NOT_ALLOWED", "Only GET method is supported");
            return;
        }

        Map<String, Object> cached = jobService.getCachedDefault();
        if (cached != null) {
            sendJson(exchange, 200, cached);
            return;
        }

        // Not cached: start default job
        try {
            SimulationJobService.JobState job = jobService.submitJob(ScenarioConfig.defaults());
            sendJson(exchange, 202, Map.of(
                "jobId", job.jobId,
                "status", job.status,
                "message", "Default simulation started."
            ));
        } catch (IllegalStateException e) {
            sendError(exchange, 409, "SIMULATION_BUSY", "Another simulation is currently running.");
        } catch (Exception e) {
            sendError(exchange, 500, "INTERNAL_ERROR", e.getMessage());
        }
    }

    private void handleDocs(HttpExchange exchange) throws IOException {
        if (!"GET".equalsIgnoreCase(exchange.getRequestMethod())) {
            sendError(exchange, 405, "METHOD_NOT_ALLOWED", "Only GET method is supported");
            return;
        }

        String rawPath = exchange.getRequestURI().getPath();
        String subPath = URLDecoder.decode(rawPath.substring("/docs/".length()), StandardCharsets.UTF_8);
        if (subPath.isBlank() || subPath.contains("..")) {
            sendError(exchange, 400, "BAD_REQUEST", "Invalid file path");
            return;
        }

        Path target = docsRoot.resolve(subPath).normalize();
        if (!target.startsWith(docsRoot.normalize()) || !Files.exists(target) || !Files.isRegularFile(target)) {
            sendError(exchange, 404, "FILE_NOT_FOUND", "Document not found: " + subPath);
            return;
        }

        String contentType = "application/octet-stream";
        if (subPath.endsWith(".pdf")) contentType = "application/pdf";
        else if (subPath.endsWith(".md")) contentType = "text/markdown; charset=UTF-8";

        byte[] bytes = Files.readAllBytes(target);
        exchange.getResponseHeaders().set("Content-Type", contentType);
        exchange.sendResponseHeaders(200, bytes.length);
        try (OutputStream os = exchange.getResponseBody()) {
            os.write(bytes);
        }
    }

    private void handleStatic(HttpExchange exchange) throws IOException {
        if (!"GET".equalsIgnoreCase(exchange.getRequestMethod())) {
            sendError(exchange, 405, "METHOD_NOT_ALLOWED", "Only GET method is supported");
            return;
        }

        String path = exchange.getRequestURI().getPath();
        if ("/".equals(path) || path.isBlank()) {
            path = "index.html";
        } else if (path.startsWith("/")) {
            path = path.substring(1);
        }

        Path target = webRoot.resolve(path).normalize();
        if (!target.startsWith(webRoot.normalize()) || !Files.exists(target) || !Files.isRegularFile(target)) {
            sendError(exchange, 404, "NOT_FOUND", "Resource not found: " + path);
            return;
        }

        String contentType = "application/octet-stream";
        if (path.endsWith(".html")) contentType = "text/html; charset=UTF-8";
        else if (path.endsWith(".css")) contentType = "text/css; charset=UTF-8";
        else if (path.endsWith(".js")) contentType = "application/javascript; charset=UTF-8";
        else if (path.endsWith(".svg")) contentType = "image/svg+xml";
        else if (path.endsWith(".json")) contentType = "application/json; charset=UTF-8";

        byte[] bytes = Files.readAllBytes(target);
        exchange.getResponseHeaders().set("Content-Type", contentType);
        exchange.sendResponseHeaders(200, bytes.length);
        try (OutputStream os = exchange.getResponseBody()) {
            os.write(bytes);
        }
    }

    private static byte[] readRequestBody(HttpExchange exchange) throws IOException {
        try (InputStream is = exchange.getRequestBody();
             ByteArrayOutputStream baos = new ByteArrayOutputStream()) {
            byte[] buf = new byte[4096];
            int n;
            while ((n = is.read(buf)) != -1) {
                baos.write(buf, 0, n);
                if (baos.size() > MAX_BODY_BYTES + 1024) break;
            }
            return baos.toByteArray();
        }
    }

    private static void sendJson(HttpExchange exchange, int statusCode, Object data) throws IOException {
        byte[] bytes = MAPPER.writeValueAsBytes(data);
        exchange.getResponseHeaders().set("Content-Type", "application/json; charset=UTF-8");
        exchange.sendResponseHeaders(statusCode, bytes.length);
        try (OutputStream os = exchange.getResponseBody()) {
            os.write(bytes);
        }
    }

    private static void sendError(HttpExchange exchange, int statusCode, String code, String message) throws IOException {
        Map<String, Object> err = Map.of(
            "error", Map.of(
                "code", code,
                "message", message
            )
        );
        sendJson(exchange, statusCode, err);
    }
}
