// metrics (3D-116): is the total volume of the main body proven, and may it be published (D-3D116-2)? A fresh run of
// the kernel's own checks (validate `runChecks`, COMMIT_VALIDATION, whole model) is read for the body's entities; the
// stored `state` alone never gives FINAL (VOL-19).
//   - Codes that make the volume undefined: open, non-manifold, orientation, self-intersection, non-planar, junction,
//     overlap, CRS (`BLOCKING`). Any of them on the body -> NOT_AVAILABLE.
//   - DEGENERATE_FACE / DEGENERATE_EDGE: safe only when the face / edge is independently non-degenerate: every edge
//     longer than `numericEpsilon` and the face's width (area / longest edge) above `numericEpsilon` [D: D-3D116-2;
//     `numericEpsilon` is the profile's linear predicate tolerance in m, spec §2.3]. Otherwise NOT_AVAILABLE.
//   - Every other code (constraints, semantics, measurement, export) leaves the volume proven.
// FINAL: state VALID_SOLID / APPROVED and no issue on the body with severity ERROR in the VALID_SOLID column.
import { distance, endVertexId } from '../brep/index.js';
import { runChecks, severityOf } from '../validate/index.js';
import { area3d } from './area.js';

/** @typedef {import('./body.js').Body} Body */
/** @typedef {'FINAL' | 'PROVISIONAL' | 'NOT_AVAILABLE'} VolumeStatus */

const BLOCKING = new Set([
  'OPEN_BOUNDARY', 'SHELL_NOT_CLOSED', 'NON_MANIFOLD_EDGE', 'NON_MANIFOLD_VERTEX', 'SELF_INTERSECTION', 'SHELL_ORIENTATION',
  'INCONSISTENT_RING_ORIENTATION', 'INCONSISTENT_JUNCTION', 'NON_PLANAR_FACE', 'SOLID_OVERLAP', 'INVALID_CRS',
]);

/** Entity ids of the body: solids, shells, faces, their half-edges and vertices. @param {Body} body */
function bodyIds(body) {
  const ids = new Set([...body.solidIds, ...body.shellIds, ...body.faces]);
  for (const he of Object.values(body.model.halfEdges)) {
    if (body.faces.has(he.faceId)) { ids.add(he.id); ids.add(he.startVertexId); }
  }
  return ids;
}

/** @param {Body} body @param {string} heId @param {number} eps */
const edgeOk = (body, heId, eps) => {
  const m = body.model, he = m.halfEdges[heId];
  return !!he && distance(m.vertices[he.startVertexId].p, m.vertices[endVertexId(m, heId)].p) > eps;
};

/** A face that is not mathematically degenerate (see header). @param {Body} body @param {string} f @param {number} eps */
function faceOk(body, f, eps) {
  const rings = body.rings(f);
  if (!rings.length || rings[0].length < 3) return false;
  let longest = 0;
  for (const r of rings) for (let i = 0; i < r.length; i++) {
    const d = distance(r[i], r[(i + 1) % r.length]);
    if (!(d > eps)) return false;
    longest = Math.max(longest, d);
  }
  return area3d(body, f) / longest > eps;
}

/**
 * @param {Body} body @param {any} tolerances the tolerance profile
 * @returns {{ proven: boolean, final: boolean }}
 */
export function volumeProof(body, tolerances) {
  const m = body.model;
  if (m.state === 'DRAFT_SURFACE' || body.missing || body.sharedWithInstallation || !body.solidIds.length) return { proven: false, final: false };
  const eps = tolerances.numericEpsilon;
  const ids = bodyIds(body);
  const issues = runChecks(m, { mode: 'COMMIT_VALIDATION', tolerances }).filter((i) => i.entityIds.some((e) => ids.has(e)));
  for (const i of issues) {
    if (BLOCKING.has(i.code)) return { proven: false, final: false };
    if (i.code === 'DEGENERATE_FACE' && !i.entityIds.every((e) => !m.faces[e] || faceOk(body, e, eps))) return { proven: false, final: false };
    if (i.code === 'DEGENERATE_EDGE' && !i.entityIds.every((e) => !m.halfEdges[e] || edgeOk(body, e, eps))) return { proven: false, final: false };
  }
  const validState = m.state === 'VALID_SOLID' || m.state === 'APPROVED';
  return { proven: true, final: validState && issues.every((i) => severityOf(i.code, 'VALID_SOLID') !== 'ERROR') };
}
