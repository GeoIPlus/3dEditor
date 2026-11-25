// ops (3D-14): entity id source for new entities. The service may inject one (spec §3: ids are injected); the
// `EntityId` format is open (Q-26). The default is a deterministic readable counter per kind that skips every id the
// input model already uses [A]: PREVIEW and COMMIT of one command on one version get the same ids, hence the same
// patch (spec §3 Accept 2), and a deleted id is never reused within the operation.

const PREFIX = /** @type {Record<string, string>} */ ({
  vertex: 'v', halfEdge: 'he', face: 'f', shell: 'sh', solid: 'so', roofComponent: 'rc',
});

/** Collections whose ids share one namespace for the skip test. */
const COLLECTIONS = ['vertices', 'halfEdges', 'faces', 'shells', 'solids', 'roofComponents', 'footprints',
  'constructionEntities', 'constraints', 'measurements', 'semantics'];

/**
 * @param {import('../brep/types.js').BuildingModel} model the input version
 * @returns {(kind: string) => string}
 */
export function freshIds(model) {
  const used = new Set();
  for (const c of COLLECTIONS) for (const id of Object.keys(/** @type {any} */ (model)[c] ?? {})) used.add(id);
  /** @type {Map<string, number>} */
  const n = new Map();
  return (kind) => {
    const prefix = PREFIX[kind] ?? kind;
    let k = n.get(prefix) ?? 0;
    let id;
    do { k++; id = `${prefix}-${k}`; } while (used.has(id));
    n.set(prefix, k);
    used.add(id);
    return id;
  };
}
