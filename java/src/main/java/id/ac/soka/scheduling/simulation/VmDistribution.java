package id.ac.soka.scheduling.simulation;

public record VmDistribution(int small, int medium, int large) {
    public VmDistribution {
        if (small < 0 || medium < 0 || large < 0) {
            throw new IllegalArgumentException("VM counts in distribution must be non-negative");
        }
    }

    public int total() {
        return small + medium + large;
    }
}
