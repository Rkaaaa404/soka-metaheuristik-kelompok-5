package id.ac.soka.scheduling.util;

/**
 * Deterministic 32-bit Mulberry32 PRNG matching the JavaScript implementation.
 */
public final class Mulberry32 {
    private int state;

    public Mulberry32(long seed) {
        this.state = (int) seed;
    }

    public double nextDouble() {
        state += 0x6D2B79F5;
        int t = (state ^ (state >>> 15)) * (state | 1);
        t ^= t + ((t ^ (t >>> 7)) * (t | 61));
        long unsignedT = Integer.toUnsignedLong(t ^ (t >>> 14));
        return (double) unsignedT / 4294967296.0;
    }

    public int nextInt(int bound) {
        if (bound <= 0) {
            throw new IllegalArgumentException("bound must be positive: " + bound);
        }
        int val = (int) Math.floor(nextDouble() * bound);
        return Math.min(val, bound - 1);
    }

    public boolean nextBoolean() {
        return nextDouble() < 0.5;
    }
}
