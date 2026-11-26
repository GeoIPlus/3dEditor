// solve (3D-13): conditions - the solver's own language in plane terms (D-08). A condition is a residual function of
// the current planes, tagged with the constraint id it comes from. Hard conditions must reach |residual| <= tol
// (D-170), soft ones are weighted least-squares terms (spec §5 r3). Builders read the model only for topology
// (defining faces of a vertex, ends of an edge); positions always come from the planes at evaluation time.
import { cross, dot, norm } from '../brep/vec.js';

/** @typedef {import('../brep/vec.js').P3} P3 */
/** @typedef {import('../brep/plane.js').Plane} Plane */
/** @typedef {import('../brep/types.js').BuildingModel} BuildingModel */

/**
 * Evaluation context: planes of every face (movable ones at their current iterate) and vertex positions derived from
 * them (spec §4 r2; a vertex none of whose defining faces moves keeps its stored position, D-70).
 * @typedef {object} EvalContext
 * @property {(faceId: string) => Plane} plane
 * @property {(vertexId: string) => P3 | null} vertex null: fewer than three independent planes (spec §4 r3)
 */

/**
 * @typedef {object} Condition
 * @property {string} id constraint id; conflict sets are reported by it (spec §5 r2)
 * @property {string} kind constraint kind (or an operation's label for its own targets)
 * @property {string[]} entityIds entities named in diagnostics
 * @property {boolean} hard
 * @property {number} weight soft weight (`1/σ²` for measurements, spec §5 r3); 0 for hard
 * @property {number} tol hard check: Euclidean norm of the residual <= tol (D-170); 0 and unused for soft terms
 * @property {string[]} faces faces whose planes the residual reads
 * @property {{ faceId: string, point: P3 } | undefined} linear stage-1 form "fixed point on this plane"
 * @property {boolean} [checkOnly] hard re-check only (spec §5 r4): not a solver term, read at the result (D-3D118-2)
 * @property {(ctx: EvalContext) => number[]} residual
 */

/** @param {Omit<Condition, 'weight' | 'linear'> & { weight?: number, linear?: Condition['linear'] }} c @returns {Condition} */
const make = (c) => ({ ...c, weight: c.hard ? 0 : (c.weight ?? 0), linear: c.linear });

/** Large finite stand-in for a residual whose geometry does not exist (vertex not fixed by its planes). */
export const UNDEFINED_RESIDUAL = 1e6;

/** @param {P3 | null} p @param {(p: P3) => number[]} f @param {number} n */
const at = (p, f, n) => (p ? f(p) : new Array(n).fill(UNDEFINED_RESIDUAL));

/**
 * Builders bound to one model's topology.
 * @param {BuildingModel} model
 */
