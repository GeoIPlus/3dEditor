// solve (3D-13): stage 2 of 3D-ADR-0005 - Gauss-Newton / Levenberg-Marquardt over all movable planes for coupled or
// nonlinear conditions. Hard conditions are linearised equalities handled in their null space (minimum-norm step onto
// them, objective minimised inside the null space); the objective is O1 (keep points, D-110) plus weighted soft terms.
// Each plane is parametrised on the unit sphere (normal = normalize(n + a·t1 + b·t2)) plus an offset `e` at a fixed
// centre point, so |n| = 1 never needs a constraint. Jacobians by central differences. Deterministic.
import { freeKinds } from './stage1.js';
import { dotN, matTVec, solveSym, splitRange, symEigen, gram } from './linalg.js';

/** @typedef {import('./conditions.js').Condition} Condition */
/** @typedef {import('./conditions.js').EvalContext} EvalContext */
/** @typedef {import('../brep/plane.js').Plane} Plane */
/** @typedef {import('../brep/vec.js').P3} P3 */

/**
 * @typedef {object} MovablePlane
 * @property {string} faceId
 * @property {Plane} plane start (stage 1 result or the current plane)
 * @property {P3[]} keep old positions of the face's other vertices (O1)
 * @property {number} keepWeight weight of the O1 terms of this face (MINIMIZE_DISPLACEMENT, default 1)
 */

/**
 * @typedef {object} Stage2Result
 * @property {Record<string, Plane>} planes
 * @property {number} iterations
 * @property {boolean} converged
 * @property {string[]} free missing degrees of freedom `"<faceId>:OFFSET|ROTATION"` (D-3D13-3); empty when fixed
 * @property {number} cost weighted sum of squares of the objective at the solution
 */

const STEP = 1e-6; // central-difference step in sphere / offset parameters [A]
const MAX_IT = 100;
const HARD_PENALTY = 1e6; // exact (L1) penalty weight of the hard residuals in the line-search merit [A]

/**
 * @param {{ movable: MovablePlane[], conditions: Condition[], context: (planes: Record<string, Plane>) => EvalContext,
 *   eps: number }} input
 * @returns {Stage2Result}
 */
export function solveCoupled({ movable, conditions, context, eps }) {
  const hard = conditions.filter((c) => c.hard);
  const soft = conditions.filter((c) => !c.hard);
  const n = 3 * movable.length;
  let state = movable.map((m) => sphereState(m));
  const evalAt = (/** @type {SphereState[]} */ s) => evaluate(s, movable, hard, soft, context);
  let cur = evalAt(state);
  let mu = 1e-9;
  let it = 0;
  let converged = false;
  for (; it < MAX_IT; it++) {
    const { H, J } = jacobians(state, movable, hard, soft, context, n);
    const { range, nullBasis: Z } = splitRange(H, n, 1e-12);
    const dxp = minNormStep(range, matTVec(H, cur.h, n), n);
    const Jdxp = J.map((row, k) => cur.r[k] + dotN(row, dxp));
    const JZ = J.map((row) => Z.map((z) => dotN(row, z)));
    const nz = Z.length;
    const A = gram(JZ, nz);
    const g = matTVec(JZ, Jdxp, nz);
    let accepted = false;
    let t = 1;
    for (let tries = 0; tries < 40 && !accepted; tries++) {
      const Ad = A.map((row, i) => row.map((x, j) => (i === j ? x + mu * Math.max(1, A[i][i]) : x)));
      const y = nz > 0 ? solveSym(Ad, g.map((x) => -x), 0) : [];
      const dx = dxp.map((x, i) => t * (x + Z.reduce((s, z, j) => s + z[i] * y[j], 0)));
      const step = Math.max(...dx.map(Math.abs), 0);
      let next = state.map((s, p) => move(s, dx.slice(3 * p, 3 * p + 3)));
      let val = evalAt(next);
      if (val.merit > cur.merit && step >= 1e-15) {
        // Second-order correction (against the Maratos effect): pull the trial point back onto the linearised hard
        // conditions with the current pseudo-inverse, then judge the merit there.
        const corr = minNormStep(range, matTVec(H, val.h, n), n);
        const next2 = next.map((s, p) => move(s, corr.slice(3 * p, 3 * p + 3)));
        const val2 = evalAt(next2);
        if (val2.merit < val.merit) {
          next = next2;
          val = val2;
        }
      }
      if (val.merit <= cur.merit || step < 1e-15) {
        accepted = true;
        const gain = cur.merit - val.merit;
        state = next;
        cur = val;
        mu = Math.max(mu / 10, 1e-15);
        if (step < 1e-14 || (gain <= 1e-30 && cur.hNorm1 <= 1e-14)) converged = true;
      } else {
        mu *= 10;
        t *= 0.5;
      }
    }
    if (!accepted || converged) {
      converged = true;
      break;
    }
  }
  return { planes: toPlanes(state, movable), iterations: it + 1, converged, free: freeDegrees(state, movable, hard, soft, context, n, eps), cost: cur.soft };
}

