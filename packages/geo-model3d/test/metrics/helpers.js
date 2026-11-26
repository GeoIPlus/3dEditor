// Test helpers of the metrics module (3D-116): the public `computeMetrics` with its contract checked by Ajv, overhang
// commits on the GT-03 gable, rigid transforms of a model (vertices and support planes), and reference values computed
// independently of the kernel (test/ops/helpers.js: Newell areas, divergence volume; analytic overhang prisms).
import { expect } from 'vitest';
import { createAjv } from '../../../../contracts/model3d/test/load.mjs';
import { computeMetrics } from '@geoiplus/geo-model3d';
import { PROFILE, run, command, gableModel, faceArea, metrics } from '../ops/helpers.js';

export { PROFILE, run, command, gableModel };
const validate = /** @type {import('ajv').ValidateFunction} */ (createAjv().getSchema('urn:geoiplus:schema:model3d-metrics-result:v1'));

/** computeMetrics with the standard profile; the result must satisfy `metrics-result`. @param {any} model */
export function metricsOf(model, profile = PROFILE) {
  const out = computeMetrics(model, { toleranceProfile: profile });
  expect(validate(out), JSON.stringify(validate.errors)).toBe(true);
  return out;
}

/** Eave half-edges of the GT-03 gable. */
export const EAVE = { s: 'he-f-roof-s-0', n: 'he-f-roof-n-0' };

/**
 * Commit SET_OVERHANG as DRAFT_SOLID (keeps the PROVISIONAL cases independent of the validator) and return the new model.
 * @param {any} model @param {string[]} eaves @param {number} width
 */
export function withOverhang(model, eaves, width) {
  const out = run(model, command(model, 'SET_OVERHANG', { eaveEdgeIds: eaves, overhangM: width }, { targetState: 'DRAFT_SOLID' }));
  expect(out.result.status).toBe('COMMITTED');
  return out.model;
}

/**
 * Analytic overhang wedge of the GT-03 gable (slope rise 3 / run 4, length 10): a right triangle of width w and drop
 * w * 3 / 4 extruded over the length (D-336; v0.3 §12 GT-14 reference).
 * @param {number} w
 */
export const wedge = (w) => (w * ((w * 3) / 4)) / 2 * 10;

/**
 * Reference values from vertex coordinates only (test/ops/helpers.js), for a model whose roof projections do not
 * overlap: plan area = sum of |n_z| x area.
 * @param {any} m
 */
export function reference(m) {
  const base = metrics(m);
  const faces = Object.values(m.faces);
  const tagged = (/** @type {string} */ k) => faces.filter((/** @type {any} */ f) => f.surfaceKind === k && f.tags.includes('OVERHANG'));
  const sum = (/** @type {any[]} */ fs) => fs.reduce((s, f) => s + faceArea(m, f.id), 0);
  const roof = faces.filter((/** @type {any} */ f) => f.surfaceKind === 'RoofSurface');
  return {
    footprintAreaM2: base.groundAreaM2,
    roofPlanAreaM2: roof.reduce((s, /** @type {any} */ f) => s + faceArea(m, f.id) * Math.abs(f.supportPlane.normal[2]), 0),
    roofSurfaceAreaM2: base.roofAreaM2,
    overhangRoofAreaM2: sum(tagged('RoofSurface')),
    soffitAreaM2: sum(tagged('OuterCeilingSurface')),
    geometricSolidVolumeM3: base.volumeM3,
  };
}

/** Area and volume tolerance of the analytic tests (spec §13). */
export const TOL = { areaM2: 0.01, volumeM3: 0.01 };

/**
 * Apply p -> R p + t to every vertex and support plane (n -> R n, d -> d - (R n) . t). R is a 3 x 3 rotation.
 * @param {any} model @param {number[][]} R @param {number[]} t
 */
export function rigid(model, R, t) {
  const m = structuredClone(model);
  const mul = (/** @type {number[]} */ v) => R.map((row) => row[0] * v[0] + row[1] * v[1] + row[2] * v[2]);
  for (const v of Object.values(m.vertices)) /** @type {any} */ (v).p = mul(/** @type {any} */ (v).p).map((x, k) => x + t[k]);
  for (const f of Object.values(m.faces)) {
    const pl = /** @type {any} */ (f).supportPlane, n = mul(pl.normal);
    pl.d = pl.d - (n[0] * t[0] + n[1] * t[1] + n[2] * t[2]);
    pl.normal = n;
  }
  return m;
}

/** Rotation by `deg` about the unit axis `a` (Rodrigues). @param {number[]} a @param {number} deg */
export function rotation(a, deg) {
  const r = (deg * Math.PI) / 180, c = Math.cos(r), s = Math.sin(r), k = 1 - c, [x, y, z] = a;
  return [
    [c + x * x * k, x * y * k - z * s, x * z * k + y * s],
    [y * x * k + z * s, c + y * y * k, y * z * k - x * s],
    [z * x * k - y * s, z * y * k + x * s, c + z * z * k],
  ];
}

/** The nine metric members (D-415). */
export const NAMES = ['footprintAreaM2', 'roofPlanAreaM2', 'roofSurfaceAreaM2', 'overhangRoofAreaM2', 'soffitAreaM2',
  'mainVolumeM3', 'overhangVolumeM3', 'geometricSolidVolumeM3', 'volumeStatus'];

/** Every numeric metric of `a` equals `b` within `eps`; statuses and nulls equal. @param {any} a @param {any} b */
export function expectSameMetrics(a, b, eps = 1e-6) {
  for (const k of NAMES) {
    if (typeof a[k] === 'number' && typeof b[k] === 'number') expect(Math.abs(a[k] - b[k]), k).toBeLessThanOrEqual(eps);
    else expect(a[k], k).toBe(b[k]);
  }
}
