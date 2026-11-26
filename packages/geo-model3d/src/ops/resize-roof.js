// ops (3D-114): RESIZE_ROOF (spec §10.10 r2; v0.2 F-29; D-339). The roof is the lower envelope of its own planes
// (D-08: planes kept, never re-fitted), clipped to the convex `roofOutline`. V1 = roofs that are their lower envelope
// (FLAT, SHED, GABLE, HIP, PYRAMID by geometry); a valley, an installation (dormer, chimney) or a roof face that gives
// no z(x, y) -> INVALID_TOPOLOGY (D-3D114-3), model unchanged.
// moveWallFootprint true: footprint := outline, walls and ground rebuilt under the new roof cells (buildEnvelope, as
// REBUILD_ENVELOPE; roof face ids kept, D-212); an existing overhang is removed first (RR-09).
// moveWallFootprint false: footprint and walls kept; the outline must be the footprint offset edge by edge, and every
// edge offset outward closes only by the D-336 overhang of a structural eave (overhang.js); otherwise
// INVALID_TOPOLOGY (D-344). Outline not covering the footprint, non-convex or self-intersecting -> INVALID_GEOMETRY.
import { resolveFootprint } from './footprint.js';
import { buildEnvelope } from './envelope.js';
import { findOverhang, removeOverhang, addOverhang } from './overhang.js';
import { heldHard } from './align-common.js';
import { notLowerEnvelope, convexOutline, envelopeCells, slopeOf } from './lower-envelope.js';
import { cross2, len2, sub2 } from './geom2.js';
import { refuse } from './errors.js';

/** @typedef {import('./pipeline.js').OpContext} OpContext */
/** @typedef {import('./pipeline.js').OpResult} OpResult */
/** @typedef {import('./geom2.js').P2} P2 */

const OVERHANG = 'OVERHANG';

/** @type {(draft: any, payload: any, ctx: OpContext) => OpResult} */
export function resizeRoof(draft, payload, ctx) {
  const p = payload ?? {};
  const tol = ctx.tol;
  if (typeof p.moveWallFootprint !== 'boolean') return refuse('INVALID_PAYLOAD', [], 'moveWallFootprint');
  const held = heldHard(draft, p.hardConstraintIds, tol);
  if (!held.ok) return held;
  const fps = Object.values(draft.footprints).filter((f) => !f.buildingPartId);
  if (fps.length !== 1) return refuse('INVALID_TOPOLOGY', fps.map((f) => f.id), 'building footprint is not unique (D-218)');
  const found = resolveFootprint(draft, fps[0].id);
  if (!found.ok) return found;
  const body = found.body;
  const raw = Array.isArray(p.roofOutline) && ctx.frame === 'WORLD'
    ? p.roofOutline.map((/** @type {any} */ q) => (Array.isArray(q) ? ctx.pointToLocal([q[0], q[1], 0], 'WORLD').slice(0, 2) : q))
    : p.roofOutline;
  const outline = convexOutline(raw, tol.minEdgeLengthM);
  if (!outline.ok) return refuse(outline.reason === 'roofOutline' ? 'INVALID_PAYLOAD' : 'INVALID_GEOMETRY', outline.reason === 'roofOutline' ? [] : [body.footprintId], outline.reason);

  const installations = Object.values(draft.semantics).filter((s) => s.kind === 'BuildingInstallation' && s.parentId === body.ownerId).map((s) => s.id);
  if (installations.length > 0) return refuse('INVALID_TOPOLOGY', installations.sort(), 'an installation joins the roof; not a lower-envelope roof (D-339, D-3D114-3)');
  const shellFaces = /** @type {string[]} */ (draft.shells[body.shellId].faceIds);
  const roofIds = shellFaces.filter((f) => draft.faces[f].surfaceKind === 'RoofSurface' && !draft.faces[f].tags.includes(OVERHANG)).sort();
  const other = shellFaces.filter((f) => !['RoofSurface', 'WallSurface', 'GroundSurface'].includes(draft.faces[f].surfaceKind) && !draft.faces[f].tags.includes(OVERHANG));
  if (roofIds.length === 0 || other.length > 0) return refuse('INVALID_TOPOLOGY', [body.footprintId, ...other], 'body is not walls, ground and one roof (D-3D114-3)');
  const steep = roofIds.filter((f) => !(draft.faces[f].supportPlane.normal[2] > tol.numericEpsilon));
  if (steep.length > 0) return refuse('INVALID_TOPOLOGY', steep, 'roof face gives no z(x, y) (D-3D114-3)');
  const valley = notLowerEnvelope(draft, roofIds, tol);
  if (valley.length > 0) return refuse('INVALID_TOPOLOGY', valley, 'the roof is not the lower envelope of its planes, e.g. a valley (D-339, D-3D114-3)');

  const res = p.moveWallFootprint
    ? withWalls(draft, body, roofIds, outline.ring, ctx)
    : byOverhang(draft, body, roofIds, outline.ring, ctx);
  if (!res.ok) return res;
  return { ...res, conditions: held.conditions, movableFaceIds: [] };
}

