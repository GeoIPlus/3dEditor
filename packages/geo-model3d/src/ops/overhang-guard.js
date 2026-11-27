// ops (3D-120, D-372, D-373): the last check of the pipeline for dependent overhangs. Since 3D-124 (D-384) the
// pipeline takes overhangs off before the operation and rebuilds them after the solve (dependents.js); this guard
// still refuses, atomically with the model unchanged, a command that leaves an overhang strip (RoofSurface +
// OVERHANG, D-336) off the plane of its parent roof face - the cases the rebuild does not cover (operations that
// rebuild by themselves, registry SELF_REBUILD). Only a strip that was coplanar with its parent in the input is checked.
import { signedDistance } from '../brep/index.js';
import { refuse } from './errors.js';

const OVERHANG = 'OVERHANG';

/**
 * Strip -> parent pairs: faces across a strip edge that are a RoofSurface without the OVERHANG tag.
 * @param {any} m @returns {[string, string][]}
 */
function pairs(m) {
  /** @type {[string, string][]} */
  const out = [];
  for (const h of Object.values(m.halfEdges)) {
    const s = m.faces[h.faceId];
    if (!s || s.surfaceKind !== 'RoofSurface' || !s.tags.includes(OVERHANG) || !h.twinId) continue;
    const p = m.faces[m.halfEdges[h.twinId]?.faceId];
    if (p && p.surfaceKind === 'RoofSurface' && !p.tags.includes(OVERHANG)) out.push([s.id, p.id]);
  }
  return out;
}

/**
 * Largest distance of the strip's vertices from the parent plane.
 * @param {any} m @param {string} strip @param {string} parent
 */
function offPlane(m, strip, parent) {
  const pl = m.faces[parent].supportPlane;
  let d = 0;
  for (const h of Object.values(m.halfEdges)) if (h.faceId === strip) d = Math.max(d, Math.abs(signedDistance(pl, m.vertices[h.startVertexId].p)));
  return d;
}

/**
 * @param {any} before input model (read only) @param {any} draft candidate after the constraint step
 * @param {{ planarTolM: number }} tol
 * @returns {null | { ok: false, refusal: any }}
 */
export function overhangGuard(before, draft, tol) {
  const now = pairs(draft);
  if (now.length === 0) return null;
  // keyed by strip: a split of the parent (INSERT_ROOF_BREAK) gives the strip a parent with a new id
  const was = new Set(pairs(before).filter(([s, p]) => offPlane(before, s, p) <= tol.planarTolM).map(([s]) => s));
  const broken = now.filter(([s, p]) => was.has(s) && offPlane(draft, s, p) > tol.planarTolM);
  if (broken.length === 0) return null;
  const ids = [...new Set(broken.flat())].sort();
  return refuse('INVALID_TOPOLOGY', ids, 'the roof plane changes but its overhang strip would stay on the old plane; not covered by the overhang rebuild (D-373)');
}
