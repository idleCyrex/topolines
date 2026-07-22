// seed.ts — deterministic seed → field offset, plus a random seed generator.

/** Turn a seed string into a large-ish offset into the noise field. Same seed
 *  = same starting pattern (FNV-1a hash, ported from the source component). */
export function seedOffset(seed: string): [number, number] {
  let a = 2166136261;
  for (let i = 0; i < seed.length; i++) {
    a ^= seed.charCodeAt(i);
    a = Math.imul(a, 16777619);
  }
  const x = ((a >>> 0) % 10000) / 10;
  const y = ((Math.imul(a, 48271) >>> 0) % 10000) / 10;
  return [x, y];
}

/** A fresh random base36 seed. Use to shuffle to a new pattern. */
export function randomSeed(): string {
  return Math.random().toString(36).slice(2, 10);
}
