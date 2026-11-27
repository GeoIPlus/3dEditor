// Test helpers for 3D-124 (D-384): GT-03 with a 0.6 m overhang on the south eave and the acceptance checks of the
// rebuild, computed outside the operation code (strip on its parent plane, width in plan from the wall, soffit
// through the outer edge and level across it (D-3D131-1), caps on the end-wall planes, ids kept, no delete / create of kept ids).
import { expect } from 'vitest';
import { deepFreeze, readFixture } from '../brep/helpers.js';
import { exec, sound } from './envelope.helpers.js';
import { PROFILE } from './helpers.js';
import { overhangsOf } from '../../src/ops/dependents.js';

export const S = 'he-f-roof-s-0';
export const N = 'he-f-roof-n-0';
export const WIDTH = 0.6;
const dot = (/** @type {number[]} */ n, /** @type {number[]} */ p) => n[0] * p[0] + n[1] * p[1] + n[2] * p[2];
const off = (/** @type {any} */ pl, /** @type {number[]} */ p) => dot(pl.normal, p) + pl.d;

/** GT-03 (or `name`) with overhangs of WIDTH on `eaves`. @param {string[]} [eaves] @param {string} [name] */
export function withOverhang(eaves = [S], name = 'GT-03') {
  const m = readFixture(name, 'input.model.json');
  const out = exec(m, 'SET_OVERHANG', { eaveEdgeIds: eaves, overhangM: WIDTH });
  expect(out.result.status).toBe('COMMITTED');
  return deepFreeze(out.model);
}

/** Ids of every overhang entity of a model, sorted. @param {any} m */
export function overhangIds(m) {
  return overhangsOf(m).flatMap(({ f }) => [f.strip, f.soffit, f.capA, f.capB, f.oA, f.oB, f.sA, f.sB, ...Object.values(f.he)]).sort();
}

/**
 * The overhangs of `before` follow their parents in `out`: acceptance of 3D-124.
 * @param {any} before @param {any} out pipeline output (COMMITTED)
 * @param {number} [widthTol] width in plan at both outer corners
 */
export function follows(before, out, widthTol = PROFILE.numericEpsilon * 10) {
  expect(out.result.status).toBe('COMMITTED');
  const m = out.model;
  expect(m.state).toBe('VALID_SOLID');
  sound(m);
  const kept = overhangIds(before);
  expect(overhangIds(m)).toEqual(kept);
  const touched = new Set([...out.result.patch.added.map((/** @type {any} */ c) => c.entity.id), ...out.result.patch.deleted.map((/** @type {any} */ d) => d.id)]);
  expect(kept.filter((id) => touched.has(id))).toEqual([]);
  for (const { h, f } of overhangsOf(m)) {
    const R = m.faces[m.halfEdges[h].faceId], W = m.faces[f.wall];
    const strip = m.faces[f.strip];
    for (const v of [f.oA, f.oB]) {
      const p = m.vertices[v].p;
      expect(Math.abs(off(R.supportPlane, p))).toBeLessThanOrEqual(PROFILE.planarTolM);
      expect(Math.abs(off(strip.supportPlane, p))).toBeLessThanOrEqual(PROFILE.planarTolM);
      expect(Math.abs(off(W.supportPlane, p) - WIDTH)).toBeLessThanOrEqual(widthTol);
      expect(Math.abs(off(m.faces[f.soffit].supportPlane, p))).toBeLessThanOrEqual(PROFILE.planarTolM);
    }
    level(m.faces[f.soffit].supportPlane, W.supportPlane, m.vertices[f.oA].p, m.vertices[f.oB].p);
    samePlane(m.faces[f.capA].supportPlane, m.faces[f.gA].supportPlane);
    samePlane(m.faces[f.capB].supportPlane, m.faces[f.gB].supportPlane);
    samePlane(strip.supportPlane, R.supportPlane);
  }
}

/**
 * Soffit of D-3D131-1: through both outer corners, level across the overhang (contains W's horizontal normal), facing
 * down; horizontal z = oA.z when the corners are level. @param {any} sp @param {any} wp @param {number[]} a @param {number[]} b
 */
function level(sp, wp, a, b) {
  for (const p of [a, b]) expect(Math.abs(off(sp, p))).toBeLessThanOrEqual(PROFILE.numericEpsilon * 10);
  expect(Math.abs(sp.normal[0] * wp.normal[0] + sp.normal[1] * wp.normal[1])).toBeLessThanOrEqual(PROFILE.numericEpsilon);
  expect(sp.normal[2]).toBeLessThan(0);
  if (Math.abs(a[2] - b[2]) <= PROFILE.numericEpsilon) samePlane(sp, { normal: [0, 0, -1], d: a[2] });
}

/** Planes equal within numericEpsilon (0 and -0 alike). @param {any} a @param {any} b */
function samePlane(a, b) {
  for (let i = 0; i < 3; i++) expect(Math.abs(a.normal[i] - b.normal[i])).toBeLessThanOrEqual(PROFILE.numericEpsilon);
  expect(Math.abs(a.d - b.d)).toBeLessThanOrEqual(PROFILE.numericEpsilon * 10);
}

/** @param {any} m @param {any} out @param {string[]} [codes] */
export function refusedUnchanged(m, out, codes = ['INVALID_TOPOLOGY', 'CONSTRAINT_CONFLICT', 'INVALID_GEOMETRY']) {
  expect(out.result.status).toBe('REJECTED');
  expect(codes).toContain(out.result.error.code);
  expect(out.model).toBe(m);
}
