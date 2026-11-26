// ops (3D-124, 3D-ADR-0010, D-384, D-385): dependent overhangs (D-336) follow their parent through the pipeline -
// detach, solve, rebuild inside the one transaction. Before the operation every overhang is taken off (a conservative
// wider set, D-384) with its reconstruction descriptor (structural eave, wall, end walls, width in plan from the input,
// ids); the plain eave has DERIVED vertices, so the operation and the solver see the structural envelope. After the
// constraint step each overhang is re-added through `addOverhang` with the same ids and width in plan from the (new)
// wall (C1). No re-parenting: the eave half-edge, its two vertices, its wall and its end walls must be the same ids,
// else INVALID_TOPOLOGY. Numeric noise (<= numericEpsilon) of the rebuild is snapped to the input values and the
// non-geometric members of the input records are kept, so an unchanged overhang gives no patch entry. Constraints that
// name dependent entities sit out the solve; after the rebuild every hard constraint is checked with all planes fixed.
// Operations that take overhangs off and on themselves are not detached (D-384: no double rebuild; registry).
import { compileConstraints, solveConstraints } from '../solve/index.js';
import { findOverhang, removeOverhang, addOverhang } from './overhang.js';
import { refuse } from './errors.js';

/** @typedef {import('./overhang.js').Slots} Slots */
/**
 * @typedef {object} Detached reconstruction descriptor of one overhang (internal, no schema, D-383)
 * @property {string} h main-roof half-edge of the structural eave @property {string} roof @property {string} wall
 * @property {string} gA @property {string} gB @property {string} A @property {string} B @property {number} width
 * @property {Slots} slots
 */
/** @typedef {{ constraints: any[], positions: Record<string, number[]> }} Held */

const OVERHANG = 'OVERHANG';

/**
 * Every well-formed overhang of a model, sorted by eave half-edge. A partial one is left to the 3D-120 guard.
 * @param {any} m @returns {{ h: string, f: any }[]}
 */
export function overhangsOf(m) {
  if (!Object.values(m.faces).some((/** @type {any} */ f) => f.tags.includes(OVERHANG))) return [];
  const out = [];
  for (const h of /** @type {any[]} */ (Object.values(m.halfEdges))) {
    const t = h.twinId ? m.halfEdges[h.twinId] : undefined;
    const r = m.faces[h.faceId];
    if (!t || r.surfaceKind !== 'RoofSurface' || r.tags.includes(OVERHANG) || !m.faces[t.faceId].tags.includes(OVERHANG)) continue;
    const f = findOverhang(m, h.id);
    if (f.ok && f.found) out.push({ h: h.id, f: f.found });
  }
  return out.sort((x, y) => (x.h < y.h ? -1 : 1));
}

/** Ids of the dependent entities of an overhang. @param {Slots} s */
const dependentIds = (s) => [s.strip, s.soffit, s.capA, s.capB, s.oA, s.oB, s.sA, s.sB, ...Object.values(s.he)];

/**
 * D-385: a payload that names a dependent entity is refused, except by the operations that own them.
 * @param {any} model @param {any} command @param {Set<string>} owners
 */
export function dependentPayload(model, command, owners) {
  if (owners.has(command.operation)) return null;
  const list = overhangsOf(model);
  if (list.length === 0) return null;
  const dep = new Set(list.flatMap((x) => dependentIds(x.f)));
  /** @type {Set<string>} */
  const named = new Set();
  const walk = (/** @type {unknown} */ v) => {
    if (typeof v === 'string') { if (dep.has(v)) named.add(v); } else if (Array.isArray(v)) v.forEach(walk);
    else if (v && typeof v === 'object') Object.values(v).forEach(walk);
  };
  walk(command.payload);
  if (named.size === 0) return null;
  return refuse('INVALID_PAYLOAD', [...named].sort(), 'the payload names dependent overhang geometry; change it through SET_OVERHANG / SET_HEIGHT EAVE (D-385)');
}

/**
 * Take every overhang off the draft (D-384 steps 3-5).
 * @param {any} draft mutated @param {number} eps @returns {Detached[]}
 */
export function detachOverhangs(draft, eps) {
  /** @type {Detached[]} */
  const out = [];
  for (const { h, f } of overhangsOf(draft)) {
    const he = draft.halfEdges[h];
    const A = he.startVertexId, B = draft.halfEdges[f.he.t].startVertexId;
    out.push({ h, roof: he.faceId, wall: f.wall, gA: f.gA, gB: f.gB, A, B, width: f.width, slots: removeOverhang(draft, h, f, eps) });
  }
  return out;
}

/**
 * Constraints that name a detached entity: taken out of the draft for the solve, handed back after the rebuild. Also
 * the vertex positions the constraint step compiles against (after the operation, before the solve).
 * @param {any} draft mutated @param {Detached[]} list @returns {Held}
 */
export function holdConstraints(draft, list) {
  if (list.length === 0) return { constraints: [], positions: {} };
  const dep = new Set(list.flatMap((x) => dependentIds(x.slots)));
  const held = Object.values(draft.constraints).filter((c) => c.entityIds.some((/** @type {string} */ id) => dep.has(id)));
  for (const c of held) delete draft.constraints[c.id];
  /** @type {Record<string, number[]>} */
  const positions = {};
  for (const [id, v] of Object.entries(draft.vertices)) positions[id] = [...v.p];
  return { constraints: held, positions };
}

/**
 * Re-add the overhangs (D-384 steps 7-9), hand the held constraints back and check every hard constraint.
 * @param {any} input the input model (read only) @param {any} draft mutated @param {Detached[]} list
 * @param {Held} held @param {{ ids: (k: string) => string, tol: any }} ctx
 * @returns {{ ok: true } | { ok: false, refusal: any }}
 */
