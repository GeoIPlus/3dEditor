// Acceptance of 3D-32: unedited round trip exact (GT-I4 rule), edited vertices within the profile, projected path
// unchanged, PRECISION_LOSS on a coarse file grid (D-70, D-92, D-123).
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { createMetricFrame, boxCentre, decodeVertex, writeBackVertices } from '../../src/crs/index.js';

/** @typedef {[number, number, number]} P3 */
const load = (/** @type {string} */ p) => JSON.parse(readFileSync(new URL(p, import.meta.url), 'utf8'));
const GEO = load('./fixtures/gt-i1-epsg4937.cityjson.json');
const UTM = load('../../../../fixtures/GT-I1/input.cityjson.json');
const PROFILE_DECIMALS = 3; // exportRoundDecimals default (spec §2.3, D-13)
const GT_I4_TOL_M = 0.001;

/** @param {any} doc */
function importDoc(doc) {
  const world = doc.vertices.map((/** @type {P3} */ v) => decodeVertex(v, doc.transform));
  const frame = createMetricFrame(doc.metadata.referenceSystem, boxCentre(world));
  return { frame, metric: world.map((/** @type {P3} */ w) => frame.toMetric(w)) };
}

/** @param {any} doc @param {import('../../src/crs/frame.js').MetricFrame} frame @param {Map<number, P3>} changed */
const exportDoc = (doc, frame, changed) =>
  writeBackVertices({ frame, transform: doc.transform, fileVertices: doc.vertices, changed, exportRoundDecimals: PROFILE_DECIMALS });

describe('geographic round trip (fixture GT-I1 in EPSG:4937)', () => {
  const { frame, metric } = importDoc(GEO);
  /** @type {P3[]} */
  const m0 = metric;

  it('imports into a metric ENU frame that reproduces the GT-I1 geometry (10 x 8, eave 5, ridge 8)', () => {
    expect(frame.crs.kind).toBe('GEOGRAPHIC');
    const d = (/** @type {number} */ i, /** @type {number} */ j) => Math.hypot(...[0, 1, 2].map((k) => metric[i][k] - metric[j][k]));
    // GT-I1 vertices 0..3 are the ground rectangle 10 x 8 (fixtures/GT-I1); UTM scale distortion and grid rounding
    // allow small differences: compare with the same distances computed in the projected source file.
    const src = importDoc(UTM).metric;
    const ds = (/** @type {number} */ i, /** @type {number} */ j) => Math.hypot(...[0, 1, 2].map((k) => src[i][k] - src[j][k]));
    const k0 = ds(0, 1) / d(0, 1); // UTM point scale factor at this place, ~0.9996 + distortion
    let worst = 0;
    for (let i = 0; i < metric.length; i++) for (let j = i + 1; j < metric.length; j++) {
      // horizontal distances scale by k0; heights do not; check a mixed tolerance
      worst = Math.max(worst, Math.abs(d(i, j) * k0 - ds(i, j)));
    }
    expect(worst).toBeLessThan(0.005);
  });

  it('without edits: every vertex keeps its file integers (exact, GT-I4 rule)', () => {
    const r = exportDoc(GEO, frame, new Map());
    expect(r.vertices).toEqual(GEO.vertices);
    expect(r.maxErrorM).toBe(0);
    expect(r.precisionLoss).toBeNull();
  });

  it('even re-encoding every vertex from the metric frame stays within 0.001 m', () => {
    const all = new Map(m0.map((m, i) => [i, m]));
    const r = exportDoc(GEO, frame, all);
    expect(r.maxErrorM).toBeLessThan(GT_I4_TOL_M);
    let maxIntDiff = 0;
    r.vertices.forEach((v, i) => v.forEach((x, k) => { maxIntDiff = Math.max(maxIntDiff, Math.abs(x - GEO.vertices[i][k])); }));
    expect(maxIntDiff).toBeLessThanOrEqual(1);
  });

  it('edited: changed vertices land within 0.001 m; untouched keep their integers (D-70)', () => {
    const moved = new Map([[5, /** @type {P3} */ ([metric[5][0] + 0.3, metric[5][1] - 0.2, metric[5][2] + 0.5])],
      [6, /** @type {P3} */ ([metric[6][0] + 0.3, metric[6][1] - 0.2, metric[6][2] + 0.5])]]);
    const r = exportDoc(GEO, frame, moved);
    expect(r.maxErrorM).toBeLessThan(GT_I4_TOL_M);
    r.vertices.forEach((v, i) => { if (!moved.has(i)) expect(v).toEqual(GEO.vertices[i]); });
    const again = importDoc({ ...GEO, vertices: r.vertices });
    // re-import uses a new box centre; compare in the original frame
    for (const [i, m] of moved) {
      const p = frame.toMetric(decodeVertex(r.vertices[i], GEO.transform));
      expect(Math.hypot(p[0] - m[0], p[1] - m[1], p[2] - m[2])).toBeLessThan(GT_I4_TOL_M);
    }
    expect(again.frame.crs.horizontalCrs).toBe('EPSG:4937');
  });

  it('a file grid coarser than the rounding rule is reported as PRECISION_LOSS (1e-7 deg)', () => {
    const coarse = { ...GEO, transform: { ...GEO.transform, scale: [1e-7, 1e-7, 0.001] } };
    const r = exportDoc(coarse, frame, new Map([[5, /** @type {P3} */ ([metric[5][0] + 0.3, metric[5][1], metric[5][2]])]]));
    expect(r.precisionLoss).toMatchObject({ code: 'PRECISION_LOSS', requiredSteps: [1e-8, 1e-8, 0.001] });
  });
});

describe('projected path unchanged (GT-I1, EPSG:25832)', () => {
  const { frame, metric } = importDoc(UTM);
  /** @type {P3[]} */
  const m1 = metric;

  it('metric frame is a pure translation by the origin', () => {
    expect(frame.crs.kind).toBe('PROJECTED');
    const w = decodeVertex(UTM.vertices[2], UTM.transform);
    expect(metric[2]).toEqual([w[0] - frame.originWorld[0], w[1] - frame.originWorld[1], w[2] - frame.originWorld[2]]);
  });

  it('without edits: integers unchanged; re-encoding all: identical integers', () => {
    expect(exportDoc(UTM, frame, new Map()).vertices).toEqual(UTM.vertices);
    const all = exportDoc(UTM, frame, new Map(m1.map((m, i) => [i, m])));
    expect(all.vertices).toEqual(UTM.vertices);
    expect(all.precisionLoss).toBeNull();
  });

  it('edited vertex within 0.001 m', () => {
    const r = exportDoc(UTM, frame, new Map([[7, /** @type {P3} */ ([metric[7][0] + 0.1234, metric[7][1], metric[7][2] - 0.0567])]]));
    expect(r.maxErrorM).toBeLessThan(GT_I4_TOL_M);
  });
});
