// Test helpers for cloud (3D-22): the D-13 default profile read from the contract (not copied), Ajv validators,
// seeded synthetic points. Tests may read files; kernel code may not.
import { createAjv, loadSchemas } from '../../../../contracts/model3d/test/load.mjs';
import { mulberry32 } from '../../src/cloud/rng.js';

const tp = loadSchemas().get('tolerance-profile');
/** Default tolerance profile: the `default` of every contract field (spec §2.3, D-13). @type {any} */
export const PROFILE = Object.fromEntries(
  Object.entries(tp.properties).filter(([, s]) => /** @type {any} */ (s).default !== undefined).map(([k, s]) => [k, /** @type {any} */ (s).default]),
);

const ajv = createAjv();
/** @param {string} name */
export const validator = (name) => /** @type {import('ajv').ValidateFunction} */ (ajv.getSchema(`urn:geoiplus:schema:model3d-${name}:v1`));

/** Selection that keeps every point. */
export const ALL = { kind: /** @type {const} */ ('BOX'), min: /** @type {[number, number, number]} */ ([-1e6, -1e6, -1e6]), max: /** @type {[number, number, number]} */ ([1e6, 1e6, 1e6]) };

/**
 * Points on z = a x + b y + c over [0, 10] x [0, 10] with uniform noise +/- amp along z, plus `outliers` points uniform in
 * a 10 m cube above the plane region.
 * @param {{ n: number, outliers?: number, amp?: number, a?: number, b?: number, c?: number, seed?: number }} o
 */
export function synthetic({ n, outliers = 0, amp = 0.005, a = 0, b = 0.75, c = 5, seed = 7 }) {
  const r = mulberry32(seed);
  const out = new Float64Array(3 * (n + outliers));
  for (let i = 0; i < n; i++) {
    const x = 10 * r();
    const y = 10 * r();
    out.set([x, y, a * x + b * y + c + amp * (2 * r() - 1)], 3 * i);
  }
  for (let i = n; i < n + outliers; i++) out.set([10 * r(), 10 * r(), 20 + 10 * r()], 3 * i);
  return out;
}

/** @param {number[]} p @param {number[]} q */
export const angleDeg = (p, q) => (Math.acos(Math.min(1, Math.abs(p[0] * q[0] + p[1] * q[1] + p[2] * q[2]))) * 180) / Math.PI;
