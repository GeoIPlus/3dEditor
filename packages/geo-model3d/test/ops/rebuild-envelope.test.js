// REBUILD_ENVELOPE (3D-14; spec §10.3 Accept 2; v0.2 §11.4), the constraint step (D-213) and the body rule
// (D-218). Expected numbers are analytic.
import { describe, expect, it } from 'vitest';
import { run, command, gableModel, replaceRoof, metrics, withFootprint } from './helpers.js';

/** @param {any} model @param {any} payload @param {Record<string, any>} [over] */
const rebuild = (model, payload = {}, over) => run(model, command(model, 'REBUILD_ENVELOPE', payload, over));
/** A model with a flat roof at 5 over 10 x 8, base 0 (committed GT-01 operation). */
const flatModel = () => replaceRoof(gableModel(), { template: 'FLAT', roofZ: 5 }).model;
const near = (/** @type {number} */ a, /** @type {number} */ b) => expect(Math.abs(a - b)).toBeLessThanOrEqual(0.01);

describe('REBUILD_ENVELOPE (spec §10.3 Accept 2)', () => {
  it('10 x 8, base 0, flat roof at 5: four wall strips, GroundSurface 80 m2, closed solid, 400 m3', () => {
    const before = flatModel();
    const out = rebuild(before);
    expect(out.result.status).toBe('COMMITTED');
    const m = metrics(out.model);
    expect(m.walls).toBe(4);
    near(m.groundAreaM2, 80); near(m.volumeM3, 400);
    expect(Object.values(out.model.shells).every((s) => s.isClosed)).toBe(true);
    expect(out.model.state).toBe('VALID_SOLID');
    for (const f of Object.values(out.model.faces)) {
      if (f.surfaceKind === 'WallSurface') expect(Math.abs(f.supportPlane.normal[2])).toBe(0); // vertical strips
    }
  });
  it('keeps the roof faces and their ids; nothing is mapped', () => {
    const before = flatModel();
    const out = rebuild(before, { baseZ: -1 });
    const roofs = (/** @type {any} */ m) => Object.values(m.faces).filter((f) => /** @type {any} */ (f).surfaceKind === 'RoofSurface').map((f) => /** @type {any} */ (f).id).sort();
    expect(roofs(out.model)).toEqual(roofs(before));
    expect(out.result.topologyLineage.mapped).toEqual({});
    near(metrics(out.model).volumeM3, 480);
    expect(out.model.footprints['fp-1'].baseElevationM).toBe(-1);
  });
  it('under the GT-03 gable, base -1: 600 m3 and roof 100 m2 (the GT-15 numbers, cross-check)', () => {
    const gable = replaceRoof(gableModel(), { template: 'GABLE', ridgeAxis: 'LOCAL_X', eaveZ: 5, ridgeZ: 8, symmetric: true }).model;
    const m = metrics(rebuild(gable, { baseZ: -1 }).model);
    near(m.volumeM3, 600); near(m.roofAreaM2, 100);
  });
  it('roof not on the footprint outline (gap or overhang), base above the roof -> INVALID_GEOMETRY (D-214)', () => {
    const m = flatModel();
    m.footprints['fp-1'].outerRing = [[0, 0], [9, 0], [9, 8], [0, 8]];
    const out = rebuild(m);
    expect(out.result.error.code).toBe('INVALID_GEOMETRY');
    expect(out.result.error.entityIds[0]).toBe('fp-1');
    expect(rebuild(flatModel(), { baseZ: 5 }).result.error.code).toBe('INVALID_GEOMETRY');
  });
  it('a second building footprint -> INVALID_TOPOLOGY (D-218)', () => {
    const m = flatModel();
    m.footprints['fp-2'] = { ...m.footprints['fp-1'], id: 'fp-2' };
    expect(rebuild(m).result.error.code).toBe('INVALID_TOPOLOGY');
  });
});

describe('body of the footprint (D-218)', () => {
  it('a Building node with two solids -> INVALID_TOPOLOGY naming footprint and node', () => {
    const m = gableModel();
    m.solids['so-2'] = { id: 'so-2', outerShellId: 'sh-1', voidShellIds: [] };
    m.semantics['sem-bld'].solidIds.push('so-2');
    const out = replaceRoof(m, { template: 'FLAT', roofZ: 5 });
    expect(out.result.error.code).toBe('INVALID_TOPOLOGY');
    expect(out.result.error.entityIds).toEqual(['fp-1', 'sem-bld']);
  });
});

describe('constraints on removed and kept entities (D-213; spec §3 r5)', () => {
  const FLAT = { template: 'FLAT', roofZ: 5 };
  it('a hard FIXED_RIDGE on the old ridge -> CONSTRAINT_CONFLICT naming the constraint, model unchanged', () => {
    const m = gableModel();
    m.constraints['c-1'] = { id: 'c-1', kind: 'FIXED_RIDGE', entityIds: ['he-f-roof-s-2'], hard: true };
    const out = replaceRoof(m, FLAT);
    expect(out.result.error.code).toBe('CONSTRAINT_CONFLICT');
    expect(out.result.error.entityIds).toEqual(['c-1']);
    expect(out.model).toBe(m);
  });
  it('a soft constraint on a removed face is dropped in the same commit', () => {
    const m = gableModel();
    m.constraints['c-2'] = { id: 'c-2', kind: 'SYMMETRY', entityIds: ['f-roof-s', 'f-roof-n'], hard: false, weight: 1 };
    const out = replaceRoof(m, FLAT);
    expect(out.result.status).toBe('COMMITTED');
    expect(out.model.constraints['c-2']).toBeUndefined();
    expect(out.result.patch.deleted).toContainEqual({ type: 'Constraint', id: 'c-2' });
  });
  it('a hard FIXED_POINT on a kept base vertex is re-checked at the result', () => {
    const m = gableModel();
    m.constraints['c-3'] = { id: 'c-3', kind: 'FIXED_POINT', entityIds: ['v-b0'], hard: true, target: [0, 0, 0] };
    expect(replaceRoof(m, FLAT).result.status).toBe('COMMITTED');
    m.constraints['c-3'].target = [0, 0, 1];
    const out = replaceRoof(m, FLAT);
    expect(out.result.error.code).toBe('CONSTRAINT_CONFLICT');
    expect(out.result.error.entityIds).toContain('c-3');
  });
});

describe('roof components (v0.3 §4.2)', () => {
  it('new roof faces join the component of the replaced roof; the component id stays', () => {
    const out = replaceRoof(withFootprint([[0, 0], [10, 0], [10, 8], [0, 8]]), { template: 'HIP', ridgeAxis: 'LOCAL_X', eaveZ: 5, slopesDeg: [30, 40, 30, 40] });
    const rc = out.model.roofComponents['rc-1'];
    const roofs = Object.values(out.model.faces).filter((f) => f.surfaceKind === 'RoofSurface');
    expect([...rc.faceIds].sort()).toEqual(roofs.map((f) => f.id).sort());
    for (const f of roofs) expect(f.roofComponentId).toBe('rc-1');
  });
});
