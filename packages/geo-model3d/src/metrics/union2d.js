// metrics (3D-116): exact area of the union of planar polygons with holes (D-412: footprint and roof plan as XY
// unions, no double count, holes kept). Slab method: the x-coordinates of every vertex and of every crossing of two
// edges cut the plane into vertical slabs; inside a slab no two edges cross, so the length of the union of the
// polygons' cross-sections is linear in x and the midpoint rule is exact. Each polygon's cross-section is found by
// the even-odd rule over all its rings (outer and holes), so a hole is a gap. O(E^2) for the crossings.

/** @typedef {[number, number]} P2 */

/**
 * @param {P2[][][]} polygons each polygon is a list of rings (outer first, then holes)
 * @returns {number} area of the union, >= 0
 */
export function unionArea(polygons) {
  /** @type {{ a: P2, b: P2, poly: number }[]} */
  const edges = [];
  polygons.forEach((rings, poly) => {
    for (const r of rings) for (let i = 0; i < r.length; i++) {
      const a = r[i], b = r[(i + 1) % r.length];
      if (a[0] !== b[0]) edges.push(a[0] < b[0] ? { a, b, poly } : { a: b, b: a, poly });
    }
  });
  const xs = new Set();
  for (const e of edges) { xs.add(e.a[0]); xs.add(e.b[0]); }
  for (let i = 0; i < edges.length; i++) for (let j = i + 1; j < edges.length; j++) {
    const x = crossingX(edges[i], edges[j]);
    if (x !== null) xs.add(x);
  }
  const cuts = [...xs].sort((p, q) => p - q);
  let area = 0;
  for (let k = 0; k + 1 < cuts.length; k++) {
    const x0 = cuts[k], x1 = cuts[k + 1];
    if (!(x1 > x0)) continue;
    area += unionLength(edges, (x0 + x1) / 2, polygons.length) * (x1 - x0);
  }
  return area;
}

/** y of a non-vertical edge at x. @param {{ a: P2, b: P2 }} e @param {number} x */
const yAt = (e, x) => e.a[1] + ((e.b[1] - e.a[1]) * (x - e.a[0])) / (e.b[0] - e.a[0]);

/**
 * x where two edges cross strictly inside both x-ranges, else null.
 * @param {{ a: P2, b: P2 }} e @param {{ a: P2, b: P2 }} f @returns {number | null}
 */
function crossingX(e, f) {
  const lo = Math.max(e.a[0], f.a[0]), hi = Math.min(e.b[0], f.b[0]);
  if (!(hi > lo)) return null;
  const d0 = yAt(e, lo) - yAt(f, lo), d1 = yAt(e, hi) - yAt(f, hi);
  if (!((d0 < 0 && d1 > 0) || (d0 > 0 && d1 < 0))) return null;
  return lo + ((hi - lo) * d0) / (d0 - d1);
}

/**
 * Length of the union of the polygons' cross-sections on the vertical line at x.
 * @param {{ a: P2, b: P2, poly: number }[]} edges @param {number} x @param {number} count
 */
function unionLength(edges, x, count) {
  /** @type {number[][]} */
  const ys = Array.from({ length: count }, () => []);
  for (const e of edges) if (e.a[0] < x && x < e.b[0]) ys[e.poly].push(yAt(e, x));
  /** @type {[number, number][]} */
  const intervals = [];
  for (const list of ys) {
    list.sort((p, q) => p - q);
    for (let i = 0; i + 1 < list.length; i += 2) intervals.push([list[i], list[i + 1]]);
  }
  intervals.sort((p, q) => p[0] - q[0]);
  if (!intervals.length) return 0;
  let len = 0, [lo, hi] = intervals[0];
  for (const [a, b] of intervals) {
    if (a > hi) { len += hi - lo; lo = a; hi = b; } else if (b > hi) hi = b;
  }
  return len + (hi - lo);
}
