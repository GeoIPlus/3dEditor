// import (3D-10): merge adjacent coplanar faces of the same semantic type (spec §6 rule 5; GT-I3). Two faces of the
// same shell are merged when they share an edge (traversed in opposite directions), their normals differ by less than
// `coplanarTolDeg`, and every vertex of each lies within `planarTolM` of the other's plane [A: the spec's "offset"].
// Groups are transitive (union-find); the merged rings are the group's boundary: shared edges cancel, the remaining
// directed edges are chained into loops, the loop with the largest area along the normal is the outer ring.
import { dot, signedDistance } from '../brep/index.js';
import { fitRings } from './faces.js';
import { newell } from './fit.js';

/** @typedef {[number, number, number]} P3 */
/** @typedef {import('./faces.js').RawFace} RawFace */

/** @param {number[]} ring @returns {[number, number][]} directed edges of a closed ring */
const edgesOf = (ring) => ring.map((v, i) => /** @type {[number, number]} */ ([v, ring[(i + 1) % ring.length]]));

/** @param {RawFace} a @param {RawFace} b @param {Map<number, P3>} local @param {number} cosTol @param {number} planarTol */
function coplanar(a, b, local, cosTol, planarTol) {
  if (dot(a.plane.normal, b.plane.normal) <= cosTol) return false;
  const near = (/** @type {RawFace} */ f, /** @type {RawFace} */ g) =>
    g.rings.flat().every((v) => Math.abs(signedDistance(f.plane, /** @type {P3} */ (local.get(v)))) <= planarTol);
  return near(a, b) && near(b, a);
}

/**
 * Chain the boundary edges of a group into rings.
 * @param {number[][][]} ringsOfGroup rings of every face in the group, in group order
 * @param {Map<number, P3>} local
 * @param {P3} normal group normal (outward)
 * @returns {number[][]} outer ring first
 */
export function boundaryRings(ringsOfGroup, local, normal) {
  const all = ringsOfGroup.flatMap((rings) => rings.flatMap(edgesOf));
  const count = new Map();
  for (const [a, b] of all) count.set(`${a}>${b}`, (count.get(`${a}>${b}`) ?? 0) + 1);
  const boundary = all.filter(([a, b]) => !count.has(`${b}>${a}`));
  /** @type {Map<number, number[]>} start vertex -> indices into boundary */
  const out = new Map();
  boundary.forEach(([a], i) => out.set(a, [...(out.get(a) ?? []), i]));
  const used = new Set();
  /** @type {number[][]} */
  const loops = [];
  boundary.forEach((_, start) => {
    if (used.has(start)) return;
    const loop = [];
    let i = start;
    while (i !== undefined && !used.has(i)) {
      used.add(i);
      loop.push(boundary[i][0]);
      i = /** @type {number} */ ((out.get(boundary[i][1]) ?? []).find((j) => !used.has(j)));
    }
    if (loop.length >= 3) loops.push(loop);
  });
  const area = (/** @type {number[]} */ l) => dot(newell(l.map((v) => /** @type {P3} */ (local.get(v)))), normal);
  const outer = loops.reduce((best, l, k) => (area(l) > area(loops[best]) ? k : best), 0);
  return [loops[outer], ...loops.filter((_, k) => k !== outer)];
}

/**
 * @param {RawFace[]} faces in input order
 * @param {Map<number, P3>} local
 * @param {{ coplanarTolDeg: number, planarTolM: number }} tol
 * @returns {RawFace[]} merged faces, in the order of each group's first member
 */
export function mergeCoplanar(faces, local, tol) {
  const cosTol = Math.cos((tol.coplanarTolDeg * Math.PI) / 180);
  const parent = faces.map((_, i) => i);
  /** @param {number} i @returns {number} */
  const find = (i) => (parent[i] === i ? i : (parent[i] = find(parent[i])));
  /** @type {Map<string, number>} directed edge -> face index */
  const byEdge = new Map();
  faces.forEach((f, i) => f.rings.forEach((r) => edgesOf(r).forEach(([a, b]) => byEdge.set(`${f.body}/${f.solid}/${f.shell}:${a}>${b}`, i))));
  faces.forEach((f, i) => f.rings.forEach((r) => edgesOf(r).forEach(([a, b]) => {
    const j = byEdge.get(`${f.body}/${f.solid}/${f.shell}:${b}>${a}`);
    if (j === undefined || j <= i) return;
    const g = faces[j];
    if (g.surfaceKind !== f.surfaceKind || g.inferred !== f.inferred || g.semanticType !== f.semanticType) return;
    if (!coplanar(f, g, local, cosTol, tol.planarTolM)) return;
    const ri = find(i), rj = find(j);
    if (ri !== rj) parent[Math.max(ri, rj)] = Math.min(ri, rj);
  })));
  /** @type {Map<number, number[]>} */
  const groups = new Map();
  faces.forEach((_, i) => groups.set(find(i), [...(groups.get(find(i)) ?? []), i]));
  /** @type {RawFace[]} */
  const merged = [];
  for (const [root, members] of [...groups].sort((x, y) => x[0] - y[0])) {
    const first = faces[root];
    if (members.length === 1) { merged.push(first); continue; }
    const rings = boundaryRings(members.map((k) => faces[k].rings), local, first.plane.normal);
    const fit = fitRings(rings, local);
    merged.push({
      ...first, rings, refs: members.flatMap((k) => faces[k].refs),
      plane: fit ? fit.plane : first.plane, maxDeviation: fit ? fit.maxDeviation : first.maxDeviation,
    });
  }
  return merged;
}
