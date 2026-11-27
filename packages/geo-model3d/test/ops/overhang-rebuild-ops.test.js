// 3D-124 (D-384, D-385): the rebuild for 3D-17, 3D-71, 3D-105, 3D-114, 3D-126 and the envelope / installation
// operations, payloads naming dependent entities (D-385), constraints on dependent entities checked after the rebuild.
// GT-03 (or the row's own fixture) with a 0.6 m overhang.
import { describe, expect, it } from 'vitest';
import { readFixture, deepFreeze } from '../brep/helpers.js';
import { exec, sameGeometry } from './envelope.helpers.js';
import { run, command } from './helpers.js';
import { overhangsOf } from '../../src/ops/dependents.js';
import { withOverhang, follows, refusedUnchanged, overhangIds, S, N, WIDTH } from './overhang-rebuild.helpers.js';

const points = Float64Array.from(readFixture('GT-20', 'input.points.json').points.flat()).map((c, i) => (i % 3 === 2 ? c + 0.3 : c));
const FIT = { selection: { kind: 'BOX', min: [0, 0, 2], max: [10, 4, 11.5] }, apply: 'FACE_PLANE', faceId: 'f-roof-s' };
/** @param {any} m @param {any} c */
const withConstraint = (m, c) => { const x = structuredClone(m); x.constraints[c.id] = c; return deepFreeze(x); };
const stripOf = (/** @type {any} */ m) => /** @type {any} */ (Object.values(m.faces)).find((/** @type {any} */ f) => f.surfaceKind === 'RoofSurface' && f.tags.includes('OVERHANG')).id;

describe('3D-124: rebuild after the operations of other rows', () => {
  it('FIT_TO_SHARED_EDGE (3D-17) on GT-06 with a north overhang', () => {
    const m = withOverhang([N], 'GT-06');
    follows(m, exec(m, 'FIT_TO_SHARED_EDGE', { edgeIds: ['he-f-roof-s-2', 'he-f-roof-n-2'], leadingFaceId: 'f-roof-s', maxDisplacementM: 0.05, movableFaceIds: ['f-roof-n'] }));
  });

  it('REMOVE_FACE (3D-17) of the other slope keeps the overhang ids (DRAFT_SOLID)', () => {
    const m = withOverhang();
    const hole = exec(m, 'REMOVE_FACE', { faceId: 'f-roof-n' }, {}, { targetState: 'DRAFT_SOLID' });
    expect(hole.result.status).toBe('COMMITTED');
    expect(overhangIds(hole.model)).toEqual(overhangIds(m));
  });

  it('TRIM_FACE (3D-105) on GT-26', () => {
    const m = withOverhang([S], 'GT-26');
    follows(m, exec(m, 'TRIM_FACE', { faceId: 'f-roof-s', cuttingFaceId: 'f-roof-n', keepPoint: [5, 2, 6.5] }));
  });

  it('EXTEND_FACE (3D-105) on GT-28', () => {
    const m = withOverhang([S], 'GT-28');
    const edgeId = readFixture('GT-28', 'steps.json')[0].command.payload.edgeId;
    follows(m, exec(m, 'EXTEND_FACE', { faceId: 'f-roof-s', edgeId, targetFaceId: 'f-roof-n' }));
  });

  it('FIT_PLANE (3D-71) on GT-20: the same result as SET_OVERHANG on the fitted roof, width exact at both corners (D-3D131-1)', () => {
    const m = withOverhang([S], 'GT-20');
    const out = run(m, command(m, 'FIT_PLANE', FIT), { points });
    // the fitted eave is horizontal within zAlignTolM only (before 3D-131 the width at oB was off by 1.1e-4 m)
    const f = overhangsOf(out.model)[0].f;
    expect(Math.abs(out.model.vertices[f.oA].p[2] - out.model.vertices[f.oB].p[2])).toBeGreaterThan(1e-6);
    follows(m, out);
    const plain = readFixture('GT-20', 'input.model.json');
    const fitted = run(plain, command(plain, 'FIT_PLANE', FIT), { points }).model;
    sameGeometry(out.model, exec(fitted, 'SET_OVERHANG', { eaveEdgeIds: [S], overhangM: WIDTH }).model);
  });

  it('ALIGN_WALL (3D-114) on the eave wall and on an end wall rebuilds by itself (width in plan from the new wall)', () => {
    const m = withOverhang();
    follows(m, exec(m, 'ALIGN_WALL', { faceId: 'f-wall-s', referenceLine: [[0, -1], [10, -1]] }));
    follows(m, exec(m, 'ALIGN_WALL', { faceId: 'f-wall-e', referenceLine: [[10, 0], [10.28, 8]] }));
  });

  it('RESIZE_ROOF (3D-114) with the outline at the current overhang keeps it', () => {
    const m = withOverhang();
    follows(m, exec(m, 'RESIZE_ROOF', { roofOutline: [[0, -WIDTH], [10, -WIDTH], [10, 8], [0, 8]], moveWallFootprint: false }));
  });

  it('REGULARIZE_FOOTPRINT (3D-126) orthogonalize after an end-wall tilt', () => {
    const m = withOverhang();
    const tilted = exec(m, 'ALIGN_WALL', { faceId: 'f-wall-e', referenceLine: [[10, 0], [10.28, 8]] }).model;
    follows(tilted, exec(tilted, 'REGULARIZE_FOOTPRINT', { footprintId: 'fp-1', allowCourtyardRemoval: false, orthogonalize: true }));
  });

  it('SET_HEIGHT EAVE / BASE (3D-19) are not detached twice and keep the overhang', () => {
    const m = withOverhang();
    follows(m, exec(m, 'SET_HEIGHT', { kind: 'EAVE', eaveEdgeId: N, z: 5.5 }));
    follows(m, exec(m, 'SET_HEIGHT', { kind: 'BASE', z: 0.5 }));
  });

  it('REBUILD_ENVELOPE and ADD_CHIMNEY keep the overhang', () => {
    const m = withOverhang();
    follows(m, exec(m, 'REBUILD_ENVELOPE', {}));
    follows(m, exec(m, 'ADD_CHIMNEY', { roofFaceId: 'f-roof-s', center: [3, 2, 6.5], widthM: 2, depthM: 0.5, heightAboveRoofM: 1.5 }));
  });
});

