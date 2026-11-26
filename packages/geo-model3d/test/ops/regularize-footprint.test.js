// 3D-114.1 REGULARIZE_FOOTPRINT (spec §10.10 r3; v0.2 F-39; D-3D1141-1..8): straightening, chains, no-op,
// orthogonalisation, courtyards kept, the change report (RF-01..RF-07, RF-13). Expected numbers are analytic.
import { describe, expect, it } from 'vitest';
import { built, regularize, walls, wallAt } from './regularize-footprint.helpers.js';
import { exec, gable, sound } from './envelope.helpers.js';
import { metrics } from './helpers.js';

const near = (/** @type {number} */ a, /** @type {number} */ b, eps = 1e-6) => expect(Math.abs(a - b)).toBeLessThanOrEqual(eps);
const tan = (/** @type {number} */ deg) => Math.tan((deg * Math.PI) / 180);
/** @param {any} out */
const ok = (out) => {
  expect(out.result.status, JSON.stringify(out.result.error)).toBe('COMMITTED');
  expect(out.model.state).toBe('VALID_SOLID');
  sound(out.model);
  return out.model;
};
/** @param {number[][]} a @param {number[][]} b */
const sameRing = (a, b) => { expect(a).toHaveLength(b.length); a.forEach((q, i) => { near(q[0], b[i][0]); near(q[1], b[i][1]); }); };
const roofPlanes = (/** @type {any} */ m) => Object.values(m.faces).filter((f) => f.surfaceKind === 'RoofSurface').map((f) => [f.id, f.supportPlane]);
/** The number in a report line `<label> <x>`. @param {string[]} w @param {string} label */
const num = (w, label) => Number(new RegExp(`${label} (-?[0-9.]+)`).exec(w.join('\n'))?.[1]);
const KINK = [[0, 0], [7, 0], [10, 0.157], [10, 8], [0, 8]];

describe('REGULARIZE_FOOTPRINT straightening (D-3D1141-1)', () => {
  it('RF-01 FLAT, 3 deg kink: merged into the longer wall (plane kept), roof plane kept, lineage merged -> survivor', () => {
    const m = built(KINK);
    const long = wallAt(m, [3, 0], [0, -1]), piece = wallAt(m, [8.5, 0.0785], [0.05, -1]);
    const out = regularize(m);
    const r = ok(out);
    expect(r.faces[long.id].supportPlane).toEqual(long.supportPlane);
    expect(r.faces[piece.id]).toBeUndefined();
    expect(roofPlanes(r)).toEqual(roofPlanes(m));
    sameRing(r.footprints['fp-1'].outerRing, [[0, 0], [10, 0], [10, 8], [0, 8]]);
    const x = metrics(r);
    near(x.volumeM3, 400); near(x.groundAreaM2, 80); expect(x.walls).toBe(4);
    expect(out.result.topologyLineage.mapped[piece.id]).toEqual([long.id]);
  });

  it('RF-02 GABLE, kink on an eave wall: roof planes unchanged, the gable returns to the 10 x 8 rectangle', () => {
    const g = gable();
    const s = exec(g, 'SPLIT_FACE', { faceId: 'f-wall-s', splitLine: [[7, 0, 0], [7, 0, 5]] }).model;
    const piece = walls(s).find((w) => !g.faces[w.id]);
    const k = ok(exec(s, 'ALIGN_WALL', { faceId: piece.id, referenceLine: [[7, 0], [10, 0.157]] }));
    const r = ok(regularize(k));
    expect(roofPlanes(r)).toEqual(roofPlanes(g));
    expect(r.faces['f-wall-s'].supportPlane).toEqual(g.faces['f-wall-s'].supportPlane);
    expect(r.faces[piece.id]).toBeUndefined();
    const x = metrics(r), y = metrics(g);
    near(x.volumeM3, y.volumeM3); near(x.roofAreaM2, y.roofAreaM2); near(x.groundAreaM2, 80);
  });

  it('RF-03 a chain +4 / -4 deg merges (8 deg pairwise); an edge 7 deg from the reference breaks the chain', () => {
    const y1 = 2 * tan(4);
    const r = ok(regularize(built([[0, 0], [6, 0], [8, y1], [10, 0], [10, 8], [0, 8]])));
    sameRing(r.footprints['fp-1'].outerRing, [[0, 0], [10, 0], [10, 8], [0, 8]]);
    expect(walls(r)).toHaveLength(4);
    const y2 = y1 + 2 * tan(7);
    const b = ok(regularize(built([[0, 0], [6, 0], [8, y1], [10, y2], [10, 8], [0, 8]])));
    sameRing(b.footprints['fp-1'].outerRing, [[0, 0], [8 - y1 / tan(7), 0], [10, y2], [10, 8], [0, 8]]);
    expect(walls(b)).toHaveLength(5);
  });

  it('RF-04 every turn above 5 deg -> no-op, version kept', () => {
    const m = built([[0, 0], [7, 0], [10, 3 * tan(6)], [10, 8], [0, 8]]);
    const out = regularize(m);
    expect(out.result.status).toBe('COMMITTED');
    expect(out.model.version).toBe(m.version);
    expect(out.model.faces).toEqual(m.faces);
  });
});

