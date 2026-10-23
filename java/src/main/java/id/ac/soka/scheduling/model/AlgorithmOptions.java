package id.ac.soka.scheduling.model;

public record AlgorithmOptions(CsaOptions csa, PhsOptions phs) {
    public AlgorithmOptions {
        if (csa == null) csa = CsaOptions.defaults();
        if (phs == null) phs = PhsOptions.defaults();
    }

    public static AlgorithmOptions defaults() {
        return new AlgorithmOptions(CsaOptions.defaults(), PhsOptions.defaults());
    }

    public record CsaOptions(int population, int selected, int generations, double beta, double timeWeight) {
        public static CsaOptions defaults() {
            return new CsaOptions(30, 10, 200, 1.0, 0.5);
        }

        public CsaOptions {
            if (population < 2 || population > 100) {
                throw new IllegalArgumentException("population must be 2..100, got: " + population);
            }
            if (selected < 1 || selected > population) {
                throw new IllegalArgumentException("selected must be 1..population, got: " + selected);
            }
            if (generations < 1 || generations > 10000) {
                throw new IllegalArgumentException("generations must be 1..10000, got: " + generations);
            }
            if (beta <= 0 || beta > 5) {
                throw new IllegalArgumentException("beta must be (0, 5], got: " + beta);
            }
            if (timeWeight < 0 || timeWeight > 1) {
                throw new IllegalArgumentException("timeWeight must be [0, 1], got: " + timeWeight);
            }
        }
    }

    public record PhsOptions(int memorySize, int iterations, int improvisations) {
        public static PhsOptions defaults() {
            return new PhsOptions(10, 200, 3);
        }

        public PhsOptions {
            if (memorySize < 2 || memorySize > 50) {
                throw new IllegalArgumentException("memorySize must be 2..50, got: " + memorySize);
            }
            if (iterations < 1 || iterations > 10000) {
                throw new IllegalArgumentException("iterations must be 1..10000, got: " + iterations);
            }
            if (improvisations < 1 || improvisations > 10) {
                throw new IllegalArgumentException("improvisations must be 1..10, got: " + improvisations);
            }
        }
    }
}
