// Polyhedron -> canonical `BuildingModel` (contracts/model3d/building-model.schema.json, spec §4) for the fixtures.
// Ids are readable strings [P] (format open, Q-26). Edge roles follow spec §6 rule 8 for the convex synthetic shapes.

/** @typedef {import('./geom.mjs').Poly} Poly */
/** @typedef {import('./geom.mjs').P3} P3 */
/** @typedef {import('./geom.mjs').Plane} Plane */

export const PROJECT_ID = 'prj-golden';
export const TOLERANCE_PROFILE_ID = 'tp-default';
/** [P] Any projected CRS; ETRS89 / UTM 32N matches the northings of order 6 000 000 m of GT-25. */
export const CRS = 'EPSG:25832';

const r12 = (/** @type {number} */ x) => { const v = Math.round(x * 1e12) / 1e12; return v === 0 ? 0 : v; };

/** Newell normal of a ring, unit length, plane through its first vertex. @param {P3[]} pts @returns {Plane} */
export function newellPlane(pts) {
  let nx = 0; let ny = 0; let nz = 0;
  for (let i = 0; i < pts.length; i++) {
    const a = pts[i]; const b = pts[(i + 1) % pts.length];
    nx += (a[1] - b[1]) * (a[2] + b[2]);
    ny += (a[2] - b[2]) * (a[0] + b[0]);
    nz += (a[0] - b[0]) * (a[1] + b[1]);
  }
  const len = Math.sqrt(nx * nx + ny * ny + nz * nz);
  /** @type {P3} */
  const n = [nx / len, ny / len, nz / len];
  return { normal: n, d: -(n[0] * pts[0][0] + n[1] * pts[0][1] + n[2] * pts[0][2]) };
}

/** Undirected edge key. */
export const edgeKey = (/** @type {string} */ a, /** @type {string} */ b) => (a < b ? `${a}~${b}` : `${b}~${a}`);

/**
 * Edge role from the two adjacent faces (spec §6 rule 8), for the convex shapes of geom.mjs.
 * @param {Poly} poly @param {string} a @param {string} b @param {import('./geom.mjs').PolyFace[]} fs faces on the edge
 */
function role(poly, a, b, fs) {
  if (fs.length !== 2) return 'BOUNDARY';
  const horizontal = poly.vertices[a][2] === poly.vertices[b][2];
  const roofs = fs.filter((f) => f.kind === 'RoofSurface').length;
  const walls = fs.filter((f) => f.kind === 'WallSurface').length;
  if (roofs === 2) return horizontal ? 'RIDGE' : 'HIP';
  if (roofs === 1 && walls === 1) return horizontal ? 'EAVE' : 'RAKE';
  return 'GENERIC';
}

/**
 * @typedef {object} ModelOptions
 * @property {string} buildingId
 * @property {number} [version] default 1 [P]
 * @property {'DRAFT_SOLID' | 'VALID_SOLID'} [state] default: VALID_SOLID when every edge has two faces
 * @property {boolean} [imported] vertices EXPLICIT at file position (D-70), `sourceRef` on faces and vertices
 * @property {string} [cityObjectId] for `sourceRef`
 * @property {P3} [originWorld] default [0, 0, 0]
 * @property {string} [originalSourceRef]
 * @property {any[]} [constraints]
 */

