// ops (3D-114.1): REGULARIZE_FOOTPRINT (spec §10.10 r3; v0.2 F-39; D-3D1141-1..8). Planes are primary (D-08): the
// plan (regularize-plan.js) chooses for each ring which walls merge into which reference wall and which vertical planes
// the surviving walls get; here the planes are set, roof planes are kept, vertices re-derived, the merged walls are
// joined by the MERGE_FACES mechanism (their corner vertices dissolve), the footprint record follows.
// Refusals: degenerate outer ring, kept degenerate courtyard, self-intersecting footprint, short edge or a wall /
// ground face turned over -> INVALID_GEOMETRY; kept roof planes no longer meeting in one point, a roof face turned
// over, a merged-away wall with an overhang, a courtyard not removable in V1 -> INVALID_TOPOLOGY; a hard constraint
// on a merged-away wall -> CONSTRAINT_CONFLICT (D-213). Change report in `warnings` (D-3D1141-5).
import { buildIndex, faceRings, rederive, derivePoint, cross } from '../brep/index.js';
import { resolveFootprint, footprintError } from './footprint.js';
import { findOverhang, removeOverhang, addOverhang } from './overhang.js';
import { mergeFaces } from './merge-faces.js';
import { loopEdges } from './face-cut.js';
import { signedArea2, len2, sub2 } from './geom2.js';
import { straighten, orthogonalize, evaluate } from './regularize-plan.js';
import { removeCourtyard } from './regularize-courtyard.js';
import { refuse } from './errors.js';

/** @typedef {import('./pipeline.js').OpContext} OpContext */
/** @typedef {import('./pipeline.js').OpResult} OpResult */
/** @typedef {import('./geom2.js').P2} P2 */
/** @typedef {import('./regularize-plan.js').RingEdge} RingEdge */

const OVERHANG = 'OVERHANG';
const TAG = 'REGULARIZE_FOOTPRINT';
const f3 = (/** @type {number} */ x) => x.toFixed(3);

