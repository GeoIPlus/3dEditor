// ops (3D-114): ALIGN_WALL (spec §10.10 r4; v0.2 F-40; D-346, D-3D114-4). Planes are primary (D-08): only the wall's
// support plane changes, to the vertical plane through `referenceLine` (outward side kept); roof planes are kept and
// every vertex on the wall is re-derived, so the adjoining roof and ground follow and the eave height is recomputed.
// The footprint record follows the wall's base vertices. An overhang whose wall or end wall is this wall is taken off
// first and rebuilt at the same width in plan with the same ids (as SET_HEIGHT EAVE, D-338).
// Refusals (D-3D114-4): not a building wall or a degenerate line -> INVALID_PAYLOAD; self-intersecting footprint, a
// footprint edge < minEdgeLengthM or a wall / ground face turned over -> INVALID_GEOMETRY; a roof face turned over or a
// junction the kept planes no longer meet in one point (roof topology change) -> INVALID_TOPOLOGY. Hard constraints
// are checked by the pipeline's constraint step (CONSTRAINT_CONFLICT).
import { buildIndex, faceRings, rederive } from '../brep/index.js';
import { resolveFootprint, footprintError } from './footprint.js';
import { findOverhang, removeOverhang, addOverhang } from './overhang.js';
import { len2, sub2 } from './geom2.js';
import { refuse } from './errors.js';

/** @typedef {import('./pipeline.js').OpContext} OpContext */
/** @typedef {import('./pipeline.js').OpResult} OpResult */
/** @typedef {import('./geom2.js').P2} P2 */

const OVERHANG = 'OVERHANG';

