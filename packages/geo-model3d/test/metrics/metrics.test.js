// computeMetrics (3D-116; D-3D116-1): MET-01..MET-24 of the owner's list. Expected values are analytic (v0.3 §12,
// D-336) or computed independently from vertex coordinates (test/ops/helpers.js), never by the kernel.
import { describe, expect, it } from 'vitest';
import { canonicalJson } from '@geoiplus/geo-model3d';
import { deepFreeze, readFixture } from '../brep/helpers.js';
import { replaceRoof, withFootprint, faceArea } from '../ops/helpers.js';
import { components } from '../../src/metrics/overhang.js';
import { mainBody } from '../../src/metrics/body.js';
import { saveModel, loadModel } from '../../src/brep/index.js';
import { metricsOf, withOverhang, gableModel, EAVE, run, command, wedge, reference, TOL, rigid, rotation, NAMES, expectSameMetrics } from './helpers.js';

const near = (/** @type {number} */ a, /** @type {number} */ b, tol = 0.01) => expect(Math.abs(a - b)).toBeLessThanOrEqual(tol);
/** Every area and the total volume equal the independent reference. @param {any} m */
function matchesReference(m) {
  const r = metricsOf(m), ref = reference(m);
  for (const [k, v] of Object.entries(ref)) near(r[k], v, k.endsWith('M3') ? TOL.volumeM3 : TOL.areaM2);
  return r;
}
const gt14 = () => withOverhang(gableModel(), [EAVE.s, EAVE.n], 0.5);
const commit = (/** @type {any} */ m, /** @type {string} */ op, /** @type {any} */ p, over = {}) => {
  const out = run(m, command(m, op, p, over));
  expect(out.result.status).toBe('COMMITTED');
  return out.model;
};

describe('computeMetrics: areas and volumes (MET-01..MET-07)', () => {
  it('MET-01: GT-03 - footprint 80, roof plan 80, roof 100, no overhang, 520 m3 FINAL', () => {
    const r = matchesReference(gableModel());
    expect(r).toMatchObject({ basis: 'GEOMETRIC', units: { area: 'm2', volume: 'm3' }, state: 'VALID_SOLID', volumeStatus: 'FINAL' });
    near(r.footprintAreaM2, 80); near(r.roofPlanAreaM2, 80); near(r.roofSurfaceAreaM2, 100);
    expect([r.overhangRoofAreaM2, r.soffitAreaM2, r.overhangVolumeM3]).toEqual([0, 0, 0]);
    near(r.mainVolumeM3, 520); near(r.geometricSolidVolumeM3, 520);
  });

  it('MET-02: GT-14 - the D-336 reference 80 / 90 / 112.5 / 12.5 / 10 m2, 520 / 1.875 / 521.875 m3', () => {
    const r = matchesReference(gt14());
    near(r.footprintAreaM2, 80); near(r.roofPlanAreaM2, 90); near(r.roofSurfaceAreaM2, 112.5);
    near(r.overhangRoofAreaM2, 12.5); near(r.soffitAreaM2, 10);
    near(r.mainVolumeM3, 520); near(r.overhangVolumeM3, 1.875); near(r.geometricSolidVolumeM3, 521.875);
    expect(r.volumeStatus).toBe('PROVISIONAL');
  });

  it('MET-03: a building without overhangs reports overhang roof, soffit and volume 0 (not null)', () => {
    const r = metricsOf(gableModel());
    expect([r.overhangRoofAreaM2, r.soffitAreaM2, r.overhangVolumeM3]).toEqual([0, 0, 0]);
    expect(r.mainVolumeM3).toBe(r.geometricSolidVolumeM3);
  });

  it('MET-04: each overhang group holds its two end caps; without them the group is not closed', () => {
    const m = gt14(), groups = components(mainBody(m), new Set(Object.keys(m.faces).filter((f) => m.faces[f].tags.includes('OVERHANG'))));
    expect(groups.map((g) => [...g].map((f) => m.faces[f].surfaceKind).sort())).toEqual([0, 1].map(() => ['OuterCeilingSurface', 'RoofSurface', 'WallSurface', 'WallSurface']));
    const noCaps = structuredClone(m);
    for (const f of Object.values(noCaps.faces)) if (f.surfaceKind === 'WallSurface') f.tags = f.tags.filter((t) => t !== 'OVERHANG');
    const r = metricsOf(noCaps);
    expect([r.mainVolumeM3, r.overhangVolumeM3]).toEqual([null, null]);
    near(r.geometricSolidVolumeM3, 521.875);
  });

  it('MET-05: overlapping roof projections count once (GT-26 input: S1 overshoots the ridge to y = 4.5)', () => {
    const m = readFixture('GT-26', 'input.model.json'), r = metricsOf(m);
    expect(reference(m).roofPlanAreaM2).toBeGreaterThan(84);
    near(r.roofPlanAreaM2, 80);
  });

  it('MET-06, MET-07: footprint and flat roof with an inner contour (courtyard 10 x 8 minus 2 x 2)', () => {
    const out = replaceRoof(withFootprint([[0, 0], [10, 0], [10, 8], [0, 8]], [[[3, 3], [5, 3], [5, 5], [3, 5]]]), { template: 'FLAT', roofZ: 5 });
    const roof = Object.values(out.model.faces).find((/** @type {any} */ f) => f.surfaceKind === 'RoofSurface');
    expect(/** @type {any} */ (roof).innerLoopIds.length).toBe(1);
    const r = matchesReference(out.model);
    near(r.footprintAreaM2, 76); near(r.roofPlanAreaM2, 76); near(r.roofSurfaceAreaM2, 76); near(r.geometricSolidVolumeM3, 380);
  });
});

