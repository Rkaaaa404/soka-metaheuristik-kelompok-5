package id.ac.soka.scheduling.data;

import id.ac.soka.scheduling.model.TaskSpec;

import java.io.BufferedReader;
import java.io.IOException;
import java.io.InputStream;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.Paths;
import java.security.MessageDigest;
import java.security.NoSuchAlgorithmException;
import java.util.*;
import java.util.concurrent.ConcurrentHashMap;

public class GoCjRepository {
    public static final List<String> WHITELISTED_FILES = List.of(
        "GoCJ_Dataset_1000.csv",
        "GoCJ_Dataset_2000.csv",
        "GoCJ_Dataset_3000.csv",
        "GoCJ_Dataset_4000.csv",
        "GoCJ_Dataset_5000.csv",
        "GoCJ_Dataset_6000.csv",
        "GoCJ_Dataset_7000.csv",
        "GoCJ_Dataset_8000.csv",
        "GoCJ_Dataset_9000.csv",
        "GoCJ_Dataset_10000.csv"
    );

    private final Path baseDir;
    private final Map<String, DatasetMeta> metaCache = new ConcurrentHashMap<>();

    public GoCjRepository() {
        this(resolveDefaultDatasetDir());
    }

    private static Path resolveDefaultDatasetDir() {
        Path[] candidates = new Path[] {
            Paths.get("dataset"),
            Paths.get("..", "dataset"),
            Paths.get("gocj_dataset"),
            Paths.get("..", "gocj_dataset")
        };
        for (Path p : candidates) {
            if (Files.isDirectory(p)) {
                return p;
            }
        }
        return Paths.get("dataset");
    }

    public GoCjRepository(Path baseDir) {
        this.baseDir = Objects.requireNonNull(baseDir, "baseDir must not be null");
    }

    public boolean isWhitelisted(String filename) {
        return WHITELISTED_FILES.contains(filename);
    }

    public Path resolvePath(String filename) {
        if (!isWhitelisted(filename)) {
            throw new IllegalArgumentException("Dataset not in whitelist: " + filename);
        }
        Path path = baseDir.resolve(filename).normalize();
        if (!path.startsWith(baseDir.normalize())) {
            throw new SecurityException("Path traversal attempt: " + filename);
        }
        if (!Files.exists(path) || !Files.isRegularFile(path)) {
            throw new NoSuchElementException("Dataset file not found: " + filename);
        }
        return path;
    }

    public DatasetMeta getMetadata(String filename) {
        return metaCache.computeIfAbsent(filename, this::computeMetadata);
    }

    public List<DatasetMeta> listDatasets() {
        List<DatasetMeta> list = new ArrayList<>(WHITELISTED_FILES.size());
        for (String file : WHITELISTED_FILES) {
            try {
                list.add(getMetadata(file));
            } catch (Exception e) {
                // If a file is missing, skip or propagate
            }
        }
        return list;
    }

    private DatasetMeta computeMetadata(String filename) {
        Path path = resolvePath(filename);
        try {
            MessageDigest md = MessageDigest.getInstance("SHA-256");
            int lines = 0;
            try (InputStream is = Files.newInputStream(path)) {
                byte[] buf = new byte[8192];
                int n;
                while ((n = is.read(buf)) != -1) {
                    md.update(buf, 0, n);
                    for (int i = 0; i < n; i++) {
                        if (buf[i] == '\n') {
                            lines++;
                        }
                    }
                }
            }
            byte[] digest = md.digest();
            StringBuilder sb = new StringBuilder();
            for (byte b : digest) {
                sb.append(String.format("%02x", b));
            }
            return new DatasetMeta(filename, lines, sb.toString());
        } catch (NoSuchAlgorithmException | IOException e) {
            throw new RuntimeException("Failed to compute metadata for " + filename + ": " + e.getMessage(), e);
        }
    }

    public List<TaskSpec> loadTasks(String filename, int taskCount) {
        if (taskCount <= 0) {
            throw new IllegalArgumentException("taskCount must be positive: " + taskCount);
        }
        Path path = resolvePath(filename);
        DatasetMeta meta = getMetadata(filename);
        if (taskCount > meta.rowCount()) {
            throw new IllegalArgumentException("taskCount (" + taskCount + ") exceeds file row count (" + meta.rowCount() + ") for " + filename);
        }

        List<TaskSpec> tasks = new ArrayList<>(taskCount);
        try (BufferedReader reader = Files.newBufferedReader(path, StandardCharsets.UTF_8)) {
            String line;
            int lineNumber = 0;
            double prevArrival = 0.0;
            while ((line = reader.readLine()) != null) {
                lineNumber++;
                if (line.isBlank()) {
                    continue;
                }
                String[] parts = line.split(",");
                if (parts.length != 3) {
                    throw new IllegalArgumentException("Malformed CSV line " + lineNumber + " in " + filename + ": expected 3 columns, got " + parts.length);
                }

                long length;
                try {
                    length = Long.parseLong(parts[0].trim());
                } catch (NumberFormatException e) {
                    throw new IllegalArgumentException("Invalid task length at line " + lineNumber + " in " + filename + ": '" + parts[0] + "'");
                }
                if (length <= 0) {
                    throw new IllegalArgumentException("Non-positive task length at line " + lineNumber + " in " + filename + ": " + length);
                }

                int sla;
                try {
                    sla = Integer.parseInt(parts[1].trim());
                } catch (NumberFormatException e) {
                    throw new IllegalArgumentException("Invalid SLA at line " + lineNumber + " in " + filename + ": '" + parts[1] + "'");
                }
                if (sla < 1 || sla > 3) {
                    throw new IllegalArgumentException("SLA out of range (1..3) at line " + lineNumber + " in " + filename + ": " + sla);
                }

                double arrival;
                try {
                    arrival = Double.parseDouble(parts[2].trim());
                } catch (NumberFormatException e) {
                    throw new IllegalArgumentException("Invalid arrival time at line " + lineNumber + " in " + filename + ": '" + parts[2] + "'");
                }
                if (Double.isNaN(arrival) || Double.isInfinite(arrival) || arrival < 0) {
                    throw new IllegalArgumentException("Arrival time must be finite and >= 0 at line " + lineNumber + " in " + filename + ": " + arrival);
                }
                if (arrival < prevArrival) {
                    throw new IllegalArgumentException("Arrival time decreased at line " + lineNumber + " in " + filename + ": " + arrival + " < " + prevArrival);
                }
                prevArrival = arrival;

                int taskId = lineNumber - 1;
                tasks.add(new TaskSpec(taskId, length, sla, arrival));
                if (tasks.size() == taskCount) {
                    break;
                }
            }
        } catch (IOException e) {
            throw new RuntimeException("Failed reading " + filename + ": " + e.getMessage(), e);
        }

        if (tasks.size() < taskCount) {
            throw new IllegalArgumentException("Dataset " + filename + " only contained " + tasks.size() + " tasks, but " + taskCount + " requested");
        }
        return tasks;
    }
}
