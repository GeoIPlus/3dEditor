// 3D-124 (D-384, 3D-ADR-0010 B1): the pipeline takes every overhang off before the operation and rebuilds it after
// the solve - strip on the new roof plane, the same width in plan, soffit and caps rebuilt, ids kept, VALID_SOLID,
// no delete / create of kept ids. GT-03 with a 0.6 m overhang on the south eave; one case per roof-plane-changing
// operation of 3D-16 (ALIGN_RIDGE, ALIGN_EAVE, MATCH_ELEVATIONS) and 3D-15; refusals leave the model unchanged.
import { describe, expect, it } from 'vitest';
import { exec, inverseRestores } from './envelope.helpers.js';
import { plane } from './core-edits.helpers.js';
import { withOverhang, follows, refusedUnchanged, overhangIds, S, N } from './overhang-rebuild.helpers.js';

/** [name, operation, payload] that change the south roof plane */
const SOUTH = /** @type {[string, string, any][]} */ ([
  ['ALIGN_RIDGE KEEP_EAVES', 'ALIGN_RIDGE', { edgeId: 'he-f-roof-s-2', mode: 'KEEP_EAVES', targetLine: [[0, 4, 8.5], [10, 4, 8.5]] }],
  ['ALIGN_EAVE KEEP_RIDGE', 'ALIGN_EAVE', { edgeId: S, mode: 'KEEP_RIDGE', targetLine: [[0, 0, 4.8], [10, 0, 4.8]] }],
  ['MATCH_ELEVATIONS ridge', 'MATCH_ELEVATIONS', { vertexIds: ['v-r0', 'v-r1'], targetZ: 8.4 }],
  ['MATCH_ELEVATIONS eave (EXPLICIT under the overhang)', 'MATCH_ELEVATIONS', { vertexIds: ['v-e0', 'v-e1'], targetZ: 5.3 }],
  ['MOVE_EDGE ridge', 'MOVE_EDGE', { edgeId: 'he-f-roof-s-2', targetLine: [[0, 4, 8.5], [10, 4, 8.5]], movableFaceIds: ['f-roof-s', 'f-roof-n'] }],
  ['OFFSET_FACE south', 'OFFSET_FACE', { faceId: 'f-roof-s', offsetM: 0.1, fixedMode: 'NONE' }],
  ['INSERT_ROOF_BREAK eave part', 'INSERT_ROOF_BREAK', { faceId: 'f-roof-s', breakLine: [[0, 2, 6.5], [10, 2, 6.5]], newPlane: plane([0, -1, 1], [0, 2, 6.5]), movingSidePoint: [5, 1, 5.75] }],
  ['INSERT_ROOF_BREAK ridge part', 'INSERT_ROOF_BREAK', { faceId: 'f-roof-s', breakLine: [[0, 2, 6.5], [10, 2, 6.5]], newPlane: plane([0, -1.1, 1], [0, 2, 6.5]), movingSidePoint: [5, 3, 7.25] }],
  ['SPLIT_FACE along the eave', 'SPLIT_FACE', { faceId: 'f-roof-s', splitLine: [[0, 2, 6.5], [10, 2, 6.5]] }],
  ['TRANSLATE_BUILDING', 'TRANSLATE_BUILDING', { vector: [1, 2, 3] }],
  ['ROTATE_BUILDING', 'ROTATE_BUILDING', { angleDeg: 90 }],
]);

describe('3D-124: an edit that moves a slope with an overhang rebuilds the overhang', () => {
  for (const [name, op, payload] of SOUTH) {
    it(`${name}: overhang follows, ids kept, PREVIEW = COMMIT`, () => {
      const m = withOverhang();
      const out = exec(m, op, payload);
      follows(m, out);
      expect(exec(m, op, payload, {}, { phase: 'PREVIEW' }).result.patch).toEqual(out.result.patch);
    });
  }

  it('the slope is actually moved: ALIGN_RIDGE takes the strip to the new plane, outer edge lower', () => {
    const m = withOverhang();
    const out = exec(m, SOUTH[0][1], SOUTH[0][2]);
    expect(out.model.faces['f-roof-s'].supportPlane).not.toEqual(m.faces['f-roof-s'].supportPlane);
    const oA = overhangIds(m).find((id) => m.vertices[id] && m.vertices[id].definingFaceIds.length === 3 && m.vertices[id].p[1] < 0);
    expect(oA).toBeDefined();
    expect(out.model.vertices[/** @type {string} */ (oA)].p[1]).toBeCloseTo(-0.6, 9);
  });

  it('both eaves with an overhang: ALIGN_RIDGE rebuilds both', () => {
    const m = withOverhang([S, N]);
    follows(m, exec(m, SOUTH[0][1], SOUTH[0][2]));
  });

  it('an edit that leaves the overhang alone puts no overhang entity in the patch', () => {
    const m = withOverhang();
    const out = exec(m, 'OFFSET_FACE', { faceId: 'f-roof-n', offsetM: 0.1, fixedMode: 'NONE' });
    follows(m, out);
    const ids = new Set(overhangIds(m));
    expect(out.result.patch.updated.filter((/** @type {any} */ c) => ids.has(c.entity.id))).toEqual([]);
  });

  it('MOVE_VERTEX of one ridge end tilts the eave -> INVALID_GEOMETRY (D-336 V1), model unchanged', () => {
    const m = withOverhang();
    refusedUnchanged(m, exec(m, 'MOVE_VERTEX', { vertexId: 'v-r0', targetPoint: [0, 4, 8.5], movableFaceIds: ['f-roof-s', 'f-roof-n'] }), ['INVALID_GEOMETRY']);
  });

  it('SPLIT_FACE across the eave splits the structural eave -> INVALID_TOPOLOGY (no re-parenting), model unchanged', () => {
    const m = withOverhang();
    const out = exec(m, 'SPLIT_FACE', { faceId: 'f-roof-s', splitLine: [[5, 0, 5], [5, 4, 8]] });
    refusedUnchanged(m, out, ['INVALID_TOPOLOGY']);
    expect(out.result.error.entityIds).toContain(S);
  });

  it('a refusal in PREVIEW is the same', () => {
    const m = withOverhang();
    const p = { vertexId: 'v-r0', targetPoint: [0, 4, 8.5], movableFaceIds: ['f-roof-s', 'f-roof-n'] };
    expect(exec(m, 'MOVE_VERTEX', p, {}, { phase: 'PREVIEW' }).result.error).toEqual(exec(m, 'MOVE_VERTEX', p).result.error);
  });

  it('the inverse patch restores the input', () => {
    const m = withOverhang();
    const out = exec(m, SOUTH[0][1], SOUTH[0][2]);
    inverseRestores(m, out);
  });
});
