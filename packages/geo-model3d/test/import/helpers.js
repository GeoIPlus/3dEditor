// Test helpers for import (3D-10): default tolerance profile (contract tolerance-profile defaults, spec §2.3, D-13),
// golden CityJSON inputs, and independent measures of an imported model (area by Newell, volume by the divergence
// theorem) written here, not taken from kernel code (v0.2 F.3).
import { readFixture } from '../brep/helpers.js';

/** Contract tolerance-profile defaults (spec §2.3), with the profile id the golden steps name. */
export const PROFILE = Object.freeze({
  id: 'default', numericEpsilon: 1e-9, topologySnapTolM: 0.01, planarTolM: 0.02, zAlignTolM: 0.01, minEdgeLengthM: 0.05,
  minFaceAreaM2: 0.1, coplanarTolDeg: 1, footprintAngleTolDeg: 5, flatRoofTolDeg: 1, screenSnapPx: 10, heatmapBufferM: 1,
  planeFitMinPoints: 30, planeFitMinInlierRatio: 0.6, exportRoundDecimals: 3,
});

/** @param {string} gt @returns {{ document: any, step: any, expected: any }} */
export function goldenImport(gt) {
  const steps = readFixture(gt, 'steps.json');
  const step = steps.find((/** @type {any} */ s) => s.step === 'IMPORT');
  return { document: readFixture(gt, step.document), step, expected: readFixture(gt, 'expected.json') };
}

/** @param {any} m @param {string} start @returns {number[][]} ring positions */
export function ringPoints(m, start) {
  const out = [];
  let h = m.halfEdges[start];
  do { out.push(m.vertices[h.startVertexId].p); h = m.halfEdges[h.nextId]; } while (h.id !== start);
  return out;
}

/** @param {number[][]} r @returns {number[]} Newell vector (twice the vector area) */
function newellVec(r) {
  const n = [0, 0, 0];
  for (let i = 0; i < r.length; i++) {
    const a = r[i], b = r[(i + 1) % r.length];
    n[0] += (a[1] - b[1]) * (a[2] + b[2]);
    n[1] += (a[2] - b[2]) * (a[0] + b[0]);
    n[2] += (a[0] - b[0]) * (a[1] + b[1]);
  }
  return n;
}

/** Area of a face (outer minus holes; rings as stored). @param {any} m @param {any} f @returns {number} */
export function faceArea(m, f) {
  const n = [f.outerLoopId, ...f.innerLoopIds].map((s) => newellVec(ringPoints(m, s)))
    .reduce((acc, v) => [acc[0] + v[0], acc[1] + v[1], acc[2] + v[2]], [0, 0, 0]);
  return Math.hypot(n[0], n[1], n[2]) / 2;
}

/** Volume of the closed faces by the divergence theorem (fan triangles of each ring). @param {any} m @returns {number} */
export function volume(m) {
  let v = 0;
  for (const f of Object.values(m.faces)) {
    for (const s of [/** @type {any} */ (f).outerLoopId, .../** @type {any} */ (f).innerLoopIds]) {
      const r = ringPoints(m, s);
      for (let i = 1; i + 1 < r.length; i++) {
        const [a, b, c] = [r[0], r[i], r[i + 1]];
        v += (a[0] * (b[1] * c[2] - b[2] * c[1]) - a[1] * (b[0] * c[2] - b[2] * c[0]) + a[2] * (b[0] * c[1] - b[1] * c[0])) / 6;
      }
    }
  }
  return v;
}

/** Undirected edge counts per role (a twin pair counts once). @param {any} m @returns {Record<string, number>} */
export function roleCounts(m) {
  /** @type {Record<string, number>} */
  const out = {};
  for (const h of Object.values(m.halfEdges)) {
    const he = /** @type {any} */ (h);
    if (he.twinId && he.twinId < he.id) continue;
    out[he.edgeRole] = (out[he.edgeRole] ?? 0) + 1;
  }
  return out;
}

/**
 * A CityJSON 2.0 document in EPSG:25832 with millimetre integers (the golden writer conventions, fixtures/README.md).
 * @param {number[][]} pointsM local metres
 * @param {Record<string, any>} objects CityObjects
 * @param {string} [crs]
 */
export function makeDoc(pointsM, objects, crs = 'https://www.opengis.net/def/crs/EPSG/0/25832') {
  return {
    type: 'CityJSON', version: '2.0', transform: { scale: [0.001, 0.001, 0.001], translate: [512000, 6170000, 0] },
    metadata: { referenceSystem: crs }, vertices: pointsM.map((p) => p.map((c) => Math.round(c * 1000))), CityObjects: objects,
  };
}

/**
 * Solid geometry; `types[i]` the semantic type of surface i (null: no semantics for it; omitted: no semantics at all).
 * @param {number[][]} surfaces outer rings of vertex indices @param {(string | null)[]} [types] @param {string} [lod]
 */
export function solid(surfaces, types, lod = '2.2') {
  const g = /** @type {any} */ ({ type: 'Solid', lod, boundaries: [surfaces.map((r) => [r])] });
  if (types) {
    const kinds = [...new Set(types.filter((t) => t !== null))];
    g.semantics = { surfaces: kinds.map((type) => ({ type })), values: [types.map((t) => (t === null ? null : kinds.indexOf(t)))] };
  }
  return g;
}

/** Box x0..x1, y0..y1, z0..z1: vertices and the six outward rings (counter-clockwise seen from outside). */
export function boxGeometry(/** @type {number[]} */ [x0, y0, z0, x1, y1, z1], offset = 0) {
  const points = [[x0, y0, z0], [x1, y0, z0], [x1, y1, z0], [x0, y1, z0], [x0, y0, z1], [x1, y0, z1], [x1, y1, z1], [x0, y1, z1]];
  const o = (/** @type {number[]} */ r) => r.map((i) => i + offset);
  const rings = [o([3, 2, 1, 0]), o([0, 1, 5, 4]), o([1, 2, 6, 5]), o([2, 3, 7, 6]), o([3, 0, 4, 7]), o([4, 5, 6, 7])];
  return { points, rings, types: ['GroundSurface', 'WallSurface', 'WallSurface', 'WallSurface', 'WallSurface', 'RoofSurface'] };
}