/** @type {(draft: any, payload: any, ctx: OpContext) => OpResult} */
export function regularizeFootprint(draft, payload, ctx) {
  const p = payload ?? {};
  const tol = ctx.tol;
  if (typeof p.allowCourtyardRemoval !== 'boolean' || typeof p.orthogonalize !== 'boolean') return refuse('INVALID_PAYLOAD', [], 'allowCourtyardRemoval / orthogonalize');
  const found = resolveFootprint(draft, p.footprintId);
  if (!found.ok) return found;
  const body = found.body;
  const fpId = body.footprintId;
  const shellFaces = /** @type {string[]} */ (draft.shells[body.shellId].faceIds);
  const grounds = shellFaces.filter((f) => draft.faces[f].surfaceKind === 'GroundSurface');
  if (grounds.length !== 1) return refuse('INVALID_TOPOLOGY', [fpId, ...grounds], 'the body has not exactly one ground face');
  const groundId = grounds[0];
  const rings = ringEdges(draft, groundId, tol.numericEpsilon);
  if (!rings) return refuse('INVALID_TOPOLOGY', [fpId, groundId], 'a ground edge does not border a vertical WallSurface');

  // the plan (D-3D1141-1, -2, -4)
  const groups = rings.map((r) => straighten(r, tol.footprintAngleTolDeg));
  if (p.orthogonalize) orthogonalize(groups, tol.footprintAngleTolDeg);
  const plans = rings.map((r, i) => evaluate(r, groups[i], tol, i === 0));
  if (plans[0].degenerate) return refuse('INVALID_GEOMETRY', [fpId], `outer ring: ${plans[0].degenerate}`);
  const drop = plans.map((pl, i) => i > 0 && !!pl.degenerate);
  for (let i = 1; i < plans.length; i++) {
    if (drop[i] && !p.allowCourtyardRemoval) return refuse('INVALID_GEOMETRY', [fpId, ...ringWalls(rings[i])], `courtyard: ${plans[i].degenerate} (D-3D1141-4)`);
  }
  const live = groups.flatMap((g, i) => (drop[i] ? [] : g));
  const plane3 = (/** @type {{ n: P2, d: number }} */ l) => ({ normal: /** @type {[number, number, number]} */ ([l.n[0], l.n[1], 0]), d: l.d });
  const moved = live.filter((g) => {
    const s = draft.faces[g.survivor].supportPlane;
    return g.absorbed.length > 0 || s.d !== g.line.d || s.normal[0] !== g.line.n[0] || s.normal[1] !== g.line.n[1];
  });
  if (moved.length === 0 && !drop.some(Boolean)) return { ok: true, noChange: true };
  /** @type {Map<string, string>} */
  const into = new Map(moved.flatMap((g) => g.absorbed.map((a) => /** @type {[string, string]} */ ([a, g.survivor]))));
  const changed = new Set([...moved.map((g) => g.survivor), ...into.keys()]);
  const courtyardWalls = new Set(rings.flatMap((r, i) => (drop[i] ? ringWalls(r) : [])));

  // hard constraints on merged-away walls (D-213, RF-12)
  const hard = Object.values(draft.constraints).filter((c) => c.hard && c.entityIds.some((/** @type {string} */ e) => into.has(e))).map((c) => c.id).sort();
  if (hard.length > 0) return refuse('CONSTRAINT_CONFLICT', hard, 'hard constraint on a wall the regularisation merges away (D-213)');

  // overhangs (D-3D1141-6): rebuilt on a changed wall, refused on a merged-away or removed wall
  const rebuild = [];
  for (const h of Object.values(draft.halfEdges)) {
    const t = h.twinId ? draft.halfEdges[h.twinId] : undefined;
    const r = draft.faces[h.faceId];
    if (!t || r.surfaceKind !== 'RoofSurface' || r.tags.includes(OVERHANG) || !draft.faces[t.faceId].tags.includes(OVERHANG)) continue;
    const f = findOverhang(draft, h.id);
    if (!f.ok) return f;
    if (!f.found) continue;
    const on = [f.found.wall, f.found.gA, f.found.gB];
    if (on.some((w) => into.has(w) || courtyardWalls.has(w))) return refuse('INVALID_TOPOLOGY', [h.id, ...on.filter((w) => into.has(w) || courtyardWalls.has(w))], 'an overhang hangs on a wall that is merged away (D-3D1141-6)');
    if (on.some((w) => changed.has(w))) rebuild.push({ h: h.id, f: f.found });
  }
  rebuild.sort((x, y) => (x.h < y.h ? -1 : 1));
  const slots = rebuild.map((x) => ({ h: x.h, width: x.f.width, s: removeOverhang(draft, x.h, x.f, tol.numericEpsilon) }));

  const oldGround = new Map(rings.flat().map((e) => [e.va, e.a]));
  /** @type {Set<string>} */
  const removed = new Set();
  for (let i = 1; i < rings.length; i++) {
    if (!drop[i]) continue;
    const c = removeCourtyard(draft, groundId, ringWalls(rings[i]));
    if (!c.ok) return c;
    c.removed.forEach((x) => removed.add(x));
  }

  // planes: survivors get their new plane, merged-away walls the survivor's (D-3D1141-1)
  const index0 = buildIndex(draft);
  const touched = new Set(Object.values(draft.vertices).filter((v) => v.definingFaceIds.some((/** @type {string} */ f) => changed.has(f))).flatMap((v) => v.definingFaceIds));
  const before = Object.fromEntries([...touched].map((f) => [f, newell(draft, index0, f)]));
  for (const g of moved) {
    draft.faces[g.survivor].supportPlane = plane3(g.line);
    for (const a of g.absorbed) draft.faces[a].supportPlane = plane3(g.line);
  }
  // corner vertices of merged walls lie on two planes only: closest point on their line (explicit until dissolved)
  for (const v of Object.values(draft.vertices)) {
    if (!v.definingFaceIds.some((/** @type {string} */ f) => into.has(f))) continue;
    const planes = [...new Set(v.definingFaceIds.map((/** @type {string} */ f) => into.get(f) ?? f))].map((f) => draft.faces[f].supportPlane);
    if (planes.length !== 2) continue;
    const u = cross(planes[0].normal, planes[1].normal);
    const l = Math.hypot(u[0], u[1], u[2]);
    if (l <= tol.numericEpsilon) return refuse('INVALID_TOPOLOGY', [v.id], 'a corner of merged walls has parallel planes');
    const n = /** @type {[number, number, number]} */ ([u[0] / l, u[1] / l, u[2] / l]);
    const q = derivePoint([...planes, { normal: n, d: -(n[0] * v.p[0] + n[1] * v.p[1] + n[2] * v.p[2]) }], tol.numericEpsilon);
    if (q) v.p = q.p;
  }
  const res = rederive(draft, [...changed], tol);
  if (res.junctions.length > 0) return refuse('INVALID_TOPOLOGY', [fpId, ...res.junctions.flatMap((j) => j.entityIds)], 'the kept planes no longer meet in one point: roof topology would change');
  if (res.offPlane.length > 0) return refuse('INVALID_TOPOLOGY', [fpId, ...res.offPlane.map((o) => o.vertexId)], 'a vertex is no longer on its planes');

  /** @type {Record<string, string[]>} */
  const mapped = {};
  /** @type {string[]} */
  const warnings = [];
  for (const g of moved) {
    if (g.absorbed.length === 0) continue;
    const m = mergeFaces(draft, { faceIds: [g.survivor, ...g.absorbed], mode: 'MERGE_COPLANAR' }, ctx);
    if (!m.ok) return m;
    Object.assign(mapped, m.mapped);
    (m.removed ?? new Set()).forEach((x) => removed.add(x));
    warnings.push(...(m.warnings ?? []));
  }
  const index = buildIndex(draft);
  for (const f of [...touched].sort()) {
    if (!draft.faces[f]) continue;
    const after = newell(draft, index, f), was = before[f];
    if (after[0] * was[0] + after[1] * was[1] + after[2] * was[2] > 0) continue;
    const roof = draft.faces[f].surfaceKind === 'RoofSurface';
    return refuse(roof ? 'INVALID_TOPOLOGY' : 'INVALID_GEOMETRY', [fpId, f], `face ${f} would turn over`);
  }

  // footprint record: corners move, removed corners and removed courtyards drop out
  const fp = draft.footprints[fpId];
  const near = (/** @type {P2} */ q) => [...oldGround].find(([, a]) => Math.hypot(a[0] - q[0], a[1] - q[1]) <= tol.topologySnapTolM)?.[0];
  const follow = (/** @type {P2[]} */ ring) => ring.flatMap((q) => {
    const v = near(q);
    if (!v) return [q];
    return draft.vertices[v] ? [[draft.vertices[v].p[0], draft.vertices[v].p[1]]] : [];
  });
  fp.outerRing = follow(fp.outerRing);
  fp.innerRings = fp.innerRings.filter((/** @type {P2[]} */ r) => !r.every((q) => { const v = near(q); return v && !draft.vertices[v]; })).map(follow);
  const after = resolveFootprint(draft, fpId);
  if (!after.ok) return after;
  const why = footprintError(after.body, tol);
  const short = after.body.rings.some((r) => r.some((q, i) => len2(sub2(r[(i + 1) % r.length], q)) < tol.minEdgeLengthM));
  if (why || short) return refuse('INVALID_GEOMETRY', [fpId], why ?? 'footprint edge shorter than minEdgeLengthM');

  for (const x of slots) {
    const again = addOverhang(draft, x.h, x.width, ctx, x.s);
    if (!again.ok) return again;
  }
  warnings.unshift(...report(draft, rings, plans, moved, drop, oldGround));
  return { ok: true, mapped: compose(draft, mapped), removed, movableFaceIds: [], warnings };
}

