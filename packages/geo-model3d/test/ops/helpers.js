// Test helpers for ops (3D-14): the full tolerance profile (spec §2.3, D-13), clock, command builder, contract checks
// with Ajv, and metrics computed independently of the kernel (v0.2 F.3): Newell area and divergence volume over the
// face rings, from vertex coordinates only.
import { expect } from 'vitest';
import { createAjv } from '../../../../contracts/model3d/test/load.mjs';
import { executeCommand } from '@geoiplus/geo-model3d';
import { readFixture } from '../brep/helpers.js';

/** Tolerance profile defaults, 14 fields (spec §2.3). */
export const PROFILE = {
  numericEpsilon: 1e-9, topologySnapTolM: 0.01, planarTolM: 0.02, zAlignTolM: 0.01, minEdgeLengthM: 0.05,
  minFaceAreaM2: 0.1, coplanarTolDeg: 1, footprintAngleTolDeg: 5, flatRoofTolDeg: 1, screenSnapPx: 10,
  heatmapBufferM: 1, planeFitMinPoints: 30, planeFitMinInlierRatio: 0.6, exportRoundDecimals: 3,
};
export const NOW = '2026-11-24T00:00:00Z';
export const clock = () => NOW;

const ajv = createAjv();
const schema = (/** @type {string} */ n) => /** @type {import('ajv').ValidateFunction} */ (ajv.getSchema(`urn:geoiplus:schema:model3d-${n}:v1`));
const v = { result: schema('command-result'), model: schema('building-model'), journal: schema('journal-entry'), command: schema('command') };

/** @param {'result' | 'model' | 'journal' | 'command'} kind @param {any} value */
export function contractValid(kind, value) {
  const ok = v[kind](value);
  expect(ok, JSON.stringify(v[kind].errors?.slice(0, 3))).toBe(true);
  return value;
}

/**
 * A command on `model` (LOCAL, VALID_SOLID target, COMMIT unless given).
 * @param {any} model @param {string} operation @param {any} payload @param {Record<string, any>} [over]
 */
export const command = (model, operation, payload, over = {}) => ({
  schemaVersion: '1', commandId: 'cmd-t', projectId: model.projectId, buildingId: model.buildingId, actorId: 'usr-t',
  operation, phase: 'COMMIT', expectedVersion: model.version, payload, coordinateFrame: 'LOCAL', targetState: 'VALID_SOLID', ...over,
});

/**
 * Run a command and check every output against its contract.
 * @param {any} model @param {any} cmd @param {Record<string, any>} [opts]
 */
export function run(model, cmd, opts = {}) {
  const out = executeCommand(model, cmd, { toleranceProfile: PROFILE, clock, ...opts });
  contractValid('result', out.result);
  if (out.journal) {
    contractValid('model', out.model);
    contractValid('journal', { ...out.journal, operationId: 'op-t', actorId: 'usr-t' });
  }
  return out;
}

/** @param {any} m @param {string} faceId @returns {number[][][]} rings of vertex positions, outer first */
export function rings(m, faceId) {
  const f = m.faces[faceId];
  return [f.outerLoopId, ...f.innerLoopIds].map((start) => {
    const out = [];
    let h = m.halfEdges[start];
    do { out.push(m.vertices[h.startVertexId].p); h = m.halfEdges[h.nextId]; } while (h.id !== start && out.length < 1e5);
    return out;
  });
}

/** Newell vector of a ring. @param {number[][]} r */
function newell(r) {
  const n = [0, 0, 0];
  r.forEach((a, i) => {
    const b = r[(i + 1) % r.length];
    n[0] += (a[1] - b[1]) * (a[2] + b[2]); n[1] += (a[2] - b[2]) * (a[0] + b[0]); n[2] += (a[0] - b[0]) * (a[1] + b[1]);
  });
  return n;
}

/** Area of a face with holes (outer minus holes, holes opposite in orientation). @param {any} m @param {string} f */
export function faceArea(m, f) {
  const s = rings(m, f).map(newell).reduce((a, n) => [a[0] + n[0], a[1] + n[1], a[2] + n[2]], [0, 0, 0]);
  return Math.hypot(s[0], s[1], s[2]) / 2;
}

/** Volume by the divergence theorem over fan triangles of every ring (outward rings). @param {any} m @param {string[]} faceIds */
export function volume(m, faceIds) {
  let vol = 0;
  for (const f of faceIds) for (const r of rings(m, f)) {
    for (let i = 1; i + 1 < r.length; i++) {
      const [a, b, c] = [r[0], r[i], r[i + 1]];
      vol += (a[0] * (b[1] * c[2] - b[2] * c[1]) - a[1] * (b[0] * c[2] - b[2] * c[0]) + a[2] * (b[0] * c[1] - b[1] * c[0])) / 6;
    }
  }
  return vol;
}

/** @param {any} m */
export function metrics(m) {
  const faces = Object.values(m.faces);
  const roof = faces.filter((f) => f.surfaceKind === 'RoofSurface');
  const shell = /** @type {any} */ (Object.values(m.shells)[0]);
  return {
    roofFaces: roof.length,
    roofAreaM2: roof.reduce((s, f) => s + faceArea(m, f.id), 0),
    volumeM3: volume(m, shell.faceIds),
    walls: faces.filter((f) => f.surfaceKind === 'WallSurface').length,
    groundAreaM2: faces.filter((f) => f.surfaceKind === 'GroundSurface').reduce((s, f) => s + faceArea(m, f.id), 0),
  };
}

/** Largest distance of a vertex from a plane of its defining faces (spec §4 shared invariant). @param {any} m */
export function maxPlaneDistance(m) {
  let max = 0;
  for (const v of Object.values(m.vertices)) for (const f of /** @type {any} */ (v).definingFaceIds) {
    const pl = m.faces[f].supportPlane, p = /** @type {any} */ (v).p;
    max = Math.max(max, Math.abs(pl.normal[0] * p[0] + pl.normal[1] * p[1] + pl.normal[2] * p[2] + pl.d));
  }
  return max;
}

/** Input model of the template tests: the GT-I1 gable as imported (fixture GT-03, D-100). @returns {any} */
export const gableModel = () => structuredClone(readFixture('GT-03', 'input.model.json'));

/** The model with another footprint outer ring (old walls are replaced anyway). @param {number[][]} ring @param {number[][][]} [holes] */
export function withFootprint(ring, holes = []) {
  const m = gableModel();
  m.footprints['fp-1'].outerRing = ring;
  m.footprints['fp-1'].innerRings = holes;
  return m;
}

/** Commit a REPLACE_ROOF and return the output. @param {any} model @param {any} payload @param {Record<string, any>} [over] */
export const replaceRoof = (model, payload, over) => run(model, command(model, 'REPLACE_ROOF', { footprintId: 'fp-1', ...payload }, over));

/** atan(rise / run) in degrees. @param {number} rise @param {number} run */
export const slopeDeg = (rise, run) => (Math.atan2(rise, run) * 180) / Math.PI;
