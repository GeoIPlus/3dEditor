// Test helpers of the core edits (3D-15): the GT-03 result as input (fixtures GT-08 / GT-10 use it), a runner that
// checks every output against its contract, and the vertex-plane invariant of spec §4 / §10.1 Accept 1.
import { expect } from 'vitest';
import { readFixture, deepFreeze } from '../brep/helpers.js';
import { run, command, metrics, maxPlaneDistance, faceArea, PROFILE } from './helpers.js';
import { derivePoint } from '../../src/brep/index.js';

export { metrics, faceArea, PROFILE };

/** The gable 10 x 8, eave 5, ridge 8 along X at y = 4 (GT-03 result, derived vertices), frozen. @returns {any} */
export const gable = () => deepFreeze(structuredClone(readFixture('GT-08', 'input.model.json')));

/** Run one COMMIT on `model`. @param {any} model @param {string} op @param {any} payload @param {Record<string, any>} [over] */
export const exec = (model, op, payload, over) => run(model, command(model, op, payload, over));

/** A commit that succeeded: VALID_SOLID, invariant held, every derived vertex equals its planes' intersection. @param {any} out */
export function committed(out) {
  expect(out.result.status, JSON.stringify(out.result.error ?? out.result.validation?.issues?.slice(0, 3))).toBe('COMMITTED');
  const m = out.model;
  expect(m.state).toBe('VALID_SOLID');
  expect(maxPlaneDistance(m)).toBeLessThanOrEqual(PROFILE.planarTolM);
  for (const v of Object.values(m.vertices)) {
    const x = /** @type {any} */ (v);
    if (x.positionMode !== 'DERIVED') continue;
    const d = derivePoint(x.definingFaceIds.map((/** @type {string} */ f) => m.faces[f].supportPlane), PROFILE.numericEpsilon);
    expect(d, x.id).not.toBeNull();
    for (let i = 0; i < 3; i++) expect(x.p[i]).toBeCloseTo(/** @type {any} */ (d).p[i], 9);
  }
  return m;
}

/** A refusal with `code` that leaves the input untouched. @param {any} model @param {any} out @param {string} code */
export function refused(model, out, code) {
  expect(out.result.status).toBe('REJECTED');
  expect(out.result.error.code).toBe(code);
  expect(out.result.modelVersion).toBe(model.version);
  expect(out.model).toBe(model);
  expect(out.journal).toBeUndefined();
  return out.result.error;
}

/** @param {any} m @param {string} v @param {number[]} p */
export function at(m, v, p) {
  for (let i = 0; i < 3; i++) expect(m.vertices[v].p[i], `${v}[${i}]`).toBeCloseTo(p[i], 6);
}

/** Unit plane from a normal direction and a point. @param {number[]} dir @param {number[]} p */
export function plane(dir, p) {
  const l = Math.hypot(...dir);
  const n = dir.map((x) => x / l);
  return { normal: n, d: -(n[0] * p[0] + n[1] * p[1] + n[2] * p[2]) };
}

/** A model with extra constraints. @param {any[]} cs */
export function withConstraints(...cs) {
  const m = structuredClone(readFixture('GT-08', 'input.model.json'));
  for (const c of cs) m.constraints[c.id] = c;
  return deepFreeze(m);
}