/**
 * Ground loops as ring edges, outer CCW first, courtyards CW; null when an edge has no vertical wall across it.
 * @param {any} d @param {string} groundId @param {number} eps @returns {RingEdge[][] | null}
 */
function ringEdges(d, groundId, eps) {
  const g = d.faces[groundId];
  /** @type {RingEdge[][]} */
  const out = [];
  for (const [k, start] of [g.outerLoopId, ...g.innerLoopIds].entries()) {
    /** @type {RingEdge[]} */
    const edges = [];
    for (const h of loopEdges(d, start)) {
      const he = d.halfEdges[h];
      const w = he.twinId ? d.faces[d.halfEdges[he.twinId].faceId] : undefined;
      if (!w || w.surfaceKind !== 'WallSurface' || Math.abs(w.supportPlane.normal[2]) > eps) return null;
      const va = he.startVertexId, vb = d.halfEdges[he.nextId].startVertexId;
      const xy = (/** @type {string} */ v) => /** @type {P2} */ ([d.vertices[v].p[0], d.vertices[v].p[1]]);
      edges.push({ wall: w.id, va, vb, a: xy(va), b: xy(vb), line: { n: [w.supportPlane.normal[0], w.supportPlane.normal[1]], d: w.supportPlane.d } });
    }
    const ccw = signedArea2(edges.map((e) => e.a)) > 0;
    out.push(ccw === (k === 0) ? edges : edges.reverse().map((e) => ({ ...e, va: e.vb, vb: e.va, a: e.b, b: e.a })));
  }
  return out;
}

