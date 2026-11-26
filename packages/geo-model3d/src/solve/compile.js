// solve (3D-13): model `Constraint` entities (contract building-model `$defs/Constraint`) -> plane-terms conditions.
// Per-kind reading: D-169 (table in the module card); check tolerances: D-170. A constraint the table cannot read
// is returned in `rejected` with a reason, never guessed; the refusal code for it belongs to the operation row.
// ON_PLANE [face] + Plane target = fixed face plane (D-289, amends D-169; row 3D-103).
import { edgeFaceIds } from '../brep/halfedge.js';
import { builders } from './conditions.js';

/** @typedef {import('./conditions.js').Condition} Condition */
/** @typedef {import('../brep/types.js').BuildingModel} BuildingModel */
/** @typedef {import('../brep/vec.js').P3} P3 */

/**
 * Tolerance fields the solver reads (contract tolerance-profile, spec §2.3, D-13).
 * @typedef {object} SolveTolerances
 * @property {number} numericEpsilon angular checks (D-170) and the underconstrained threshold (D-172)
 * @property {number} planarTolM point / line / plane distances
 * @property {number} zAlignTolM EQUAL_Z
 * @property {number} topologySnapTolM COINCIDENT; vertex derivation rank threshold uses numericEpsilon
 */

/**
 * @typedef {object} Compiled
 * @property {Condition[]} conditions
 * @property {Record<string, number>} keepWeights MINIMIZE_DISPLACEMENT weight per face (O1 terms; default 1)
 * @property {{ id: string, kind: string, reason: string }[]} rejected
 */

/** Kinds that spec §5 r1 lists as soft only. */
export const SOFT_KINDS = new Set(['CLOSE_TO_MEASUREMENT', 'MINIMIZE_DISPLACEMENT', 'PREFERRED_AXIS', 'SYMMETRY']);
/** Kinds left `TBD` by D-169 (footprint segment; measurement layout Q-28, 3D-22). */
export const TBD_KINDS = new Set(['BOUNDARY_ON_FOOTPRINT', 'CLOSE_TO_MEASUREMENT']);

/**
 * @param {BuildingModel} model
 * @param {any[]} constraints contract `Constraint` objects (default: every constraint of the model, in id order)
 * @param {SolveTolerances} tol
 * @returns {Compiled}
 */
export function compileConstraints(model, constraints, tol) {
  const b = builders(model);
  /** @type {Compiled} */
  const out = { conditions: [], keepWeights: {}, rejected: [] };
  for (const c of [...constraints].sort((x, y) => (x.id < y.id ? -1 : x.id > y.id ? 1 : 0))) {
    const reason = check(model, c);
    if (reason) {
      out.rejected.push({ id: c.id, kind: c.kind, reason });
      continue;
    }
    if (c.kind === 'MINIMIZE_DISPLACEMENT') {
      for (const f of c.entityIds) out.keepWeights[f] = c.weight;
      continue;
    }
    out.conditions.push(...kindConditions(model, b, c, tol));
  }
  return out;
}

/** @param {BuildingModel} model @param {any} c @returns {string | null} */
function check(model, c) {
  if (TBD_KINDS.has(c.kind)) return 'TBD';
  if (SOFT_KINDS.has(c.kind) && c.hard) return 'SOFT_KIND_MARKED_HARD';
  if (!c.hard && !(c.weight > 0)) return 'SOFT_WITHOUT_WEIGHT';
  const ids = c.entityIds;
  const isV = (/** @type {string} */ id) => id in model.vertices;
  const isF = (/** @type {string} */ id) => id in model.faces;
  const isE = (/** @type {string} */ id) => id in model.halfEdges;
  const all = (/** @type {(id: string) => boolean} */ p, n = 1) => ids.length >= n && ids.every(p);
  const shape = {
    FIXED_POINT: () => ids.length === 1 && isV(ids[0]),
    ON_PLANE: () => (ids.length === 2 && isV(ids[0]) && isF(ids[1])) || (ids.length === 1 && isF(ids[0]) && isPlane(c.target)),
    FIXED_LINE: () => ids.length === 1 && isE(ids[0]),
    FIXED_EAVE: () => ids.length === 1 && isE(ids[0]) && model.halfEdges[ids[0]].edgeRole === 'EAVE',
    FIXED_RIDGE: () => ids.length === 1 && isE(ids[0]) && model.halfEdges[ids[0]].edgeRole === 'RIDGE',
    EQUAL_Z: () => all(isV, typeof c.target === 'number' ? 1 : 2),
    COINCIDENT: () => ids.length === 2 && all(isV),
    PLANAR_FACE: () => ids.length === 1 && isF(ids[0]),
    SHARED_EDGE: () => ids.length === 1 && isE(ids[0]),
    HORIZONTAL: () => ids.length === 1 && (isF(ids[0]) || isE(ids[0])),
    VERTICAL: () => ids.length === 1 && (isF(ids[0]) || isE(ids[0])),
    PARALLEL: () => ids.length === 2 && (all(isF) || all(isE)),
    PERPENDICULAR: () => ids.length === 2 && (all(isF) || all(isE)),
    ROOF_SLOPE: () => ids.length === 1 && isF(ids[0]) && typeof c.target === 'number',
    MINIMIZE_DISPLACEMENT: () => all(isF),
    PREFERRED_AXIS: () => ids.length === 1 && isE(ids[0]),
    SYMMETRY: () => ids.length === 2 && all(isF),
  };
  const fn = /** @type {Record<string, () => boolean>} */ (shape)[c.kind];
  if (!fn) return 'UNKNOWN_KIND';
  return fn() ? null : 'ENTITIES_DO_NOT_MATCH_KIND';
}

