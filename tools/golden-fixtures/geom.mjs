// Synthetic building polyhedra for the golden fixtures (3D-07). Pure arithmetic only (+ - * / and Math.sqrt): no
// trigonometry or logarithms, so the output is byte-identical on every platform.
// Local frame: X east, Y north, Z up, metres (spec §1.2). Rings are counter-clockwise seen from outside.

/** @typedef {[number, number, number]} P3 */
/** @typedef {[number, number]} P2 */
/** @typedef {'RoofSurface' | 'WallSurface' | 'GroundSurface'} Kind */
/** @typedef {{ normal: P3, d: number }} Plane */
/** @typedef {{ id: string, kind: Kind, ring: string[], plane?: Plane }} PolyFace */
/** @typedef {{ vertices: Record<string, P3>, faces: PolyFace[] }} Poly */

/**
 * Envelope over a footprint: ground, one wall per footprint edge, the given roof faces.
 * @param {P2[]} ring footprint, counter-clockwise from above
 * @param {number} base base elevation
 * @param {Record<string, P3>} top roof boundary vertices (ids `e<i>` for the corners, others free)
 * @param {string[][]} wallTops per footprint edge i -> i+1: top vertex ids from corner i to corner i+1
 * @param {PolyFace[]} roofs
 * @param {string[]} [wallIds] wall face ids per edge
 * @returns {Poly}
 */
export function envelope(ring, base, top, wallTops, roofs, wallIds) {
  /** @type {Record<string, P3>} */
  const vertices = {};
  ring.forEach(([x, y], i) => { vertices[`b${i}`] = [x, y, base]; });
  Object.assign(vertices, top);
  const n = ring.length;
  /** @type {PolyFace[]} */
  const faces = [{ id: 'f-ground', kind: 'GroundSurface', ring: ring.map((_, i) => `b${i}`).reverse() }];
  for (let i = 0; i < n; i++) {
    const j = (i + 1) % n;
    faces.push({ id: wallIds?.[i] ?? `f-wall-${i}`, kind: 'WallSurface', ring: [`b${i}`, `b${j}`, ...[...wallTops[i]].reverse()] });
  }
  faces.push(...roofs);
  return { vertices, faces };
}

/** Rectangle footprint L x W at the origin (corners 0..3 = SW, SE, NE, NW). */
const rect = (/** @type {number} */ L, /** @type {number} */ W) => /** @type {P2[]} */ ([[0, 0], [L, 0], [L, W], [0, W]]);
const WALLS4 = ['f-wall-s', 'f-wall-e', 'f-wall-n', 'f-wall-w'];

/**
 * Gable, ridge along X on the mid line (v0.3 §12 GT-I1, GT-03). With `gap` > 0 the north slope keeps its own ridge edge
 * at y = W/2 + gap (GT-I2, D-101): the gable walls become hexagons with a `gap`-long top edge.
 * @param {{ L?: number, W?: number, base?: number, eave?: number, ridge?: number, gap?: number }} [o]
 */
export function gable(o = {}) {
  const { L = 10, W = 8, base = 0, eave = 5, ridge = 8, gap = 0 } = o;
  const h = W / 2;
  /** @type {Record<string, P3>} */
  const top = { e0: [0, 0, eave], e1: [L, 0, eave], e2: [L, W, eave], e3: [0, W, eave], r0: [0, h, ridge], r1: [L, h, ridge] };
  const n0 = gap > 0 ? 'r2' : 'r0';
  const n1 = gap > 0 ? 'r3' : 'r1';
  if (gap > 0) { top.r2 = [0, h + gap, ridge]; top.r3 = [L, h + gap, ridge]; }
  const eastTop = gap > 0 ? ['e1', 'r1', 'r3', 'e2'] : ['e1', 'r1', 'e2'];
  const westTop = gap > 0 ? ['e3', 'r2', 'r0', 'e0'] : ['e3', 'r0', 'e0'];
  return envelope(rect(L, W), base, top, [['e0', 'e1'], eastTop, ['e2', 'e3'], westTop], [
    { id: 'f-roof-s', kind: 'RoofSurface', ring: ['e0', 'e1', 'r1', 'r0'] },
    { id: 'f-roof-n', kind: 'RoofSurface', ring: ['e2', 'e3', n0, n1] },
  ], WALLS4);
}

/** Flat roof at `z` over any simple footprint (R-01; GT-01, GT-05). @param {P2[]} ring @param {number} base @param {number} z */
export function flat(ring, base, z) {
  /** @type {Record<string, P3>} */
  const top = {};
  ring.forEach(([x, y], i) => { top[`e${i}`] = [x, y, z]; });
  const tops = ring.map((_, i) => [`e${i}`, `e${(i + 1) % ring.length}`]);
  return envelope(ring, base, top, tops, [{ id: 'f-roof', kind: 'RoofSurface', ring: ring.map((_, i) => `e${i}`) }]);
}