describe('BuildingInstallation excluded (MET-08..MET-10)', () => {
  const base = metricsOf(gableModel());
  for (const [gt, op] of [['GT-17', 'ADD_CHIMNEY'], ['GT-18', 'ADD_DORMER']]) {
    it(`MET-08, MET-09, MET-10: ${op} (${gt}) leaves all nine metrics of the building unchanged`, () => {
      const cmd = readFixture(gt, 'steps.json')[0].command;
      const m = commit(gableModel(), op, cmd.payload);
      const inst = Object.values(m.semantics).filter((/** @type {any} */ n) => n.kind === 'BuildingInstallation');
      expect(inst.length).toBe(1);
      const kinds = new Set(/** @type {any} */ (inst[0]).solidIds.flatMap((/** @type {string} */ s) => m.shells[m.solids[s].outerShellId].faceIds.map((/** @type {string} */ f) => m.faces[f].surfaceKind)));
      expect(kinds.has('RoofSurface') || kinds.has('WallSurface')).toBe(true);
      expectSameMetrics(metricsOf(m), base, 1e-9);
    });
  }

  it('MET-10: an installation shell that shares a face with the building cannot be excluded -> volumes N/A', () => {
    const m = commit(gableModel(), 'ADD_CHIMNEY', readFixture('GT-17', 'steps.json')[0].command.payload);
    const inst = /** @type {any} */ (Object.values(m.semantics).find((/** @type {any} */ n) => n.kind === 'BuildingInstallation'));
    m.shells[m.solids[inst.solidIds[0]].outerShellId].faceIds.push('f-roof-s');
    const r = metricsOf(m);
    expect([r.volumeStatus, r.geometricSolidVolumeM3]).toEqual(['NOT_AVAILABLE', null]);
  });
});

