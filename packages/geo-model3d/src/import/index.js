// `import` module of geo-model3d (3D-10; spec §6, I-01): one CityJSON Building with its BuildingPart and
// BuildingInstallation children -> canonical model (version 0), immutable baseline, import report. Pure: the document
// is read, never written (export, 3D-11, writes opaque members from it, spec §6 rule 12). Module DAG: brep, crs only.
import { isolatedCopy } from '../brep/index.js';
import { readBodies } from './cityjson.js';
import { importVertices } from './vertices.js';
import { rawFaces } from './faces.js';
import { mergeCoplanar } from './coplanar.js';
import { buildTopology } from './halfedges.js';
import { assignRoles } from './roles.js';
import { deriveFootprints } from './footprint.js';
import { assessImport } from './state.js';
import { counterIds } from './ids.js';
import { ImportError } from './errors.js';
import { SEMANTICS_INFERRED } from './semantics.js';

export { ImportError } from './errors.js';
export { counterIds } from './ids.js';

/** @typedef {import('../brep/types.js').BuildingModel} BuildingModel */

/** Faces per building above which import warns (spec §6 rule 15, D-94). */
export const FACE_LIMIT = 500;

/**
 * @typedef {object} ImportInput
 * @property {any} document parsed CityJSON document (the service reads the bytes)
 * @property {string} cityObjectId the Building's CityObject id
 * @property {Record<string, any>} toleranceProfile contract `tolerance-profile`
 * @property {string} projectId
 * @property {string} [buildingId] model `buildingId`; default the CityObject id [A] (mapping: Q-32)
 * @property {string} [toleranceProfileId] default `toleranceProfile.id`
 * @property {string} [originalSourceRef]
 * @property {(kind: string) => string} [ids] entity id source (Q-26); default `counterIds()`
 */

/**
 * @param {ImportInput} input
 * @returns {{ model: BuildingModel, baseline: BuildingModel, report: Record<string, any> }}
 */
export function importCityObject(input) {
  const tol = input.toleranceProfile;
  const toleranceProfileId = input.toleranceProfileId ?? tol?.id;
  if (typeof toleranceProfileId !== 'string' || toleranceProfileId === '') throw new ImportError('INVALID_PAYLOAD', 'no tolerance profile id');
  const ids = input.ids ?? counterIds();
  const bodies = readBodies(input.document, input.cityObjectId);
  const used = new Set(bodies.flatMap((b) => b.solids.flatMap((s) => s.shells.flatMap((h) => h.surfaces.flatMap((f) => f.rings.flat())))));
  const iv = importVertices(input.document, used, tol.topologySnapTolM);
  const { faces: raw, dropped } = rawFaces(bodies, iv.repOf, iv.local);
  const merged = mergeCoplanar(raw, iv.local, tol);
  const topo = buildTopology(merged, iv.local, iv.members, ids, tol.planarTolM);

  /** @type {BuildingModel} */
  const model = {
    schemaVersion: '1', projectId: input.projectId, buildingId: input.buildingId ?? input.cityObjectId, version: 0,
    state: 'DRAFT_SOLID', frame: iv.frame, footprints: {}, constructionEntities: {}, vertices: topo.vertices,
    halfEdges: topo.halfEdges, faces: topo.faces, shells: {}, solids: {}, roofComponents: {}, constraints: {},
    measurements: {}, semantics: {}, toleranceProfileId,
    ...(input.originalSourceRef ? { originalSourceRef: input.originalSourceRef } : {}),
  };
  assignRoles(model, topo.edges, tol.zAlignTolM);

  // semantics, solids and shells per body (spec §6 rule 13); faces grouped by their input shell
  const semOf = bodies.map(() => ids('semantic'));
  /** @type {Map<string, string>} body/solid/shell -> shell id */
  const shellId = new Map();
  /** @type {Map<string, string | undefined>} */
  const partOfFace = new Map();
  /** @type {Map<number, string[]>} body -> roof faces */
  const roofOf = new Map();
  bodies.forEach((b, bi) => {
    const solidIds = b.solids.map((so, si) => {
      const shellIds = so.shells.map((_, hi) => {
        const id = ids('shell');
        shellId.set(`${bi}/${si}/${hi}`, id);
        model.shells[id] = { id, faceIds: [], intendedRole: hi === 0 ? 'OUTER' : 'VOID', isClosed: false };
        return id;
      });
      const id = ids('solid');
      model.solids[id] = { id, outerShellId: shellIds[0], voidShellIds: shellIds.slice(1) };
      return id;
    });
    const parent = b.parentObjectId === null ? -1 : bodies.findIndex((x) => x.objectId === b.parentObjectId);
    model.semantics[semOf[bi]] = {
      id: semOf[bi], kind: b.objectType, ...(parent >= 0 ? { parentId: semOf[parent] } : {}), solidIds,
      attributes: b.attributes, sourceRef: b.objectId,
    };
  });
  /** @param {number} bi @returns {number} nearest Building / BuildingPart body (a roof component's owner) */
  const ownerBody = (bi) => {
    let k = bi;
    while (bodies[k].objectType === 'BuildingInstallation' && bodies[k].parentObjectId !== null) {
      k = bodies.findIndex((x) => x.objectId === bodies[k].parentObjectId);
    }
    return k;
  };
  merged.forEach((f, k) => {
    const fid = topo.faceIds[k];
    model.shells[/** @type {string} */ (shellId.get(`${f.body}/${f.solid}/${f.shell}`))].faceIds.push(fid);
    partOfFace.set(fid, bodies[f.body].objectType === 'BuildingPart' ? semOf[f.body] : undefined);
    if (f.surfaceKind === 'RoofSurface') {
      const o = ownerBody(f.body);
      roofOf.set(o, [...(roofOf.get(o) ?? []), fid]);
    }
  });
  for (const [bi, faceIds] of [...roofOf].sort((x, y) => x[0] - y[0])) {
    const id = ids('roofComponent');
    model.roofComponents[id] = { id, ownerId: semOf[bi], faceIds };
    for (const f of faceIds) model.faces[f].roofComponentId = id;
  }
  model.footprints = deriveFootprints(model, partOfFace, ids);

  const { state, issues, openEdges } = assessImport(model, topo.edges, tol);
  model.state = state;
  const openFaces = new Set([...openEdges].map((e) => model.halfEdges[e.halfEdgeIds[0]].faceId));
  for (const sh of Object.values(model.shells)) sh.isClosed = sh.faceIds.length > 0 && !sh.faceIds.some((f) => openFaces.has(f));

  const faceList = Object.values(model.faces);
  const warnings = dropped.map((ref) => `model3d.import.droppedSurface:${ref}`);
  if (faceList.length > FACE_LIMIT) warnings.push(`model3d.import.faceLimitExceeded:${faceList.length}>${FACE_LIMIT}`);
  const report = {
    buildingId: model.buildingId, modelVersion: model.version, assignedState: state, issues,
    mergedFaces: Object.fromEntries(merged.flatMap((f, k) => (f.refs.length > 1 ? [[topo.faceIds[k], [...f.refs]]] : []))),
    inferredSemanticsFaceIds: faceList.filter((f) => f.tags.includes(SEMANTICS_INFERRED)).map((f) => f.id),
    nonPlanarFaceIds: faceList.filter((f) => f.tags.includes('NON_PLANAR_FACE')).map((f) => f.id),
    faceCount: faceList.length, warnings,
  };
  return { model, baseline: isolatedCopy(model), report };
}
