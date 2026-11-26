// ops (3D-20): REMOVE_INSTALLATION (spec §10.11 r5; v0.2 §13.5; v0.3 §6 E-12): delete a BuildingInstallation and every
// entity of its body (and of its child nodes): semantic nodes, solids, shells, faces, half-edges, the vertices no
// other half-edge uses; its faces leave their roof components (an emptied component is deleted, as D-227). The roof
// face under it is not cut by ADD_* (D-260), so it stands as before. Unknown id or another kind -> INVALID_PAYLOAD
// (D-259); hard constraints on removed entities -> CONSTRAINT_CONFLICT by the pipeline's constraint step (D-213).
import { refuse } from './errors.js';

/**
 * @param {import('../brep/types.js').BuildingModel} draft
 * @param {any} payload contract `command-payload-remove-installation`
 * @returns {import('./pipeline.js').OpResult}
 */
export function removeInstallation(draft, payload) {
  const id = payload?.installationId;
  if (typeof id !== 'string') return refuse('INVALID_PAYLOAD', [], 'installationId');
  const node = draft.semantics[id];
  if (!node) return refuse('INVALID_PAYLOAD', [id], 'unknown installationId (D-259)');
  if (node.kind !== 'BuildingInstallation') return refuse('INVALID_PAYLOAD', [id], 'not a BuildingInstallation (D-259)');

  const nodes = new Set([id]);
  for (let grew = true; grew;) {
    grew = false;
    for (const s of Object.values(draft.semantics)) if (s.parentId && nodes.has(s.parentId) && !nodes.has(s.id)) { nodes.add(s.id); grew = true; }
  }
  const solids = new Set([...nodes].flatMap((n) => draft.semantics[n].solidIds));
  const shells = new Set([...solids].flatMap((s) => [draft.solids[s].outerShellId, ...draft.solids[s].voidShellIds]));
  const faces = new Set([...shells].flatMap((s) => draft.shells[s].faceIds));
  const halfEdges = new Set(Object.values(draft.halfEdges).filter((h) => faces.has(h.faceId)).map((h) => h.id));
  const usedElsewhere = new Set(Object.values(draft.halfEdges).filter((h) => !halfEdges.has(h.id)).map((h) => h.startVertexId));
  const vertices = new Set([...halfEdges].map((h) => draft.halfEdges[h].startVertexId).filter((v) => !usedElsewhere.has(v)));

  for (const h of Object.values(draft.halfEdges)) if (h.twinId && halfEdges.has(h.twinId) && !halfEdges.has(h.id)) h.twinId = null;
  /** @type {Set<string>} */
  const removed = new Set();
  for (const rc of Object.values(draft.roofComponents)) {
    if (!rc.faceIds.some((f) => faces.has(f))) continue;
    rc.faceIds = rc.faceIds.filter((f) => !faces.has(f));
    if (rc.faceIds.length === 0) { delete draft.roofComponents[rc.id]; removed.add(rc.id); }
  }
  /** @type {[Record<string, any>, Set<string>][]} */
  const groups = [[draft.semantics, nodes], [draft.solids, solids], [draft.shells, shells], [draft.faces, faces],
    [draft.halfEdges, halfEdges], [draft.vertices, vertices]];
  for (const [coll, ids] of groups) for (const k of ids) { delete coll[k]; removed.add(k); }
  return { ok: true, removed };
}