/**
 * @param {BuildingModel} model @param {ReturnType<typeof builders>} b @param {any} c @param {SolveTolerances} tol
 * @returns {Condition[]}
 */
function kindConditions(model, b, c, tol) {
  const t = { id: c.id, kind: c.kind, hard: c.hard, weight: c.weight, entityIds: c.entityIds };
  const ids = /** @type {string[]} */ (c.entityIds);
  const ang = tol.numericEpsilon;
  switch (c.kind) {
    case 'FIXED_POINT': {
      const v = model.vertices[ids[0]];
      const p = /** @type {P3} */ (Array.isArray(c.target) ? c.target : v.p);
      const onPlanes = v.definingFaceIds.map((f) => b.pointOnPlane(t, f, p, tol.planarTolM));
      // a DERIVED vertex is also checked where its planes put it (D-371); an EXPLICIT one (D-70, spec §4 r3) has
      // no derived position
      return v.positionMode === 'DERIVED' ? [...onPlanes, b.vertexAt(t, ids[0], p, tol.planarTolM)] : onPlanes;
    }
    case 'ON_PLANE':
      if (ids.length === 1) {
        const p = targetPlane(c.target, model.faces[ids[0]].supportPlane.normal);
        return [b.planeEquals(t, ids[0], p, 'NORMAL', ang), b.planeEquals(t, ids[0], p, 'OFFSET', tol.planarTolM)];
      }
      return [Array.isArray(c.target) ? b.pointOnPlane(t, ids[1], c.target, tol.planarTolM) : b.vertexOnPlane(t, ids[0], ids[1], tol.planarTolM)];
    case 'FIXED_LINE':
    case 'FIXED_EAVE':
    case 'FIXED_RIDGE': {
      const pts = b.ends(ids[0]).map((v) => model.vertices[v].p);
      return edgeFaceIds(model, ids[0]).flatMap((f) => pts.map((p) => b.pointOnPlane(t, f, p, tol.planarTolM)));
    }
    case 'EQUAL_Z':
      return typeof c.target === 'number'
        ? ids.map((v) => b.vertexZ(t, v, c.target, tol.zAlignTolM))
        : ids.slice(1).map((v) => b.vertexZ(t, v, ids[0], tol.zAlignTolM));
    case 'COINCIDENT':
      return [b.coincident(t, ids[0], ids[1], tol.topologySnapTolM)];
    case 'PLANAR_FACE':
      return Object.values(model.halfEdges)
        .filter((h) => h.faceId === ids[0])
        .map((h) => h.startVertexId)
        .filter((v, i, a) => a.indexOf(v) === i)
        .sort()
        .map((v) => b.vertexOnPlane(t, v, ids[0], tol.planarTolM));
    case 'SHARED_EDGE':
      return edgeFaceIds(model, ids[0]).flatMap((f) => b.ends(ids[0]).map((v) => b.vertexOnPlane(t, v, f, tol.planarTolM)));
    case 'HORIZONTAL':
    case 'VERTICAL':
      return [ids[0] in model.faces ? b.faceAxis(t, ids[0], c.kind, ang) : b.edgeAxis(t, ids[0], c.kind, ang)];
    case 'PARALLEL':
    case 'PERPENDICULAR':
      return [b.relation(t, ids[0] in model.faces ? 'FACE' : 'EDGE', ids[0], ids[1], c.kind, ang)];
    case 'ROOF_SLOPE':
      return [b.slope(t, ids[0], c.target, ang)];
    case 'PREFERRED_AXIS':
      return [b.preferredAxis(t, ids[0])];
    case 'SYMMETRY':
      return [b.symmetry(t, ids[0], ids[1])];
    default:
      return [];
  }
}

/** Contract `Plane` with a finite non-zero normal. @param {any} t @returns {boolean} */
function isPlane(t) {
  if (!t || typeof t !== 'object' || Array.isArray(t) || !Array.isArray(t.normal) || t.normal.length !== 3) return false;
  return Number.isFinite(t.d) && t.normal.every(Number.isFinite) && Math.hypot(...t.normal) > 0;
}

/**
 * The target plane scaled to a unit normal and oriented like the face's stored normal (D-312): the same geometric plane
 * given with the opposite orientation is not a conflict (the face orientation is the model's, spec §4).
 * @param {{ normal: P3, d: number }} t @param {P3} faceNormal
 */
function targetPlane(t, faceNormal) {
  const n = t.normal;
  const s = (n[0] * faceNormal[0] + n[1] * faceNormal[1] + n[2] * faceNormal[2] < 0 ? -1 : 1) / Math.hypot(...n);
  return { normal: /** @type {P3} */ (n.map((x) => x * s)), d: t.d * s };
}
