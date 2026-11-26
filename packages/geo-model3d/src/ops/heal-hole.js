// ops (3D-17): HEAL_HOLE (spec §10.8 r2; v0.2 C.14; D-76, D-284..D-286). The operator names the hole's open boundary
// half-edges and a mode: COPY_NEIGHBOR_PLANE (plane of a face beside the hole), FIT_MEASUREMENTS (least-squares plane
// of POINT measurements, D-215) or FILL_PLANAR (least-squares plane of the hole's vertices). The closing is made only
// when it is compatible (heal-closing.js); otherwise INVALID_GEOMETRY, several closings UNDERCONSTRAINED_GEOMETRY, both
// with `details.admissibleModes` - the modes that would close this hole, a proposal the operator may send (D-285).
// The new face's kind is inferred (spec §6 r7) and tagged SEMANTICS_INFERRED for the operator to confirm (D-286).
import { refuse } from './errors.js';
import { idList } from './repair-topology.js';
import { holeLoop, loopPoints, fitPlane, orient, ringNormal, checkClosing, inferKind, measuredPoints } from './heal-closing.js';

/** @typedef {import('./pipeline.js').OpContext} OpContext */
/** @typedef {import('./pipeline.js').OpResult} OpResult */
/** @typedef {import('../brep/types.js').BuildingModel} BuildingModel */
/** @typedef {import('../brep/plane.js').Plane} Plane */
/** @typedef {import('./heal-closing.js').LoopEdge} LoopEdge */

const MODES = ['COPY_NEIGHBOR_PLANE', 'FIT_MEASUREMENTS', 'FILL_PLANAR'];

/**
 * @param {BuildingModel} draft
 * @param {any} payload contract `command-payload-heal-hole`
 * @param {OpContext} ctx
 * @returns {OpResult}
 */
export function healHole(draft, payload, ctx) {
  const tol = ctx.tol;
  if (!payload || !idList(payload.boundaryEdgeIds) || !MODES.includes(payload.mode)) return refuse('INVALID_PAYLOAD', [], 'boundaryEdgeIds and mode');
  const maxM = payload.maxDisplacementM ?? tol.planarTolM; // D-284
  if (!(typeof maxM === 'number' && maxM >= 0 && Number.isFinite(maxM))) return refuse('INVALID_PAYLOAD', [], 'maxDisplacementM');
  const h = holeLoop(draft, payload.boundaryEdgeIds);
  if (!h.ok) {
    // [A] several ways to chain the edges: no mode is admissible until the operator names one ring
    return refuse(h.code, h.ids, h.why, h.code === 'UNDERCONSTRAINED_GEOMETRY' ? { admissibleModes: [] } : undefined);
  }
  const loop = h.loop;
  const around = neighbours(draft, loop);
  const admissible = () => ({ admissibleModes: admissibleModes(draft, loop, around, maxM, tol) });

  /** @type {Plane | null} */
  let plane;
  if (payload.mode === 'COPY_NEIGHBOR_PLANE') {
    if (!around.includes(payload.neighborFaceId)) return refuse('INVALID_PAYLOAD', [payload.neighborFaceId ?? ''].filter(Boolean), 'neighborFaceId is not a face beside the hole');
    plane = orient(draft.faces[payload.neighborFaceId].supportPlane, ringNormal(draft, loop));
  } else if (payload.mode === 'FIT_MEASUREMENTS') {
    if (!idList(payload.measurementIds)) return refuse('INVALID_PAYLOAD', [], 'measurementIds');
    const m = measuredPoints(draft, payload.measurementIds, ctx.pointToLocal);
    if (!m.ok) return refuse(m.code, m.ids, 'FIT_MEASUREMENTS needs POINT measurements [[x, y, z]] (D-215)');
    plane = fitPlane(m.pts, ringNormal(draft, loop), tol.numericEpsilon);
    if (!plane) return refuse('UNDERCONSTRAINED_GEOMETRY', payload.measurementIds, 'the measurements do not fix a plane', admissible());
  } else {
    plane = fitPlane(loopPoints(draft, loop), ringNormal(draft, loop), tol.numericEpsilon);
    if (!plane) return refuse('INVALID_GEOMETRY', loop.map((l) => l.he), 'the hole vertices do not fix a plane', admissible());
  }
  const c = checkClosing(draft, loop, plane, maxM, tol);
  if (!c.ok) return refuse('INVALID_GEOMETRY', c.ids, c.why, admissible());

  const faceId = ctx.ids('face');
  const heIds = loop.map(() => ctx.ids('halfEdge'));
  const n = loop.length;
  loop.forEach((l, k) => {
    const twin = draft.halfEdges[l.he];
    draft.halfEdges[heIds[k]] = {
      id: heIds[k], startVertexId: l.from, nextId: heIds[(k + 1) % n], prevId: heIds[(k + n - 1) % n], faceId,
      twinId: l.he, edgeRole: twin.edgeRole,
    };
    twin.twinId = heIds[k];
  });
  const surfaceKind = inferKind(plane.normal);
  /** @type {import('../brep/types.js').Face} */
  const face = { id: faceId, outerLoopId: heIds[0], innerLoopIds: [], supportPlane: plane, surfaceKind, tags: ['SEMANTICS_INFERRED'] };
  const rcFace = surfaceKind === 'RoofSurface' ? around.find((f) => draft.faces[f].roofComponentId && draft.faces[f].surfaceKind === 'RoofSurface') : undefined;
  if (rcFace) {
    face.roofComponentId = /** @type {string} */ (draft.faces[rcFace].roofComponentId);
    draft.roofComponents[face.roofComponentId].faceIds.push(faceId);
  }
  draft.faces[faceId] = face;
  const shells = Object.values(draft.shells).filter((s) => s.faceIds.some((f) => around.includes(f)));
  if (shells.length !== 1) return refuse('INVALID_TOPOLOGY', around, 'the faces around the hole are not in one shell');
  shells[0].faceIds.push(faceId);
  for (const [vId, pos] of Object.entries(c.positions)) {
    const v = draft.vertices[vId];
    v.definingFaceIds.push(faceId);
    v.p = pos.p;
    v.positionMode = pos.mode;
  }
  return { ok: true };
}

/** Faces beside the hole, in ring order. @param {BuildingModel} m @param {LoopEdge[]} loop @returns {string[]} */
const neighbours = (m, loop) => [...new Set(loop.map((l) => m.halfEdges[l.he].faceId))];

/**
 * Modes that close this hole compatibly (D-76, D-285). FIT_MEASUREMENTS cannot be checked before the operator
 * picks points: [A] it is listed when the model holds at least three POINT measurements.
 * @param {BuildingModel} m @param {LoopEdge[]} loop @param {string[]} around @param {number} maxM @param {any} tol
 * @returns {string[]}
 */
export function admissibleModes(m, loop, around, maxM, tol) {
  const out = [];
  const towards = ringNormal(m, loop);
  if (around.some((f) => checkClosing(m, loop, orient(m.faces[f].supportPlane, towards), maxM, tol).ok)) out.push('COPY_NEIGHBOR_PLANE');
  if (Object.values(m.measurements).filter((x) => x.geometry?.kind === 'POINT').length >= 3) out.push('FIT_MEASUREMENTS');
  const fill = fitPlane(loopPoints(m, loop), towards, tol.numericEpsilon);
  if (fill && checkClosing(m, loop, fill, maxM, tol).ok) out.push('FILL_PLANAR');
  return out;
}
