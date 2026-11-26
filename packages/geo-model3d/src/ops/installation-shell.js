// ops (3D-20): the closed body of an installation (spec §10.11 r1 "installation shell", r3, r4): the vertical prism over
// a convex or simple plan outline, cut below by the roof face plane (face-half-space) and above by the lower envelope
// of one or two top planes (plane-plane: a GABLE ridge is where the two top planes meet). Own planar Boolean of the K-12
// P0 scope, no library (D-109, 3D-ADR-0004 B1). The roof face itself is not cut (D-260).
// Faces: base (ClosureSurface, D-261, in the roof plane, normal down), one WallSurface per outline edge, one RoofSurface
// per used top plane; installation roof faces join no roof component (as D-227 for new roof faces). Plane terms (D-08):
// every face gets its plane and every vertex is derived from the faces it lies on (`rederive`).
import { rederive } from '../brep/index.js';
import { zAt, equalHeightOnSegment } from './geom2.js';
import { writeFaces, assignRoles } from './topology.js';

/** @typedef {import('./geom2.js').P2} P2 */
/** @typedef {[number, number, number]} P3 */
/** @typedef {import('../brep/plane.js').Plane} Plane */
/** @typedef {import('../brep/types.js').BuildingModel} BuildingModel */
/** @typedef {import('./topology.js').NewFace} NewFace */
/** @typedef {{ numericEpsilon: number, topologySnapTolM: number, planarTolM: number, zAlignTolM: number }} ShellTol */

/**
 * @typedef {object} InstallationSpec
 * @property {P2[]} ring plan outline, counter-clockwise
 * @property {Plane} roof roof face plane, normal up
 * @property {Plane[]} tops one or two non-vertical top planes, normals up; the top is their lower envelope
 * @property {string} ownerId parent semantic node (Building / BuildingPart)
 */

/** @param {Plane} pl @param {P2} p */
const h = (pl, p) => /** @type {number} */ (zAt(pl, p[0], p[1], 0));

/**
 * Add the installation body (semantic node, solid, shell, faces, half-edges, vertices) to the draft.
 * @param {BuildingModel} draft mutated
 * @param {InstallationSpec} spec @param {(kind: string) => string} ids @param {ShellTol} tol
 * @returns {{ ok: true, nodeId: string, faceIds: string[] } | { ok: false, reason: string }}
 */
export function buildInstallation(draft, spec, ids, tol) {
  const { ring, roof, tops } = spec;
  const n = ring.length;
  const topAt = (/** @type {P2} */ p) => Math.min(...tops.map((t) => h(t, p)));
  // label of each corner: index of the top plane that is lowest there, or -1 on the ridge (both planes)
  const label = ring.map((p) => {
    if (tops.length === 1) return 0;
    const d = h(tops[0], p) - h(tops[1], p);
    return Math.abs(d) <= tol.numericEpsilon ? -1 : d < 0 ? 0 : 1;
  });
  /** @type {(P2 | null)[]} ridge point on edge i (between corner i and i + 1) */
  const ridge = ring.map(() => null);
  for (let i = 0; i < n && tops.length === 2; i++) {
    const j = (i + 1) % n;
    if (label[i] < 0 || label[j] < 0 || label[i] === label[j]) continue;
    const m = equalHeightOnSegment(tops[0], tops[1], ring[i], ring[j]);
    if (!m) return { ok: false, reason: 'ridge crossing not found' };
    const len = Math.hypot(ring[j][0] - ring[i][0], ring[j][1] - ring[i][1]);
    if (m.t * len <= tol.topologySnapTolM) label[i] = -1;
    else if ((1 - m.t) * len <= tol.topologySnapTolM) label[j] = -1;
    else ridge[i] = m.p;
  }

  /** @type {Map<string, P3>} */
  const pos = new Map();
  const vtx = (/** @type {P3} */ p) => { const id = ids('vertex'); pos.set(id, p); return id; };
  const base = ring.map((p) => vtx([p[0], p[1], h(roof, p)]));
  const top = ring.map((p) => vtx([p[0], p[1], topAt(p)]));
  const ridgeIds = ridge.map((p) => (p ? vtx([p[0], p[1], h(tops[0], p)]) : null));

  /** @type {NewFace[]} */
  const faces = [];
  faces.push({
    id: ids('face'), plane: { normal: [-roof.normal[0], -roof.normal[1], -roof.normal[2]], d: -roof.d },
    surfaceKind: 'ClosureSurface', loops: [base.slice().reverse()],
  });
  for (let i = 0; i < n; i++) {
    const j = (i + 1) % n;
    const dx = ring[j][0] - ring[i][0], dy = ring[j][1] - ring[i][1], l = Math.hypot(dx, dy);
    /** @type {P3} */
    const normal = [dy / l, -dx / l, 0];
    const r = ridgeIds[i];
    faces.push({
      id: ids('face'), plane: { normal, d: -(normal[0] * ring[i][0] + normal[1] * ring[i][1]) }, surfaceKind: 'WallSurface',
      loops: [[base[i], base[j], top[j], ...(r ? [r] : []), top[i]]],
    });
  }
  // top boundary, counter-clockwise: corners with their label, ridge points on both planes
  /** @type {{ id: string, label: number }[]} */
  const boundary = [];
  for (let i = 0; i < n; i++) {
    boundary.push({ id: top[i], label: label[i] });
    const r = ridgeIds[i];
    if (r) boundary.push({ id: r, label: -1 });
  }
  tops.forEach((plane, k) => {
    const loop = boundary.filter((b) => b.label === k || b.label === -1).map((b) => b.id);
    if (loop.length >= 3) faces.push({ id: ids('face'), plane, surfaceKind: 'RoofSurface', loops: [loop] });
  });

  /** @type {Map<string, string[]>} */
  const incident = new Map();
  for (const f of faces) for (const v of f.loops[0]) incident.set(v, [...(incident.get(v) ?? []), f.id]);
  for (const [id, p] of pos) {
    draft.vertices[id] = { id, p, definingFaceIds: incident.get(id) ?? [], positionMode: 'EXPLICIT' };
  }
  const { halfEdgeIds, unpaired } = writeFaces(draft, faces, new Map(), ids);
  if (unpaired.length > 0) return { ok: false, reason: 'installation shell is not closed' };
  const faceIds = faces.map((f) => f.id);
  rederive(draft, faceIds, tol);
  assignRoles(draft, halfEdgeIds, tol.zAlignTolM);

  const shellId = ids('shell'), solidId = ids('solid'), nodeId = ids('installation');
  draft.shells[shellId] = { id: shellId, faceIds, intendedRole: 'OUTER', isClosed: true };
  draft.solids[solidId] = { id: solidId, outerShellId: shellId, voidShellIds: [] };
  draft.semantics[nodeId] = { id: nodeId, kind: 'BuildingInstallation', parentId: spec.ownerId, solidIds: [solidId], attributes: {} };
  return { ok: true, nodeId, faceIds };
}
