// 3D-126 REGULARIZE_FOOTPRINT: courtyard removal, overhangs and refusals (RF-08..RF-12, RF-14; D-420, -6,
// D-213, D-218). A refusal leaves the model object unchanged.
import { describe, expect, it } from 'vitest';
import { built, regularize, walls, wallAt } from './regularize-footprint.helpers.js';
import { exec, gable, sound, SMALL_FACES } from './envelope.helpers.js';
import { metrics, withFootprint, replaceRoof } from './helpers.js';
import { deepFreeze } from '../brep/helpers.js';

const near = (/** @type {number} */ a, /** @type {number} */ b, eps = 1e-6) => expect(Math.abs(a - b)).toBeLessThanOrEqual(eps);
/** @param {any} m @param {any} out @param {string} code */
const refused = (m, out, code) => {
  expect(out.result.status).toBe('REJECTED');
  expect(out.result.error.code, JSON.stringify(out.result.error)).toBe(code);
  expect(out.model).toBe(m);
  return out.result.error;
};
/** @param {any} out @param {any} [tol] */
const ok = (out, tol) => {
  expect(out.result.status, JSON.stringify(out.result.error)).toBe('COMMITTED');
  expect(out.model.state).toBe('VALID_SOLID');
  sound(out.model, tol);
  return out.model;
};
const SQUARE = [[0, 0], [20, 0], [20, 20], [0, 20]];
const TINY = [[10, 10], [10, 10.3], [10.3, 10.3], [10.3, 10]];

describe('REGULARIZE_FOOTPRINT courtyard removal (D-420)', () => {
  it('RF-08 degenerate courtyard (0.09 m2): false -> INVALID_GEOMETRY; true -> removed, ground and roof closed', () => {
    const m = built(SQUARE, undefined, [TINY], SMALL_FACES);
    const court = walls(m).filter((w) => Math.abs(w.supportPlane.d) > 9 && Math.abs(w.supportPlane.d) < 11).map((w) => w.id);
    expect(court).toHaveLength(4);
    const e = refused(m, regularize(m), 'INVALID_GEOMETRY');
    expect(e.entityIds).toEqual(['fp-1', ...court.sort()]);
    const out = regularize(m, { allowCourtyardRemoval: true });
    const r = ok(out);
    expect(r.footprints['fp-1'].innerRings).toEqual([]);
    for (const c of court) expect(r.faces[c]).toBeUndefined();
    for (const f of Object.values(r.faces)) expect(/** @type {any} */ (f).innerLoopIds).toEqual([]);
    near(metrics(r).groundAreaM2, 400); near(metrics(r).volumeM3, 2000);
    expect(out.result.warnings).toContain(`REGULARIZE_FOOTPRINT: removed courtyard [${court.sort().join(', ')}]`);
  });
});

describe('REGULARIZE_FOOTPRINT overhangs (D-422)', () => {
  it('RF-09 overhang on a changed end wall is rebuilt at the same width; on a merged-away end wall -> INVALID_TOPOLOGY', () => {
    const oh = ok(exec(gable(), 'SET_OVERHANG', { eaveEdgeIds: ['he-f-roof-s-0', 'he-f-roof-n-0'], overhangM: 0.5 }, SMALL_FACES), SMALL_FACES.toleranceProfile);
    const tilt = ok(exec(oh, 'ALIGN_WALL', { faceId: 'f-wall-e', referenceLine: [[10, 0], [10.28, 8]] }, SMALL_FACES), SMALL_FACES.toleranceProfile);
    const r = ok(regularize(tilt, { orthogonalize: true }, SMALL_FACES), SMALL_FACES.toleranceProfile);
    expect(Object.keys(r.faces).sort()).toEqual(Object.keys(tilt.faces).sort());
    near(r.faces['f-wall-e'].supportPlane.d, -10.14);
    near(metrics(r).roofAreaM2, (10.14 * 9) / 0.8);
    for (const y of [-0.5, 8.5]) expect(Object.values(r.vertices).filter((v) => Math.abs(v.p[1] - y) < 1e-9)).toHaveLength(2);

    const split = exec(gable(), 'SPLIT_FACE', { faceId: 'f-wall-e', splitLine: [[10, 6, 0], [10, 6, 7]] }).model;
    const north = ok(exec(split, 'SET_OVERHANG', { eaveEdgeIds: ['he-f-roof-n-0'], overhangM: 0.5 }, SMALL_FACES), SMALL_FACES.toleranceProfile);
    const piece = walls(split).find((w) => !gable().faces[w.id])?.id;
    expect(Object.values(split.vertices).some((v) => v.definingFaceIds.includes(piece) && v.p[1] === 8)).toBe(true);
    const e = refused(north, regularize(north, {}, SMALL_FACES), 'INVALID_TOPOLOGY');
    expect(e.entityIds).toContain(piece);
  });
});

describe('REGULARIZE_FOOTPRINT refusals', () => {
  it('RF-10 kept roof planes no longer meet in one point (hip corner of an 88 / 92 deg quad) -> INVALID_TOPOLOGY', () => {
    const h = replaceRoof(withFootprint([[0, 0], [10, 0], [10.28, 8], [0, 8]]), { template: 'HIP', ridgeAxis: 'LOCAL_X', eaveZ: 5, slopesDeg: [30, 30, 30, 30] });
    const m = deepFreeze(ok(h));
    refused(m, regularize(m, { orthogonalize: true }), 'INVALID_TOPOLOGY');
  });

  it('RF-11 a turned-over result edge or an edge below minEdgeLengthM -> INVALID_GEOMETRY', () => {
    for (const tip of [[10.06, -0.04], [10.13, 0.03]]) {
      const m = built([[0, 0], [8, 0], [10, -0.1], tip, [tip[0], 8], [0, 8]]);
      refused(m, regularize(m), 'INVALID_GEOMETRY');
    }
  });

  it('RF-12 a hard constraint on a wall that is merged away -> CONSTRAINT_CONFLICT naming it (D-213)', () => {
    const m = structuredClone(built([[0, 0], [7, 0], [10, 0.157], [10, 8], [0, 8]]));
    const piece = wallAt(m, [8.5, 0.0785], [0.05, -1]), east = wallAt(m, [10, 4], [1, 0]);
    m.constraints['c-1'] = { id: 'c-1', kind: 'PERPENDICULAR', entityIds: [piece.id, east.id], hard: true };
    const f = deepFreeze(m);
    expect(refused(f, regularize(f), 'CONSTRAINT_CONFLICT').entityIds).toEqual(['c-1']);
  });

  it('RF-14 unknown footprintId -> INVALID_PAYLOAD; a body that is not unique -> INVALID_TOPOLOGY (D-218)', () => {
    const m = built([[0, 0], [7, 0], [10, 0.157], [10, 8], [0, 8]]);
    const out = exec(m, 'REGULARIZE_FOOTPRINT', { footprintId: 'fp-x', allowCourtyardRemoval: false, orthogonalize: false });
    expect(refused(m, out, 'INVALID_PAYLOAD').entityIds).toEqual(['fp-x']);
    const two = structuredClone(m);
    two.solids['so-2'] = { id: 'so-2', outerShellId: 'sh-1', voidShellIds: [] };
    two.semantics['sem-bld'].solidIds.push('so-2');
    const f = deepFreeze(two);
    expect(refused(f, regularize(f), 'INVALID_TOPOLOGY').entityIds).toEqual(['fp-1', 'sem-bld']);
  });
});