/**
 * Minimum-norm step dx with H dx = -h (least squares when inconsistent), from the range part of HᵀH and Hᵀh.
 * @param {{ v: number[], value: number }[]} range @param {number[]} hT Hᵀh @param {number} n
 */
function minNormStep(range, hT, n) {
  const dx = new Array(n).fill(0);
  for (const { v, value } of range) {
    const c = -dotN(v, hT) / value;
    for (let i = 0; i < n; i++) dx[i] += c * v[i];
  }
  return dx;
}

/** @typedef {{ n: P3, c: P3, e: number }} SphereState plane n·(p - c) + e = 0 */

/** @param {MovablePlane} m @returns {SphereState} */
function sphereState(m) {
  const pts = m.keep;
  const { normal, d } = m.plane;
  /** @type {P3} */
  const c = pts.length > 0 ? /** @type {P3} */ ([0, 1, 2].map((i) => pts.reduce((s, p) => s + p[i], 0) / pts.length)) : [-d * normal[0], -d * normal[1], -d * normal[2]];
  return { n: normal, c, e: dotN(normal, c) + d };
}

/** Deterministic tangent basis of a unit normal. @param {P3} n @returns {[P3, P3]} */
function tangents(n) {
  const a = Math.abs(n[0]) < 0.9 ? [1, 0, 0] : [0, 1, 0];
  const t1 = /** @type {P3} */ ([n[1] * a[2] - n[2] * a[1], n[2] * a[0] - n[0] * a[2], n[0] * a[1] - n[1] * a[0]]);
  const l = Math.hypot(...t1);
  const u = /** @type {P3} */ ([t1[0] / l, t1[1] / l, t1[2] / l]);
  return [u, [n[1] * u[2] - n[2] * u[1], n[2] * u[0] - n[0] * u[2], n[0] * u[1] - n[1] * u[0]]];
}

/** @param {SphereState} s @param {number[]} d [a, b, de] @returns {SphereState} */
function move(s, d) {
  const [t1, t2] = tangents(s.n);
  const v = [0, 1, 2].map((i) => s.n[i] + d[0] * t1[i] + d[1] * t2[i]);
  const l = Math.hypot(v[0], v[1], v[2]);
  return { n: [v[0] / l, v[1] / l, v[2] / l], c: s.c, e: s.e + d[2] };
}

/** @param {SphereState[]} state @param {MovablePlane[]} movable @returns {Record<string, Plane>} */
function toPlanes(state, movable) {
  /** @type {Record<string, Plane>} */
  const out = {};
  state.forEach((s, i) => {
    out[movable[i].faceId] = { normal: [s.n[0] + 0, s.n[1] + 0, s.n[2] + 0], d: s.e - dotN(s.n, s.c) + 0 };
  });
  return out;
}

