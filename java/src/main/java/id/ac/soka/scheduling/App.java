package id.ac.soka.scheduling;

import id.ac.soka.scheduling.api.SimulationHttpApi;
import id.ac.soka.scheduling.simulation.SimulationWorker;

public class App {
    public static void main(String[] args) {
        for (String arg : args) {
            if ("--worker".equals(arg)) {
                SimulationWorker.main(args);
                return;
            }
        }

        int port = 8080;
        for (String arg : args) {
            if (arg.startsWith("--port=")) {
                try {
                    port = Integer.parseInt(arg.substring("--port=".length()));
                } catch (NumberFormatException e) {
                    System.err.println("Invalid port argument: " + arg + ", using 8080.");
                }
            }
        }

        try {
            SimulationHttpApi api = new SimulationHttpApi(port);
            api.start();

            Runtime.getRuntime().addShutdownHook(new Thread(() -> {
                System.out.println("Shutting down HTTP server...");
                api.stop();
            }));

            // Keep main thread alive
            Thread.currentThread().join();
        } catch (Exception e) {
            System.err.println("Failed to start application: " + e.getMessage());
            e.printStackTrace();
            System.exit(1);
        }
    }
}
