// ops (3D-19): SET_HEIGHT (spec §10.10 r5; v0.3 §6 F-41). Planes are primary (D-08): both kinds are hard EQUAL_Z
// targets solved by the pipeline's constraint step for the planes they declare movable, so hard model constraints
// (FIXED_POINT, ...) conflict through the solver (CONSTRAINT_CONFLICT) as in D-231.
// BASE: the ground faces of the building body move to the new Z; walls follow by re-derivation.
// EAVE (D-3D19-3): the structural eave (roof plane ∩ wall plane), not an overhang's outer edge; only the roof face of
// that eave moves (D-231, D-110: its other vertices, e.g. the ridge, are kept); walls, ground, the opposite slope and
// hard-constrained faces stay fixed. A height at or below the base -> INVALID_GEOMETRY (as D-214 for templates) [A].
import { builders } from '../solve/index.js';
import { resolveFootprint } from './footprint.js';
import { hardConstrainedFaces } from './align-common.js';
import { findOverhang, removeOverhang, addOverhang } from './overhang.js';
import { structuralEave } from './set-overhang.js';
import { constraintStep } from './constraints.js';
import { refuse } from './errors.js';

/** @typedef {import('./pipeline.js').OpContext} OpContext */
/** @typedef {import('./pipeline.js').OpResult} OpResult */

/** @type {(draft: any, payload: any, ctx: OpContext) => OpResult} */
export function setHeight(draft, payload, ctx) {
  const p = payload ?? {};
  if (typeof p.z !== 'number' || !Number.isFinite(p.z)) return refuse('INVALID_PAYLOAD', [], 'z');
  const z = ctx.frame === 'WORLD' ? ctx.heightToLocal(p.z) : p.z;
  const fps = Object.values(draft.footprints).filter((f) => !f.buildingPartId);
  if (fps.length !== 1) return refuse('INVALID_TOPOLOGY', fps.map((f) => f.id), 'building footprint is not unique (D-218)');
  const found = resolveFootprint(draft, fps[0].id);
  if (!found.ok) return found;
  const body = found.body;
  const shellFaces = draft.shells[body.shellId].faceIds;
  if (p.kind === 'BASE') return setBase(draft, body, shellFaces, z, ctx);
  if (p.kind === 'EAVE') return setEave(draft, body, shellFaces, p.eaveEdgeId, z, ctx);
  return refuse('INVALID_PAYLOAD', [], 'kind');
}

/**
 * @param {any} draft @param {import('./footprint.js').FootprintBody} body @param {string[]} shellFaces @param {number} z
 * @param {OpContext} ctx @returns {OpResult}
 */
function setBase(draft, body, shellFaces, z, ctx) {
  const ground = shellFaces.filter((f) => draft.faces[f].surfaceKind === 'GroundSurface');
  if (ground.length === 0) return refuse('INVALID_TOPOLOGY', [body.footprintId], 'body has no GroundSurface');
  const groundVertices = verticesOf(draft, ground);
  const others = verticesOf(draft, shellFaces).filter((v) => !groundVertices.includes(v));
  if (others.some((v) => !(draft.vertices[v].p[2] > z))) {
    return refuse('INVALID_GEOMETRY', [body.footprintId], 'new base at or above a wall top or roof vertex (D-214) [A]');
  }
  const fixed = hardConstrainedFaces(draft);
  const b = builders(draft);
  draft.footprints[body.footprintId].baseElevationM = z;
  return {
    ok: true,
    movableFaceIds: ground.filter((f) => !fixed.has(f)).sort(),
    conditions: groundVertices.map((v) => b.vertexZ({ id: v, kind: 'EQUAL_Z' }, v, z, ctx.tol.zAlignTolM)),
    targetVertexIds: groundVertices,
  };
}

/**
 * @param {any} draft @param {import('./footprint.js').FootprintBody} body @param {string[]} shellFaces
 * @param {unknown} heId @param {number} z @param {OpContext} ctx @returns {OpResult}
 */
function setEave(draft, body, shellFaces, heId, z, ctx) {
  const bad = structuralEave(draft, heId);
  if (bad) return bad;
  const he = draft.halfEdges[/** @type {string} */ (heId)];
  if (!shellFaces.includes(he.faceId)) return refuse('INVALID_PAYLOAD', [he.id], 'eave not on the building body');
  if (!(z > body.baseZ)) return refuse('INVALID_GEOMETRY', [body.footprintId, he.id], 'eave at or below the base (D-214) [A]');
  const found = findOverhang(draft, he.id);
  if (!found.ok) return found;
  const roof = he.faceId;
  const fixed = hardConstrainedFaces(draft);
  const b = builders(draft);
  // an existing overhang is taken off first (its eave vertices are not derivable while it is there), the slope
  // solved, then the overhang rebuilt at the same width in plan with the same ids (D-3D19-3)
  const slots = found.found ? removeOverhang(draft, he.id, found.found, ctx.tol.numericEpsilon) : undefined;
  const ends = [he.startVertexId, draft.halfEdges[/** @type {string} */ (he.twinId)].startVertexId];
  const op = {
    movableFaceIds: fixed.has(roof) ? [] : [roof],
    conditions: ends.map((v) => b.vertexZ({ id: v, kind: 'EQUAL_Z' }, v, z, ctx.tol.zAlignTolM)),
    targetVertexIds: ends,
  };
  // D-3D19-3: the other vertices of the slope (ridge) stay; solved here so that this is checked on the solved planes
  // (the solver alone can satisfy both targets by turning the slope towards vertical - bug row 3D-19.5)
  const others = verticesOf(draft, [roof]).filter((v) => !ends.includes(v));
  const before = others.map((v) => [...draft.vertices[v].p]);
  const solved = constraintStep(draft, op, ctx.tol);
  if (!solved.ok) return solved;
  const moved = others.filter((v, i) => Math.hypot(...draft.vertices[v].p.map((/** @type {number} */ c, /** @type {number} */ k) => c - before[i][k])) > ctx.tol.planarTolM);
  if (moved.length > 0) return refuse('CONSTRAINT_CONFLICT', [roof, ...moved], 'the other vertices of the slope (ridge) cannot stay (D-3D19-3)');
  if (slots && found.found) {
    const again = addOverhang(draft, he.id, found.found.width, ctx, slots);
    if (!again.ok) return again;
  }
  return { ok: true, warnings: solved.warnings };
}

/** Distinct vertex ids of faces, sorted. @param {any} draft @param {string[]} faceIds */
function verticesOf(draft, faceIds) {
  const set = new Set(faceIds);
  return [...new Set(Object.values(draft.halfEdges).filter((h) => set.has(h.faceId)).map((h) => h.startVertexId))].sort();
}
