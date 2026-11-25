// Seeded synthetic point sets for GT-20 / GT-21 (v0.3 §12). Arithmetic only, so the bytes do not depend on the
// platform's logarithm and cosine: uniform numbers from mulberry32, normal noise by Irwin-Hall (sum of 12 uniforms - 6).

/** mulberry32 PRNG, returns uniform numbers in [0, 1). @param {number} seed */
export function rng(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Approximately standard normal (Irwin-Hall n = 12, variance 1). @param {() => number} u */
export function normal(u) {
  let s = 0;
  for (let i = 0; i < 12; i++) s += u();
  return s - 6;
}

const r4 = (/** @type {number} */ x) => { const v = Math.round(x * 1e4) / 1e4; return v === 0 ? 0 : v; };

/**
 * GT-20 parameters. From v0.3 §12: 500 points, plane z = 0.75 y + 5, sigma 0.01 m, 10 % outliers. [P] (D-99,
 * D-102): plan extent = the south slope of GT-03 (x 0..10, y 0..4), so GT-21 can reuse the points; noise along Z;
 * "500 points" read as the total, 50 of them outliers; outliers 1.5..3 m above or below the plane (beyond
 * `heatmapBufferM` 1.0); coordinates rounded to 0.1 mm; seed 20.
 */
export const GT20 = Object.freeze({
  total: 500, outliers: 50, slope: 0.75, z0: 5, sigma: 0.01, xMax: 10, yMax: 4, outlierMin: 1.5, outlierMax: 3, seed: 20,
});

/**
 * @returns {{ points: [number, number, number][], outlierIndices: number[] }} shuffled; outlier positions listed
 */
export function gt20Points() {
  const g = GT20;
  const u = rng(g.seed);
  /** @type {{ p: [number, number, number], out: boolean }[]} */
  const all = [];
  for (let i = 0; i < g.total; i++) {
    const out = i >= g.total - g.outliers;
    const x = u() * g.xMax;
    const y = u() * g.yMax;
    const onPlane = g.slope * y + g.z0;
    const dz = out ? (u() < 0.5 ? -1 : 1) * (g.outlierMin + u() * (g.outlierMax - g.outlierMin)) : g.sigma * normal(u);
    all.push({ p: [r4(x), r4(y), r4(onPlane + dz)], out });
  }
  for (let i = all.length - 1; i > 0; i--) {
    const j = Math.floor(u() * (i + 1));
    [all[i], all[j]] = [all[j], all[i]];
  }
  return {
    points: all.map((a) => a.p),
    outlierIndices: all.flatMap((a, i) => (a.out ? [i] : [])),
  };
}

/** GT-21: the GT-20 points shifted +0.10 m in Z (v0.3 §12), rounded to 0.1 mm. @param {[number, number, number][]} pts */
export const shiftZ = (pts, dz = 0.1) => pts.map(([x, y, z]) => /** @type {[number, number, number]} */ ([x, y, r4(z + dz)]));
