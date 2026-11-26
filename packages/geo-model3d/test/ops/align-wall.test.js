// 3D-114 ALIGN_WALL (spec §10.10 r4; v0.2 F-40; D-346, D-392): the wall plane goes to the vertical plane through
// referenceLine, roof planes are kept, the roof and ground follow, the footprint record is updated. Expected numbers
// are analytic (integrals of the roof height over the plan), computed here.
import { describe, expect, it } from 'vitest';
import { exec, gable, hip, sound, SMALL_FACES } from './envelope.helpers.js';
import { metrics } from './helpers.js';
import { readFixture, deepFreeze } from '../brep/helpers.js';

const near = (/** @type {number} */ a, /** @type {number} */ b, eps = 0.01) => expect(Math.abs(a - b)).toBeLessThanOrEqual(eps);
/** @param {any} m @param {string} faceId @param {number[][]} line @param {any} [opts] */
const align = (m, faceId, line, opts = {}) => exec(m, 'ALIGN_WALL', { faceId, referenceLine: line }, opts);
/** @param {any} out @param {any} [tol] */
const ok = (out, tol) => {
  expect(out.result.status, JSON.stringify(out.result.error)).toBe('COMMITTED');
  expect(out.model.state).toBe('VALID_SOLID');
  sound(out.model, tol);
  return out.model;
};
/** @param {any} m @param {any} out @param {string} code */
const refused = (m, out, code) => {
  expect(out.result.status).toBe('REJECTED');
  expect(out.result.error.code, JSON.stringify(out.result.error)).toBe(code);
  expect(out.model).toBe(m);
  return out.result.error;
};
const roofPlanes = (/** @type {any} */ m) => Object.values(m.faces).filter((f) => f.surfaceKind === 'RoofSurface' && !f.tags.includes('OVERHANG')).map((f) => [f.id, f.supportPlane]);
const BOTH = ['he-f-roof-s-0', 'he-f-roof-n-0'];

describe('ALIGN_WALL', () => {
  it('eave wall 1 m outward: wall on the line, roof planes kept, eave recomputed to 4.25, footprint updated', () => {
    const g = gable();
    const r = ok(align(g, 'f-wall-s', [[0, -1], [10, -1]]));
    expect(r.faces['f-wall-s'].supportPlane).toEqual({ normal: [0, -1, 0], d: -1 });
    expect(roofPlanes(r)).toEqual(roofPlanes(g));
    expect(r.footprints['fp-1'].outerRing).toEqual([[0, -1], [10, -1], [10, 8], [0, 8]]);
    for (const v of ['v-e0', 'v-e1']) expect(r.vertices[v].p).toEqual([v === 'v-e0' ? 0 : 10, -1, 4.25]);
    const x = metrics(r);
    // 10 * (int_-1^4 (5 + 0.75 y) dy + int_4^8 (8 - 0.75 (y - 4)) dy)
    near(x.volumeM3, 10 * (25 + 0.375 * 15 + 26)); near(x.roofAreaM2, 100 / 0.8 - 12.5); near(x.groundAreaM2, 90);
  });

  it('gable wall turned about a corner: ridge and eaves follow on the kept planes, trapezoid footprint 84 m2', () => {
    const r = ok(align(gable(), 'f-wall-w', [[0, 0], [-1, 8]]));
    expect(r.footprints['fp-1'].outerRing).toEqual([[0, 0], [10, 0], [10, 8], [-1, 8]]);
    [-0.5, 4, 8].forEach((c, i) => near(r.vertices['v-r0'].p[i], c, 1e-9));
    near(metrics(r).groundAreaM2, 84);
  });

  it('an overhang on the wall, or on an end wall of the wall, follows at the same width in plan', () => {
    const oh = exec(gable(), 'SET_OVERHANG', { eaveEdgeIds: BOTH, overhangM: 0.5 }, SMALL_FACES).model;
    const s = ok(align(oh, 'f-wall-s', [[0, -1], [10, -1]], SMALL_FACES), SMALL_FACES.toleranceProfile);
    expect(Object.keys(s.faces).sort()).toEqual(Object.keys(oh.faces).sort());
    near(metrics(s).roofAreaM2, 100 / 0.8);
    const edge = Object.values(s.vertices).filter((v) => Math.abs(v.p[1] + 1.5) < 1e-9);
    expect(edge).toHaveLength(2);
    for (const v of edge) near(v.p[2], 5 - 0.75 * 1.5, 1e-9);
    const w = ok(align(oh, 'f-wall-w', [[-1, 0], [-1, 8]], SMALL_FACES), SMALL_FACES.toleranceProfile);
    near(metrics(w).roofAreaM2, (11 * 9) / 0.8);
  });

  it('a wall already on the line: COMMITTED, no new version, input returned', () => {
    const g = gable();
    const out = align(g, 'f-wall-s', [[3, 0], [7, 0]]);
    expect(out.result.status).toBe('COMMITTED');
    expect(out.journal).toBeUndefined();
    expect(out.model).toBe(g);
  });

  it('refusals leave the model unchanged (D-392)', () => {
    const g = gable();
    refused(g, align(g, 'f-ground', [[0, 5], [10, 5]]), 'INVALID_PAYLOAD');
    refused(g, align(g, 'f-roof-s', [[0, 5], [10, 5]]), 'INVALID_PAYLOAD');
    refused(g, align(g, 'f-wall-s', [[0, 0], [0.01, 0]]), 'INVALID_PAYLOAD');
    refused(g, align(g, 'f-wall-s', [[0, 0]]), 'INVALID_PAYLOAD');
    // the south slope would turn over past the ridge
    expect(refused(g, align(g, 'f-wall-s', [[0, 5], [10, 5]]), 'INVALID_TOPOLOGY').entityIds).toContain('f-roof-s');
    // the north edge of the footprint would be 0.03 m < minEdgeLengthM
    refused(g, align(g, 'f-wall-w', [[0, 0], [9.97, 8]]), 'INVALID_GEOMETRY');
    refused(g, align(g, 'f-wall-w', [[0, 0], [10.5, 8]]), 'INVALID_GEOMETRY');
    // hip: the hip corner is no longer one point of the kept planes
    const h = hip();
    const south = /** @type {any} */ (Object.values(h.faces).find((f) => f.surfaceKind === 'WallSurface' && f.supportPlane.normal[1] < -0.5)).id;
    refused(h, align(h, south, [[0, -1], [10, -1]]), 'INVALID_TOPOLOGY');
  });

  it('a hard FIXED_POINT on a vertex the wall moves -> CONSTRAINT_CONFLICT', () => {
    const m = deepFreeze(readFixture('GT-10', 'input.model.json'));
    expect(refused(m, align(m, 'f-wall-w', [[-1, 0], [-1, 8]]), 'CONSTRAINT_CONFLICT').entityIds).toContain('c-fix-r0');
  });
});