/**
 * moveWallFootprint true.
 * @param {any} draft @param {import('./footprint.js').FootprintBody} body @param {string[]} roofIds @param {P2[]} outline
 * @param {OpContext} ctx @returns {OpResult}
 */
function withWalls(draft, body, roofIds, outline, ctx) {
  const tol = ctx.tol;
  if (body.rings.length > 1) return refuse('INVALID_TOPOLOGY', [body.footprintId], 'footprint with a courtyard: the roof is not over a convex outline (D-339)');
  const eaves = overhangEaves(draft, roofIds);
  if (eaves.length === 0 && sameRing(outline, body.rings[0], tol.topologySnapTolM)) return { ok: true, noChange: true };
  /** @type {Set<string>} */
  const removed = new Set();
  for (const h of eaves) {
    const f = findOverhang(draft, h);
    if (!f.ok) return f;
    if (f.found) addSlots(removed, removeOverhang(draft, h, f.found, tol.numericEpsilon));
  }
  // coplanar roof faces share one plane and one cell; the first id (sorted) keeps it, the others map to it
  /** @type {{ id: string, plane: any, dup: string[] }[]} */
  const groups = [];
  const cosTol = Math.cos((tol.coplanarTolDeg * Math.PI) / 180);
  for (const f of roofIds) {
    const pl = draft.faces[f].supportPlane;
    const g = groups.find((x) => samePlane(x.plane, pl, cosTol, outline, tol.planarTolM));
    if (g) g.dup.push(f); else groups.push({ id: f, plane: pl, dup: [] });
  }
  const oldTop = roofVertices(draft, roofIds);
  const cells = envelopeCells(outline, groups.map((g) => g.plane), 1e-6).map((c) => {
    const g = groups[c.index];
    const s = slopeOf(g.plane);
    const vertexIds = [c.ring.map((q) => {
      const z = s[0] * q[0] + s[1] * q[1] + s[2];
      return oldTop.find((v) => Math.hypot(v.p[0] - q[0], v.p[1] - q[1], v.p[2] - z) <= 1e-9)?.id;
    })];
    return { plane: g.plane, faceId: g.id, rings: [c.ring], vertexIds };
  });
  // a vertex id may stand for one plan point only
  const used = new Set();
  for (const c of cells) c.vertexIds = c.vertexIds.map((r) => r.map((v) => (v && !used.has(v) ? (used.add(v), v) : undefined)));
  const fp = draft.footprints[body.footprintId];
  fp.outerRing = outline.map((q) => [q[0], q[1]]);
  fp.innerRings = [];
  const env = buildEnvelope(draft, { ...body, rings: [outline], edgeIndex: [outline.map((_, i) => i)] }, /** @type {any} */ (cells), ctx);
  if (!env.ok) return refuse('INVALID_GEOMETRY', [body.footprintId, ...roofIds], env.reason);
  for (const id of env.removed) removed.add(id);
  /** @type {Record<string, string[]>} */
  const mapped = { ...env.mapped };
  const kept = new Set(cells.map((c) => c.faceId));
  for (const g of groups) for (const f of g.dup) if (kept.has(g.id)) mapped[f] = [g.id];
  return { ok: true, mapped, removed };
}

/**
 * moveWallFootprint false: per footprint edge the outward offset of the outline is an overhang width (D-336).
 * @param {any} draft @param {import('./footprint.js').FootprintBody} body @param {string[]} roofIds @param {P2[]} outline
 * @param {OpContext} ctx @returns {OpResult}
 */
function byOverhang(draft, body, roofIds, outline, ctx) {
  const tol = ctx.tol, snap = tol.topologySnapTolM;
  const fr = body.rings[0], n = fr.length;
  const uncovered = fr.some((q) => outline.some((a, i) => cross2(sub2(outline[(i + 1) % outline.length], a), sub2(q, a)) / len2(sub2(outline[(i + 1) % outline.length], a)) < -snap));
  if (uncovered) return refuse('INVALID_GEOMETRY', [body.footprintId], 'the outline does not cover the footprint (D-339)');
  const widths = offsets(fr, outline, snap);
  if (!widths) return refuse('INVALID_TOPOLOGY', [body.footprintId], 'the outline is not the footprint offset edge by edge; outer parts close only by an eave overhang (D-339, D-344)');
  /** @type {Set<string>} */
  const removed = new Set();
  let changed = false;
  for (let i = 0; i < n; i++) {
    const w = widths[i] <= snap ? 0 : widths[i];
    const h = eaveOver(draft, roofIds, fr[i], fr[(i + 1) % n], snap);
    if (!h) {
      if (w > 0) return refuse('INVALID_TOPOLOGY', [body.footprintId], `outline beyond footprint edge ${i}, which is not a structural eave (D-344)`);
      continue;
    }
    const f = findOverhang(draft, h);
    if (!f.ok) return f;
    const cur = f.found ? f.found.width : 0;
    if (Math.abs(cur - w) <= tol.numericEpsilon) continue;
    changed = true;
    const slots = f.found ? removeOverhang(draft, h, f.found, tol.numericEpsilon) : undefined;
    if (w === 0) { if (slots) addSlots(removed, slots); continue; }
    const r = addOverhang(draft, h, w, ctx, slots);
    if (!r.ok) return r;
  }
  return changed ? { ok: true, removed } : { ok: true, noChange: true };
}

