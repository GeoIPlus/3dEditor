// export (3D-11): CityJSON geometry helpers. Selection of the LoD 2.x geometry repeats import's rule (spec §6 rule 1,
// `src/import/cityjson.js`): the module DAG lets `export` import `brep` and `crs` only, so the rule is restated here and
// both are checked against each other by `test/export/structure.test.js`.

/** Preference within one LoD [A] (as import): a Solid before a MultiSurface; composite before multi. */
const TYPE_RANK = ['Solid', 'CompositeSolid', 'MultiSolid', 'CompositeSurface', 'MultiSurface'];

/** @param {unknown} lod @returns {number} */
const lodValue = (lod) => (typeof lod === 'number' ? lod : typeof lod === 'string' ? Number(lod) : NaN);

/**
 * Index of the geometry import used: highest LoD in [2, 3), then TYPE_RANK, then the first.
 * @param {any[]} geoms @returns {number} -1 when none qualifies
 */
export function selectGeometry(geoms) {
  let best = -1;
  for (let i = 0; i < geoms.length; i++) {
    const g = geoms[i], lod = lodValue(g?.lod), rank = TYPE_RANK.indexOf(g?.type);
    if (!(lod >= 2 && lod < 3) || rank < 0) continue;
    if (best < 0) { best = i; continue; }
    const b = geoms[best], bl = lodValue(b.lod);
    if (lod > bl || (lod === bl && rank < TYPE_RANK.indexOf(b.type))) best = i;
  }
  return best;
}

/**
 * Every vertex index in a `boundaries` value, whatever the geometry type (all numbers at any depth).
 * @param {unknown} b @param {(i: number) => void} visit
 */
export function eachIndex(b, visit) {
  if (typeof b === 'number') visit(b);
  else if (Array.isArray(b)) for (const x of b) eachIndex(x, visit);
}

/**
 * Copy of a `boundaries` value with every index mapped.
 * @param {unknown} b @param {(i: number) => number} map @returns {any}
 */
export function mapIndices(b, map) {
  if (typeof b === 'number') return map(b);
  return Array.isArray(b) ? b.map((x) => mapIndices(x, map)) : b;
}

/**
 * Node of a nested array by a path of indices; undefined when the path leaves the array.
 * @param {unknown} root @param {number[]} path @returns {any}
 */
export function atPath(root, path) {
  let n = /** @type {any} */ (root);
  for (const k of path) {
    if (!Array.isArray(n) || k >= n.length) return undefined;
    n = n[k];
  }
  return n;
}

/**
 * Path below `boundaries` of a `Face.sourceRef` (`<object>/geometry/<gi>/boundaries/<path>`, import 3D-10) when it
 * points into geometry `gi` of `objectId`; null otherwise.
 * @param {string | undefined} ref @param {string} objectId @param {number} gi @returns {number[] | null}
 */
export function surfacePath(ref, objectId, gi) {
  const prefix = `${objectId}/geometry/${gi}/boundaries/`;
  if (typeof ref !== 'string' || !ref.startsWith(prefix)) return null;
  const parts = ref.slice(prefix.length).split('/');
  if (!parts.every((p) => /^\d+$/.test(p))) return null;
  return parts.map(Number);
}

/**
 * Number of indices of a surface path for a geometry type (MultiSurface: [surface]; Solid: [shell, surface];
 * MultiSolid / CompositeSolid: [solid, shell, surface]).
 * @param {string} type @returns {number}
 */
export function surfaceDepth(type) {
  if (type === 'Solid') return 2;
  if (type === 'MultiSolid' || type === 'CompositeSolid') return 3;
  return 1;
}

/**
 * Paths of every surface of a geometry, in file order.
 * @param {any} g @returns {number[][]}
 */
export function surfacePaths(g) {
  const depth = surfaceDepth(g.type);
  /** @type {number[][]} */
  const out = [];
  /** @param {any} n @param {number[]} p */
  const walk = (n, p) => {
    if (p.length === depth) { out.push(p); return; }
    if (Array.isArray(n)) n.forEach((c, i) => walk(c, [...p, i]));
  };
  walk(g.boundaries, []);
  return out;
}
