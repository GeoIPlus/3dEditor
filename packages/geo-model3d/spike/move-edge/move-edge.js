// 3D-08 spike (throwaway, server-only, P4): MOVE_EDGE in plane terms (spec §10.4, D-08). The target line becomes hard
// "point on plane" constraints of the movable incident faces; fixed incident faces only check it; vertices are re-derived
// from planes, never written. Refusal codes come from spec §10.4 where it names them; others are marked [A].
import { derive, dist, solvePlane } from './planes.js';
import { edgeFaces } from './topology.js';

/** @typedef {import('./planes.js').Plane} Plane */
/** @typedef {import('./linalg.js').P3} P3 */
/** @typedef {{ planarTolM: number, topologySnapTolM: number, minEdgeLengthM: number, minFaceAreaM2: number }} Tol */
/** @typedef {{ code: string, entityIds: string[], message: string }} Refusal */
/**
 * @typedef {object} Candidate
 * @property {Map<string, Plane>} planes new support planes of the movable faces that changed
 * @property {Map<string, P3>} vertices re-derived vertex positions
 * @property {Set<string>} affectedFaces faces whose plane or ring vertices changed
 */

/**
 * @param {any} model canonical BuildingModel (not modified)
 * @param {import('./topology.js').Index} idx
 * @param {{ edgeId: string, targetLine: [P3, P3], movableFaceIds: string[] }} payload
 * @param {Tol} tol
 * @returns {{ ok: true, candidate: Candidate } | { ok: false, refusal: Refusal }}
 */
export function moveEdge(model, idx, payload, tol) {
  const ef = edgeFaces(model, payload.edgeId);
  // [A] spike: unknown ids are a payload error here; the op row decides the code.
  if (!ef) return refuse('INVALID_PAYLOAD', [payload.edgeId], 'unknown edge');
  const unknown = payload.movableFaceIds.filter((id) => !model.faces[id]);
  if (unknown.length) return refuse('INVALID_PAYLOAD', unknown, 'unknown face');
  const [q0, q1] = payload.targetLine;
  const movable = new Set(payload.movableFaceIds);
  const plane = (/** @type {string} */ id) => /** @type {Plane} */ (model.faces[id].supportPlane);

  // Rule 2 / rule 4: a fixed incident plane must already contain the target line.
  const blocked = ef.faceIds.filter((f) => !movable.has(f)
    && (Math.abs(dist(plane(f), q0)) > tol.planarTolM || Math.abs(dist(plane(f), q1)) > tol.planarTolM));
  if (blocked.length) return refuse('CONSTRAINT_CONFLICT', blocked, 'target line is off a fixed plane');

  // Rule 3: FIXED_POINT vertices on a movable face are hard points of that face's plane.
  /** @type {Map<string, P3>} */
  const fixedPoints = new Map();
  for (const c of Object.values(model.constraints ?? {})) {
    if (c.kind !== 'FIXED_POINT' || c.hard === false) continue;
    for (const v of c.entityIds ?? []) if (model.vertices[v]) fixedPoints.set(v, model.vertices[v].p);
  }

  /** @type {Map<string, Plane>} */
  const planes = new Map();
  for (const f of movable) {
    const ring = /** @type {string[]} */ (idx.ring.get(f));
    const all = [ring, ...(idx.holes.get(f) ?? [])].flat();
    const pinned = all.filter((v) => fixedPoints.has(v));
    const hard = [...(ef.faceIds.includes(f) ? [q0, q1] : []), ...pinned.map((v) => /** @type {P3} */ (fixedPoints.get(v)))];
    // Q-17 objective (ADR-S proposal): keep the face's other vertices - those not on the moved edge - where they were.
    const others = all.filter((v) => v !== ef.a && v !== ef.b);
    const r = solvePlane({ hard, old: others.map((v) => model.vertices[v].p), oldPlane: plane(f) });
    if (r.status === 'CONFLICT') return refuse('CONSTRAINT_CONFLICT', [f, ...pinned], 'no plane holds the target and the fixed points');
    if (r.status !== 'OK') return refuse('UNDERCONSTRAINED_GEOMETRY', [f], 'objective leaves the plane free');
    // Spec §5 rule 4: every hard constraint is checked after the solve.
    if (hard.some((p) => Math.abs(dist(r.plane, p)) > tol.planarTolM)) return refuse('CONSTRAINT_CONFLICT', [f], 'hard point off the solved plane');
    if (r.plane !== plane(f)) planes.set(f, r.plane);
  }

  // Rule 3: every vertex of a changed face is re-derived from its defining planes (D-70: imported ones become derived).
  /** @type {Map<string, P3>} */
  const vertices = new Map();
  /** @type {Set<string>} */
  const affectedFaces = new Set(planes.keys());
  for (const f of planes.keys()) {
    for (const v of [/** @type {string[]} */ (idx.ring.get(f)), ...(idx.holes.get(f) ?? [])].flat()) {
      if (vertices.has(v)) continue;
      const vtx = model.vertices[v];
      const pls = vtx.definingFaceIds.map((/** @type {string} */ id) => planes.get(id) ?? plane(id));
      const r = derive(pls);
      if (!r) {
        // Rule 6: fewer than three independent planes - the explicit position stays only if it is on all planes.
        if (pls.some((/** @type {Plane} */ pl) => Math.abs(dist(pl, vtx.p)) > tol.planarTolM)) return refuse('INVALID_GEOMETRY', [v], 'explicit vertex off its planes'); // [A]
        continue;
      }
      if (r.residual > tol.topologySnapTolM) return refuse('INVALID_GEOMETRY', [v], 'planes of the vertex do not meet'); // [A] INCONSISTENT_JUNCTION at commit
      if (fixedPoints.has(v) && Math.hypot(...r.p.map((x, i) => x - vtx.p[i])) > tol.topologySnapTolM) {
        return refuse('CONSTRAINT_CONFLICT', [v], 'FIXED_POINT would move');
      }
      vertices.set(v, r.p);
      for (const g of idx.facesOfVertex.get(v) ?? []) affectedFaces.add(g);
    }
  }
  return { ok: true, candidate: { planes, vertices, affectedFaces } };
}

/** @param {string} code @param {string[]} entityIds @param {string} message @returns {{ ok: false, refusal: Refusal }} */
const refuse = (code, entityIds, message) => ({ ok: false, refusal: { code, entityIds, message } });
