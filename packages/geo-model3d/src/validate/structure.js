// validate (3D-12): topological checks (spec §8 rule 2; v0.2 §16.2): c(e) = 2 is necessary, not sufficient - open
// boundaries, non-manifold edges and vertices, shell closure and connectivity, and the mapping of the structural problems
// `brep.checkTopology` reports (internal kinds) to contract codes.
import { checkTopology, endVertexId, distance } from '../brep/index.js';
import { shellFaces } from './context.js';

/** @typedef {import('./context.js').Ctx} Ctx */
/** @typedef {import('./context.js').RawIssue} RawIssue */

/**
 * brep internal kind -> contract code. (D-162): the spec names the codes, not this map. TWIN_MISSING is left out:
 * `openBoundaries` reports every null twin in every state. LINK (broken ring) reads as an open boundary of the face;
 * TWIN_ASYMMETRIC (a twin pointing to a third half-edge) as a non-manifold edge; TWIN_NOT_OPPOSITE (shared edge
 * traversed in the same direction, v0.2 §16.2) as shell orientation; a face outside its shell as an open shell; a vertex
 * whose defining face does not use it as an inconsistent junction (its planes do not describe the node).
 * @type {Record<string, string | null>}
 */
export const TOPOLOGY_KIND_CODE = {
  LINK: 'OPEN_BOUNDARY',
  TWIN_MISSING: null,
  TWIN_ASYMMETRIC: 'NON_MANIFOLD_EDGE',
  TWIN_NOT_OPPOSITE: 'SHELL_ORIENTATION',
  TWIN_OTHER_SHELL: 'SHELL_NOT_CLOSED',
  SHELL_FACE: 'SHELL_NOT_CLOSED',
  VERTEX_FACE: 'INCONSISTENT_JUNCTION',
};

/** @param {Ctx} ctx @returns {RawIssue[]} brep structural problems as issues */
export function structuralProblems(ctx) {
  /** @type {RawIssue[]} */
  const out = [];
  for (const p of checkTopology(ctx.model, ctx.index)) {
    const code = TOPOLOGY_KIND_CODE[p.kind];
    if (code) out.push({ code, entityIds: p.entityIds.filter(Boolean), detail: `${p.kind}: ${p.detail}` });
  }
  return out;
}

/** Ring half-edges of a face. @param {Ctx} ctx @param {string} f @returns {string[]} */
const faceHalfEdges = (ctx, f) => [...(ctx.index.outer.get(f) ?? []), ...(ctx.index.inner.get(f) ?? []).flat()];

/**
 * OPEN_BOUNDARY per half-edge without a twin (every state, v0.3 §8.3). A one-face edge shorter than `minEdgeLengthM`
 * is left to `degenerateEdges` (DEGENERATE_EDGE, not OPEN_BOUNDARY: D-156, Q-41).
 * @param {Ctx} ctx @returns {RawIssue[]}
 */
export function openBoundaries(ctx) {
  const { model } = ctx;
  /** @param {string} h @returns {boolean} */
  const short = (h) => distance(model.vertices[model.halfEdges[h].startVertexId].p, model.vertices[endVertexId(model, h)].p) < ctx.tol.minEdgeLengthM;
  /** @type {RawIssue[]} */
  const out = [];
  for (const f of ctx.faces) {
    for (const h of faceHalfEdges(ctx, f)) {
      if (ctx.model.halfEdges[h].twinId === null && !short(h)) out.push({ code: 'OPEN_BOUNDARY', entityIds: [h, f], location: ctx.model.vertices[ctx.model.halfEdges[h].startVertexId].p, detail: 'no twin' });
    }
  }
  return out;
}

/** @param {Ctx} ctx @returns {RawIssue[]} NON_MANIFOLD_EDGE: more than two half-edges on one vertex pair */
export function nonManifoldEdges(ctx) {
  const { model } = ctx;
  /** @type {Map<string, string[]>} */
  const byPair = new Map();
  for (const he of Object.values(model.halfEdges)) {
    if (!ctx.index.loopOf.has(he.id)) continue;
    const a = he.startVertexId;
    const b = endVertexId(model, he.id);
    const key = a < b ? `${a}|${b}` : `${b}|${a}`;
    const list = byPair.get(key);
    if (list) list.push(he.id);
    else byPair.set(key, [he.id]);
  }
  /** @type {RawIssue[]} */
  const out = [];
  for (const ids of byPair.values()) {
    const faces = ids.map((h) => model.halfEdges[h].faceId);
    if (ids.length > 2 && faces.some((f) => ctx.faces.has(f))) {
      out.push({ code: 'NON_MANIFOLD_EDGE', entityIds: [...ids].sort(), location: model.vertices[model.halfEdges[ids[0]].startVertexId].p, detail: `${ids.length} half-edges on one edge` });
    }
  }
  return out;
}

