// Test helpers for solve (3D-13): GT-03 (gable house, fixtures/GT-03, 3D-07), the solver's tolerance fields (spec §2.3,
// D-13), plane / point distances.
import { deepFreeze, readFixture } from '../brep/helpers.js';
import { builders, compileConstraints } from '../../src/solve/index.js';

/** Tolerance fields the solver reads, defaults of spec §2.3 (D-13). */
export const TOL = { numericEpsilon: 1e-9, planarTolM: 0.02, zAlignTolM: 0.01, topologySnapTolM: 0.01 };

/** @returns {any} a frozen GT-03 input model (proves the solver never writes it) */
export const gt03 = () => deepFreeze(readFixture('GT-03', 'input.model.json'));

/** @param {{ normal: number[], d: number }} pl @param {number[]} p */
export const off = (pl, p) => Math.abs(pl.normal[0] * p[0] + pl.normal[1] * p[1] + pl.normal[2] * p[2] + pl.d);

/** @param {number[]} a @param {number[]} b */
export const gap = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);

/** South eave line of GT-03 raised to z (spec §10.4 example). @param {number} z0 @param {number} [z1] */
export const eaveLine = (z0, z1 = z0) => [[0, 0, z0], [10, 0, z1]];

/**
 * MOVE_EDGE-style target conditions: each point of the line on the given face plane (spec §10.4 r2).
 * @param {any} model @param {string} faceId @param {number[][]} line @param {string} [id]
 */
export function targetOn(model, faceId, line, id = 'target') {
  const b = builders(model);
  return line.map((p) => b.pointOnPlane({ id, kind: 'MOVE_EDGE' }, faceId, /** @type {any} */ (p), TOL.planarTolM));
}

/** @param {any} model @param {any[]} constraints */
export const compiled = (model, constraints) => compileConstraints(model, constraints, TOL);