/** @type {(draft: any, payload: any, ctx: OpContext) => OpResult} */
export function alignWall(draft, payload, ctx) {
  const p = payload ?? {};
  const tol = ctx.tol;
  const face = typeof p.faceId === 'string' ? draft.faces[p.faceId] : undefined;
  if (!face) return refuse('INVALID_PAYLOAD', p.faceId ? [String(p.faceId)] : [], 'unknown faceId');
  const line = readLine(p.referenceLine, ctx);
  if (!line) return refuse('INVALID_PAYLOAD', [face.id], 'referenceLine');
  if (len2(sub2(line[1], line[0])) < tol.minEdgeLengthM) return refuse('INVALID_PAYLOAD', [face.id], 'referenceLine shorter than minEdgeLengthM');
  const fps = Object.values(draft.footprints).filter((f) => !f.buildingPartId);
  if (fps.length !== 1) return refuse('INVALID_TOPOLOGY', fps.map((f) => f.id), 'building footprint is not unique (D-218)');
  const found = resolveFootprint(draft, fps[0].id);
  if (!found.ok) return found;
  const body = found.body;
  const shellFaces = /** @type {string[]} */ (draft.shells[body.shellId].faceIds);
  const ground = shellFaces.filter((f) => draft.faces[f].surfaceKind === 'GroundSurface');
  const index0 = buildIndex(draft);
  const onGround = (/** @type {string} */ v) => draft.vertices[v].definingFaceIds.some((/** @type {string} */ f) => ground.includes(f));
  const baseOld = verticesOf(draft, index0, face.id).filter(onGround);
  if (face.surfaceKind !== 'WallSurface' || face.tags.includes(OVERHANG) || !shellFaces.includes(face.id) || baseOld.length < 2
    || Math.abs(face.supportPlane.normal[2]) > tol.numericEpsilon) {
    return refuse('INVALID_PAYLOAD', [face.id], 'not a wall of the building footprint');
  }

  // the new vertical plane, outward side kept
  const [a, b] = line;
  const l = len2(sub2(b, a));
  let n = /** @type {[number, number, number]} */ ([(b[1] - a[1]) / l, -(b[0] - a[0]) / l, 0]);
  const old = face.supportPlane.normal;
  const dot = n[0] * old[0] + n[1] * old[1];
  if (Math.abs(dot) <= tol.numericEpsilon) return refuse('INVALID_GEOMETRY', [face.id], 'referenceLine is perpendicular to the wall');
  if (dot < 0) n = [-n[0], -n[1], 0];
  const plane = { normal: n, d: -(n[0] * a[0] + n[1] * a[1]) };
  if (plane.d === face.supportPlane.d && n[0] === old[0] && n[1] === old[1]) return { ok: true, noChange: true };

  // overhangs that hang on this wall (as eave wall or end wall) come off first
  const rebuild = [];
  for (const h of Object.values(draft.halfEdges)) {
    const t = h.twinId ? draft.halfEdges[h.twinId] : undefined;
    const r = draft.faces[h.faceId];
    if (!t || r.surfaceKind !== 'RoofSurface' || r.tags.includes(OVERHANG) || !draft.faces[t.faceId].tags.includes(OVERHANG)) continue;
    const f = findOverhang(draft, h.id);
    if (!f.ok) return f;
    if (f.found && [f.found.wall, f.found.gA, f.found.gB].includes(face.id)) rebuild.push({ h: h.id, f: f.found });
  }
  rebuild.sort((x, y) => (x.h < y.h ? -1 : 1));
  const slots = rebuild.map((x) => ({ h: x.h, width: x.f.width, s: removeOverhang(draft, x.h, x.f, tol.numericEpsilon) }));

  const index = buildIndex(draft);
  const touched = new Set(Object.values(draft.vertices).filter((v) => v.definingFaceIds.includes(face.id)).flatMap((v) => v.definingFaceIds));
  const before = Object.fromEntries([...touched].map((f) => [f, normalOf(draft, index, f)]));
  const plan = Object.fromEntries(baseOld.map((v) => [v, [draft.vertices[v].p[0], draft.vertices[v].p[1]]]));
  face.supportPlane = plane;
  const res = rederive(draft, [face.id], tol);
  if (res.junctions.length > 0) {
    return refuse('INVALID_TOPOLOGY', [face.id, ...res.junctions.flatMap((j) => j.entityIds)], 'the kept planes no longer meet in one point: roof topology would change (D-3D114-4)');
  }
  if (res.offPlane.length > 0) return refuse('INVALID_TOPOLOGY', [face.id, ...res.offPlane.map((o) => o.vertexId)], 'a vertex is no longer on its planes (D-3D114-4)');
  for (const f of [...touched].sort()) {
    const after = normalOf(draft, index, f);
    const was = before[f];
    if (after[0] * was[0] + after[1] * was[1] + after[2] * was[2] > 0) continue;
    const roof = draft.faces[f].surfaceKind === 'RoofSurface';
    return refuse(roof ? 'INVALID_TOPOLOGY' : 'INVALID_GEOMETRY', [face.id, f], `face ${f} would turn over (D-3D114-4)`);
  }

  // footprint record: the wall's base corners move
  const fp = draft.footprints[body.footprintId];
  const move = (/** @type {P2[]} */ ring) => ring.map((q) => {
    const v = baseOld.find((x) => Math.hypot(plan[x][0] - q[0], plan[x][1] - q[1]) <= tol.topologySnapTolM);
    return v ? [draft.vertices[v].p[0], draft.vertices[v].p[1]] : q;
  });
  fp.outerRing = move(fp.outerRing);
  fp.innerRings = fp.innerRings.map(move);
  const moved = resolveFootprint(draft, body.footprintId);
  if (!moved.ok) return moved;
  const why = footprintError(moved.body, tol);
  const short = moved.body.rings.some((r) => r.some((q, i) => len2(sub2(r[(i + 1) % r.length], q)) < tol.minEdgeLengthM));
  if (why || short) return refuse('INVALID_GEOMETRY', [body.footprintId, face.id], why ?? 'footprint edge shorter than minEdgeLengthM');

  for (const x of slots) {
    const again = addOverhang(draft, x.h, x.width, ctx, x.s);
    if (!again.ok) return again;
  }
  return { ok: true, movableFaceIds: [] };
}

/** @param {unknown} raw @param {OpContext} ctx @returns {[P2, P2] | null} */
function readLine(raw, ctx) {
  const isP = (/** @type {any} */ q) => Array.isArray(q) && q.length >= 2 && Number.isFinite(q[0]) && Number.isFinite(q[1]);
  if (!Array.isArray(raw) || raw.length !== 2 || !raw.every(isP)) return null;
  const pts = raw.map((/** @type {any} */ q) => (ctx.frame === 'WORLD' ? ctx.pointToLocal([q[0], q[1], 0], 'WORLD') : q));
  return [[pts[0][0], pts[0][1]], [pts[1][0], pts[1][1]]];
}

/** Distinct vertex ids of a face. @param {any} d @param {any} index @param {string} f @returns {string[]} */
const verticesOf = (d, index, f) => [...new Set(faceRings(d, index, f).flat())].sort();

/** Newell normal of the outer ring (not normalised). @param {any} d @param {any} index @param {string} f @returns {number[]} */
function normalOf(d, index, f) {
  const ring = faceRings(d, index, f)[0].map((/** @type {string} */ v) => d.vertices[v].p);
  const n = [0, 0, 0];
  for (let i = 0; i < ring.length; i++) {
    const p = ring[i], q = ring[(i + 1) % ring.length];
    n[0] += (p[1] - q[1]) * (p[2] + q[2]);
    n[1] += (p[2] - q[2]) * (p[0] + q[0]);
    n[2] += (p[0] - q[0]) * (p[1] + q[1]);
  }
  return n;
}
