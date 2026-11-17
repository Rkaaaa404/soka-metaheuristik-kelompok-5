package id.ac.soka.scheduling.cli;

import id.ac.soka.scheduling.algorithm.BaselineSchedulers;
import id.ac.soka.scheduling.algorithm.CsaScheduler;
import id.ac.soka.scheduling.algorithm.PhsScheduler;
import id.ac.soka.scheduling.api.SimulationHttpApi;
import id.ac.soka.scheduling.data.DatasetMeta;
import id.ac.soka.scheduling.data.GoCjRepository;
import id.ac.soka.scheduling.model.*;
import id.ac.soka.scheduling.simulation.*;

import java.io.FileDescriptor;
import java.io.FileOutputStream;
import java.io.PrintStream;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.Paths;
import java.time.Instant;
import java.util.*;

public class CliRunner {

    // ANSI Escape Codes
    public static final String RESET = "\u001B[0m";
    public static final String BOLD = "\u001B[1m";
    public static final String DIM = "\u001B[2m";
    public static final String RED = "\u001B[31m";
    public static final String GREEN = "\u001B[32m";
    public static final String YELLOW = "\u001B[33m";
    public static final String BLUE = "\u001B[34m";
    public static final String MAGENTA = "\u001B[35m";
    public static final String CYAN = "\u001B[36m";
    public static final String WHITE_BOLD = "\u001B[1;37m";

    private static boolean colorEnabled = true;
    private static final PrintStream OUT = new PrintStream(new FileOutputStream(FileDescriptor.out), true, StandardCharsets.UTF_8);

    public static void main(String[] args) {
        // UTF-8 console output setup
        System.setProperty("file.encoding", "UTF-8");

        // Parse CLI flags
        Map<String, String> flags = parseFlags(args);

        if (flags.containsKey("no-color") || System.getenv("NO_COLOR") != null) {
            colorEnabled = false;
        }

        if (flags.containsKey("help") || flags.containsKey("h")) {
            printHelp();
            return;
        }

        // If direct benchmark arguments are provided, run non-interactively
        if (flags.containsKey("tasks") || flags.containsKey("batch")) {
            int tasks = Integer.parseInt(flags.getOrDefault("tasks", "1000"));
            int runs = Integer.parseInt(flags.getOrDefault("runs", "3"));
            List<String> algos = parseAlgos(flags.get("algos"));
            long seed = Long.parseLong(flags.getOrDefault("seed", "42"));

            runBenchmarkWithHeader(tasks, runs, algos, seed);
            return;
        }

        // Otherwise, launch interactive menu
        runInteractiveMenu();
    }

    private static Map<String, String> parseFlags(String[] args) {
        Map<String, String> flags = new HashMap<>();
        for (String arg : args) {
            if (arg.startsWith("--")) {
                int eq = arg.indexOf('=');
                if (eq > 0) {
                    flags.put(arg.substring(2, eq).trim().toLowerCase(), arg.substring(eq + 1).trim());
                } else {
                    flags.put(arg.substring(2).trim().toLowerCase(), "true");
                }
            }
        }
        return flags;
    }

    private static List<String> parseAlgos(String algosStr) {
        if (algosStr == null || algosStr.isBlank() || "all".equalsIgnoreCase(algosStr)) {
            return List.of("PHS", "CSA", "MinMin", "MaxMin", "SJF", "FCFS", "RR");
        }
        List<String> list = new ArrayList<>();
        for (String s : algosStr.split(",")) {
            String trimmed = s.trim();
            if (!trimmed.isEmpty()) {
                list.add(trimmed);
            }
        }
        return list;
    }

    private static String c(String code, String text) {
        if (!colorEnabled) return text;
        return code + text + RESET;
    }

