package id.ac.soka.scheduling.data;

/**
 * Metadata descriptor for a GoCJ dataset file.
 */
public record DatasetMeta(String filename, int rowCount, String sha256) {
    public DatasetMeta {
        if (filename == null || filename.isBlank()) throw new IllegalArgumentException("filename must not be blank");
        if (rowCount <= 0) throw new IllegalArgumentException("rowCount must be positive");
        if (sha256 == null || sha256.isBlank()) throw new IllegalArgumentException("sha256 must not be blank");
    }
}
