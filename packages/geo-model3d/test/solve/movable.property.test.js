// 3D-13 property test, spec §5 Accept 3 (r7): a planes-only solve never changes a plane outside the declared movable
// set. Seeded generator (deterministic, offline): random movable sets and random hard / soft constraint mixes on GT-03.
// Also: the input model is never written (deep-frozen) and equal inputs give byte-identical results.
import { describe, expect, it } from 'vitest';
import { canonicalJson } from '../../src/brep/index.js';
import { solveConstraints } from '../../src/solve/index.js';
import { TOL, compiled, gt03, targetOn } from './helpers.js';

/** Park-Miller LCG. @param {number} seed */
function rng(seed) {
  let s = seed % 2147483647 || 1;
  return () => (s = (s * 16807) % 2147483647) / 2147483647;
}

const FACES = ['f-roof-s', 'f-roof-n', 'f-wall-s', 'f-wall-n', 'f-wall-e', 'f-wall-w', 'f-ground'];
const VERTS = ['v-e0', 'v-e1', 'v-e2', 'v-e3', 'v-r0', 'v-r1', 'v-b0', 'v-b1'];

/** @param {() => number} r @param {any[]} a */
const pick = (r, a) => a[Math.floor(r() * a.length)];

/** @param {any} model @param {() => number} r @param {number} i */
function randomConstraint(model, r, i) {
  const hard = r() < 0.7;
  const soft = hard ? {} : { weight: 0.5 + r() * 4 };
  const id = `c-${String(i).padStart(2, '0')}`;
  switch (Math.floor(r() * 6)) {
    case 0: return { id, kind: 'ROOF_SLOPE', entityIds: [pick(r, ['f-roof-s', 'f-roof-n'])], hard, ...soft, target: 25 + r() * 30 };
    case 1: return { id, kind: 'EQUAL_Z', entityIds: [pick(r, VERTS), pick(r, ['v-r0', 'v-r1'])].filter((v, k, a) => a.indexOf(v) === k), hard, ...soft, target: 7 + r() * 2 };
    case 2: return { id, kind: 'FIXED_POINT', entityIds: [pick(r, VERTS)], hard: true };
    case 3: return { id, kind: pick(r, ['PARALLEL', 'PERPENDICULAR']), entityIds: ['f-roof-s', 'f-roof-n'], hard, ...soft };
    case 4: return { id, kind: pick(r, ['HORIZONTAL', 'VERTICAL']), entityIds: [pick(r, FACES)], hard, ...soft };
    default: return { id, kind: 'SYMMETRY', entityIds: ['f-roof-s', 'f-roof-n'], hard: false, weight: 1 + r() };
  }
}

/** @param {number} seed */
function scenario(seed) {
  const r = rng(seed);
  const model = gt03();
  const movable = FACES.filter(() => r() < 0.35);
  if (movable.length === 0) movable.push(pick(r, FACES));
  const constraints = Array.from({ length: 1 + Math.floor(r() * 4) }, (_, i) => randomConstraint(model, r, i));
  const face = pick(r, movable);
  const z = 4.5 + r();
  const conditions = [...targetOn(model, face, [[0, 0, z], [10, 0, z + r() * 0.2]]), ...compiled(model, constraints).conditions];
  // Sometimes every vertex is a target: O1 keeps nothing and free degrees can remain.
  const targetVertexIds = r() < 0.4 ? Object.keys(model.vertices) : [];
  return { model, movable, conditions, targetVertexIds };
}

describe('planes outside the movable set never change (spec §5 Accept 3)', () => {
  const seeds = Array.from({ length: 60 }, (_, i) => 1000 + i * 7919);
  it.each(seeds)('seed %i', (seed) => {
    const { model, movable, conditions, targetVertexIds } = scenario(seed);
    const before = canonicalJson(model);
    const r = solveConstraints({ model, movableFaceIds: movable, conditions, targetVertexIds }, TOL);
    for (const f of Object.keys(r.planes)) expect(movable).toContain(f);
    if (r.status !== 'OK') expect(r.planes).toEqual({});
    expect(canonicalJson(model)).toBe(before);
    const again = solveConstraints({ model, movableFaceIds: movable, conditions, targetVertexIds }, TOL);
    expect(canonicalJson(again)).toBe(canonicalJson(r));
  });

  it('every result kind occurs in the sample (the property is not vacuous)', () => {
    const statuses = new Set(Array.from({ length: 60 }, (_, i) => {
      const { model, movable, conditions, targetVertexIds } = scenario(1000 + i * 7919);
      return solveConstraints({ model, movableFaceIds: movable, conditions, targetVertexIds }, TOL).status;
    }));
    expect([...statuses].sort()).toEqual(['CONSTRAINT_CONFLICT', 'OK', 'UNDERCONSTRAINED_GEOMETRY']);
  });
});