    private static void printBanner() {
        OUT.println(c(CYAN, "╔════════════════════════════════════════════════════════════════════════════════════════════╗"));
        OUT.println(c(CYAN, "║") + c(WHITE_BOLD, "  ⚡ SOKA TASK 5 — CLOUDSIM METAHEURISTIC TASK SCHEDULING BENCHMARK (KELOMPOK 5)     ") + c(CYAN, "║"));
        OUT.println(c(CYAN, "║") + c(YELLOW,     "  Clonal Selection (CSA) & Polyrhythmic Harmony Search (PHS) vs Heuristics Baselines  ") + c(CYAN, "║"));
        OUT.println(c(CYAN, "╚════════════════════════════════════════════════════════════════════════════════════════════╝"));
        OUT.println(" " + c(CYAN, "ℹ") + " Engine: CloudSim 7.0.1 | Dataset: GoCJ (Google Cloud Jobs) | Topology: 2 DCs, 50 VMs");
        OUT.println(" " + c(CYAN, "ℹ") + " Standar Evaluasi: " + c(WHITE_BOLD, "Minimal 3 Kali Rerun") + " per skenario (Hasil dirata-rata Mean ± SD)\n");
    }

    private static void printHelp() {
        printBanner();
        OUT.println("PENGGUNAAN:");
        OUT.println("  ./gradlew.bat runCli                       (Menjalankan menu interaktif)");
        OUT.println("  ./gradlew.bat runCli --args=\"--tasks=1000 --runs=3\"  (Eksekusi instan)");
        OUT.println("\nOPSI FLAG:");
        OUT.println("  --tasks=<N>      Jumlah tasks GoCJ: 1000, 2000, ..., 10000 (default: 1000)");
        OUT.println("  --runs=<R>       Jumlah iterasi rerun untuk rata-rata: minimal 3 (default: 3)");
        OUT.println("  --algos=<list>   Daftar algoritma dipisah koma (contoh: PHS,CSA,MinMin,SJF,FCFS) atau 'all'");
        OUT.println("  --seed=<S>       Seed awal generator acak (default: 42)");
        OUT.println("  --no-color       Nonaktifkan warna ANSI di terminal");
        OUT.println("  --help, -h       Tampilkan panduan bantuan ini");
    }

