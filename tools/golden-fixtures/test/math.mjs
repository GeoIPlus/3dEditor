// Independent geometry for the fixture tests (v0.2 F.3): written apart from the generator, reads only fixture files.

import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { ROOT } from '../source.mjs';

/** @typedef {number[]} V */

/** @param {string} rel */
export const read = (rel) => JSON.parse(readFileSync(join(ROOT, rel), 'utf8'));

const sub = (/** @type {V} */ a, /** @type {V} */ b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const cross = (/** @type {V} */ a, /** @type {V} */ b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
export const dot = (/** @type {V} */ a, /** @type {V} */ b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
export const norm = (/** @type {V} */ a) => Math.hypot(a[0], a[1], a[2]);

/** Area of a planar polygon (fan cross products). @param {V[]} pts */
export function area(pts) {
  let s = [0, 0, 0];
  for (let i = 1; i + 1 < pts.length; i++) {
    const c = cross(sub(pts[i], pts[0]), sub(pts[i + 1], pts[0]));
    s = [s[0] + c[0], s[1] + c[1], s[2] + c[2]];
  }
  return norm(s) / 2;
}

/** Volume of a closed, outward-oriented polyhedron by the divergence theorem. @param {V[][]} rings */
export function volume(rings) {
  let v = 0;
  for (const r of rings) for (let i = 1; i + 1 < r.length; i++) v += dot(r[0], cross(r[i], r[i + 1])) / 6;
  return v;
}

/**
 * Face rings of a canonical model by half-edge traversal.
 * @param {any} m model
 * @returns {{ id: string, kind: string, plane: { normal: V, d: number }, pts: V[], hes: any[] }[]}
 */
export function modelFaces(m) {
  return Object.values(m.faces).map((/** @type {any} */ f) => {
    const hes = [];
    let he = m.halfEdges[f.outerLoopId];
    do { hes.push(he); he = m.halfEdges[he.nextId]; } while (he.id !== f.outerLoopId && hes.length < 1000);
    return { id: f.id, kind: f.surfaceKind, plane: f.supportPlane, pts: hes.map((h) => m.vertices[h.startVertexId].p), hes };
  });
}

/** Undirected edges of a model: key -> half-edges. @param {any} m */
export function modelEdges(m) {
  /** @type {Map<string, any[]>} */
  const out = new Map();
  for (const he of Object.values(m.halfEdges)) {
    const a = he.startVertexId; const b = m.halfEdges[he.nextId].startVertexId;
    const k = a < b ? `${a}|${b}` : `${b}|${a}`;
    out.set(k, [...(out.get(k) ?? []), he]);
  }
  return out;
}

/** Metrics of a model: total roof area, volume. @param {any} m */
export function metrics(m) {
  const fs = modelFaces(m);
  return { roofArea: fs.filter((f) => f.kind === 'RoofSurface').reduce((s, f) => s + area(f.pts), 0), volume: volume(fs.map((f) => f.pts)) };
}

/**
 * Surfaces of the first CityJSON object's Solid, coordinates in the local (untranslated, scaled) frame.
 * @param {any} cj
 */
export function cityJsonSurfaces(cj) {
  const [obj] = Object.values(cj.CityObjects);
  const g = /** @type {any} */ (obj).geometry[0];
  const s = cj.transform.scale;
  const pts = cj.vertices.map((/** @type {V} */ v) => [v[0] * s[0], v[1] * s[1], v[2] * s[2]]);
  return g.boundaries[0].map((/** @type {number[][]} */ surf, /** @type {number} */ i) => ({
    idx: surf[0], pts: surf[0].map((k) => pts[k]), type: g.semantics.surfaces[g.semantics.values[0][i]].type,
  }));
}

/** Distance of point p to plane. @param {V} p @param {{ normal: V, d: number }} pl */
export const planeDist = (p, pl) => dot(pl.normal, p) + pl.d;

/** Least-squares plane z = a x + b y + c (normal equations, 3 x 3 Cramer). @param {V[]} pts */
export function fitZ(pts) {
  let sxx = 0, sxy = 0, sx = 0, syy = 0, sy = 0, n = 0, sxz = 0, syz = 0, sz = 0;
  for (const [x, y, z] of pts) { sxx += x * x; sxy += x * y; sx += x; syy += y * y; sy += y; n++; sxz += x * z; syz += y * z; sz += z; }
  const M = [[sxx, sxy, sx], [sxy, syy, sy], [sx, sy, n]];
  const r = [sxz, syz, sz];
  const det = (/** @type {number[][]} */ A) => A[0][0] * (A[1][1] * A[2][2] - A[1][2] * A[2][1]) - A[0][1] * (A[1][0] * A[2][2] - A[1][2] * A[2][0]) + A[0][2] * (A[1][0] * A[2][1] - A[1][1] * A[2][0]);
  const D = det(M);
  const col = (/** @type {number} */ j) => det(M.map((row, i) => row.map((v, k) => (k === j ? r[i] : v))));
  return { a: col(0) / D, b: col(1) / D, c: col(2) / D };
}