/**
 * NON_MANIFOLD_VERTEX: the faces of one shell around a vertex do not form one fan. Outgoing half-edges h and
 * twin(prev(h)) are neighbours in the fan; more than one group of neighbours = several cones touching at the vertex.
 * @param {Ctx} ctx @returns {RawIssue[]}
 */
export function nonManifoldVertices(ctx) {
  const { model, index } = ctx;
  /** @type {Map<string, string[]>} vertex + shell -> outgoing half-edges */
  const out0 = new Map();
  for (const he of Object.values(model.halfEdges)) {
    if (!index.loopOf.has(he.id)) continue;
    const key = `${he.startVertexId}\u0000${index.shellOf.get(he.faceId) ?? ''}`;
    const list = out0.get(key);
    if (list) list.push(he.id);
    else out0.set(key, [he.id]);
  }
  /** @type {RawIssue[]} */
  const out = [];
  for (const [key, hs] of out0) {
    const v = key.split('\u0000')[0];
    if (![...(index.facesOfVertex.get(v) ?? [])].some((f) => ctx.faces.has(f))) continue;
    const parent = new Map(hs.map((h) => [h, h]));
    /** @param {string} h @returns {string} */
    const find = (h) => { let r = h; while (parent.get(r) !== r) r = /** @type {string} */ (parent.get(r)); return r; };
    /** @param {string} a @param {string | null | undefined} b */
    const join = (a, b) => { if (b && parent.has(b)) parent.set(find(a), find(b)); };
    for (const h of hs) {
      // consistent twins: twin(prev(h)) leaves v; a twin traversed the same way (SHELL_ORIENTATION, reported
      // elsewhere) still closes the fan: twin(h) or next(twin(prev(h))) then leaves v.
      const t = model.halfEdges[model.halfEdges[h].prevId]?.twinId;
      join(h, t);
      if (t && model.halfEdges[t]) join(h, model.halfEdges[t].nextId);
      join(h, model.halfEdges[h].twinId);
    }
    const groups = new Set(hs.map(find));
    if (groups.size > 1) out.push({ code: 'NON_MANIFOLD_VERTEX', entityIds: [v], location: model.vertices[v].p, detail: `${groups.size} fans` });
  }
  return out;
}

/**
 * SHELL_NOT_CLOSED: a shell with a boundary edge (null twin, or twin on a face outside the shell) or whose faces fall
 * apart into several edge-connected components ([A] val3dity 305 MULTIPLE_CONNECTED_COMPONENTS read as not closed).
 * @param {Ctx} ctx @returns {RawIssue[]}
 */
export function openShells(ctx) {
  const { model } = ctx;
  /** @type {RawIssue[]} */
  const out = [];
  for (const sh of Object.values(model.shells)) {
    const faces = shellFaces(ctx, sh.id);
    if (!faces.some((f) => ctx.faces.has(f))) continue;
    const inShell = new Set(faces);
    const parent = new Map(faces.map((f) => [f, f]));
    /** @param {string} f @returns {string} */
    const find = (f) => { let r = f; while (parent.get(r) !== r) r = /** @type {string} */ (parent.get(r)); return r; };
    let open = faces.length === 0;
    for (const f of faces) {
      for (const h of faceHalfEdges(ctx, f)) {
        const tw = model.halfEdges[h].twinId;
        const tf = tw ? model.halfEdges[tw]?.faceId : undefined;
        if (!tf || !inShell.has(tf)) open = true;
        else parent.set(find(f), find(tf));
      }
    }
    const components = new Set(faces.map(find)).size;
    if (open || components > 1) {
      out.push({ code: 'SHELL_NOT_CLOSED', entityIds: [sh.id], detail: open ? 'boundary edge' : `${components} components` });
    }
  }
  return out;
}