    private static void runInteractiveMenu() {
        Scanner scanner = new Scanner(System.in, StandardCharsets.UTF_8);

        while (true) {
            printBanner();
            OUT.println(c(BOLD, "┌── PILIH SKENARIO SIMULASI CLOUDSIM ────────────────────────────────────────────────────────┐"));
            OUT.println("│ " + c(GREEN,  "[1]") + " ⚡ " + c(BOLD, "Quick Benchmark") + "     : 1,000 Tasks  (GoCJ-1000)  — 3 Rerun [~3 detik]                 │");
            OUT.println("│ " + c(YELLOW, "[2]") + " ⚖️  " + c(BOLD, "Medium Benchmark") + "    : 5,000 Tasks  (GoCJ-5000)  — 3 Rerun [~15 detik]                │");
            OUT.println("│ " + c(RED,    "[3]") + " 🚀 " + c(BOLD, "Full Stress Test") + "    : 10,000 Tasks (GoCJ-10000) — 3 Rerun [~45 detik]                │");
            OUT.println("│ " + c(CYAN,   "[4]") + " 🔬 " + c(BOLD, "Full Academic Suite") + " : Jalankan 1k, 5k, dan 10k task secara berurutan            │");
            OUT.println("│ " + c(MAGENTA,"[5]") + " ⚙️  " + c(BOLD, "Custom Benchmark") + "    : Konfigurasi manual (jumlah task, runs, algoritma)          │");
            OUT.println("│ " + c(BLUE,   "[6]") + " 🌐 " + c(BOLD, "Start Web Server") + "    : Jalankan HTTP Server & Slide Presentasi (:8080)            │");
            OUT.println("│ " + c(DIM,    "[0]") + " ❌ " + c(DIM,  "Keluar") + "                                                                                │");
            OUT.println(c(BOLD, "└────────────────────────────────────────────────────────────────────────────────────────────┘"));
            OUT.print(c(WHITE_BOLD, "Masukkan pilihan [0-6]: "));

            String input = scanner.hasNextLine() ? scanner.nextLine().trim() : "0";
            OUT.println();

            switch (input) {
                case "1" -> runBenchmarkWithHeader(1000, 3, List.of("PHS", "CSA", "MinMin", "MaxMin", "SJF", "FCFS", "RR"), 42L);
                case "2" -> runBenchmarkWithHeader(5000, 3, List.of("PHS", "CSA", "MinMin", "MaxMin", "SJF", "FCFS", "RR"), 42L);
                case "3" -> runBenchmarkWithHeader(10000, 3, List.of("PHS", "CSA", "MinMin", "MaxMin", "SJF", "FCFS", "RR"), 42L);
                case "4" -> {
                    OUT.println(c(WHITE_BOLD, "=== Menjalankan Rangkaian Pengujian Akademik Lengkap (1000, 5000, 10000 tasks) ==="));
                    runBenchmarkWithHeader(1000, 3, List.of("PHS", "CSA", "MinMin", "MaxMin", "SJF", "FCFS", "RR"), 42L);
                    runBenchmarkWithHeader(5000, 3, List.of("PHS", "CSA", "MinMin", "MaxMin", "SJF", "FCFS", "RR"), 42L);
                    runBenchmarkWithHeader(10000, 3, List.of("PHS", "CSA", "MinMin", "MaxMin", "SJF", "FCFS", "RR"), 42L);
                }
                case "5" -> {
                    OUT.print("Masukkan jumlah task (1000 - 10000): ");
                    int tasks = parsePositiveInt(scanner.nextLine(), 1000);
                    OUT.print("Masukkan jumlah rerun (rekomendasi >= 3): ");
                    int runs = parsePositiveInt(scanner.nextLine(), 3);
                    OUT.print("Algoritma (tekan ENTER untuk semua 7 algoritma): ");
                    String algoInput = scanner.nextLine().trim();
                    List<String> algos = parseAlgos(algoInput);
                    runBenchmarkWithHeader(tasks, runs, algos, 42L);
                }
                case "6" -> {
                    OUT.println(c(GREEN, "▶ Menyalakan HTTP API & Static Presentation Server di http://localhost:8080 ..."));
                    OUT.println(c(DIM, "Tekan Ctrl+C di terminal ini untuk berhenti.\n"));
                    try {
                        SimulationHttpApi api = new SimulationHttpApi(8080);
                        api.start();
                        Thread.currentThread().join();
                    } catch (Exception e) {
                        OUT.println(c(RED, "Gagal menjalankan server: " + e.getMessage()));
                    }
                    return;
                }
                case "0", "exit", "quit" -> {
                    OUT.println("Terima kasih telah menggunakan CloudSim Benchmark Runner Kelompok 5. Sampai jumpa!");
                    return;
                }
                default -> OUT.println(c(RED, "Pilihan tidak valid, silakan coba lagi."));
            }

            OUT.println("\nTekan ENTER untuk kembali ke menu...");
            if (scanner.hasNextLine()) scanner.nextLine();
            OUT.println("\n--------------------------------------------------------------------------------\n");
        }
    }

    private static int parsePositiveInt(String input, int defaultVal) {
        try {
            int val = Integer.parseInt(input.trim());
            return val > 0 ? val : defaultVal;
        } catch (Exception e) {
            return defaultVal;
        }
    }

    private static void runBenchmarkWithHeader(int taskCount, int runs, List<String> algorithms, long seed) {
        String datasetName = "GoCJ_Dataset_" + taskCount + ".csv";
        ScenarioConfig config = ScenarioConfig.create(
            datasetName,
            algorithms,
            taskCount,
            2,  // datacenters
            5,  // hostsPerDatacenter
            null, // vmsPerDatacenter
            new VmDistribution(2, 2, 1),
            runs,
            seed,
            null,
            null
        );

        runBenchmark(config);
    }

