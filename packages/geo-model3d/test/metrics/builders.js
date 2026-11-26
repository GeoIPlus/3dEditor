// Synthetic models for the overhang tests (3D-116; D-3D116-3), built with the validate test builder (outward rings,
// twins matched by vertex pairs): an L-shaped overhang prism on a box (concave planar boundary loop, OVM-07) and a
// copy of a whole building as a second main solid (overlapping overhang groups, OVM-27).
import { golden, addPolyhedron } from '../validate/helpers.js';

/**
 * Box [0,4]^3 with an L-section prism (x, z) = (0,0)(3,0)(3,1)(1,1)(1,3)(0,3), y in [-1, 0], on its south wall.
 * Volumes: box 64, prism 5 (L area 5 x depth 1). The prism faces are tagged OVERHANG; the remaining south wall
 * (y = 0, outward -y, toward the prism) is the closing wall.
 */
export function lModel() {
  const m = golden('GT-03');
  for (const k of ['vertices', 'halfEdges', 'faces', 'shells', 'solids', 'roofComponents', 'constraints', 'footprints']) m[k] = {};
  m.semantics = { 'sem-bld': { id: 'sem-bld', kind: 'Building', solidIds: ['so-1'], attributes: {} } };
  m.shells['sh-1'] = { id: 'sh-1', faceIds: [], intendedRole: 'OUTER', isClosed: true };
  m.solids['so-1'] = { id: 'so-1', outerShellId: 'sh-1', voidShellIds: [] };
  m.state = 'DRAFT_SOLID';
  /** @type {Record<string, number[]>} */
  const P = {
    A0: [0, 0, 0], B0: [4, 0, 0], C0: [4, 4, 0], D0: [0, 4, 0], A1: [0, 0, 4], B1: [4, 0, 4], C1: [4, 4, 4], D1: [0, 4, 4],
    L2: [3, 0, 0], L3: [3, 0, 1], L4: [1, 0, 1], L5: [1, 0, 3], L6: [0, 0, 3],
    M1: [0, -1, 0], M2: [3, -1, 0], M3: [3, -1, 1], M4: [1, -1, 1], M5: [1, -1, 3], M6: [0, -1, 3],
  };
  addPolyhedron(m, 'sh-1', 'b', P, [
    ['A1', 'B1', 'C1', 'D1'], ['D0', 'D1', 'C1', 'C0'], ['B0', 'C0', 'C1', 'B1'], ['A0', 'L6', 'A1', 'D1', 'D0'],
    ['A0', 'D0', 'C0', 'B0', 'L2'], ['L2', 'B0', 'B1', 'A1', 'L6', 'L5', 'L4', 'L3'],
  ]);
  addPolyhedron(m, 'sh-1', 'p', {}, [
    ['M1', 'M2', 'M3', 'M4', 'M5', 'M6'], ['A0', 'L2', 'M2', 'M1'], ['L2', 'L3', 'M3', 'M2'], ['L3', 'L4', 'M4', 'M3'],
    ['L4', 'L5', 'M5', 'M4'], ['L5', 'L6', 'M6', 'M5'], ['L6', 'A0', 'M1', 'M6'],
  ]);
  for (const f of Object.keys(m.faces)) if (f.startsWith('p-')) m.faces[f].tags = ['OVERHANG'];
  return m;
}

/**
 * The model with a second copy of its main solid (ids prefixed `c-`) in the same place, as another main solid.
 * @param {any} model
 */
export function withCopy(model) {
  const m = structuredClone(model);
  const c = (/** @type {string} */ id) => `c-${id}`;
  for (const v of Object.values(model.vertices)) m.vertices[c(v.id)] = { ...structuredClone(v), id: c(v.id), definingFaceIds: v.definingFaceIds.map(c) };
  for (const h of Object.values(model.halfEdges)) {
    m.halfEdges[c(h.id)] = { ...h, id: c(h.id), startVertexId: c(h.startVertexId), nextId: c(h.nextId), prevId: c(h.prevId), twinId: h.twinId === null ? null : c(h.twinId), faceId: c(h.faceId) };
  }
  for (const f of Object.values(model.faces)) {
    m.faces[c(f.id)] = { ...structuredClone(f), id: c(f.id), outerLoopId: c(f.outerLoopId), innerLoopIds: f.innerLoopIds.map(c) };
  }
  for (const sh of Object.values(model.shells)) m.shells[c(sh.id)] = { ...sh, id: c(sh.id), faceIds: sh.faceIds.map(c) };
  for (const so of Object.values(model.solids)) m.solids[c(so.id)] = { ...so, id: c(so.id), outerShellId: c(so.outerShellId), voidShellIds: so.voidShellIds.map(c) };
  return m;
}
