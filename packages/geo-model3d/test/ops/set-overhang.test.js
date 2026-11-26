// 3D-19: SET_OVERHANG (spec §10.10 r1; D-336, D-337, D-344). Standard profile unless a test says otherwise:
// widths >= 0.52 m keep the end caps above `minFaceAreaM2` (0.75 w^2 / 2 >= 0.1); GT-14 (0.5 m) waits for 3D-117.
import { describe, expect, it } from 'vitest';
import { faceArea, volume, metrics } from './helpers.js';
import { saveModel, loadModel } from '../../src/brep/index.js';
import { gable, hip, exec, sound, inverseRestores, sameGeometry } from './envelope.helpers.js';

const BOTH = ['he-f-roof-s-0', 'he-f-roof-n-0'];
const set = (/** @type {any} */ m, /** @type {number} */ w, ids = BOTH, opts = {}) => exec(m, 'SET_OVERHANG', { eaveEdgeIds: ids, overhangM: w }, opts);
const tagged = (/** @type {any} */ m, /** @type {string} */ k) => Object.keys(m.faces).filter((f) => m.faces[f].surfaceKind === k && m.faces[f].tags.includes('OVERHANG')).sort();
const total = (/** @type {any} */ m) => volume(m, Object.values(m.shells)[0].faceIds);

