// Overhang volume (3D-116; D-3D116-3): OVM-01..OVM-06, OVM-16..OVM-24, OVM-28..OVM-30 of the owner's list - golden
// values, editing operations, transforms, lifecycle. Expected volumes are analytic: wedge(w) = w x (3w/4) / 2 x 10.
import { describe, expect, it } from 'vitest';
import { canonicalJson } from '@geoiplus/geo-model3d';
import { deepFreeze, readFixture } from '../brep/helpers.js';
import { volume } from '../ops/helpers.js';
import { mainBody } from '../../src/metrics/body.js';
import { overhangVolume } from '../../src/metrics/overhang.js';
import { saveModel, loadModel } from '../../src/brep/index.js';
import { envelopeRun } from '../golden/envelope.golden.helpers.js';
import { metricsOf, withOverhang, gableModel, EAVE, run, command, wedge, rigid, rotation, expectSameMetrics, PROFILE } from './helpers.js';

const eps = PROFILE.numericEpsilon;
const near = (/** @type {number} */ a, /** @type {number} */ b, tol = 1e-9) => expect(Math.abs(a - b)).toBeLessThanOrEqual(tol);
const gt14 = () => withOverhang(gableModel(), [EAVE.s, EAVE.n], 0.5);
const groupsOf = (/** @type {any} */ m) => overhangVolume(mainBody(m), eps);
const draft = (/** @type {any} */ m, /** @type {string} */ op, /** @type {any} */ p) => {
  const out = run(m, command(m, op, p, { targetState: 'DRAFT_SOLID' }));
  expect(out.result.status).toBe('COMMITTED');
  return out.model;
};
/** Total volume from vertex coordinates only (test/ops/helpers.js). @param {any} m */
const helperTotal = (m) => volume(m, /** @type {any} */ (Object.values(m.shells)[0]).faceIds);

describe('golden values (OVM-01..OVM-06)', () => {
  it('OVM-01: GT-03 without overhangs -> main 520, overhang 0, total 520', () => {
    const r = metricsOf(gableModel());
    expect([r.mainVolumeM3, r.overhangVolumeM3, r.geometricSolidVolumeM3]).toEqual([520, 0, 520]);
  });

  it('OVM-02, OVM-03: GT-14 has two independent groups of 0.9375 m3 each (10 x 0.5 x 0.375 / 2)', () => {
    const g = groupsOf(gt14());
    expect(g.groups.length).toBe(2);
    for (const v of g.groups) near(v, wedge(0.5));
    near(wedge(0.5), 0.9375, 0);
  });

  it('OVM-04: GT-14 totals 1.875 / 520 / 521.875; the total equals the independent divergence sum', () => {
    const m = gt14(), r = metricsOf(m);
    near(r.overhangVolumeM3, 1.875); near(r.mainVolumeM3, 520); near(r.geometricSolidVolumeM3, 521.875);
    near(r.geometricSolidVolumeM3, helperTotal(m));
  });

  it('OVM-05: one-sided overhang -> one group, wedge(0.5)', () => {
    const m = withOverhang(gableModel(), [EAVE.s], 0.5), r = metricsOf(m);
    expect(groupsOf(m).groups.length).toBe(1);
    near(r.overhangVolumeM3, wedge(0.5)); near(r.mainVolumeM3, 520); near(r.geometricSolidVolumeM3, helperTotal(m));
  });

  it('OVM-06: different widths on opposite eaves (0.5 south, 1 north) -> groups wedge(0.5) and wedge(1)', () => {
    const m = withOverhang(withOverhang(gableModel(), [EAVE.s], 0.5), [EAVE.n], 1);
    expect(groupsOf(m).groups.map((v) => Math.round(v * 1e9) / 1e9).sort()).toEqual([wedge(0.5), wedge(1)]);
    near(metricsOf(m).mainVolumeM3, 520);
  });
});

describe('transforms and numerical stability (OVM-16..OVM-18)', () => {
  it('OVM-16: TRANSLATE_BUILDING keeps every volume metric', () => {
    expectSameMetrics(metricsOf(draft(gt14(), 'TRANSLATE_BUILDING', { vector: [100, 50, 2] })), metricsOf(gt14()));
  });
  it('OVM-17: ROTATE_BUILDING and an arbitrary rigid rotation keep every volume metric', () => {
    expectSameMetrics(metricsOf(draft(gt14(), 'ROTATE_BUILDING', { angleDeg: -47 })), metricsOf(gt14()));
    const a = Math.hypot(2, -1, 5), r = metricsOf(rigid(gt14(), rotation([2 / a, -1 / a, 5 / a], 23), [1, 2, 3]));
    near(r.overhangVolumeM3, 1.875); near(r.mainVolumeM3, 520);
  });
  it('OVM-18: 500 km / 6000 km from the origin the split is the same (local reference origin)', () => {
    const r = metricsOf(rigid(gt14(), rotation([0, 0, 1], 0), [5e5, 6e6, 250]));
    near(r.overhangVolumeM3, 1.875, 1e-6); near(r.mainVolumeM3, 520, 1e-6);
  });
});

