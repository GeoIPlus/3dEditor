// Test helpers for validate (3D-12): tolerances (spec §2.3, D-13), clock, Ajv for `validation-report`, and builders
// that turn golden inputs (fixtures/, 3D-07) into defective models - each mutation produces one defect on purpose.
import { createAjv } from '../../../../contracts/model3d/test/load.mjs';
import { readFixture } from '../brep/helpers.js';
import { validateModel } from '../../src/index.js';
import { endVertexId } from '../../src/brep/index.js';

export { readFixture, goldenModels, deepFreeze } from '../brep/helpers.js';

/** Defaults of the tolerance profile the validator reads (spec §2.3). */
export const TOLS = Object.freeze({ numericEpsilon: 1e-9, topologySnapTolM: 0.01, planarTolM: 0.02, minEdgeLengthM: 0.05, minFaceAreaM2: 0.1 });
export const NOW = '2026-11-23T12:00:00Z';
export const clock = () => NOW;

const ajv = createAjv();
export const reportSchema = /** @type {import('ajv').ValidateFunction} */ (ajv.getSchema('urn:geoiplus:schema:model3d-validation-report:v1'));

/** @param {any} report @returns {any} the report, after asserting it is valid against the contract */
export function contractValid(report) {
  if (!reportSchema(report)) throw new Error(`report invalid: ${JSON.stringify(reportSchema.errors)}`);
  return report;
}

/** @param {any} model @param {any} opts @returns {Promise<any>} */
export const validate = async (model, opts) => contractValid(await validateModel(model, { tolerances: TOLS, clock, ...opts }));

/** @param {string} gt @param {string} [file] @returns {any} a fresh copy of a golden input model */
export const golden = (gt, file = 'input.model.json') => structuredClone(readFixture(gt, file));

/** @param {number[][]} ring @returns {number[]} */
function newell(ring) {
  const n = [0, 0, 0];
  for (let i = 0; i < ring.length; i++) {
    const a = ring[i];
    const b = ring[(i + 1) % ring.length];
    n[0] += a[1] * b[2] - a[2] * b[1];
    n[1] += a[2] * b[0] - a[0] * b[2];
    n[2] += a[0] * b[1] - a[1] * b[0];
  }
  return n;
}

/**
 * Add a polyhedron (faces as vertex-id rings, outward right-hand order) to a shell; twins are matched by vertex pairs
 * inside the new faces and against existing half-edges with a null twin. New vertices: `points` (id -> p).
 * @param {any} model @param {string} shellId @param {string} prefix id prefix
 * @param {Record<string, number[]>} points @param {string[][]} faces
 */
export function addPolyhedron(model, shellId, prefix, points, faces) {
  for (const [id, p] of Object.entries(points)) model.vertices[id] = { id, p, definingFaceIds: [], positionMode: 'EXPLICIT' };
  faces.forEach((ring, fi) => {
    const fid = `${prefix}-f${fi}`;
    const pts = ring.map((v) => model.vertices[v].p);
    const n = newell(pts);
    const len = Math.hypot(...n);
    const normal = n.map((x) => x / len);
    const d = -(normal[0] * pts[0][0] + normal[1] * pts[0][1] + normal[2] * pts[0][2]);
    const hes = ring.map((_, i) => `${fid}-he${i}`);
    hes.forEach((h, i) => {
      model.halfEdges[h] = { id: h, startVertexId: ring[i], nextId: hes[(i + 1) % hes.length], prevId: hes[(i + hes.length - 1) % hes.length], faceId: fid, twinId: null, edgeRole: 'GENERIC' };
    });
    model.faces[fid] = { id: fid, outerLoopId: hes[0], innerLoopIds: [], supportPlane: { normal, d }, surfaceKind: 'WallSurface', tags: [] };
    model.shells[shellId].faceIds.push(fid);
    ring.forEach((v) => { if (!model.vertices[v].definingFaceIds.includes(fid)) model.vertices[v].definingFaceIds.push(fid); });
  });
  const open = Object.values(model.halfEdges).filter((h) => h.twinId === null);
  for (const h of open) {
    if (h.twinId !== null) continue;
    const a = h.startVertexId;
    const b = endVertexId(model, h.id);
    const tw = open.find((o) => o !== h && o.twinId === null && o.startVertexId === b && endVertexId(model, o.id) === a);
    if (tw) { h.twinId = tw.id; tw.twinId = h.id; }
  }
}

/** A new shell + solid holding an axis-aligned box. @param {any} model @param {string} prefix @param {number[]} min @param {number[]} max */
export function addBoxSolid(model, prefix, min, max) {
  const sh = `${prefix}-sh`;
  model.shells[sh] = { id: sh, faceIds: [], intendedRole: 'OUTER', isClosed: true };
  model.solids[`${prefix}-so`] = { id: `${prefix}-so`, outerShellId: sh, voidShellIds: [] };
  const [x0, y0, z0] = min;
  const [x1, y1, z1] = max;
  const v = (/** @type {string} */ k) => `${prefix}-${k}`;
  addPolyhedron(model, sh, prefix, {
    [v('a')]: [x0, y0, z0], [v('b')]: [x1, y0, z0], [v('c')]: [x1, y1, z0], [v('d')]: [x0, y1, z0],
    [v('e')]: [x0, y0, z1], [v('f')]: [x1, y0, z1], [v('g')]: [x1, y1, z1], [v('h')]: [x0, y1, z1],
  }, [
    [v('a'), v('d'), v('c'), v('b')], [v('e'), v('f'), v('g'), v('h')], [v('a'), v('b'), v('f'), v('e')],
    [v('b'), v('c'), v('g'), v('f')], [v('c'), v('d'), v('h'), v('g')], [v('d'), v('a'), v('e'), v('h')],
  ]);
}

/** A tetrahedron (outward faces) added to an existing shell. @param {any} model @param {string} shellId @param {string} prefix @param {Record<string, number[]>} pts 4 points, ids may be existing vertices */
export function addTetra(model, shellId, prefix, pts) {
  let [a, b, c, d] = Object.keys(pts);
  const P = (/** @type {string} */ k) => pts[k];
  const n = newell([P(a), P(b), P(c)]);
  if (n[0] * (P(d)[0] - P(a)[0]) + n[1] * (P(d)[1] - P(a)[1]) + n[2] * (P(d)[2] - P(a)[2]) > 0) [b, c] = [c, b];
  const fresh = Object.fromEntries(Object.entries(pts).filter(([k]) => !model.vertices[k]));
  addPolyhedron(model, shellId, prefix, fresh, [[a, b, c], [b, a, d], [c, b, d], [a, c, d]]);
}

/** Reverse the ring of a face (and its plane) in place. @param {any} model @param {string} faceId */
export function reverseFace(model, faceId) {
  const f = model.faces[faceId];
  const ring = [];
  let h = f.outerLoopId;
  do { ring.push(h); h = model.halfEdges[h].nextId; } while (h !== f.outerLoopId);
  const ends = ring.map((id) => endVertexId(model, id));
  ring.forEach((id, i) => {
    const he = model.halfEdges[id];
    he.startVertexId = ends[i];
    [he.nextId, he.prevId] = [he.prevId, he.nextId];
  });
  f.supportPlane = { normal: f.supportPlane.normal.map((/** @type {number} */ x) => (x === 0 ? 0 : -x)), d: f.supportPlane.d === 0 ? 0 : -f.supportPlane.d };
}