/** Shed rising along Y from zLow (y = 0) to zHigh (y = W) (R-02; GT-02). */
export function shed(L = 10, W = 8, base = 0, zLow = 5, zHigh = 8) {
  /** @type {Record<string, P3>} */
  const top = { e0: [0, 0, zLow], e1: [L, 0, zLow], e2: [L, W, zHigh], e3: [0, W, zHigh] };
  return envelope(rect(L, W), base, top, [['e0', 'e1'], ['e1', 'e2'], ['e2', 'e3'], ['e3', 'e0']],
    [{ id: 'f-roof', kind: 'RoofSurface', ring: ['e0', 'e1', 'e2', 'e3'] }], WALLS4);
}

/**
 * Hip with equal slopes rise/run on every side, ridge along X (R-04; GT-04). L > W.
 * @param {{ L?: number, W?: number, base?: number, eave?: number, rise?: number, run?: number }} [o]
 */
export function hip(o = {}) {
  const { L = 10, W = 8, base = 0, eave = 5, rise = 3, run = 4 } = o;
  const h = W / 2;
  const z = eave + (h * rise) / run;
  /** @type {Record<string, P3>} */
  const top = { e0: [0, 0, eave], e1: [L, 0, eave], e2: [L, W, eave], e3: [0, W, eave], r0: [h, h, z], r1: [L - h, h, z] };
  return envelope(rect(L, W), base, top, [['e0', 'e1'], ['e1', 'e2'], ['e2', 'e3'], ['e3', 'e0']], [
    { id: 'f-roof-s', kind: 'RoofSurface', ring: ['e0', 'e1', 'r1', 'r0'] },
    { id: 'f-roof-e', kind: 'RoofSurface', ring: ['e1', 'e2', 'r1'] },
    { id: 'f-roof-n', kind: 'RoofSurface', ring: ['e2', 'e3', 'r0', 'r1'] },
    { id: 'f-roof-w', kind: 'RoofSurface', ring: ['e3', 'e0', 'r0'] },
  ], WALLS4);
}

/**
 * Pyramid on a square S x S: four slopes rise/run meeting in one apex (GT-19, [P]). `eastLiftM` lifts the east slope at
 * the apex by that many metres (rotation about its eave line), so the four planes no longer meet in one point; the apex
 * stays at the point of the other three (an imported, explicit vertex, D-70).
 * @param {{ S?: number, base?: number, eave?: number, rise?: number, run?: number, eastLiftM?: number }} [o]
 */
export function pyramid(o = {}) {
  const { S = 8, base = 0, eave = 5, rise = 3, run = 4, eastLiftM = 0 } = o;
  const h = S / 2;
  const z = eave + (h * rise) / run;
  /** @type {Record<string, P3>} */
  const top = { e0: [0, 0, eave], e1: [S, 0, eave], e2: [S, S, eave], e3: [0, S, eave], a: [h, h, z] };
  const poly = envelope(rect(S, S), base, top, [['e0', 'e1'], ['e1', 'e2'], ['e2', 'e3'], ['e3', 'e0']], [
    { id: 'f-roof-s', kind: 'RoofSurface', ring: ['e0', 'e1', 'a'] },
    { id: 'f-roof-e', kind: 'RoofSurface', ring: ['e1', 'e2', 'a'] },
    { id: 'f-roof-n', kind: 'RoofSurface', ring: ['e2', 'e3', 'a'] },
    { id: 'f-roof-w', kind: 'RoofSurface', ring: ['e3', 'e0', 'a'] },
  ], WALLS4);
  if (eastLiftM !== 0) {
    // East slope through its eave line (x = S, z = eave) and (h, ., z + lift): z = eave + k (S - x).
    const k = (z + eastLiftM - eave) / h;
    const len = Math.sqrt(k * k + 1);
    const east = /** @type {PolyFace} */ (poly.faces.find((f) => f.id === 'f-roof-e'));
    east.plane = { normal: [k / len, 0, 1 / len], d: -(eave + k * S) / len };
  }
  return poly;
}

/** Translate every vertex by `v`. @param {Poly} poly @param {P3} v @returns {Poly} */
export function translate(poly, v) {
  /** @type {Record<string, P3>} */
  const vertices = {};
  for (const [id, p] of Object.entries(poly.vertices)) vertices[id] = [p[0] + v[0], p[1] + v[1], p[2] + v[2]];
  return { vertices, faces: poly.faces };
}

/** Set the Z of every vertex at `fromZ` to `toZ` (SET_HEIGHT BASE reference, GT-15). @param {Poly} poly */
export function rebase(poly, /** @type {number} */ fromZ, /** @type {number} */ toZ) {
  /** @type {Record<string, P3>} */
  const vertices = {};
  for (const [id, p] of Object.entries(poly.vertices)) vertices[id] = p[2] === fromZ ? [p[0], p[1], toZ] : p;
  return { vertices, faces: poly.faces };
}