    public static void runBenchmark(ScenarioConfig config) {
        GoCjRepository repo = new GoCjRepository();
        List<TaskSpec> tasks;
        DatasetMeta meta;
        try {
            tasks = repo.loadTasks(config.dataset(), config.taskCount());
            meta = repo.getMetadata(config.dataset());
        } catch (Exception e) {
            OUT.println(c(RED, "✖ Gagal memuat dataset " + config.dataset() + ": " + e.getMessage()));
            return;
        }

        List<VmSpec> vms = ScenarioFactory.buildVmSpecs(config);
        int totalHosts = config.datacenters() * config.hostsPerDatacenter();
        String jobId = "cli-" + config.taskCount() + "t-" + System.currentTimeMillis();
        Path resultsRoot = resolveResultsRoot();

        OUT.println(c(WHITE_BOLD, "▶ KONFIGURASI SIMULASI:"));
        OUT.printf("  • Dataset          : %s (%s tasks, SHA-256: %s)%n",
            c(CYAN, config.dataset()), c(BOLD, String.valueOf(config.taskCount())), c(DIM, meta.sha256().substring(0, 16) + "..."));
        OUT.printf("  • Topologi Cloud   : %d Datacenters, %d Hosts, %d VMs (20 Small, 20 Medium, 10 Large)%n",
            config.datacenters(), totalHosts, vms.size());
        OUT.printf("  • Iterasi Pengujian: %s Rerun per algoritma (Rata-rata Mean ± SD)%n", c(BOLD, String.valueOf(config.runs())));
        OUT.printf("  • Algoritma Diuji  : %s%n", c(YELLOW, String.join(", ", config.algorithms())));
        OUT.printf("  • Job ID & Logging : %s%n%n", c(DIM, jobId));

        AlgorithmOptions options = new AlgorithmOptions(config.csa(), config.phs());
        List<AlgorithmBenchmarkResult> results = new ArrayList<>();

        long totalStartNs = System.nanoTime();

        try (ExperimentCsv export = new ExperimentCsv(resultsRoot, jobId, config, meta.sha256())) {
            int algoIndex = 1;
            int totalAlgos = config.algorithms().size();

            for (String algo : config.algorithms()) {
                String algoLabel = formatAlgoName(algo);
                OUT.printf("  [%d/%d] %-35s ", algoIndex++, totalAlgos, c(WHITE_BOLD, algoLabel));

                List<Map<String, Double>> singleMetrics = new ArrayList<>();
                long algoStartNs = System.nanoTime();

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

                    long schedStart = System.nanoTime();
                    SchedulePlan plan = scheduler.schedule(tasks, vms, options, runSeed);
                    long schedElapsed = System.nanoTime() - schedStart;
                    double schedTimeMs = schedElapsed / 1_000_000.0;

                    SimulationRunResult simResult = CloudSimRunner.runSimulation(tasks, vms, plan, config);
                    Map<String, Double> metrics = MetricsCalculator.computeSingleRun(simResult.allocations(), vms, schedTimeMs);
                    singleMetrics.add(metrics);

                    DecodedSchedule dec = ScheduleDecoder.decode(tasks, vms, plan, totalHosts);
                    export.append(algo, r, runSeed, metrics, dec.energyJoules());

                    OUT.print(c(GREEN, "R" + (r + 1) + "✓ "));
                }

                double algoElapsedSec = (System.nanoTime() - algoStartNs) / 1_000_000_000.0;
                OUT.printf(c(CYAN, "→ Selesai (%.2fs)%n"), algoElapsedSec);

                Map<String, MetricValue> aggregated = MetricsCalculator.aggregateRuns(singleMetrics);
                results.add(new AlgorithmBenchmarkResult(algo, aggregated));
            }

            export.complete();

            double totalElapsedSec = (System.nanoTime() - totalStartNs) / 1_000_000_000.0;
            OUT.printf("%n" + c(GREEN, "✔ Seluruh simulasi selesai dengan sukses!") + " (Total waktu: %.2fs)%n", totalElapsedSec);
            OUT.printf("  Hasil CSV tersimpan di: %s%n%n", c(CYAN, export.metadata().get("metricsCsv").toString()));

            printResultsTable(results, config.runs());

        } catch (Exception e) {
            OUT.println(c(RED, "\n✖ Terjadi kesalahan saat simulasi: " + e.getMessage()));
            e.printStackTrace(OUT);
        }
    }

    private static String formatAlgoName(String algo) {
        return switch (algo) {
            case "PHS" -> "PHS (Polyrhythmic Harmony Search)";
            case "CSA" -> "CSA (Clonal Selection Algorithm)";
            case "MinMin" -> "Min-Min Heuristic";
            case "MaxMin" -> "Max-Min Heuristic";
            case "SJF" -> "Shortest Job First (SJF)";
            case "FCFS" -> "First-Come First-Served (FCFS)";
            case "RR" -> "Round Robin (RR)";
            default -> algo;
        };
    }

    private record AlgorithmBenchmarkResult(String algorithm, Map<String, MetricValue> metrics) {}

    private static void printResultsTable(List<AlgorithmBenchmarkResult> results, int runs) {
        if (results.isEmpty()) return;

        // Metric keys we want to show in summary table
        // 1. Makespan (s) - min
        // 2. Avg Waiting Time (s) - min
        // 3. Resource Utilization (%) - max
        // 4. Degree of Imbalance - min
        // 5. Total Cost (G$) - min
        // 6. Scheduling Time (ms) - min

        double bestMakespan = Double.MAX_VALUE;
        double bestWaiting = Double.MAX_VALUE;
        double bestUtil = -1.0;
        double bestImbalance = Double.MAX_VALUE;
        double bestCost = Double.MAX_VALUE;
        double bestSchedTime = Double.MAX_VALUE;

        for (AlgorithmBenchmarkResult r : results) {
            MetricValue mk = r.metrics.get(MetricsCalculator.MAKESPAN);
            if (mk != null && mk.mean() < bestMakespan) bestMakespan = mk.mean();

            MetricValue wt = r.metrics.get(MetricsCalculator.AVG_WAITING_TIME);
            if (wt != null && wt.mean() < bestWaiting) bestWaiting = wt.mean();

            MetricValue ut = r.metrics.get(MetricsCalculator.RESOURCE_UTILIZATION);
            if (ut != null && ut.mean() > bestUtil) bestUtil = ut.mean();

            MetricValue im = r.metrics.get(MetricsCalculator.DEGREE_OF_IMBALANCE);
            if (im != null && im.mean() < bestImbalance) bestImbalance = im.mean();

            MetricValue co = r.metrics.get(MetricsCalculator.TOTAL_COST);
            if (co != null && co.mean() < bestCost) bestCost = co.mean();

            MetricValue st = r.metrics.get(MetricsCalculator.SCHEDULING_TIME);
            if (st != null && st.mean() < bestSchedTime) bestSchedTime = st.mean();
        }

        int colAlgo = 9;
        int colMk = 19;
        int colWt = 19;
        int colUt = 16;
        int colIm = 16;
        int colCo = 15;
        int colSt = 15;

        // Inner width is sum of (col + 2) for each column + (numCols - 1) for intermediate separators
        int totalInnerWidth = (colAlgo + 2) + (colMk + 2) + (colWt + 2) + (colUt + 2) + (colIm + 2) + (colCo + 2) + (colSt + 2) + 6;
        String title = String.format("TABEL HASIL BENCHMARK METRIK CLOUDSIM (RATA-RATA DARI %d RERUN)", runs);
        int padLeft = Math.max(0, (totalInnerWidth - 2 - title.length()) / 2);
        int padRight = Math.max(0, totalInnerWidth - 2 - title.length() - padLeft);
        String headerTitle = " ".repeat(padLeft) + title + " ".repeat(padRight);

        OUT.println(c(BOLD, "┌" + "─".repeat(totalInnerWidth) + "┐"));
        OUT.println("│ " + c(WHITE_BOLD, headerTitle) + " │");
        OUT.println(c(BOLD, "├" + "─".repeat(colAlgo + 2) + "┬" + "─".repeat(colMk + 2) + "┬" + "─".repeat(colWt + 2) + "┬" +
            "─".repeat(colUt + 2) + "┬" + "─".repeat(colIm + 2) + "┬" + "─".repeat(colCo + 2) + "┬" + "─".repeat(colSt + 2) + "┤"));
        OUT.println("│ " + c(WHITE_BOLD, padRight("Algoritma", colAlgo)) + " │ " +
            c(WHITE_BOLD, padRight("Makespan (s)", colMk)) + " │ " +
            c(WHITE_BOLD, padRight("Avg Waiting (s)", colWt)) + " │ " +
            c(WHITE_BOLD, padRight("Utilization (%)", colUt)) + " │ " +
            c(WHITE_BOLD, padRight("Degree Imbalance", colIm)) + " │ " +
            c(WHITE_BOLD, padRight("Total Cost (G$)", colCo)) + " │ " +
            c(WHITE_BOLD, padRight("Sched Time (ms)", colSt)) + " │");
        OUT.println(c(BOLD, "├" + "─".repeat(colAlgo + 2) + "┼" + "─".repeat(colMk + 2) + "┼" + "─".repeat(colWt + 2) + "┼" +
            "─".repeat(colUt + 2) + "┼" + "─".repeat(colIm + 2) + "┼" + "─".repeat(colCo + 2) + "┼" + "─".repeat(colSt + 2) + "┤"));

        for (AlgorithmBenchmarkResult res : results) {
            String algo = res.algorithm;
            MetricValue mk = res.metrics.get(MetricsCalculator.MAKESPAN);
            MetricValue wt = res.metrics.get(MetricsCalculator.AVG_WAITING_TIME);
            MetricValue ut = res.metrics.get(MetricsCalculator.RESOURCE_UTILIZATION);
            MetricValue im = res.metrics.get(MetricsCalculator.DEGREE_OF_IMBALANCE);
            MetricValue co = res.metrics.get(MetricsCalculator.TOTAL_COST);
            MetricValue st = res.metrics.get(MetricsCalculator.SCHEDULING_TIME);

            boolean isBestMakespan = mk != null && Math.abs(mk.mean() - bestMakespan) < 1e-4;
            boolean isBestWaiting = wt != null && Math.abs(wt.mean() - bestWaiting) < 1e-4;
            boolean isBestUtil = ut != null && Math.abs(ut.mean() - bestUtil) < 1e-4;
            boolean isBestImbalance = im != null && Math.abs(im.mean() - bestImbalance) < 1e-4;
            boolean isBestCost = co != null && Math.abs(co.mean() - bestCost) < 1e-4;
            boolean isBestSched = st != null && Math.abs(st.mean() - bestSchedTime) < 1e-4;

            String algoCell = c(WHITE_BOLD, padRight(algo, colAlgo));
            String mkStr = formatCell(mk, isBestMakespan, "%.1f", colMk);
            String wtStr = formatCell(wt, isBestWaiting, "%.1f", colWt);
            String utStr = formatCell(ut, isBestUtil, "%.1f%%", colUt);
            String imStr = formatCell(im, isBestImbalance, "%.2f", colIm);
            String coStr = formatCell(co, isBestCost, "%.1f", colCo);
            String stStr = formatCell(st, isBestSched, "%.0f", colSt);

            OUT.println("│ " + algoCell + " │ " + mkStr + " │ " + wtStr + " │ " + utStr + " │ " + imStr + " │ " + coStr + " │ " + stStr + " │");
        }

        OUT.println(c(BOLD, "└" + "─".repeat(colAlgo + 2) + "┴" + "─".repeat(colMk + 2) + "┴" + "─".repeat(colWt + 2) + "┴" +
            "─".repeat(colUt + 2) + "┴" + "─".repeat(colIm + 2) + "┴" + "─".repeat(colCo + 2) + "┴" + "─".repeat(colSt + 2) + "┘"));
        OUT.println(" " + c(GREEN, "★") + " = Nilai terbaik di kolom tersebut (Makespan & Waiting terendah, Utilisasi tertinggi, Imbalance terendah)");
        OUT.println(" Catatan: Format angka adalah " + c(BOLD, "Mean ± StdDev") + " dari hasil rerun.");
    }

    private static String formatCell(MetricValue mv, boolean isBest, String numberFormat, int width) {
        if (mv == null) return padRight("-", width);
        String valStr = String.format(Locale.US, numberFormat, mv.mean());
        String sdStr = String.format(Locale.US, numberFormat, mv.stddev());
        String display = valStr + " ± " + sdStr;
        if (isBest) {
            display += " ★";
        }
        String padded = padRight(display, width);
        return isBest ? c(GREEN, padded) : padded;
    }

    private static String padRight(String text, int width) {
        if (text.length() >= width) return text;
        return text + " ".repeat(width - text.length());
    }

    private static Path resolveResultsRoot() {
        Path[] candidates = new Path[] {
            Paths.get("build", "results"),
            Paths.get("java", "build", "results"),
            Paths.get("..", "build", "results")
        };
        for (Path p : candidates) {
            if (Files.isDirectory(p.getParent())) {
                return p;
            }
        }
        return Paths.get("build", "results");
    }
}
