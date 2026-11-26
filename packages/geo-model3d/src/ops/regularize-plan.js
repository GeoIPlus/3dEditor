// ops (3D-126): the plan of REGULARIZE_FOOTPRINT in plan view (spec §10.10 r3; v0.2 F-39). Pure 2D: it decides
// which walls merge and which new vertical planes the surviving walls get; the B-rep is changed by the caller.
// Planes are primary (D-08): a wall is the 2D line n . x + d = 0 of its vertical support plane (n outward, unit).
// D-3D126-1: per ring, a chain of consecutive walls whose directions all lie within `footprintAngleTolDeg` of the
// chain's reference wall (the longest; tie: smallest face id) merges into the reference wall, whose plane is kept.
// D-3D126-2: `orthogonalize` turns every wall within the tolerance of the 0 / 90 deg grid of the longest outer wall
// exactly onto the grid, about the midpoint of its edge; walls made consecutive and parallel merge again.
// D-3D126-4: a ring with fewer than 3 walls, area < minFaceAreaM2, an edge < minEdgeLengthM or a parallel corner is
// degenerate. D-3D126-3 / -5: the largest vertex shift and the area change are reported.
import { signedArea2 } from './geom2.js';

/** @typedef {import('./geom2.js').P2} P2 */
/** @typedef {{ n: P2, d: number }} Line2 */
/** @typedef {{ wall: string, va: string, vb: string, a: P2, b: P2, line: Line2 }} RingEdge edge from vertex `va` at `a` to `vb` at `b` */
/** @typedef {{ survivor: string, absorbed: string[], line: Line2, rotatedDeg: number, members: number[] }} Group */
/**
 * @typedef {object} RingPlan
 * @property {Group[]} groups in ring order; group k runs from corner k to corner k + 1
 * @property {P2[]} poly new corners (empty when degenerate)
 * @property {string | null} degenerate reason, null when the ring is valid
 * @property {Set<string>} keptVertices old corner vertex ids that stay corners
 * @property {number} shift largest old-corner distance to the new boundary (m)
 * @property {number} areaOld @property {number} areaNew absolute areas (m2)
 */

const DEG = Math.PI / 180;
const EPS_DEG = 1e-9;
const dirOf = (/** @type {Line2} */ l) => /** @type {P2} */ ([-l.n[1], l.n[0]]);
const angDeg = (/** @type {P2} */ u, /** @type {P2} */ v) => Math.atan2(u[0] * v[1] - u[1] * v[0], u[0] * v[0] + u[1] * v[1]) / DEG;
const byId = (/** @type {string} */ x, /** @type {string} */ y) => (x < y ? -1 : x > y ? 1 : 0);

/**
 * Straighten one ring (D-3D126-1).
 * @param {RingEdge[]} edges in ring order (outer CCW, courtyards CW) @param {number} tolDeg
 * @returns {Group[]}
 */
export function straighten(edges, tolDeg) {
  const n = edges.length;
  const len = edges.map((e) => Math.hypot(e.b[0] - e.a[0], e.b[1] - e.a[1]));
  const dir = edges.map((e) => dirOf(e.line));
  const order = edges.map((_, i) => i).sort((i, j) => len[j] - len[i] || byId(edges[i].wall, edges[j].wall) || i - j);
  const owner = new Array(n).fill(-1);
  const within = (/** @type {number} */ j, /** @type {number} */ r) => Math.abs(angDeg(dir[r], dir[j])) <= tolDeg + EPS_DEG;
  for (const r of order) {
    if (owner[r] >= 0) continue;
    owner[r] = r;
    for (let j = (r + 1) % n; owner[j] < 0 && within(j, r); j = (j + 1) % n) owner[j] = r;
    for (let j = (r - 1 + n) % n; owner[j] < 0 && within(j, r); j = (j - 1 + n) % n) owner[j] = r;
  }
  let s = 0;
  while (s < n && owner[s] === owner[(s - 1 + n) % n]) s++;
  if (s === n) s = 0;
  /** @type {Group[]} */
  const groups = [];
  for (let k = 0; k < n; k++) {
    const i = (s + k) % n;
    const last = groups[groups.length - 1];
    if (last && owner[last.members[0]] === owner[i]) { last.members.push(i); continue; }
    groups.push({ survivor: edges[owner[i]].wall, absorbed: [], line: edges[owner[i]].line, rotatedDeg: 0, members: [i] });
  }
  for (const g of groups) g.absorbed = [...new Set(g.members.map((i) => edges[i].wall))].filter((w) => w !== g.survivor).sort(byId);
  return groups;
}

/** Corners of a ring of groups: corner k = line k-1 x line k; null on parallel neighbours. @param {Group[]} groups */
export function corners(groups) {
  /** @type {P2[]} */
  const out = [];
  for (let k = 0; k < groups.length; k++) {
    const p = groups[(k - 1 + groups.length) % groups.length].line, q = groups[k].line;
    const det = p.n[0] * q.n[1] - p.n[1] * q.n[0];
    if (Math.abs(det) < 1e-12) return null;
    out.push([(-p.d * q.n[1] + q.d * p.n[1]) / det, (-q.d * p.n[0] + p.d * q.n[0]) / det]);
  }
  return out;
}