export function builders(model) {
  /** @param {string} vId */
  const facesOf = (vId) => {
    const v = model.vertices[vId];
    if (!v) throw new Error(`solve: unknown vertex ${vId}`);
    return v.definingFaceIds.slice();
  };
  /** @param {string} heId @returns {[string, string]} start and end vertex of an edge */
  const ends = (heId) => {
    const he = model.halfEdges[heId];
    if (!he) throw new Error(`solve: unknown half-edge ${heId}`);
    return [he.startVertexId, model.halfEdges[he.nextId].startVertexId];
  };
  /** @param {string} heId @returns {string[]} */
  const edgeFaces = (heId) => [...new Set(ends(heId).flatMap(facesOf))].sort();
  /** @param {EvalContext} ctx @param {string} heId @returns {P3 | null} unit direction of the edge */
  const dir = (ctx, heId) => {
    const [a, b] = ends(heId).map(ctx.vertex);
    if (!a || !b) return null;
    const u = /** @type {P3} */ ([b[0] - a[0], b[1] - a[1], b[2] - a[2]]);
    const l = norm(u);
    return l > 0 ? [u[0] / l, u[1] / l, u[2] / l] : null;
  };
  /** @param {string} faceId */
  const face = (faceId) => {
    if (!model.faces[faceId]) throw new Error(`solve: unknown face ${faceId}`);
    return faceId;
  };
  /** @typedef {{ id: string, kind: string, hard?: boolean, weight?: number, entityIds?: string[] }} Tag */
  /** @param {Tag} t @param {string[]} ids */
  const tag = (t, ids) => ({ id: t.id, kind: t.kind, hard: t.hard ?? true, weight: t.weight, entityIds: t.entityIds ?? ids });

  return {
    ends,
    edgeFaces,
    /** A fixed point lies on a face plane (stage 1). @param {Tag} t @param {string} faceId @param {P3} p @param {number} tol */
    pointOnPlane: (t, faceId, p, tol) =>
      make({ ...tag(t, [face(faceId)]), tol, faces: [faceId], linear: { faceId, point: p },
        residual: (ctx) => { const pl = ctx.plane(faceId); return [dot(pl.normal, p) + pl.d]; } }),
    /** The derived vertex sits at a fixed point (hard FIXED_POINT re-check on the vertex, D-3D118-2; 3D-118): a check
     * only - the per-plane conditions above are the solver terms, this catches a solution where they hold but the planes
     * are near-parallel and the vertex slides away. @param {Tag} t @param {string} vId @param {P3} p @param {number} tol */
    vertexAt: (t, vId, p, tol) =>
      make({ ...tag(t, [vId]), tol, faces: facesOf(vId), checkOnly: true,
        residual: (ctx) => at(ctx.vertex(vId), (q) => [q[0] - p[0], q[1] - p[1], q[2] - p[2]], 3) }),
    /** The face plane equals a fixed plane (ON_PLANE [face] + Plane target, D-289): residual on the unit normal (angular,
     * tol `numericEpsilon`) or on the offset (plane distance once the normals agree, tol `planarTolM`), D-170.
     * @param {Tag} t @param {string} faceId @param {Plane} target unit normal @param {'NORMAL' | 'OFFSET'} part @param {number} tol */
    planeEquals: (t, faceId, target, part, tol) =>
      make({ ...tag(t, [face(faceId)]), tol, faces: [faceId],
        residual: (ctx) => {
          const pl = ctx.plane(faceId);
          return part === 'NORMAL' ? pl.normal.map((x, i) => x - target.normal[i]) : [pl.d - target.d];
        } }),
    /** A (derived) vertex lies on a face plane. @param {Tag} t @param {string} vId @param {string} faceId @param {number} tol */
    vertexOnPlane: (t, vId, faceId, tol) =>
      make({ ...tag(t, [vId, face(faceId)]), tol, faces: [...new Set([...facesOf(vId), faceId])].sort(),
        residual: (ctx) => { const pl = ctx.plane(faceId); return at(ctx.vertex(vId), (p) => [dot(pl.normal, p) + pl.d], 1); } }),
    /** z of a vertex equals a number or the z of a reference vertex. @param {Tag} t @param {string} vId @param {number | string} ref @param {number} tol */
    vertexZ: (t, vId, ref, tol) =>
      make({ ...tag(t, [vId]), tol, faces: [...new Set([...facesOf(vId), ...(typeof ref === 'string' ? facesOf(ref) : [])])].sort(),
        residual: (ctx) => {
          const z0 = typeof ref === 'string' ? ctx.vertex(ref)?.[2] : ref;
          return z0 === undefined ? [UNDEFINED_RESIDUAL] : at(ctx.vertex(vId), (p) => [p[2] - z0], 1);
        } }),
    /** Two vertices at one position. @param {Tag} t @param {string} a @param {string} b @param {number} tol */
    coincident: (t, a, b, tol) =>
      make({ ...tag(t, [a, b]), tol, faces: [...new Set([...facesOf(a), ...facesOf(b)])].sort(),
        residual: (ctx) => {
          const p = ctx.vertex(a);
          const q = ctx.vertex(b);
          return p && q ? [p[0] - q[0], p[1] - q[1], p[2] - q[2]] : [UNDEFINED_RESIDUAL];
        } }),
    /** Face normal parallel (HORIZONTAL face) or perpendicular (VERTICAL face) to z. @param {Tag} t @param {string} faceId @param {'HORIZONTAL' | 'VERTICAL'} mode @param {number} tol */
    faceAxis: (t, faceId, mode, tol) =>
      make({ ...tag(t, [face(faceId)]), tol, faces: [faceId],
        residual: (ctx) => { const n = ctx.plane(faceId).normal; return mode === 'HORIZONTAL' ? [n[0], n[1]] : [n[2]]; } }),
    /** Edge direction perpendicular (HORIZONTAL) or parallel (VERTICAL) to z. @param {Tag} t @param {string} heId @param {'HORIZONTAL' | 'VERTICAL'} mode @param {number} tol */
    edgeAxis: (t, heId, mode, tol) =>
      make({ ...tag(t, [heId]), tol, faces: edgeFaces(heId),
        residual: (ctx) => at(dir(ctx, heId), (u) => (mode === 'HORIZONTAL' ? [u[2]] : [u[0], u[1]]), mode === 'HORIZONTAL' ? 1 : 2) }),
    /** Two faces (normals) or two edges (directions) parallel or perpendicular. @param {Tag} t @param {'FACE' | 'EDGE'} of @param {string} a @param {string} b @param {'PARALLEL' | 'PERPENDICULAR'} rel @param {number} tol */
    relation: (t, of, a, b, rel, tol) =>
      make({ ...tag(t, [a, b]), tol, faces: of === 'FACE' ? [face(a), face(b)].sort() : [...new Set([...edgeFaces(a), ...edgeFaces(b)])].sort(),
        residual: (ctx) => {
          const u = of === 'FACE' ? ctx.plane(a).normal : dir(ctx, a);
          const v = of === 'FACE' ? ctx.plane(b).normal : dir(ctx, b);
          if (!u || !v) return rel === 'PARALLEL' ? [UNDEFINED_RESIDUAL, 0, 0] : [UNDEFINED_RESIDUAL];
          return rel === 'PARALLEL' ? cross(u, v) : [dot(u, v)];
        } }),
    /** Angle between the face normal and z equals `deg` (ROOF_SLOPE, contract target in degrees). @param {Tag} t @param {string} faceId @param {number} deg @param {number} tol */
    slope: (t, faceId, deg, tol) =>
      make({ ...tag(t, [face(faceId)]), tol, faces: [faceId],
        residual: (ctx) => [ctx.plane(faceId).normal[2] - Math.cos((deg * Math.PI) / 180)] }),
    /** Soft: horizontal edge direction along a local building axis (local frame axes, D-116). @param {Tag} t @param {string} heId */
    preferredAxis: (t, heId) =>
      make({ ...tag(t, [heId]), tol: 0, faces: edgeFaces(heId),
        residual: (ctx) => at(dir(ctx, heId), (u) => { const h = u[0] * u[0] + u[1] * u[1]; return [h > 0 ? (u[0] * u[1]) / h : 0]; }, 1) }),
    /** Soft: mirrored slopes - equal angle of both normals to z. @param {Tag} t @param {string} a @param {string} b */
    symmetry: (t, a, b) =>
      make({ ...tag(t, [a, b]), tol: 0, faces: [face(a), face(b)].sort(),
        residual: (ctx) => [ctx.plane(a).normal[2] - ctx.plane(b).normal[2]] }),
  };
}

/** Norm of a residual vector. @param {number[]} r */
export const residualNorm = (r) => Math.hypot(...r);
