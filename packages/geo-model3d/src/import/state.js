// import (3D-10): interim issues and state of an imported model (spec §6 rule 10) [D] (D-157). The module DAG lets
// `import` use only `brep` and `crs`, and validation (3D-12) is not merged; this file computes only the codes import
// needs and is removed once `importBuilding` takes the state from `validateModel` (D-157).
// Codes: an edge shorter than `minEdgeLengthM` -> DEGENERATE_EDGE (also when it has one face: D-156, Q-41);
// otherwise 3+ half-edges -> NON_MANIFOLD_EDGE, one face (or two uses in the same direction) -> OPEN_BOUNDARY;
// a face tagged NON_PLANAR_FACE -> NON_PLANAR_FACE. No issue -> VALID_SOLID, any issue -> DRAFT_SOLID (each of these
// codes is an ERROR for VALID_SOLID, contract validation-report). Severity is that of the assigned state (D-77 table).
import { distance } from '../brep/index.js';

/** @typedef {import('../brep/types.js').BuildingModel} BuildingModel */
/** @typedef {import('./halfedges.js').ImportEdge} ImportEdge */

export const NON_PLANAR_FACE = 'NON_PLANAR_FACE';

/** Severity in DRAFT_SOLID (contract validation-report `SeverityInDraftSolid`); every one is ERROR in VALID_SOLID. */
const DRAFT_SEVERITY = /** @type {Record<string, 'WARNING' | 'ERROR'>} */ ({
  OPEN_BOUNDARY: 'WARNING', NON_MANIFOLD_EDGE: 'WARNING', NON_PLANAR_FACE: 'WARNING', DEGENERATE_EDGE: 'ERROR',
});
const SCOPE = /** @type {Record<string, string>} */ ({
  OPEN_BOUNDARY: 'TOPOLOGY', NON_MANIFOLD_EDGE: 'TOPOLOGY', NON_PLANAR_FACE: 'GEOMETRY', DEGENERATE_EDGE: 'GEOMETRY',
});
/** Localisation keys (D-91: error texts as keys) [A: key names]. */
const MESSAGE = /** @type {Record<string, string>} */ ({
  OPEN_BOUNDARY: 'model3d.issue.openBoundary', NON_MANIFOLD_EDGE: 'model3d.issue.nonManifoldEdge',
  NON_PLANAR_FACE: 'model3d.issue.nonPlanarFace', DEGENERATE_EDGE: 'model3d.issue.degenerateEdge',
});

/**
 * @typedef {object} ValidationIssue contract validation-report `ValidationIssue`
 * @property {string} code @property {string} scope @property {'INFO' | 'WARNING' | 'ERROR'} severity
 * @property {string[]} entityIds @property {[number, number, number]} [location] @property {string} message
 */

/**
 * @param {BuildingModel} m
 * @param {ImportEdge[]} edges
 * @param {{ minEdgeLengthM: number }} tol
 * @returns {{ state: 'VALID_SOLID' | 'DRAFT_SOLID', issues: ValidationIssue[], openEdges: Set<ImportEdge> }}
 *   `openEdges`: edges that keep a shell from being closed (one face, unpaired or non-manifold)
 */
export function assessImport(m, edges, tol) {
  /** @type {{ code: string, entityIds: string[], location?: [number, number, number] }[]} */
  const found = [];
  const openEdges = new Set();
  for (const e of edges) {
    const a = m.vertices[e.vertexIds[0]].p, b = m.vertices[e.vertexIds[1]].p;
    const location = /** @type {[number, number, number]} */ ([(a[0] + b[0]) / 2, (a[1] + b[1]) / 2, (a[2] + b[2]) / 2]);
    const open = e.nonManifold || m.halfEdges[e.halfEdgeIds[0]].twinId === null;
    if (open) openEdges.add(e);
    const entityIds = [...e.halfEdgeIds].sort();
    if (distance(a, b) < tol.minEdgeLengthM) found.push({ code: 'DEGENERATE_EDGE', entityIds, location });
    else if (e.nonManifold) found.push({ code: 'NON_MANIFOLD_EDGE', entityIds, location });
    else if (open) found.push({ code: 'OPEN_BOUNDARY', entityIds, location });
  }
  for (const f of Object.values(m.faces)) if (f.tags.includes(NON_PLANAR_FACE)) found.push({ code: NON_PLANAR_FACE, entityIds: [f.id] });
  const state = found.length === 0 && openEdges.size === 0 ? 'VALID_SOLID' : 'DRAFT_SOLID';
  found.sort((x, y) => (x.code < y.code ? -1 : x.code > y.code ? 1 : x.entityIds[0] < y.entityIds[0] ? -1 : x.entityIds[0] > y.entityIds[0] ? 1 : 0));
  const issues = found.map(({ code, entityIds, location }) => ({
    code, scope: SCOPE[code], severity: state === 'VALID_SOLID' ? /** @type {const} */ ('ERROR') : DRAFT_SEVERITY[code],
    entityIds, ...(location ? { location } : {}), message: MESSAGE[code],
  }));
  return { state, issues, openEdges };
}