describe('3D-124: dependent entities in payloads and constraints', () => {
  it('D-385: a payload naming the strip is INVALID_PAYLOAD, except for SET_OVERHANG', () => {
    const m = withOverhang();
    const strip = stripOf(m);
    for (const [op, p] of /** @type {[string, any][]} */ ([
      ['OFFSET_FACE', { faceId: strip, offsetM: 0.1, fixedMode: 'NONE' }],
      ['SET_CONSTRAINT', { constraint: { id: 'c-1', kind: 'FIXED_PLANE', entityIds: [strip], hard: true } }],
      ['SET_SEMANTICS', { faceIds: [strip], surfaceKind: 'WallSurface' }],
    ])) {
      const out = exec(m, op, p);
      refusedUnchanged(m, out, ['INVALID_PAYLOAD']);
      expect(out.result.error.entityIds).toEqual([strip]);
    }
    expect(exec(m, 'SET_OVERHANG', { eaveEdgeIds: [S], overhangM: 0.8 }).result.status).toBe('COMMITTED');
  });

  it('a hard FIXED_POINT on an outer corner holds when the slope stays, conflicts when it moves', () => {
    const base = withOverhang();
    const oA = overhangIds(base).find((id) => base.vertices[id] && base.vertices[id].p[1] < 0);
    const m = withConstraint(base, { id: 'c-oa', kind: 'FIXED_POINT', entityIds: [oA], hard: true });
    follows(m, exec(m, 'OFFSET_FACE', { faceId: 'f-roof-n', offsetM: 0.1, fixedMode: 'NONE' }));
    const out = exec(m, 'ALIGN_RIDGE', { edgeId: 'he-f-roof-s-2', mode: 'KEEP_EAVES', targetLine: [[0, 4, 8.5], [10, 4, 8.5]] });
    refusedUnchanged(m, out, ['CONSTRAINT_CONFLICT']);
  });

  it('a soft constraint on the strip sits out the solve and is kept', () => {
    const base = withOverhang();
    const m = withConstraint(base, { id: 'c-soft', kind: 'MINIMIZE_DISPLACEMENT', entityIds: [stripOf(base)], hard: false, weight: 1 });
    const out = exec(m, 'ALIGN_RIDGE', { edgeId: 'he-f-roof-s-2', mode: 'KEEP_EAVES', targetLine: [[0, 4, 8.5], [10, 4, 8.5]] });
    follows(m, out);
    expect(out.model.constraints['c-soft']).toEqual(m.constraints['c-soft']);
  });
});
