// Test helpers for the 3D-19 envelope operations: the GT-03 gable, a hip (GT-04 R-04 result), validity checks
// computed outside the operation code (topology, validation errors, vertex-plane invariant) and the inverse patch.
import { expect } from 'vitest';
import { readFixture, deepFreeze } from '../brep/helpers.js';
import { applyPatch, checkTopology, buildIndex } from '../../src/brep/index.js';
import { runChecks, toIssues } from '../../src/validate/index.js';
import { run, command, PROFILE, maxPlaneDistance } from './helpers.js';

export const gable = () => deepFreeze(readFixture('GT-14', 'input.model.json'));
export const hip = () => {
  const m = readFixture('GT-04', 'input.model.json');
  return deepFreeze(run(m, readFixture('GT-04', 'steps.json')[0].command).model);
};
/** Profile in which GT-14-sized end caps pass (only for tests of the overhang topology; see 3D-19.4). */
export const SMALL_FACES = { toleranceProfile: { ...PROFILE, minFaceAreaM2: 0.05 } };

/** @param {any} m @param {string} op @param {any} payload @param {Record<string, any>} [opts] @param {Record<string, any>} [over] */
export const exec = (m, op, payload, opts = {}, over = {}) => run(m, command(m, op, payload, over), opts);

/** A committed model is a closed manifold without errors, its vertices on their planes. @param {any} m */
export function sound(m, tol = PROFILE) {
  expect(checkTopology(m, buildIndex(m))).toEqual([]);
  // every issue that is an ERROR for VALID_SOLID (closure, manifold edges / vertices, junctions, degenerate faces, ...)
  const errors = toIssues(runChecks(m, { mode: 'COMMIT_VALIDATION', tolerances: tol, fullSolid: true }), 'VALID_SOLID').filter((i) => i.severity === 'ERROR');
  expect(errors).toEqual([]);
  expect(maxPlaneDistance(m)).toBeLessThanOrEqual(tol.planarTolM);
}

/** The journal's inverse patch restores the input. @param {any} before @param {any} out */
export function inverseRestores(/** @type {any} */ before, /** @type {any} */ out) {
  const back = /** @type {any} */ (applyPatch(out.model, out.journal.inversePatch));
  for (const k of ['vertices', 'halfEdges', 'faces', 'shells', 'roofComponents', 'footprints', 'constraints', 'measurements', 'semantics']) expect(back[k]).toEqual(before[k]);
}

/** Positions equal within `eps`, ids and everything else equal. @param {any} a @param {any} b */
export function sameGeometry(a, b, eps = 1e-9) {
  for (const k of ['halfEdges', 'faces', 'shells', 'roofComponents']) expect(a[k]).toEqual(b[k]);
  expect(Object.keys(a.vertices).sort()).toEqual(Object.keys(b.vertices).sort());
  for (const [id, v] of Object.entries(a.vertices)) {
    expect(b.vertices[id].definingFaceIds).toEqual(/** @type {any} */ (v).definingFaceIds);
    for (let i = 0; i < 3; i++) expect(Math.abs(b.vertices[id].p[i] - /** @type {any} */ (v).p[i])).toBeLessThanOrEqual(eps);
  }
}
