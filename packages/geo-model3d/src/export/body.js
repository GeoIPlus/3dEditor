// export (3D-11): the LoD 2.x geometry of one body (Building, BuildingPart or BuildingInstallation) from the model.
// Type and LoD label stay those of the file (spec §7 rule 3, D-91). When every surface is reused in file order the
// geometry is written verbatim (D-190): `semantics`, `material`, `texture` unchanged. Otherwise boundaries and the
// per-surface members are rebuilt in model order: solids (`solidIds`), shells (outer, voids), faces (`faceIds`).
import { atPath, surfaceDepth, surfacePath, surfacePaths } from './geometry.js';
import { CITYJSON_KINDS, faceRings, fileSurfaceType, kindUnchanged, surfaceMatches } from './rings.js';
import { ExportError } from './errors.js';

/** @typedef {import('../brep/types.js').BuildingModel} BuildingModel */
/** @typedef {import('./rings.js').VertexInfo} VertexInfo */
/**
 * @typedef {object} Item one surface of the output
 * @property {string} faceId
 * @property {number[] | null} path original surface path when the face reuses it
 * @property {any[]} rings boundaries of the surface (file indices; changed vertices as tokens, see `index.js`)
 * @property {string} kind face `surfaceKind`
 * @property {boolean} inferred face tagged SEMANTICS_INFERRED
 */

/**
 * Surfaces of a body in model nesting: solids -> shells -> items.
 * @param {BuildingModel} model @param {any} sem body semantic entry @param {any} g original geometry
 * @param {number} gi @param {Map<string, VertexInfo>} info @param {(vertexId: string) => number} indexOf
 * @returns {Item[][][]}
 */
function items(model, sem, g, gi, info, indexOf) {
  return (sem.solidIds ?? []).map((/** @type {string} */ sid) => {
    const so = model.solids[sid];
    if (!so) throw new ExportError('INVALID_PAYLOAD', `solid ${sid} not in the model`);
    return [so.outerShellId, ...so.voidShellIds].map((hid) => {
      const sh = model.shells[hid];
      if (!sh) throw new ExportError('INVALID_PAYLOAD', `shell ${hid} not in the model`);
      return sh.faceIds.map((fid) => {
        const face = model.faces[fid];
        if (!face) throw new ExportError('INVALID_PAYLOAD', `face ${fid} not in the model`);
        const rings = faceRings(model, face);
        const p = surfacePath(face.sourceRef, sem.sourceRef, gi);
        const surface = p === null ? undefined : atPath(g.boundaries, p);
        const reuse = p !== null && surfaceMatches(rings, surface, info) && kindUnchanged(face, fileSurfaceType(g, p, atPath));
        return {
          faceId: fid, path: reuse ? p : null, kind: face.surfaceKind, inferred: face.tags.includes('SEMANTICS_INFERRED'),
          rings: reuse ? structuredClone(surface) : rings.map((r) => r.map(indexOf)),
        };
      });
    });
  });
}

/**
 * Nest per-surface values as the geometry type requires.
 * @param {string} type @param {Item[][][]} solids @param {(it: Item) => any} f @param {string} objectId
 */
function shape(type, solids, f, objectId) {
  const depth = surfaceDepth(type);
  if (depth === 3) return solids.map((sh) => sh.map((its) => its.map(f)));
  if (solids.length !== 1) throw new ExportError('INVALID_PAYLOAD', `${objectId}: ${type} needs one solid, model has ${solids.length}`);
  if (depth === 2) return solids[0].map((its) => its.map(f));
  // TBD: a surface geometry with void shells has no CityJSON form; import makes one shell (spec §6 rule 1)
  if (solids[0].length !== 1) throw new ExportError('INVALID_PAYLOAD', `${objectId}: ${type} needs one shell`);
  return solids[0][0].map(f);
}

/** Position of an item in the file nesting of `type`. @param {string} type @param {number[]} at solid, shell, face */
const positionPath = (type, [s, h, f]) => {
  const d = surfaceDepth(type);
  return d === 3 ? [s, h, f] : d === 2 ? [h, f] : [f];
};

/**
 * @param {string} type @param {Item[][][]} solids @param {any} g
 * @returns {boolean} every file surface reused, each at its own position
 */
