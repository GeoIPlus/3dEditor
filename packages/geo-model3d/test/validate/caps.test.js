// 3D-117 (D-343): verified overhang end caps and the minimum face area. Tests CAP-03..CAP-09: a verified cap below
// `minFaceAreaM2` is measured with its coplanar end wall; every broken condition falls back to DEGENERATE_FACE and the
// validator never throws. The model is the GT-14 result (SET_OVERHANG 0.5 m on the GT-03 gable, D-336, D-337).
import { describe, expect, it } from 'vitest';
import { readFixture, TOLS } from './helpers.js';
import { run } from '../ops/helpers.js';
import { runChecks } from '../../src/validate/index.js';
import { makeContext } from '../../src/validate/context.js';
import { verifiedCapWall } from '../../src/validate/caps.js';

/** @returns {any} a mutable copy of the GT-14 commit (DRAFT_SOLID, so the result does not depend on the rule) */
function overhangModel() {
  const steps = readFixture('GT-14', 'steps.json');
  const r = run(readFixture('GT-14', 'input.model.json'), { ...steps[0].command, targetState: 'DRAFT_SOLID' });
  expect(r.result.status).toBe('COMMITTED');
  return structuredClone(r.model);
}
const caps = (/** @type {any} */ m) => Object.keys(m.faces).filter((f) => m.faces[f].surfaceKind === 'WallSurface' && m.faces[f].tags.includes('OVERHANG')).sort();
/** @param {any} m @param {string} f @returns {any[]} half-edges of the outer ring */
function loop(m, f) {
  const out = [];
  let h = m.halfEdges[m.faces[f].outerLoopId];
  do { out.push(h); h = m.halfEdges[h.nextId]; } while (h.id !== m.faces[f].outerLoopId && out.length < 50);
  return out;
}
/** the half-edge of cap `f` whose twin lies in a face of kind `kind` */
const edgeTo = (/** @type {any} */ m, /** @type {string} */ f, /** @type {string} */ kind) => loop(m, f).find((h) => m.faces[m.halfEdges[h.twinId].faceId].surfaceKind === kind);
/** @param {any} m @param {any} [tol] @returns {string[]} faces with DEGENERATE_FACE after COMMIT_VALIDATION */
function degenerate(m, tol = TOLS) {
  /** @type {any[]} */
  let issues = [];
  expect(() => { issues = runChecks(m, { mode: 'COMMIT_VALIDATION', tolerances: tol }); }).not.toThrow();
  return issues.filter((i) => i.code === 'DEGENERATE_FACE').flatMap((i) => i.entityIds).sort();
}

describe('3D-117 overhang end caps (D-343)', () => {
  it('CAP-03: a verified cap below minFaceAreaM2 is measured with its end wall - no DEGENERATE_FACE', () => {
    const m = overhangModel();
    const cs = caps(m);
    expect(cs).toHaveLength(4);
    expect(degenerate(m)).toEqual([]);
    const ctx = makeContext(m, TOLS, undefined);
    for (const c of cs) {
      const wall = m.halfEdges[edgeTo(m, c, 'WallSurface').twinId].faceId;
      expect(m.faces[wall].tags).not.toContain('OVERHANG');
      expect(verifiedCapWall(ctx, c, 0.09375)).toBe(wall);
    }
  });

  it('CAP-03: C10 - cap plus end wall below minFaceAreaM2 -> DEGENERATE_FACE', () => {
    const m = overhangModel();
    expect(degenerate(m, { ...TOLS, minFaceAreaM2: 1000 })).toEqual(expect.arrayContaining(caps(m)));
  });

  it('CAP-04: a plain small face (no OVERHANG tag) is still DEGENERATE_FACE', () => {
    const m = overhangModel();
    const [c] = caps(m);
    m.faces[c].tags = [];
    expect(degenerate(m)).toEqual([c]);
  });

  it('CAP-05: a degenerate OVERHANG cap (apex on the end-wall corner, zero area) is DEGENERATE_FACE', () => {
    const m = overhangModel();
    const [c] = caps(m);
    const toWall = edgeTo(m, c, 'WallSurface');
    const apex = m.halfEdges[m.halfEdges[toWall.nextId].nextId].startVertexId;
    m.vertices[apex].p = [...m.vertices[toWall.startVertexId].p];
    expect(degenerate(m)).toContain(c);
    expect(verifiedCapWall(makeContext(m, TOLS, undefined), c, 0)).toBeNull();
  });

  it('CAP-06: tag only - no correct end-wall link (neighbour kinds broken) -> DEGENERATE_FACE, no exception', () => {
    const m = overhangModel();
    const [c] = caps(m);
    const wall = m.halfEdges[edgeTo(m, c, 'WallSurface').twinId].faceId;
    m.faces[wall].tags = ['OVERHANG'];
    expect(degenerate(m)).toContain(c);
    const m2 = overhangModel();
    const [c2] = caps(m2);
    m2.faces[m2.halfEdges[edgeTo(m2, c2, 'OuterCeilingSurface').twinId].faceId].surfaceKind = 'GroundSurface';
    expect(degenerate(m2)).toContain(c2);
  });

  it('CAP-07: a cap not coplanar with its end wall -> DEGENERATE_FACE, no exception', () => {
    const m = overhangModel();
    const [c] = caps(m);
    const n = m.faces[c].supportPlane.normal;
    const t = [n[0] + 0.05, n[1] + 0.05, n[2]];
    const len = Math.hypot(...t);
    m.faces[c].supportPlane.normal = t.map((x) => x / len);
    expect(degenerate(m)).toContain(c);
  });

  it('CAP-08: a cap folded over its end wall (overlap) -> DEGENERATE_FACE, no exception', () => {
    const m = overhangModel();
    const [c] = caps(m);
    const toWall = edgeTo(m, c, 'WallSurface');
    const apex = m.halfEdges[m.halfEdges[toWall.nextId].nextId].startVertexId;
    const a = m.vertices[toWall.startVertexId].p, p = m.vertices[apex].p;
    m.vertices[apex].p = [2 * a[0] - p[0], 2 * a[1] - p[1], p[2]]; // mirrored through A in plan: inside the gable wall
    expect(degenerate(m)).toContain(c);
  });

  it('CAP-09: a non-manifold / open cap edge -> DEGENERATE_FACE, no exception', () => {
    const m = overhangModel();
    const [c] = caps(m);
    const h = edgeTo(m, c, 'RoofSurface');
    m.halfEdges[h.twinId].twinId = null;
    h.twinId = null;
    expect(degenerate(m)).toContain(c);
    const m2 = overhangModel();
    const [c2] = caps(m2);
    const h2 = edgeTo(m2, c2, 'OuterCeilingSurface');
    h2.twinId = edgeTo(m2, c2, 'RoofSurface').twinId; // twin that does not point back
    expect(degenerate(m2)).toContain(c2);
  });
});