/** Merge consecutive groups with the same direction into the longer one (D-3D126-2). @param {Group[]} groups */
function remergeParallel(groups) {
  let again = true;
  while (again && groups.length > 1) {
    again = false;
    const poly = corners(groups) ?? [];
    for (let k = 0; k < groups.length && groups.length > 1; k++) {
      const g = groups[k], h = groups[(k + 1) % groups.length];
      const u = dirOf(g.line), v = dirOf(h.line);
      if (Math.abs(angDeg(u, v)) > EPS_DEG) continue;
      const lg = edgeLen(poly, k), lh = edgeLen(poly, (k + 1) % groups.length);
      const [keep, drop] = lg > lh || (lg === lh && g.survivor < h.survivor) ? [g, h] : [h, g];
      const merged = { ...keep, absorbed: [...new Set([...keep.absorbed, ...drop.absorbed, drop.survivor])].sort(byId), members: [...g.members, ...h.members] };
      if (k === groups.length - 1) { groups.pop(); groups.shift(); groups.unshift(merged); } else groups.splice(k, 2, merged);
      again = true;
      break;
    }
  }
}

/** @param {P2[]} poly @param {number} k */
const edgeLen = (poly, k) => (poly.length < 2 ? 0 : Math.hypot(poly[(k + 1) % poly.length][0] - poly[k][0], poly[(k + 1) % poly.length][1] - poly[k][1]));

/**
 * Orthogonalise all rings onto the grid of the longest outer wall (D-3D126-2). Mutates the groups.
 * @param {Group[][]} rings outer first @param {number} tolDeg
 */
export function orthogonalize(rings, tolDeg) {
  const poly0 = corners(rings[0]);
  if (!poly0) return;
  let gi = 0;
  rings[0].forEach((g, k) => { const l = edgeLen(poly0, k), m = edgeLen(poly0, gi); if (l > m || (l === m && g.survivor < rings[0][gi].survivor)) gi = k; });
  const tg = dirOf(rings[0][gi].line);
  for (const groups of rings) {
    const poly = corners(groups);
    if (!poly) continue;
    groups.forEach((g, k) => {
      if (groups === rings[0] && k === gi) return;
      const a = angDeg(tg, dirOf(g.line));
      const delta = a - 90 * Math.round(a / 90);
      if (Math.abs(delta) <= EPS_DEG || Math.abs(delta) > tolDeg + EPS_DEG) return;
      const t = dirOf(g.line), c = Math.cos(-delta * DEG), s = Math.sin(-delta * DEG);
      const u = /** @type {P2} */ ([t[0] * c - t[1] * s, t[0] * s + t[1] * c]);
      const n = /** @type {P2} */ ([u[1], -u[0]]);
      const p = poly[k], q = poly[(k + 1) % poly.length];
      const m = [(p[0] + q[0]) / 2, (p[1] + q[1]) / 2];
      g.line = { n, d: -(n[0] * m[0] + n[1] * m[1]) };
      g.rotatedDeg = -delta;
    });
    remergeParallel(groups);
  }
}

/**
 * Evaluate a ring after straightening (and orthogonalisation).
 * @param {RingEdge[]} edges @param {Group[]} groups @param {{ minFaceAreaM2: number, minEdgeLengthM: number }} tol
 * @param {boolean} outer @returns {RingPlan}
 */
export function evaluate(edges, groups, tol, outer) {
  const areaOld = Math.abs(signedArea2(edges.map((e) => e.a))) / 2;
  const keptVertices = new Set(groups.map((g) => edges[g.members[0]].va));
  const base = { groups, keptVertices, areaOld };
  const poly = groups.length >= 3 ? corners(groups) : null;
  if (!poly) return { ...base, poly: [], degenerate: groups.length < 3 ? 'fewer than 3 walls' : 'parallel neighbour walls', shift: 0, areaNew: 0 };
  const signed = signedArea2(poly) / 2;
  const areaNew = Math.abs(signed);
  let degenerate = null;
  if ((signed > 0) !== outer) degenerate = 'ring turned over';
  else if (areaNew < tol.minFaceAreaM2) degenerate = 'area below minFaceAreaM2';
  else if (poly.some((_, k) => edgeLen(poly, k) < tol.minEdgeLengthM)) degenerate = 'edge shorter than minEdgeLengthM';
  let shift = 0;
  groups.forEach((g, k) => {
    g.members.forEach((i, j) => {
      const a = edges[i].a;
      const dist = j === 0 ? Math.hypot(poly[k][0] - a[0], poly[k][1] - a[1]) : Math.abs(g.line.n[0] * a[0] + g.line.n[1] * a[1] + g.line.d);
      shift = Math.max(shift, dist);
    });
  });
  return { ...base, poly, degenerate, shift, areaNew };
}
