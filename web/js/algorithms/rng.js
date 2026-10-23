/**
 * Deterministic Mulberry32 32-bit PRNG identical to Java implementation.
 */
export class Mulberry32 {
  constructor(seed = 42) {
    this.state = (seed >>> 0);
  }

  nextDouble() {
    this.state = (this.state + 0x6D2B79F5) | 0;
    let t = Math.imul(this.state ^ (this.state >>> 15), this.state | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }

  nextInt(bound) {
    if (bound <= 0) throw new Error("bound must be positive");
    const val = Math.floor(this.nextDouble() * bound);
    return Math.min(val, bound - 1);
  }

  nextBoolean() {
    return this.nextDouble() < 0.5;
  }
}
