// Test helpers for 3D-114.1 REGULARIZE_FOOTPRINT: models built by REPLACE_ROOF over a given footprint, the command,
// and lookups by geometry (wall ids of a built envelope are not fixed by these tests).
import { expect } from 'vitest';
import { withFootprint, run, command, PROFILE } from './helpers.js';
import { exec } from './envelope.helpers.js';
import { deepFreeze } from '../brep/helpers.js';

/**
 * A committed REPLACE_ROOF model over the ring (and courtyards).
 * @param {number[][]} ring @param {any} roof REPLACE_ROOF payload @param {number[][][]} [holes] @param {any} [opts]
 */
export function built(ring, roof = { template: 'FLAT', roofZ: 5 }, holes = [], opts = {}) {
  const m = withFootprint(ring, holes);
  const out = run(m, command(m, 'REPLACE_ROOF', { footprintId: 'fp-1', ...roof }), opts);
  expect(out.result.status, JSON.stringify(out.result.error)).toBe('COMMITTED');
  return deepFreeze(out.model);
}

/** @param {any} m @param {{ orthogonalize?: boolean, allowCourtyardRemoval?: boolean }} [flags] @param {any} [opts] */
export const regularize = (m, flags = {}, opts = {}) =>
  exec(m, 'REGULARIZE_FOOTPRINT', { footprintId: 'fp-1', allowCourtyardRemoval: false, orthogonalize: false, ...flags }, opts);

/** Walls of the model. @param {any} m @returns {any[]} */
export const walls = (m) => Object.values(m.faces).filter((f) => f.surfaceKind === 'WallSurface').sort((a, b) => (a.id < b.id ? -1 : 1));

/** The wall whose plane passes through the plan point with the given outward normal direction. @param {any} m @param {number[]} q @param {number[]} n */
export function wallAt(m, q, n, eps = 1e-6) {
  const w = walls(m).filter((f) => Math.abs(f.supportPlane.normal[0] * q[0] + f.supportPlane.normal[1] * q[1] + f.supportPlane.d) < eps
    && f.supportPlane.normal[0] * n[0] + f.supportPlane.normal[1] * n[1] > 0.99);
  expect(w, JSON.stringify(q)).toHaveLength(1);
  return w[0];
}

export const STD = { toleranceProfile: PROFILE };
