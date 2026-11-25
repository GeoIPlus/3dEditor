// 3D-08 spike (throwaway, server-only, P4): FAST_PREVIEW of the affected faces (spec §8 rule 1, §10.4 rule 8):
// vertex-plane residual, edge length, face area, ring self-crossing, face-face crossing with the rest of the shell.
// Severities follow the spec §8 table. Not a full COMMIT_VALIDATION (no stitching, orientation, regression).
import { cross, dot, norm, sub } from './linalg.js';
import { dist } from './planes.js';
import { faceGeom, facesCross, ringSelfCrosses } from './intersect.js';

/** @typedef {import('./linalg.js').P3} P3 */
/** @typedef {{ code: string, scope: string, severity: 'ERROR' | 'WARNING', entityIds: string[], message: string }} Issue */

/** Spec §8 rule 4 for the codes this spike can raise. */
const SEVERITY = {
  NON_PLANAR_FACE: { DRAFT_SOLID: 'WARNING', VALID_SOLID: 'ERROR' },
  SELF_INTERSECTION: { DRAFT_SOLID: 'WARNING', VALID_SOLID: 'ERROR' },
  DEGENERATE_EDGE: { DRAFT_SOLID: 'ERROR', VALID_SOLID: 'ERROR' },
  DEGENERATE_FACE: { DRAFT_SOLID: 'ERROR', VALID_SOLID: 'ERROR' },
};

/**
 * @param {any} model @param {import('./topology.js').Index} idx
 * @param {import('./move-edge.js').Candidate} cand @param {import('./move-edge.js').Tol} tol
 * @param {'DRAFT_SOLID' | 'VALID_SOLID'} targetState
 * @returns {Issue[]}
 */
export function fastPreview(model, idx, cand, tol, targetState) {
  /** @type {Issue[]} */
  const issues = [];
  /** @param {keyof typeof SEVERITY} code @param {string} scope @param {string[]} ids @param {string} message */
  const add = (code, scope, ids, message) => issues.push({ code, scope, severity: /** @type {'ERROR' | 'WARNING'} */ (SEVERITY[code][targetState]), entityIds: ids, message });
  /** @param {string} v @returns {P3} */
  const pos = (v) => cand.vertices.get(v) ?? model.vertices[v].p;
  /** @param {string} f */
  const plane = (f) => cand.planes.get(f) ?? model.faces[f].supportPlane;
  /** @param {string} f */
  const rings = (f) => [/** @type {string[]} */ (idx.ring.get(f)), ...(idx.holes.get(f) ?? [])];

  /** @type {Map<string, import('./intersect.js').FaceGeom>} */
  const geoms = new Map();
  const geom = (/** @type {string} */ f) => {
    let g = geoms.get(f);
    if (!g) geoms.set(f, (g = faceGeom(f, plane(f), rings(f), pos)));
    return g;
  };
  const affected = [...cand.affectedFaces].sort();
  for (const f of affected) {
    const rs = rings(f);
    const off = rs.flat().filter((v) => Math.abs(dist(plane(f), pos(v))) > tol.planarTolM);
    if (off.length) add('NON_PLANAR_FACE', 'GEOMETRY', [f, ...off], 'vertex farther than planarTolM from the face plane');
    for (const r of rs) {
      r.forEach((a, k) => {
        const b = r[(k + 1) % r.length];
        if (norm(sub(pos(b), pos(a))) < tol.minEdgeLengthM) add('DEGENERATE_EDGE', 'GEOMETRY', [f, a, b], 'edge shorter than minEdgeLengthM');
      });
    }
    if (area(rs.map((r) => r.map(pos)), plane(f).normal) < tol.minFaceAreaM2) add('DEGENERATE_FACE', 'GEOMETRY', [f], 'face smaller than minFaceAreaM2');
    if (ringSelfCrosses(geom(f))) add('SELF_INTERSECTION', 'GEOMETRY', [f], 'face ring crosses itself');
  }
  // Face-face: each affected face against every face of the model that shares no vertex with it.
  const all = Object.keys(model.faces).sort();
  const done = new Set();
  for (const f of affected) {
    const gf = geom(f);
    for (const g of all) {
      if (g === f || done.has(`${g}|${f}`)) continue;
      done.add(`${f}|${g}`);
      const gg = geom(g);
      let shares = false;
      for (const v of gg.ids) if (gf.ids.has(v)) { shares = true; break; }
      if (!shares && facesCross(gf, gg, tol.topologySnapTolM)) add('SELF_INTERSECTION', 'GEOMETRY', [f, g], 'faces cross');
    }
  }
  return issues;
}

/** Area of a planar face with holes (Newell, projected on its normal). @param {P3[][]} rings @param {P3} n */
function area(rings, n) {
  let s = 0;
  rings.forEach((r, i) => {
    /** @type {P3} */
    let acc = [0, 0, 0];
    r.forEach((a, k) => { const c = cross(a, r[(k + 1) % r.length]); acc = [acc[0] + c[0], acc[1] + c[1], acc[2] + c[2]]; });
    s += (i === 0 ? 1 : -1) * Math.abs(dot(acc, n)) / 2;
  });
  return s;
}
