// ops (3D-14): build the envelope of one body from roof cells over its footprint (spec §10.3 r1, r7; v0.2 §11.4):
// roof faces from the cells, one vertical wall per footprint edge (outer and courtyard rings) up to the roof - its top
// runs through every roof vertex on that edge, so no T-junction -, and one GroundSurface at the base. Plane terms
// (D-08): every face gets its plane, vertices are re-derived from the planes they lie on (`rederive`).
// Ids (D-212): ground face, base vertices, their half-edges and the wall face of each footprint edge keep their old
// ids; the caller may pass roof face / vertex ids to keep; every other old entity of the body is deleted.
import { rederive } from '../brep/index.js';
import { onSegment, zAt } from './geom2.js';
import { writeFaces, assignRoles } from './topology.js';

/** @typedef {import('./geom2.js').P2} P2 */
/** @typedef {import('../brep/types.js').BuildingModel} BuildingModel */
/** @typedef {import('./footprint.js').FootprintBody} FootprintBody */
/** @typedef {import('./topology.js').NewFace} NewFace */
/** @typedef {import('./templates.js').Cell & { faceId?: string, vertexIds?: string[][] }} EnvelopeCell */
/** @typedef {{ numericEpsilon: number, topologySnapTolM: number, planarTolM: number, zAlignTolM: number }} EnvTol */

/** Plan key of a point (1e-7 m grid [A]); cells share the same computed corner values. @param {P2} p */
const key2 = (p) => `${Math.round(p[0] * 1e7)}:${Math.round(p[1] * 1e7)}`;

/**
 * @typedef {object} EnvelopeResult
 * @property {true} ok
 * @property {Record<string, string[]>} mapped old roof face -> new roof faces (D-212), for faces not kept
 * @property {Set<string>} removed every old id of the body that no longer exists
 * @property {string[]} faceIds the body's faces after the operation
 */

/**
 * @param {BuildingModel} draft mutated (a transaction's isolated copy)
 * @param {FootprintBody} body
 * @param {EnvelopeCell[]} cells
 * @param {{ ids: (kind: string) => string, tol: EnvTol }} ctx
 * @returns {EnvelopeResult | { ok: false, reason: string }}
 */