describe('editing operations and transforms (MET-11..MET-16)', () => {
  it('MET-11: TRANSLATE_BUILDING keeps every metric', () => {
    expectSameMetrics(metricsOf(commit(gt14(), 'TRANSLATE_BUILDING', { vector: [100, 50, 2] }, { targetState: 'DRAFT_SOLID' })), metricsOf(gt14()));
  });

  it('MET-12: ROTATE_BUILDING about the vertical axis keeps every metric', () => {
    expectSameMetrics(metricsOf(commit(gt14(), 'ROTATE_BUILDING', { angleDeg: 30 }, { targetState: 'DRAFT_SOLID' })), metricsOf(gt14()));
  });

  it('MET-13: an arbitrary rigid rotation keeps 3D areas and volumes; plan areas are recomputed', () => {
    const a = Math.hypot(1, 2, 3), m = rigid(gableModel(), rotation([1 / a, 2 / a, 3 / a], 17), [3, -2, 1]);
    const r = metricsOf(m), g = metricsOf(gableModel());
    for (const k of ['roofSurfaceAreaM2', 'geometricSolidVolumeM3', 'mainVolumeM3']) near(r[k], g[k], 1e-9);
    const ground = m.faces['f-ground'];
    near(r.footprintAreaM2, faceArea(m, 'f-ground') * Math.abs(ground.supportPlane.normal[2]), 1e-9);
    expect(r.footprintAreaM2).toBeLessThan(80);
  });

  it('MET-14: SET_HEIGHT EAVE on the gable - new areas and volume equal the independent computation', () => {
    const r = matchesReference(commit(gableModel(), 'SET_HEIGHT', { kind: 'EAVE', z: 4, eaveEdgeId: EAVE.s }));
    near(r.geometricSolidVolumeM3, 500); expect(r.volumeStatus).toBe('FINAL');
  });

  it('MET-15: SET_OVERHANG 1 m on both eaves - new areas, overhang 2 x wedge(1) = 7.5 m3', () => {
    const r = matchesReference(withOverhang(gableModel(), [EAVE.s, EAVE.n], 1));
    near(r.overhangVolumeM3, 2 * wedge(1)); near(r.mainVolumeM3, 520); near(r.overhangRoofAreaM2, 25); near(r.soffitAreaM2, 20);
  });

  it('MET-16: removing the overhang restores the GT-03 numbers', () => {
    const m = gt14(), r = metricsOf(commit(m, 'SET_OVERHANG', { eaveEdgeIds: [EAVE.s, EAVE.n], overhangM: 0 }, { targetState: 'DRAFT_SOLID' }));
    expectSameMetrics({ ...r, volumeStatus: 'FINAL' }, metricsOf(gableModel()), 1e-9);
  });
});

describe('contract and invariants (MET-17..MET-24)', () => {
  it('MET-17: computeMetrics does not change the model (frozen input, same canonical JSON)', () => {
    const m = deepFreeze(gt14()), before = canonicalJson(m);
    metricsOf(m);
    expect(canonicalJson(m)).toBe(before);
  });

  it('MET-18: two versions of one building give their own results', () => {
    const v1 = metricsOf(gableModel()), v2 = metricsOf(gt14());
    expect([v1.modelVersion + 1, v1.buildingId]).toEqual([v2.modelVersion, v2.buildingId]);
    expect(v2.geometricSolidVolumeM3 - v1.geometricSolidVolumeM3).toBeCloseTo(1.875, 9);
  });

  it('MET-19: far from the origin (500 km, 6000 km) the metrics equal those at the origin', () => {
    expectSameMetrics(metricsOf(rigid(gt14(), rotation([0, 0, 1], 0), [5e5, 6e6, 300])), metricsOf(gt14()), 1e-6);
  });

  it('MET-20: order of faces, shells, collections and ring start does not change the result', () => {
    const m = gt14(), s = /** @type {any} */ (structuredClone(m));
    for (const sh of Object.values(s.shells)) sh.faceIds.reverse();
    for (const k of ['faces', 'halfEdges', 'vertices']) s[k] = Object.fromEntries(Object.entries(s[k]).reverse());
    for (const f of Object.values(s.faces)) f.outerLoopId = s.halfEdges[f.outerLoopId].nextId;
    expectSameMetrics(metricsOf(s), metricsOf(m), 1e-9);
  });

  it('MET-21: small but valid faces (GT-14 end caps 0.09375 m2 < minFaceAreaM2) are counted, not filtered', () => {
    const r = metricsOf(gt14());
    expect(r.volumeStatus).toBe('PROVISIONAL');
    near(r.overhangVolumeM3, 1.875, 1e-9);
  });

  it('MET-22: save -> load -> computeMetrics gives the same result', () => {
    expect(metricsOf(loadModel(saveModel(gt14())))).toEqual(metricsOf(gt14()));
  });

  it('MET-23: the result has exactly the contract members, metrics in the D-3D116-4 order', () => {
    const r = metricsOf(gt14());
    expect(Object.keys(r)).toEqual(['schemaVersion', 'buildingId', 'modelVersion', 'state', 'basis', 'units', ...NAMES]);
  });

  it('MET-24: total = main + overhang wherever the split is given', () => {
    for (const m of [gableModel(), gt14(), withOverhang(gableModel(), [EAVE.s], 0.5), withOverhang(gableModel(), [EAVE.s, EAVE.n], 1)]) {
      const r = metricsOf(m);
      near(r.mainVolumeM3 + r.overhangVolumeM3, r.geometricSolidVolumeM3, 1e-9);
    }
  });
});
