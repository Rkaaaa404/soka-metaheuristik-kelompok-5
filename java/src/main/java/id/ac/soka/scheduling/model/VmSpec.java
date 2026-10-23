package id.ac.soka.scheduling.model;

/**
 * Specification of a VM in the simulated infrastructure.
 */
public record VmSpec(
    int id,
    int datacenterIndex,
    int hostIndex,
    String type,
    double nominalMips,
    int pes,
    int ramMb,
    long bandwidth,
    long storageMb
) {
    public VmSpec {
        if (id < 0) throw new IllegalArgumentException("VM id must be non-negative");
        if (datacenterIndex < 0) throw new IllegalArgumentException("Datacenter index must be non-negative");
        if (hostIndex < 0) throw new IllegalArgumentException("Host index must be non-negative");
        if (type == null || type.isBlank()) throw new IllegalArgumentException("VM type must not be blank");
        if (nominalMips <= 0) throw new IllegalArgumentException("Nominal MIPS must be positive");
        if (pes <= 0) throw new IllegalArgumentException("PEs must be positive");
        if (ramMb <= 0) throw new IllegalArgumentException("RAM must be positive");
        if (bandwidth <= 0) throw new IllegalArgumentException("Bandwidth must be positive");
        if (storageMb <= 0) throw new IllegalArgumentException("Storage must be positive");
    }

    public double totalNominalMips() {
        return nominalMips * pes;
    }
}