/** @param {Poly} poly @param {ModelOptions} o */
export function toModel(poly, o) {
  const vids = Object.keys(poly.vertices);
  /** @type {Map<string, import('./geom.mjs').PolyFace[]>} */
  const byEdge = new Map();
  /** @type {Map<string, string>} directed "a>b" -> half-edge id */
  const directed = new Map();
  for (const f of poly.faces) {
    f.ring.forEach((a, i) => {
      const b = f.ring[(i + 1) % f.ring.length];
      const k = edgeKey(a, b);
      byEdge.set(k, [...(byEdge.get(k) ?? []), f]);
      directed.set(`${a}>${b}`, `he-${f.id}-${i}`);
    });
  }
  const closed = [...byEdge.values()].every((fs) => fs.length === 2);
  /** @type {Record<string, any>} */
  const halfEdges = {};
  /** @type {Record<string, any>} */
  const faces = {};
  poly.faces.forEach((f, fi) => {
    const n = f.ring.length;
    f.ring.forEach((a, i) => {
      const b = f.ring[(i + 1) % n];
      const id = `he-${f.id}-${i}`;
      halfEdges[id] = {
        id, startVertexId: `v-${a}`, nextId: `he-${f.id}-${(i + 1) % n}`, prevId: `he-${f.id}-${(i + n - 1) % n}`,
        faceId: f.id, twinId: directed.get(`${b}>${a}`) ?? null,
        edgeRole: role(poly, a, b, /** @type {any} */ (byEdge.get(edgeKey(a, b)))),
      };
    });
    const pl = f.plane ?? newellPlane(f.ring.map((v) => poly.vertices[v]));
    faces[f.id] = {
      id: f.id, outerLoopId: `he-${f.id}-0`, innerLoopIds: [],
      supportPlane: { normal: pl.normal.map(r12), d: r12(pl.d) }, surfaceKind: f.kind, tags: [],
      ...(f.kind === 'RoofSurface' ? { roofComponentId: 'rc-1' } : {}),
      ...(o.imported ? { sourceRef: `${o.cityObjectId}/geometry/0/boundaries/0/${fi}` } : {}),
    };
  });
  /** @type {Record<string, any>} */
  const vertices = {};
  vids.forEach((v, i) => {
    const incident = poly.faces.filter((f) => f.ring.includes(v)).map((f) => f.id);
    vertices[`v-${v}`] = {
      id: `v-${v}`, p: poly.vertices[v], definingFaceIds: incident,
      positionMode: o.imported || incident.length < 3 ? 'EXPLICIT' : 'DERIVED',
      ...(o.imported ? { sourceRef: String(i) } : {}),
    };
  });
  const ground = /** @type {import('./geom.mjs').PolyFace} */ (poly.faces.find((f) => f.kind === 'GroundSurface'));
  const roofIds = poly.faces.filter((f) => f.kind === 'RoofSurface').map((f) => f.id);
  const baseZ = poly.vertices[ground.ring[0]][2];
  /** @type {Record<string, any>} */
  const constraints = {};
  for (const c of o.constraints ?? []) constraints[c.id] = c;
  return {
    schemaVersion: '1', projectId: PROJECT_ID, buildingId: o.buildingId, version: o.version ?? 1,
    state: o.state ?? (closed ? 'VALID_SOLID' : 'DRAFT_SOLID'),
    frame: { horizontalCrs: CRS, verticalCrs: null, axisOrder: 'EAST_NORTH_UP', unit: 'm', originWorld: o.originWorld ?? [0, 0, 0], buildingAxisDeg: 0 },
    footprints: {
      'fp-1': {
        id: 'fp-1', outerRing: [...ground.ring].reverse().map((v) => [poly.vertices[v][0], poly.vertices[v][1]]), innerRings: [],
        baseElevationM: baseZ, sourceMeasurementIds: [], sourceKind: 'DERIVED_FROM_GROUND',
      },
    },
    constructionEntities: {}, vertices, halfEdges, faces,
    shells: { 'sh-1': { id: 'sh-1', faceIds: poly.faces.map((f) => f.id), intendedRole: 'OUTER', isClosed: closed } },
    solids: { 'so-1': { id: 'so-1', outerShellId: 'sh-1', voidShellIds: [] } },
    roofComponents: { 'rc-1': { id: 'rc-1', ownerId: 'sem-bld', faceIds: roofIds } },
    constraints, measurements: {},
    semantics: { 'sem-bld': { id: 'sem-bld', kind: 'Building', solidIds: ['so-1'], attributes: {}, ...(o.imported ? { sourceRef: o.cityObjectId } : {}) } },
    toleranceProfileId: TOLERANCE_PROFILE_ID,
    ...(o.originalSourceRef ? { originalSourceRef: o.originalSourceRef } : {}),
  };
}

/** Id of the half-edge of face `faceId` that starts at vertex `a` and ends at `b` (vertex keys of the polyhedron). */
export function halfEdgeId(/** @type {Poly} */ poly, /** @type {string} */ faceId, /** @type {string} */ a, /** @type {string} */ b) {
  const f = poly.faces.find((x) => x.id === faceId);
  const i = f ? f.ring.findIndex((v, k) => v === a && f.ring[(k + 1) % f.ring.length] === b) : -1;
  if (i < 0) throw new Error(`no half-edge ${a}>${b} on ${faceId}`);
  return `he-${faceId}-${i}`;
}