describe('SET_OVERHANG', () => {
  it('OH-01 / CAP-02: 0.52 m on both eaves - VALID_SOLID, closed manifold, analytic areas and volumes', () => {
    const m = gable(), w = 0.52;
    const out = set(m, w);
    expect(out.result.status).toBe('COMMITTED');
    expect(out.model.state).toBe('VALID_SOLID');
    sound(out.model);
    const o = out.model;
    expect(tagged(o, 'RoofSurface')).toHaveLength(2);
    expect(tagged(o, 'OuterCeilingSurface')).toHaveLength(2);
    expect(tagged(o, 'WallSurface')).toHaveLength(4);
    const sum = (/** @type {string[]} */ fs) => fs.reduce((s, f) => s + faceArea(o, f), 0);
    expect(Math.abs(sum(tagged(o, 'RoofSurface')) - 2 * 10 * w / 0.8)).toBeLessThanOrEqual(0.01);
    expect(Math.abs(sum(tagged(o, 'OuterCeilingSurface')) - 2 * 10 * w)).toBeLessThanOrEqual(0.01);
    for (const c of tagged(o, 'WallSurface')) expect(Math.abs(faceArea(o, c) - 0.375 * w * w)).toBeLessThanOrEqual(1e-9);
    expect(Math.abs(total(o) - 520 - 2 * 10 * 0.375 * w * w)).toBeLessThanOrEqual(0.01);
    expect(Math.abs(metrics(o).groundAreaM2 - 80)).toBeLessThanOrEqual(0.01);
    const edge = Object.values(o.vertices).filter((/** @type {any} */ v) => v.p[1] < -1e-6 || v.p[1] > 8 + 1e-6);
    for (const v of /** @type {any[]} */ (edge)) expect(Math.abs(v.p[2] - (5 - 0.75 * w))).toBeLessThanOrEqual(1e-9);
    // walls keep id, plane and semantics; the strip shares the plane of its roof face; caps share the gable planes
    for (const f of ['f-wall-s', 'f-wall-n', 'f-wall-e', 'f-wall-w']) expect(o.faces[f].supportPlane).toEqual(m.faces[f].supportPlane);
    for (const c of tagged(o, 'WallSurface')) expect(['f-wall-e', 'f-wall-w'].some((g) => JSON.stringify(o.faces[g].supportPlane) === JSON.stringify(o.faces[c].supportPlane))).toBe(true);
    expect(o.halfEdges['he-f-roof-s-0'].edgeRole).toBe('EAVE');
    inverseRestores(m, out);
  });

  it('OH-02: PREVIEW and COMMIT give the same patch', () => {
    const m = gable();
    expect(set(m, 0.6).result.patch).toEqual(exec(m, 'SET_OVERHANG', { eaveEdgeIds: BOTH, overhangM: 0.6 }, {}, { phase: 'PREVIEW' }).result.patch);
  });

  it('OH-03 / CAP-12: the same width again is a no-op (no new faces, empty patch)', () => {
    const o = set(gable(), 0.6).model;
    const again = set(o, 0.6);
    expect(again.result.status).toBe('COMMITTED');
    expect([...again.result.patch.added, ...again.result.patch.updated, ...again.result.patch.deleted]).toEqual([]);
  });

  it('OH-04 / CAP-10, CAP-14: 0.52 -> 0.60 -> 0.52 keeps every id and returns to the same geometry', () => {
    const a = set(gable(), 0.52).model;
    const b = set(a, 0.6);
    expect(b.result.patch.added).toEqual([]);
    expect(b.result.patch.deleted).toEqual([]);
    sound(b.model);
    const c = set(b.model, 0.52).model;
    sameGeometry(a, c);
  });

  it('OH-05 / CAP-11: width 0 removes strip, soffit and caps and restores the plain gable', () => {
    const m = gable();
    const out = set(set(m, 0.6).model, 0);
    expect(out.model.state).toBe('VALID_SOLID');
    expect(tagged(out.model, 'WallSurface')).toEqual([]);
    expect(out.result.patch.deleted.length).toBeGreaterThan(0);
    sameGeometry(m, out.model);
    expect(set(m, 0).result.patch.updated).toEqual([]);
  });

  it('OH-06: one eave only; the other keeps its plain eave', () => {
    const out = set(gable(), 0.6, ['he-f-roof-s-0']);
    expect(tagged(out.model, 'RoofSurface')).toHaveLength(1);
    expect(out.model.halfEdges['he-f-roof-n-0'].twinId).toBe('he-f-wall-n-2');
    sound(out.model);
  });

  it('OH-07 / CAP-16: save -> load keeps a valid model with the overhang; SET_OVERHANG on the loaded copy is a no-op', () => {
    const o = set(gable(), 0.6).model;
    const back = loadModel(saveModel(o));
    expect(back).toEqual(o);
    sound(back);
    expect(set(back, 0.6).result.patch.updated).toEqual([]);
  });

  it('OH-08: unsupported junction (hip end) -> INVALID_TOPOLOGY, model unchanged (D-344)', () => {
    const h = hip();
    const eave = Object.values(h.halfEdges).find((/** @type {any} */ e) => e.edgeRole === 'EAVE' && h.faces[e.faceId].surfaceKind === 'RoofSurface');
    const out = set(h, 0.6, [/** @type {any} */ (eave).id]);
    expect(out.result.error?.code).toBe('INVALID_TOPOLOGY');
    expect(out.model).toBe(h);
  });

  it('OH-09: atomic - a bad second eave refuses the whole command; the first is not applied', () => {
    const m = gable();
    const out = set(m, 0.6, ['he-f-roof-s-0', 'he-f-roof-s-2']);
    expect(out.result.error?.code).toBe('INVALID_PAYLOAD');
    expect(out.model).toBe(m);
  });

  it('OH-10: payload refusals - negative width, duplicates, overhang half-edge, unknown id', () => {
    const m = gable();
    expect(set(m, -0.1).result.error.code).toBe('INVALID_PAYLOAD');
    expect(set(m, 0.6, ['he-f-roof-s-0', 'he-f-roof-s-0']).result.error.code).toBe('INVALID_PAYLOAD');
    expect(set(m, 0.6, ['nope']).result.error.code).toBe('INVALID_PAYLOAD');
    const o = set(m, 0.6).model;
    const strip = /** @type {string} */ (o.halfEdges['he-f-roof-s-0'].twinId);
    expect(set(o, 0.7, [strip]).result.error.code).toBe('INVALID_PAYLOAD');
  });

  it('OH-11: a width whose soffit reaches the wall base -> INVALID_GEOMETRY', () => {
    expect(set(gable(), 7).result.error?.code).toBe('INVALID_GEOMETRY');
  });

  it('OH-12: constraints are kept; a hard constraint on a removed overhang face refuses width 0 (D-213)', () => {
    const m = structuredClone(gable());
    m.constraints = { 'c-w': { id: 'c-w', kind: 'VERTICAL', entityIds: ['f-wall-s'], hard: true } };
    const o = set(m, 0.6);
    expect(o.model.constraints).toEqual(m.constraints);
    const strip = /** @type {string} */ (o.model.halfEdges[/** @type {string} */ (o.model.halfEdges['he-f-roof-s-0'].twinId)].faceId);
    const withC = structuredClone(o.model);
    withC.constraints['c-s'] = { id: 'c-s', kind: 'HORIZONTAL', entityIds: [strip], hard: false };
    withC.constraints['c-h'] = { id: 'c-h', kind: 'PLANAR_FACE', entityIds: [strip], hard: true };
    const z = set(withC, 0);
    expect(z.result.error?.code).toBe('CONSTRAINT_CONFLICT');
    expect(z.result.error.entityIds).toEqual(['c-h']);
  });

  it('OH-13: overhang then SET_HEIGHT BASE and TRANSLATE keep the overhang valid (own ops)', () => {
    const o = set(gable(), 0.6).model;
    const b = exec(o, 'SET_HEIGHT', { kind: 'BASE', z: -1 });
    expect(b.model.state).toBe('VALID_SOLID');
    sound(b.model);
    const t = exec(b.model, 'TRANSLATE_BUILDING', { vector: [3, -2, 1] });
    expect(t.model.state).toBe('VALID_SOLID');
    sound(t.model);
    expect(set(t.model, 0.6).result.patch.updated).toEqual([]);
  });
});