/**
 * Outward offset of the outline edge that runs parallel to each footprint edge (same order, same count), or null.
 * @param {P2[]} fr footprint outer ring, CCW @param {P2[]} outline CCW @param {number} snap @returns {number[] | null}
 */
function offsets(fr, outline, snap) {
  const n = fr.length;
  if (outline.length !== n) return null;
  for (let k = 0; k < n; k++) {
    /** @type {number[]} */
    const w = [];
    for (let i = 0; i < n; i++) {
      const a = fr[i], b = fr[(i + 1) % n], l = len2(sub2(b, a));
      const out = (/** @type {P2} */ q) => -cross2(sub2(b, a), sub2(q, a)) / l;
      const oa = outline[(i + k) % n], ob = outline[(i + k + 1) % n];
      const dir = sub2(ob, oa);
      if (!(dir[0] * (b[0] - a[0]) + dir[1] * (b[1] - a[1]) > 0)) break;
      const wa = out(oa), wb = out(ob);
      if (Math.abs(wa - wb) > snap) break;
      w.push((wa + wb) / 2);
    }
    if (w.length === n) return w;
  }
  return null;
}

/** Main-roof half-edges of eaves that carry an overhang. @param {any} d @param {string[]} roofIds */
function overhangEaves(d, roofIds) {
  const set = new Set(roofIds);
  return Object.values(d.halfEdges)
    .filter((h) => set.has(h.faceId) && h.twinId && d.faces[d.halfEdges[h.twinId].faceId].tags.includes(OVERHANG))
    .map((h) => h.id).sort();
}

/** The main-roof EAVE half-edge from a to b in plan, if exactly one. @param {any} d @param {string[]} roofIds @param {P2} a @param {P2} b @param {number} snap */
function eaveOver(d, roofIds, a, b, snap) {
  const set = new Set(roofIds);
  const at = (/** @type {string} */ v, /** @type {P2} */ q) => Math.hypot(d.vertices[v].p[0] - q[0], d.vertices[v].p[1] - q[1]) <= snap;
  const hs = Object.values(d.halfEdges).filter((h) => set.has(h.faceId) && h.edgeRole === 'EAVE' && at(h.startVertexId, a) && at(d.halfEdges[h.nextId].startVertexId, b));
  return hs.length === 1 ? hs[0].id : null;
}

/** @param {any} d @param {string[]} roofIds @returns {{ id: string, p: number[] }[]} */
function roofVertices(d, roofIds) {
  const set = new Set(roofIds);
  const ids = [...new Set(Object.values(d.halfEdges).filter((h) => set.has(h.faceId)).map((h) => h.startVertexId))].sort();
  return ids.map((id) => ({ id, p: d.vertices[id].p }));
}

/** @param {any} a @param {any} b @param {number} cosTol @param {P2[]} outline @param {number} tolM */
function samePlane(a, b, cosTol, outline, tolM) {
  const dot = a.normal[0] * b.normal[0] + a.normal[1] * b.normal[1] + a.normal[2] * b.normal[2];
  if (dot < cosTol) return false;
  const sa = slopeOf(a), sb = slopeOf(b);
  return outline.every((q) => Math.abs(sa[0] * q[0] + sa[1] * q[1] + sa[2] - (sb[0] * q[0] + sb[1] * q[1] + sb[2])) <= tolM);
}

/** Same points in the same cyclic order within `tol`. @param {P2[]} a @param {P2[]} b @param {number} tol */
function sameRing(a, b, tol) {
  if (a.length !== b.length) return false;
  const n = a.length;
  for (let k = 0; k < n; k++) if (a.every((q, i) => Math.hypot(q[0] - b[(i + k) % n][0], q[1] - b[(i + k) % n][1]) <= tol)) return true;
  return false;
}

/** @param {Set<string>} removed @param {any} s overhang slots */
function addSlots(removed, s) {
  for (const x of [s.strip, s.soffit, s.capA, s.capB, s.oA, s.oB, s.sA, s.sB, ...Object.values(s.he)]) removed.add(/** @type {string} */ (x));
}