export function buildEnvelope(draft, body, cells, ctx) {
  const { ids, tol } = ctx;
  const shell = draft.shells[body.shellId];
  const oldFaces = [...shell.faceIds];
  const oldHe = Object.values(draft.halfEdges).filter((h) => oldFaces.includes(h.faceId));
  const oldVertexIds = [...new Set(oldHe.map((h) => h.startVertexId))].sort();
  const endOf = (/** @type {any} */ h) => draft.halfEdges[h.nextId].startVertexId;

  // vertices: base ones reuse an old vertex at the same place, top ones come from the cells (or the caller's ids)
  /** @type {Map<string, { id: string, p: [number, number, number] }>} */
  const base = new Map(), top = new Map();
  const claimed = new Set();
  for (const ring of body.rings) {
    for (const q of ring) {
      const p = /** @type {[number, number, number]} */ ([q[0], q[1], body.baseZ]);
      const old = oldVertexIds.find((v) => !claimed.has(v) && near(draft.vertices[v].p, p, tol.topologySnapTolM));
      if (old) claimed.add(old);
      base.set(key2(q), { id: old ?? ids('vertex'), p });
    }
  }
  for (const cell of cells) {
    cell.rings.forEach((ring, k) => ring.forEach((q, i) => {
      if (top.has(key2(q))) return;
      const id = cell.vertexIds?.[k][i] ?? ids('vertex');
      top.set(key2(q), { id, p: [q[0], q[1], /** @type {number} */ (zAt(cell.plane, q[0], q[1], 0))] });
    }));
  }

  // old half-edges by face and direction; the wall face of a footprint edge is the face of its old bottom half-edge
  /** @type {Map<string, string>} */
  const oldEdges = new Map();
  for (const h of oldHe) oldEdges.set(`${h.faceId}|${h.startVertexId}|${endOf(h)}`, h.id);
  const keptRoofs = new Set(cells.map((c) => c.faceId).filter(Boolean));
  const oldRoofs = oldFaces.filter((f) => draft.faces[f].surfaceKind === 'RoofSurface' && !keptRoofs.has(f));
  const oldGround = oldFaces.filter((f) => draft.faces[f].surfaceKind === 'GroundSurface').sort();
  const claimedFaces = new Set(oldGround.slice(0, 1));
  const tops = [...top.entries()].map(([, v]) => v);

  /** @type {NewFace[]} */
  const faces = [];
  const groundId = oldGround[0] ?? ids('face');
  faces.push({
    id: groundId, plane: { normal: [0, 0, -1], d: body.baseZ }, surfaceKind: 'GroundSurface', keep: keepOf(draft, oldGround[0]),
    loops: body.rings.map((r) => [...r].reverse().map((q) => /** @type {any} */ (base.get(key2(q))).id)),
  });
  for (const ring of body.rings) {
    for (let i = 0; i < ring.length; i++) {
      const a = ring[i], b = ring[(i + 1) % ring.length];
      const va = /** @type {any} */ (base.get(key2(a))).id, vb = /** @type {any} */ (base.get(key2(b))).id;
      const onEdge = tops.map((t) => ({ t, s: onSegment([t.p[0], t.p[1]], a, b, 1e-7) })).filter((x) => x.s !== null);
      if (!onEdge.some((x) => key2([x.t.p[0], x.t.p[1]]) === key2(a)) || !onEdge.some((x) => key2([x.t.p[0], x.t.p[1]]) === key2(b))) {
        return { ok: false, reason: 'roof does not reach a footprint corner' };
      }
      onEdge.sort((x, y) => /** @type {number} */ (y.s) - /** @type {number} */ (x.s));
      const oldBottom = oldHe.find((h) => h.startVertexId === va && endOf(h) === vb && draft.faces[h.faceId].surfaceKind === 'WallSurface' && !claimedFaces.has(h.faceId));
      const id = oldBottom ? oldBottom.faceId : ids('face');
      claimedFaces.add(id);
      const dx = b[0] - a[0], dy = b[1] - a[1], l = Math.hypot(dx, dy);
      const normal = /** @type {[number, number, number]} */ ([dy / l, -dx / l, 0]);
      faces.push({
        id, plane: { normal, d: -(normal[0] * a[0] + normal[1] * a[1]) }, surfaceKind: 'WallSurface', keep: keepOf(draft, oldBottom?.faceId),
        loops: [[va, vb, ...onEdge.map((x) => x.t.id)]],
      });
    }
  }
  const roofIds = cells.map((c) => c.faceId ?? ids('face'));
  cells.forEach((c, n) => {
    if (c.faceId) claimedFaces.add(c.faceId);
    faces.push({
      id: roofIds[n], plane: c.plane, surfaceKind: 'RoofSurface', keep: keepOf(draft, c.faceId),
      loops: c.rings.map((r) => r.map((q) => /** @type {any} */ (top.get(key2(q))).id)),
    });
  });

  // remove the old body, then write the new one
  const keptVertices = new Set([...base.values(), ...top.values()].map((v) => v.id));
  const removed = new Set();
  for (const h of oldHe) { delete draft.halfEdges[h.id]; removed.add(h.id); }
  for (const f of oldFaces) if (!claimedFaces.has(f)) { delete draft.faces[f]; removed.add(f); }
  for (const v of oldVertexIds) if (!keptVertices.has(v)) { delete draft.vertices[v]; removed.add(v); }
  /** @type {Map<string, string[]>} */
  const incident = new Map();
  for (const f of faces) for (const loop of f.loops) for (const v of loop) {
    const l = incident.get(v) ?? [];
    if (!l.includes(f.id)) l.push(f.id);
    incident.set(v, l);
  }
  for (const v of [...base.values(), ...top.values()]) {
    const old = draft.vertices[v.id];
    draft.vertices[v.id] = { ...(old ?? {}), id: v.id, p: v.p, definingFaceIds: incident.get(v.id) ?? [], positionMode: 'EXPLICIT' };
  }
  const { halfEdgeIds, unpaired } = writeFaces(draft, faces, oldEdges, ids);
  for (const id of halfEdgeIds) removed.delete(id);
  if (unpaired.length > 0) return { ok: false, reason: 'roof edge not over the footprint outline' };
  rederive(draft, faces.map((f) => f.id), tol);
  assignRoles(draft, halfEdgeIds, tol.zAlignTolM);

  const faceIds = faces.map((f) => f.id);
  shell.faceIds = faceIds;
  const newRoofs = roofIds.filter((f) => !keptRoofs.has(f));
  updateRoofComponents(draft, body.ownerId, removed, newRoofs, ids);
  return { ok: true, mapped: newRoofs.length ? Object.fromEntries(oldRoofs.map((f) => [f, newRoofs])) : {}, removed, faceIds };
}

/**
 * Roof components of the body (v0.3 §4.2): removed faces leave their components; the new roof faces join the first
 * component (id order) that held a removed roof face of this owner, else a new component of the owner [A]; a component
 * left without faces is deleted.
 * @param {BuildingModel} draft @param {string} ownerId @param {Set<string>} removed @param {string[]} newRoofs
 * @param {(kind: string) => string} ids
 */
function updateRoofComponents(draft, ownerId, removed, newRoofs, ids) {
  const own = Object.values(draft.roofComponents).filter((rc) => rc.ownerId === ownerId).sort((a, b) => (a.id < b.id ? -1 : 1));
  const host = own.find((rc) => rc.faceIds.some((f) => removed.has(f)));
  for (const rc of Object.values(draft.roofComponents)) rc.faceIds = rc.faceIds.filter((f) => !removed.has(f));
  if (newRoofs.length > 0) {
    let target = host ?? own[0];
    if (!target) {
      const id = ids('roofComponent');
      target = draft.roofComponents[id] = { id, ownerId, faceIds: [] };
    }
    target.faceIds.push(...newRoofs);
    for (const f of newRoofs) draft.faces[f].roofComponentId = target.id;
  }
  for (const rc of Object.values(draft.roofComponents)) if (rc.faceIds.length === 0) { delete draft.roofComponents[rc.id]; removed.add(rc.id); }
}

/** @param {number[]} a @param {number[]} b @param {number} tol */
const near = (a, b, tol) => Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]) <= tol;

/** Members of a reused face that the operation does not regenerate. @param {BuildingModel} draft @param {string | undefined} id */
function keepOf(draft, id) {
  if (!id || !draft.faces[id]) return undefined;
  const { tags, sourceRef, roofComponentId } = draft.faces[id];
  return { tags: [...tags], ...(sourceRef !== undefined ? { sourceRef } : {}), ...(roofComponentId !== undefined ? { roofComponentId } : {}) };
}