describe('editing operations (OVM-19..OVM-24)', () => {
  it('OVM-19: SET_HEIGHT EAVE 4 on the south eave with overhangs -> south wedge 0.5 x 0.5 / 2 x 10, main 500', () => {
    const m = draft(gt14(), 'SET_HEIGHT', { kind: 'EAVE', z: 4, eaveEdgeId: EAVE.s }), r = metricsOf(m);
    near(r.overhangVolumeM3, 1.25 + wedge(0.5)); near(r.mainVolumeM3, 500); near(r.geometricSolidVolumeM3, helperTotal(m));
  });
  it('OVM-20: changing the width 0.5 -> 1 gives 2 x wedge(1) = 7.5', () => {
    near(metricsOf(draft(gt14(), 'SET_OVERHANG', { eaveEdgeIds: [EAVE.s, EAVE.n], overhangM: 1 })).overhangVolumeM3, 7.5);
  });
  it('OVM-21: removing all overhangs -> overhang 0, main = total = 520', () => {
    const r = metricsOf(draft(gt14(), 'SET_OVERHANG', { eaveEdgeIds: [EAVE.s, EAVE.n], overhangM: 0 }));
    expect(r.overhangVolumeM3).toBe(0); near(r.mainVolumeM3, 520); near(r.geometricSolidVolumeM3, 520);
  });
  it('OVM-22: an installation added on the overhung roof contributes to no volume metric', () => {
    const m = draft(gt14(), 'ADD_CHIMNEY', readFixture('GT-17', 'steps.json')[0].command.payload);
    expectSameMetrics(metricsOf(m), metricsOf(gt14()), 1e-9);
  });
  it('OVM-23: face, shell, half-edge and ring order do not change the split', () => {
    const m = gt14(), s = /** @type {any} */ (structuredClone(m));
    for (const sh of Object.values(s.shells)) sh.faceIds.reverse();
    for (const k of ['faces', 'halfEdges']) s[k] = Object.fromEntries(Object.entries(s[k]).reverse());
    for (const f of Object.values(s.faces)) f.outerLoopId = s.halfEdges[s.halfEdges[f.outerLoopId].nextId].nextId;
    expectSameMetrics(metricsOf(s), metricsOf(m), 1e-9);
  });
  it('OVM-24: computeMetrics changes no geometry, topology, id, constraint, measurement, version or state', () => {
    const m = deepFreeze(gt14()), before = canonicalJson(m);
    metricsOf(m);
    expect(canonicalJson(m)).toBe(before);
  });
});

describe('small faces, persistence, lifecycle (OVM-28..OVM-30)', () => {
  it('OVM-28: the 0.09375 m2 end caps (below minFaceAreaM2) are part of each group and of the volume', () => {
    const m = gt14(), r = metricsOf(m);
    expect(r.volumeStatus).toBe('PROVISIONAL');
    const caps = Object.keys(m.faces).filter((f) => m.faces[f].surfaceKind === 'WallSurface' && m.faces[f].tags.includes('OVERHANG'));
    expect(caps.length).toBe(4);
    near(r.overhangVolumeM3, 1.875);
  });
  it('OVM-29: save -> load -> computeMetrics keeps the volumes', () => {
    expect(metricsOf(loadModel(saveModel(gt14())))).toEqual(metricsOf(gt14()));
  });
  // BLOCKED_BY_VALIDATOR_DEPENDENCY 3D-117 (D-343): to be switched to `it` once 3D-117 is merged.
  it.fails('OVM-30: GT-14 PROVISIONAL (DRAFT_SOLID) -> FINAL (VALID_SOLID) with the same numbers', () => {
    const d = metricsOf(envelopeRun('GT-14', { targetState: 'DRAFT_SOLID' }).commit.model);
    const v = metricsOf(envelopeRun('GT-14').commit.model);
    expect([d.volumeStatus, v.volumeStatus]).toEqual(['PROVISIONAL', 'FINAL']);
    expectSameMetrics({ ...d, volumeStatus: 'FINAL', state: 'VALID_SOLID' }, v, 1e-12);
  });
});