function isVerbatim(type, solids, g) {
  const want = surfacePaths(g).map((p) => p.join('/'));
  /** @type {string[]} */
  const got = [];
  let same = true;
  solids.forEach((sh, s) => sh.forEach((its, h) => its.forEach((it, f) => {
    const pos = positionPath(type, [s, h, f]).join('/');
    if (!it.path || it.path.join('/') !== pos) same = false;
    got.push(pos);
  })));
  if (surfaceDepth(type) === 1 && (solids.length !== 1 || solids[0].length !== 1)) return false;
  if (surfaceDepth(type) === 2 && solids.length !== 1) return false;
  return same && got.length === want.length && got.every((p, i) => p === want[i]);
}

/**
 * Semantic surfaces and values. Reused surface: its file object (`parent` / `children` dropped [A]: their indices
 * point into the old list); file value null stays null. Regenerated: `{ type: surfaceKind }`, one entry per kind;
 * `Unclassified` and inferred kinds are written as null [A] (the file gave no type; inference is internal, spec §6 r7).
 * @param {any} g @param {string} type @param {Item[][][]} solids @param {string} objectId
 */
function semantics(g, type, solids, objectId) {
  /** @type {any[]} */
  const surfaces = [];
  /** @type {Map<string, number>} */
  const slot = new Map();
  /** @param {string} key @param {() => any} make */
  const put = (key, make) => {
    if (!slot.has(key)) { slot.set(key, surfaces.length); surfaces.push(make()); }
    return /** @type {number} */ (slot.get(key));
  };
  const values = shape(type, solids, (it) => {
    if (it.path) {
      const v = atPath(g.semantics?.values, it.path);
      if (!Number.isInteger(v) || !g.semantics?.surfaces?.[v]) return null;
      return put(`file:${v}`, () => {
        const { parent: _p, children: _c, ...rest } = structuredClone(g.semantics.surfaces[v]);
        return rest;
      });
    }
    if (it.inferred || !CITYJSON_KINDS.has(it.kind)) return null;
    return put(`kind:${it.kind}`, () => ({ type: it.kind }));
  }, objectId);
  return surfaces.length > 0 || g.semantics ? { surfaces, values } : undefined;
}

/**
 * `material` / `texture` themes: a reused surface keeps its file entry; a regenerated one has none (null; texture
 * `[null]` per ring) [A]. A theme given by a single `value` is kept as is.
 * @param {any} themes @param {string} type @param {Item[][][]} solids @param {string} objectId @param {boolean} rings
 */
function perSurface(themes, type, solids, objectId, rings) {
  if (!themes || typeof themes !== 'object') return themes;
  return Object.fromEntries(Object.entries(themes).map(([name, th]) => {
    if (!th || typeof th !== 'object' || !('values' in th)) return [name, structuredClone(th)];
    const values = shape(type, solids, (it) => {
      const v = it.path ? atPath(th.values, it.path) : undefined;
      if (v !== undefined) return structuredClone(v);
      return rings ? it.rings.map(() => [null]) : null;
    }, objectId);
    return [name, { ...structuredClone(th), values }];
  }));
}

/**
 * @param {BuildingModel} model @param {any} sem body semantic entry (`sourceRef` = CityObject id)
 * @param {any} g original geometry (index `gi` of the object) @param {number} gi
 * @param {Map<string, VertexInfo>} info @param {(vertexId: string) => number} indexOf index or token of a vertex
 * @returns {{ geometry: any, verbatim: boolean, faceIds: string[] }}
 */
export function bodyGeometry(model, sem, g, gi, info, indexOf) {
  const solids = items(model, sem, g, gi, info, indexOf);
  const faceIds = solids.flat(2).map((it) => it.faceId);
  if (isVerbatim(g.type, solids, g)) return { geometry: structuredClone(g), verbatim: true, faceIds };
  const geometry = { ...structuredClone(g), boundaries: shape(g.type, solids, (it) => it.rings, sem.sourceRef) };
  const sm = semantics(g, g.type, solids, sem.sourceRef);
  if (sm) geometry.semantics = sm; else delete geometry.semantics;
  if ('material' in g) geometry.material = perSurface(g.material, g.type, solids, sem.sourceRef, false);
  if ('texture' in g) geometry.texture = perSurface(g.texture, g.type, solids, sem.sourceRef, true);
  return { geometry, verbatim: false, faceIds };
}