/**
 * Successive merges dissolve a half-edge that an earlier dissolve mapped to: follow the map to ids that still exist.
 * @param {any} d @param {Record<string, string[]>} mapped @returns {Record<string, string[]>}
 */
function compose(d, mapped) {
  const exists = (/** @type {string} */ id) => !!(d.halfEdges[id] || d.faces[id] || d.vertices[id]);
  /** @type {(id: string, seen: Set<string>) => string[]} */
  const follow = (id, seen) => {
    if (exists(id)) return [id];
    if (seen.has(id) || !mapped[id]) return [];
    seen.add(id);
    return mapped[id].flatMap((n) => follow(n, seen));
  };
  /** @type {Record<string, string[]>} */
  const out = {};
  for (const [k, v] of Object.entries(mapped)) {
    const to = [...new Set(v.flatMap((n) => follow(n, new Set([k]))))].sort();
    if (to.length > 0) out[k] = to;
  }
  return out;
}

/** @param {RingEdge[]} r */
const ringWalls = (r) => [...new Set(r.map((e) => e.wall))].sort();

/** The change report (D-3D1141-5). @returns {string[]} */
function report(/** @type {any} */ d, /** @type {RingEdge[][]} */ rings, /** @type {any[]} */ plans, /** @type {any[]} */ moved, /** @type {boolean[]} */ drop, /** @type {Map<string, P2>} */ old) {
  const gone = [...old.keys()].filter((v) => !d.vertices[v]).sort();
  const out = [`${TAG}: removed vertices [${gone.join(', ')}]`];
  for (const g of moved) if (g.absorbed.length > 0) out.push(`${TAG}: merged walls [${g.absorbed.join(', ')}] into ${g.survivor}`);
  for (const g of moved) if (g.rotatedDeg !== 0) out.push(`${TAG}: rotated wall ${g.survivor} by ${f3(g.rotatedDeg)} deg`);
  rings.forEach((r, i) => { if (drop[i]) out.push(`${TAG}: removed courtyard [${ringWalls(r).join(', ')}]`); });
  const shift = Math.max(...plans.map((pl, i) => (drop[i] ? 0 : pl.shift)));
  const net = (/** @type {(pl: any, i: number) => number} */ f) => plans.reduce((s, pl, i) => s + (i === 0 ? f(pl, i) : -f(pl, i)), 0);
  const change = net((pl, i) => (drop[i] ? 0 : pl.areaNew)) - net((pl) => pl.areaOld);
  out.push(`${TAG}: max vertex shift ${f3(shift)} m; area change ${f3(change)} m2`);
  return out;
}

/** Newell normal of the outer ring (not normalised). @param {any} d @param {any} index @param {string} f @returns {number[]} */
function newell(d, index, f) {
  const ring = faceRings(d, index, f)[0].map((/** @type {string} */ v) => d.vertices[v].p);
  const n = [0, 0, 0];
  for (let i = 0; i < ring.length; i++) {
    const a = ring[i], b = ring[(i + 1) % ring.length];
    n[0] += (a[1] - b[1]) * (a[2] + b[2]); n[1] += (a[2] - b[2]) * (a[0] + b[0]); n[2] += (a[0] - b[0]) * (a[1] + b[1]);
  }
  return n;
}
