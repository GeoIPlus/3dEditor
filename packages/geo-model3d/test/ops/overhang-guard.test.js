// 3D-120 (D-3D118-3, D-341): until 3D-115, a command that changes the plane of a roof face with an overhang strip is
// refused atomically (INVALID_TOPOLOGY), model unchanged. GT-03 gable (GT-14 input) with SET_OVERHANG 0.6 m on the
// south eave; one case per roof-plane-changing operation of 3D-15, 3D-16, 3D-17. The north slope has no overhang, so
// the same edits there still commit.
import { describe, expect, it } from 'vitest';
import { deepFreeze, readFixture } from '../brep/helpers.js';
import { gable, exec, sound } from './envelope.helpers.js';
import { plane } from './core-edits.helpers.js';
import { PROFILE } from './helpers.js';

const S = 'he-f-roof-s-0';
const withOverhang = (/** @type {any} */ m = gable(), eave = S) => {
  const out = exec(m, 'SET_OVERHANG', { eaveEdgeIds: [eave], overhangM: 0.6 });
  expect(out.result.status).toBe('COMMITTED');
  return deepFreeze(out.model);
};
/** Largest distance of an overhang strip's vertices from the plane of the roof face across its edges. @param {any} m */
function stripOff(m) {
  let d = 0;
  for (const h of /** @type {any[]} */ (Object.values(m.halfEdges))) {
    const s = m.faces[h.faceId];
    if (s.surfaceKind !== 'RoofSurface' || !s.tags.includes('OVERHANG')) continue;
    const p = m.faces[m.halfEdges[h.twinId].faceId];
    if (p.surfaceKind !== 'RoofSurface' || p.tags.includes('OVERHANG')) continue;
    for (const g of /** @type {any[]} */ (Object.values(m.halfEdges))) {
      if (g.faceId !== s.id) continue;
      const q = m.vertices[g.startVertexId].p, n = p.supportPlane.normal;
      d = Math.max(d, Math.abs(n[0] * q[0] + n[1] * q[1] + n[2] * q[2] + p.supportPlane.d));
    }
  }
  return d;
}
/** @param {any} m @param {any} out */
function refused(m, out) {
  expect(out.result.status).toBe('REJECTED');
  expect(out.result.error.code).toBe('INVALID_TOPOLOGY');
  expect(out.model).toBe(m);
}

/** [operation, payload] that change the south roof plane (3D-15, 3D-16) */
const SOUTH = /** @type {[string, any][]} */ ([
  ['ALIGN_RIDGE', { edgeId: 'he-f-roof-s-2', mode: 'KEEP_EAVES', targetLine: [[0, 4, 8.5], [10, 4, 8.5]] }],
  ['MATCH_ELEVATIONS', { vertexIds: ['v-r0', 'v-r1'], targetZ: 8.4 }],
  ['ALIGN_EAVE', { edgeId: S, mode: 'KEEP_RIDGE', targetLine: [[0, 0, 4.8], [10, 0, 4.8]] }],
  ['MOVE_VERTEX', { vertexId: 'v-r0', targetPoint: [0, 4, 8.5], movableFaceIds: ['f-roof-s', 'f-roof-n'] }],
  ['MOVE_EDGE', { edgeId: 'he-f-roof-s-2', targetLine: [[0, 4, 8.5], [10, 4, 8.5]], movableFaceIds: ['f-roof-s', 'f-roof-n'] }],
  ['OFFSET_FACE', { faceId: 'f-roof-s', offsetM: 0.1, fixedMode: 'NONE' }],
]);