/**
 * @param {SphereState[]} state @param {MovablePlane[]} movable @param {Condition[]} hard @param {Condition[]} soft
 * @param {(planes: Record<string, Plane>) => EvalContext} context
 */
function evaluate(state, movable, hard, soft, context) {
  const planes = toPlanes(state, movable);
  const ctx = context(planes);
  const h = hard.flatMap((c) => c.residual(ctx));
  /** @type {number[]} */
  const r = [];
  movable.forEach((m) => {
    const w = Math.sqrt(m.keepWeight);
    const pl = planes[m.faceId];
    for (const p of m.keep) r.push(w * (dotN(pl.normal, p) + pl.d));
  });
  for (const c of soft) for (const x of c.residual(ctx)) r.push(Math.sqrt(c.weight) * x);
  // L1 penalty is exact: near feasibility it still dominates the quadratic change of the objective.
  const hNorm1 = h.reduce((s, x) => s + Math.abs(x), 0);
  const rr = dotN(r, r);
  return { h, r, soft: rr, hNorm1, merit: HARD_PENALTY * hNorm1 + rr };
}

/**
 * @param {SphereState[]} state @param {MovablePlane[]} movable @param {Condition[]} hard @param {Condition[]} soft
 * @param {(planes: Record<string, Plane>) => EvalContext} context @param {number} n
 */
function jacobians(state, movable, hard, soft, context, n) {
  /** @type {number[][]} */
  const Hc = [];
  /** @type {number[][]} */
  const Jc = [];
  for (let j = 0; j < n; j++) {
    const d = [0, 0, 0];
    d[j % 3] = STEP;
    const p = Math.floor(j / 3);
    const plus = evaluate(state.map((s, i) => (i === p ? move(s, d) : s)), movable, hard, soft, context);
    const minus = evaluate(state.map((s, i) => (i === p ? move(s, d.map((x) => -x)) : s)), movable, hard, soft, context);
    Hc.push(plus.h.map((x, k) => (x - minus.h[k]) / (2 * STEP)));
    Jc.push(plus.r.map((x, k) => (x - minus.r[k]) / (2 * STEP)));
  }
  const rowsOf = (/** @type {number[][]} */ cols) => (cols.length === 0 ? [] : cols[0].map((_, k) => cols.map((col) => col[k])));
  return { H: rowsOf(Hc), J: rowsOf(Jc) };
}

/**
 * Free degrees at the solution: directions that keep the linearised hard conditions (null space of H) and along which
 * the objective has a vanishing singular value (<= eps, D-3D13-4).
 * @param {SphereState[]} state @param {MovablePlane[]} movable @param {Condition[]} hard @param {Condition[]} soft
 * @param {(planes: Record<string, Plane>) => EvalContext} context @param {number} n @param {number} eps
 */
function freeDegrees(state, movable, hard, soft, context, n, eps) {
  const { H, J } = jacobians(state, movable, hard, soft, context, n);
  const Z = splitRange(H, n, 1e-12).nullBasis;
  if (Z.length === 0) return [];
  const JZ = J.map((row) => Z.map((z) => dotN(row, z)));
  const e = symEigen(gram(JZ, Z.length));
  const dirs = e.values
    .map((value, k) => ({ value, k }))
    .filter(({ value }) => Math.sqrt(Math.max(0, value)) <= eps)
    .map(({ k }) => Z[0].map((_, i) => Z.reduce((s, z, j) => s + z[i] * e.vectors[k][j], 0)));
  if (dirs.length === 0) return [];
  // Per plane: sphere parameters a, b turn the normal, e moves the offset (blocks of 3); directions are unit as a whole
  // (orthonormal Z times a unit eigenvector), so a block a direction does not touch stays below the rank threshold.
  return movable.flatMap((m, p) => freeKinds(dirs.map((x) => x.slice(3 * p, 3 * p + 3)), [0, 1], [2], false).map((k) => `${m.faceId}:${k}`));
}