export function rebuildOverhangs(input, draft, list, held, ctx) {
  const eps = ctx.tol.numericEpsilon;
  for (const x of [...list].reverse()) {
    const he = draft.halfEdges[x.h];
    const t = he?.twinId ? draft.halfEdges[he.twinId] : undefined;
    const r = he ? draft.faces[he.faceId] : undefined;
    if (!he || !t || !r || r.surfaceKind !== 'RoofSurface' || he.startVertexId !== x.A || t.startVertexId !== x.B || t.faceId !== x.wall) {
      return refuse('INVALID_TOPOLOGY', [x.h, x.slots.strip], 'the structural eave of the overhang is gone, split or on another wall; no re-parenting (D-384)');
    }
    const ends = endWalls(draft, t);
    if (ends[0] !== x.gA || ends[1] !== x.gB) {
      return refuse('INVALID_TOPOLOGY', [x.h, x.slots.strip, ...ends], 'the end walls of the overhang changed; no re-parenting (D-384)');
    }
    const again = addOverhang(draft, x.h, x.width, ctx, x.slots);
    if (!again.ok) return again;
  }
  keepInput(input, draft, list, eps);
  for (const c of held.constraints) draft.constraints[c.id] = c;
  return checkHard(input, draft, held.positions, ctx.tol);
}

/** End walls at A and B of the plain eave whose wall half-edge is `t`. @param {any} d @param {any} t */
function endWalls(d, t) {
  const wn = d.halfEdges[t.nextId], wp = d.halfEdges[t.prevId];
  const face = (/** @type {any} */ e) => (e.twinId ? d.halfEdges[e.twinId].faceId : '');
  return [face(wn), face(wp)];
}

/**
 * Snap the rebuild's numeric noise to the input and keep the input records' other members (provenance, extra tags,
 * loop entry, shell order), so that only real changes reach the patch.
 * @param {any} input @param {any} draft @param {Detached[]} list @param {number} eps
 */
function keepInput(input, draft, list, eps) {
  const near = (/** @type {number[]} */ a, /** @type {number[]} */ b) => a.length === b.length && a.every((v, i) => Math.abs(v - b[i]) <= eps);
  /** @type {Set<string>} */
  const faces = new Set();
  for (const x of list) {
    const s = x.slots;
    for (const f of [s.strip, s.soffit, s.capA, s.capB, x.roof, x.wall, x.gA, x.gB]) faces.add(f);
    for (const v of [s.oA, s.oB, s.sA, s.sB, x.A, x.B]) {
      const a = draft.vertices[v], b = input.vertices[v];
      if (!a || !b) continue;
      if (a.positionMode === b.positionMode && near(a.p, b.p) && a.definingFaceIds.join() === b.definingFaceIds.join()) a.p = [...b.p];
      for (const k of ['provenanceId', 'sourceRef']) if (b[k] !== undefined && a[k] === undefined) a[k] = b[k];
    }
  }
  for (const id of faces) {
    const a = draft.faces[id], b = input.faces[id];
    if (!a || !b) continue;
    const pa = a.supportPlane, pb = b.supportPlane;
    if (a.tags.includes(OVERHANG)) {
      if (near([...pa.normal, pa.d], [...pb.normal, pb.d])) a.supportPlane = { normal: [...pb.normal], d: pb.d };
      a.tags = [...b.tags];
      for (const k of Object.keys(b)) if (!(k in a) && k !== 'roofComponentId') a[k] = structuredClone(b[k]);
    }
    const loopOf = (/** @type {string} */ e) => draft.halfEdges[e]?.faceId === id;
    if (a.outerLoopId !== b.outerLoopId && loopOf(b.outerLoopId)) a.outerLoopId = b.outerLoopId;
    if (b.innerLoopIds.every(loopOf) && b.innerLoopIds.length === a.innerLoopIds.length) a.innerLoopIds = [...b.innerLoopIds];
  }
  for (const key of ['shells', 'roofComponents']) {
    for (const [id, a] of Object.entries(draft[key])) {
      const b = input[key][id];
      if (!b || a.faceIds.length !== b.faceIds.length) continue;
      const set = new Set(a.faceIds);
      if (b.faceIds.every((/** @type {string} */ f) => set.has(f))) a.faceIds = [...b.faceIds];
    }
  }
}

/**
 * Every hard constraint holds on the rebuilt model with all planes fixed (D-384: a solver success is not proof). A
 * constraint without a target keeps the position the constraint step compiled against (after the operation, before
 * the solve); a detached vertex keeps its input position.
 * @param {any} input @param {any} draft @param {Record<string, number[]>} positions @param {any} tol
 * @returns {{ ok: true } | { ok: false, refusal: any }}
 */
function checkHard(input, draft, positions, tol) {
  const hard = Object.values(draft.constraints).filter((c) => c.hard);
  if (hard.length === 0) return { ok: true };
  const at = { ...draft, vertices: { ...draft.vertices } };
  for (const [id, v] of Object.entries(draft.vertices)) {
    const p = positions[id] ?? input.vertices[id]?.p;
    if (p) at.vertices[id] = { ...v, p };
  }
  const compiled = compileConstraints(at, hard, tol);
  if (compiled.conditions.length === 0) return { ok: true };
  const res = solveConstraints({ model: draft, movableFaceIds: [], conditions: compiled.conditions, keepWeights: compiled.keepWeights }, tol);
  if (res.status === 'OK') return { ok: true };
  const ids = [...new Set([...res.conflictIds, ...res.entityIds])].sort();
  return refuse('CONSTRAINT_CONFLICT', ids, 'a hard constraint does not hold after the overhang rebuild (D-384)');
}