describe('3D-120: an edit that moves a slope with an overhang is refused until 3D-115', () => {
  for (const [op, payload] of SOUTH) {
    it(`${op} ${payload.mode ?? payload.fixedMode ?? ''} on the south slope -> INVALID_TOPOLOGY, model unchanged`, () => {
      const m = withOverhang();
      const out = exec(m, op, payload);
      refused(m, out);
      expect(out.result.error.entityIds).toContain('f-roof-s');
    });
  }

  it('the same kind of edit on the north slope (no overhang) still commits, the strip stays coplanar', () => {
    const m = withOverhang();
    for (const [op, payload] of /** @type {[string, any][]} */ ([
      ['OFFSET_FACE', { faceId: 'f-roof-n', offsetM: 0.1, fixedMode: 'NONE' }],
      ['ALIGN_EAVE', { edgeId: 'he-f-roof-n-0', mode: 'KEEP_RIDGE', targetLine: [[10, 8, 4.8], [0, 8, 4.8]] }],
    ])) {
      const out = exec(m, op, payload);
      expect(out.result.status).toBe('COMMITTED');
      expect(stripOff(out.model)).toBeLessThanOrEqual(PROFILE.planarTolM);
    }
  });

  it('SET_HEIGHT EAVE rebuilds its own overhang (D-338) and is not refused', () => {
    const m = withOverhang();
    const out = exec(m, 'SET_HEIGHT', { kind: 'EAVE', eaveEdgeId: S, z: 5.5 });
    expect(out.result.status).toBe('COMMITTED');
    expect(stripOff(out.model)).toBeLessThanOrEqual(PROFILE.planarTolM);
    sound(out.model);
  });

  it('INSERT_ROOF_BREAK (3D-15): the eave part moves -> refused; the ridge part moves -> commits, strip coplanar', () => {
    const m = withOverhang(readFixture('GT-08', 'input.model.json'));
    const line = [[0, 2, 6.5], [10, 2, 6.5]];
    const lower = exec(m, 'INSERT_ROOF_BREAK', { faceId: 'f-roof-s', breakLine: line, newPlane: plane([0, -1, 1], [0, 2, 6.5]), movingSidePoint: [5, 1, 5.75] });
    refused(m, lower);
    const upper = exec(m, 'INSERT_ROOF_BREAK', { faceId: 'f-roof-s', breakLine: line, newPlane: plane([0, -1.1, 1], [0, 2, 6.5]), movingSidePoint: [5, 3, 7.25] });
    expect(upper.result.status).toBe('COMMITTED');
    expect(stripOff(upper.model)).toBeLessThanOrEqual(PROFILE.planarTolM);
  });

  it('MERGE_FACES MERGE_REFIT (3D-15) of the split slope keeps its plane and commits, strip coplanar', () => {
    const m = withOverhang(readFixture('GT-08', 'input.model.json'));
    const s = exec(m, 'SPLIT_FACE', { faceId: 'f-roof-s', splitLine: [[5, 0, 5], [5, 4, 8]] });
    expect(s.result.status).toBe('COMMITTED');
    const out = exec(s.model, 'MERGE_FACES', { faceIds: ['f-roof-s', 'f-1'], mode: 'MERGE_REFIT', movableFaceIds: ['f-roof-s'] });
    expect(out.result.status).toBe('COMMITTED');
    expect(stripOff(out.model)).toBeLessThanOrEqual(PROFILE.planarTolM);
  });

  it('FIT_TO_SHARED_EDGE (3D-17) on GT-06 with a north overhang: the fit stays within planarTolM of the strip', () => {
    const m = withOverhang(readFixture('GT-06', 'input.model.json'), 'he-f-roof-n-0');
    const out = exec(m, 'FIT_TO_SHARED_EDGE', { edgeIds: ['he-f-roof-s-2', 'he-f-roof-n-2'], leadingFaceId: 'f-roof-s', maxDisplacementM: 0.05, movableFaceIds: ['f-roof-n'] });
    expect(out.result.status).toBe('COMMITTED');
    expect(stripOff(out.model)).toBeLessThanOrEqual(PROFILE.planarTolM);
  });

  it('PREVIEW is refused the same way', () => {
    const m = withOverhang();
    const [op, payload] = SOUTH[0];
    refused(m, exec(m, op, payload, {}, { phase: 'PREVIEW' }));
  });
});
