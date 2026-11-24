// validate (3D-12): per-face and per-shell geometric checks - degenerate edges and faces (spec §8 rule 5, v0.3 §10),
// planarity against the authoritative support plane (D-08), ring orientation, shell orientation by signed volume, and
// inconsistent 4+ plane junctions (brep helper, spec §4 rule 5).
import { distance, dot, signedDistance, inconsistentJunctions, endVertexId } from '../brep/index.js';
import { newell, faceArea } from './polygon.js';
import { shellFaces } from './context.js';

/** @typedef {import('./context.js').Ctx} Ctx */
/** @typedef {import('./context.js').RawIssue} RawIssue */
/** @typedef {[number, number, number]} P3 */

/** @param {P3} a @param {P3} b @returns {P3} */
const mid = (a, b) => [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2, (a[2] + b[2]) / 2];

/** @param {Ctx} ctx @returns {RawIssue[]} DEGENERATE_EDGE: edge shorter than `minEdgeLengthM`, once per undirected edge */
export function degenerateEdges(ctx) {
  const { model } = ctx;
  /** @type {RawIssue[]} */
  const out = [];
  for (const f of ctx.faces) {
    for (const h of [...(ctx.index.outer.get(f) ?? []), ...(ctx.index.inner.get(f) ?? []).flat()]) {
      const he = model.halfEdges[h];
      if (he.twinId && he.twinId < h && ctx.faces.has(model.halfEdges[he.twinId]?.faceId)) continue;
      const a = model.vertices[he.startVertexId].p;
      const b = model.vertices[endVertexId(model, h)].p;
      const len = distance(a, b);
      if (len < ctx.tol.minEdgeLengthM) {
        out.push({ code: 'DEGENERATE_EDGE', entityIds: he.twinId ? [h, he.twinId] : [h], location: mid(a, b), detail: `length ${len}` });
      }
    }
  }
  return out;
}

/**
 * Per face: DEGENERATE_FACE (area below `minFaceAreaM2`), NON_PLANAR_FACE (a ring vertex farther than `planarTolM` from
 * the support plane; this includes imported vertices kept at file position, spec §4 rule 3a), and
 * INCONSISTENT_RING_ORIENTATION (outer ring not counter-clockwise about the plane normal, or an inner ring not clockwise).
 * [A] Ring convention: the support-plane normal points out of the solid (v0.2 B.2) and the outer ring turns about it
 * by the right-hand rule, as in CityJSON; the golden inputs follow it (test/validate/golden-clean.test.js).
 * @param {Ctx} ctx @returns {RawIssue[]}
 */
export function faceChecks(ctx) {
  const { model, tol } = ctx;
  /** @type {RawIssue[]} */
  const out = [];
  for (const f of ctx.faces) {
    const face = model.faces[f];
    const n = /** @type {P3} */ (face.supportPlane.normal);
    const rings = ctx.ringPts(f);
    const ids = ctx.ringIds(f);
    const area = faceArea(rings, n);
    if (area < tol.minFaceAreaM2) out.push({ code: 'DEGENERATE_FACE', entityIds: [f], detail: `area ${area}` });
    /** @type {string[]} */
    const off = [];
    let worst = 0;
    /** @type {P3 | undefined} */
    let at;
    rings.forEach((r, i) => r.forEach((p, j) => {
      const dist = Math.abs(signedDistance(face.supportPlane, p));
      if (!(dist <= tol.planarTolM)) {
        if (!off.includes(ids[i][j])) off.push(ids[i][j]);
        if (dist > worst) { worst = dist; at = p; }
      }
    }));
    if (off.length) out.push({ code: 'NON_PLANAR_FACE', entityIds: [f, ...off], location: at, detail: `max distance ${worst}` });
    const bad = rings.some((r, i) => {
      const s = dot(newell(r), n) / 2;
      if (Math.abs(s) <= tol.numericEpsilon) return false;
      return i === 0 ? s < 0 : s > 0;
    });
    if (bad) out.push({ code: 'INCONSISTENT_RING_ORIENTATION', entityIds: [f], detail: 'ring turns against the plane normal' });
  }
  return out;
}

/**
 * Signed volume enclosed by a shell (divergence theorem over its rings; positive when the rings turn outward).
 * @param {Ctx} ctx @param {string[]} faces @returns {number} m3
 */
export function signedVolume(ctx, faces) {
  let v = 0;
  for (const f of faces) for (const r of ctx.ringPts(f)) if (r.length) v += dot(r[0], newell(r)) / 6;
  return v;
}

/**
 * SHELL_ORIENTATION: a closed shell whose rings enclose a negative volume (OUTER) or a positive one (VOID).
 * [A] the sign rule for void shells follows CityJSON / val3dity 405 (inner shells oriented inward). Open shells are
 * skipped: their volume is not defined (SHELL_NOT_CLOSED is reported instead).
 * @param {Ctx} ctx @param {Set<string>} openShellIds @returns {RawIssue[]}
 */
export function shellOrientation(ctx, openShellIds) {
  /** @type {RawIssue[]} */
  const out = [];
  for (const sh of Object.values(ctx.model.shells)) {
    if (openShellIds.has(sh.id)) continue;
    const faces = shellFaces(ctx, sh.id);
    if (!faces.length || !faces.some((f) => ctx.faces.has(f))) continue;
    const vol = signedVolume(ctx, faces);
    const wrong = sh.intendedRole === 'VOID' ? vol > ctx.tol.numericEpsilon : vol < -ctx.tol.numericEpsilon;
    if (wrong) out.push({ code: 'SHELL_ORIENTATION', entityIds: [sh.id], detail: `signed volume ${vol}` });
  }
  return out;
}

/** @param {Ctx} ctx @returns {RawIssue[]} INCONSISTENT_JUNCTION among the vertices of the checked faces */
export function junctions(ctx) {
  /** @type {Set<string>} */
  const vs = new Set();
  for (const f of ctx.faces) for (const r of ctx.ringIds(f)) r.forEach((v) => vs.add(v));
  const ids = ctx.all ? Object.keys(ctx.model.vertices) : [...vs].sort();
  return inconsistentJunctions(ctx.model, ctx.tol, ids).map((j) => ({
    code: j.code, entityIds: j.entityIds, location: /** @type {P3} */ (ctx.model.vertices[j.entityIds[0]].p), detail: `residual ${j.residual}`,
  }));
}