describe('REGULARIZE_FOOTPRINT orthogonalize (D-3D1141-2)', () => {
  const QUAD = [[0, 0], [10, 0], [10.28, 8], [0, 8]];
  it('RF-05 88 / 92 deg corners -> exactly 90 deg about the midpoint, the longest wall unchanged; false keeps them', () => {
    const m = built(QUAD);
    const north = wallAt(m, [5, 8], [0, 1]), east = wallAt(m, [10.14, 4], [1, -0.035]);
    const out = regularize(m, { orthogonalize: true });
    const r = ok(out);
    expect(r.faces[north.id].supportPlane).toEqual(north.supportPlane);
    near(r.faces[east.id].supportPlane.normal[1], 0, 1e-12); near(r.faces[east.id].supportPlane.d, -10.14);
    sameRing(r.footprints['fp-1'].outerRing, [[0, 0], [10.14, 0], [10.14, 8], [0, 8]]);
    near(metrics(r).groundAreaM2, 81.12);
    near(num(out.result.warnings, `rotated wall ${east.id} by`), (Math.atan(0.28 / 8) * 180) / Math.PI, 1e-3);
    const keep = regularize(m, { orthogonalize: false });
    expect(keep.model.version).toBe(m.version);
  });

  it('RF-06 a 120 deg corner: walls off the grid are untouched, a wall 0.8 deg off is turned onto it', () => {
    const c = [10 - 4 * Math.cos(Math.PI / 6), 7];
    const m = built([[0.1, 0], [10, 0], [10, 5], c, [0, 7]]);
    const diag = wallAt(m, [10, 5], [0.5, 0.866], 1e-6), west = wallAt(m, [0.05, 3.5], [-1, -0.014]);
    const r = ok(regularize(m, { orthogonalize: true }));
    expect(r.faces[diag.id].supportPlane).toEqual(diag.supportPlane);
    near(r.faces[west.id].supportPlane.normal[1], 0, 1e-12); near(r.faces[west.id].supportPlane.d, 0.05);
    sameRing(r.footprints['fp-1'].outerRing, [[0.05, 0], [10, 0], [10, 5], c, [0.05, 7]]);
  });
});

describe('REGULARIZE_FOOTPRINT courtyards and report (D-3D1141-4, -5)', () => {
  it('RF-07 a courtyard with a kink is regularized and kept (allowCourtyardRemoval false)', () => {
    const m = built([[0, 0], [20, 0], [20, 20], [0, 20]], undefined, [[[8, 8], [8, 12], [12, 12], [12, 8.05], [11, 8]]]);
    const r = ok(regularize(m));
    expect(r.footprints['fp-1'].innerRings).toHaveLength(1);
    expect(r.footprints['fp-1'].innerRings[0]).toHaveLength(4);
    expect(r.footprints['fp-1'].innerRings[0].some((/** @type {number[]} */ q) => Math.hypot(q[0] - 12, q[1] - 8) < 1e-9)).toBe(true);
    expect(walls(r)).toHaveLength(8);
    near(metrics(r).groundAreaM2, 384);
  });

  it('RF-13 the report: removed vertices, merged walls, max shift and area change in warnings', () => {
    const m = built(KINK);
    const long = wallAt(m, [3, 0], [0, -1]), piece = wallAt(m, [8.5, 0.0785], [0.05, -1]);
    const vs = Object.values(m.vertices).filter((v) => Math.hypot(v.p[0] - 7, v.p[1]) < 1e-9 && v.p[2] === 0).map((v) => v.id);
    const w = regularize(m).result.warnings;
    expect(w).toContain(`REGULARIZE_FOOTPRINT: removed vertices [${vs.join(', ')}]`);
    expect(w).toContain(`REGULARIZE_FOOTPRINT: merged walls [${piece.id}] into ${long.id}`);
    near(num(w, 'max vertex shift'), 0.157, 1e-3);
    near(num(w, 'area change'), 0.5 * 3 * 0.157, 1e-3);
  });
});
