package id.ac.soka.scheduling.model;

/**
 * Specification for a task parsed from dataset.
 * id: 0-indexed line number (line number minus one).
 * lengthMi: task workload length in MI (Million Instructions).
 * sla: SLA class, domain 1..3.
 * arrivalTime: arrival time in seconds from workload epoch.
 */
public record TaskSpec(int id, long lengthMi, int sla, double arrivalTime) {
    public TaskSpec {
        if (id < 0) {
            throw new IllegalArgumentException("Task id must be non-negative: " + id);
        }
        if (lengthMi <= 0) {
            throw new IllegalArgumentException("Task length must be positive: " + lengthMi);
        }
        if (sla < 1 || sla > 3) {
            throw new IllegalArgumentException("SLA must be between 1 and 3: " + sla);
        }
        if (Double.isNaN(arrivalTime) || Double.isInfinite(arrivalTime) || arrivalTime < 0) {
            throw new IllegalArgumentException("Arrival time must be finite and non-negative: " + arrivalTime);
        }
    }
}
