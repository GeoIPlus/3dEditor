// cloud (3D-22): seeded pseudo-random numbers for RANSAC. The kernel has no randomness source (3D-ADR-0002 C1 rule 1,
// `kernelNoIo`): sampling is a pure function of the input and a fixed seed, so equal inputs give equal results
// (D-130). Algorithm: mulberry32 (public domain, 32-bit state), the generator 3D-07 uses for the fixtures.

/**
 * @param {number} seed 32-bit unsigned integer
 * @returns {() => number} next value in [0, 1)
 */
export function mulberry32(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * Integer in [0, n).
 * @param {() => number} rnd @param {number} n
 */
export const randomIndex = (rnd, n) => Math.floor(rnd() * n);
