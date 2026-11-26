// 3D-19: SET_HEIGHT BASE and EAVE (spec §10.10 r5; D-3D19-3 reference on GT-03: south eave 5 -> 5.5).
import { describe, expect, it } from 'vitest';
import { metrics } from './helpers.js';
import { gable, exec, sound, inverseRestores, SMALL_FACES } from './envelope.helpers.js';

const slopeDeg = (/** @type {any} */ m, /** @type {string} */ f) => (Math.acos(Math.abs(m.faces[f].supportPlane.normal[2])) * 180) / Math.PI;
const changedPlanes = (/** @type {any} */ a, /** @type {any} */ b) => Object.keys(a.faces).filter((f) => JSON.stringify(a.faces[f].supportPlane) !== JSON.stringify(b.faces[f].supportPlane));
const EAVE_S = { kind: 'EAVE', z: 5.5, eaveEdgeId: 'he-f-roof-s-0' };

describe('SET_HEIGHT EAVE (D-3D19-3)', () => {
  it('EH-01: south eave to 5.5 - only f-roof-s turns; reference values of D-3D19-3', () => {
    const m = gable();
    const out = exec(m, 'SET_HEIGHT', EAVE_S);
    expect(out.result.status).toBe('COMMITTED');
    expect(out.model.state).toBe('VALID_SOLID');
    sound(out.model);
    expect(changedPlanes(m, out.model)).toEqual(['f-roof-s']);
    const v = out.model.vertices;
    for (const id of ['v-e0', 'v-e1']) expect(Math.abs(v[id].p[2] - 5.5)).toBeLessThanOrEqual(1e-9);
    for (const id of ['v-e2', 'v-e3']) expect(Math.abs(v[id].p[2] - 5)).toBeLessThanOrEqual(1e-9);
    for (const id of ['v-r0', 'v-r1']) expect(v[id].p).toEqual(m.vertices[id].p);
    for (const id of ['v-e0', 'v-e1']) expect(v[id].p.slice(0, 2)).toEqual(m.vertices[id].p.slice(0, 2));
    expect(Math.abs(slopeDeg(out.model, 'f-roof-s') - 32.005383)).toBeLessThanOrEqual(1e-6);
    expect(Math.abs(slopeDeg(out.model, 'f-roof-n') - 36.869898)).toBeLessThanOrEqual(1e-6);
    const mt = metrics(out.model);
    expect(Math.abs(mt.groundAreaM2 - 80)).toBeLessThanOrEqual(0.01);
    expect(Math.abs(mt.roofAreaM2 - 97.169906)).toBeLessThanOrEqual(0.01);
    expect(Math.abs(mt.volumeM3 - 530)).toBeLessThanOrEqual(0.01);
    inverseRestores(m, out);
  });

  it('EH-02: PREVIEW and COMMIT give the same patch; ids unchanged', () => {
    const m = gable();
    const p = exec(m, 'SET_HEIGHT', EAVE_S, {}, { phase: 'PREVIEW' });
    const c = exec(m, 'SET_HEIGHT', EAVE_S);
    expect(c.result.patch).toEqual(p.result.patch);
    expect(c.result.patch.added).toEqual([]);
    expect(c.result.patch.deleted).toEqual([]);
  });

  it('EH-03: a hard FIXED_POINT on the eave vertex -> CONSTRAINT_CONFLICT, model unchanged', () => {
    const m = structuredClone(gable());
    m.constraints = { 'c-fix': { id: 'c-fix', kind: 'FIXED_POINT', entityIds: ['v-e0'], hard: true } };
    const out = exec(m, 'SET_HEIGHT', EAVE_S);
    expect(out.result.error?.code).toBe('CONSTRAINT_CONFLICT');
    expect(out.model).toBe(m);
  });

  it('EH-04: a hard constraint on the slope keeps it fixed -> CONSTRAINT_CONFLICT (D-231)', () => {
    const m = structuredClone(gable());
    m.constraints = { 'c-slope': { id: 'c-slope', kind: 'ROOF_SLOPE', entityIds: ['f-roof-s'], hard: true, target: 36.869898 } };
    expect(exec(m, 'SET_HEIGHT', EAVE_S).result.error?.code).toBe('CONSTRAINT_CONFLICT');
  });

  it('EH-05: refusals - not an eave, unknown edge, overhang half-edge, at or below the base', () => {
    const m = gable();
    expect(exec(m, 'SET_HEIGHT', { ...EAVE_S, eaveEdgeId: 'he-f-roof-s-2' }).result.error.code).toBe('INVALID_PAYLOAD');
    expect(exec(m, 'SET_HEIGHT', { ...EAVE_S, eaveEdgeId: 'nope' }).result.error.code).toBe('INVALID_PAYLOAD');
    expect(exec(m, 'SET_HEIGHT', { ...EAVE_S, z: 0 }).result.error.code).toBe('INVALID_GEOMETRY');
    expect(exec(m, 'SET_HEIGHT', { kind: 'RIDGE', z: 9 }).result.error.code).toBe('INVALID_PAYLOAD');
  });

  it('EH-06: with a 0.5 m overhang the outer edge goes to Z 5.1875, width and ids kept (CAP-13)', () => {
    const o = exec(gable(), 'SET_OVERHANG', { eaveEdgeIds: ['he-f-roof-s-0'], overhangM: 0.5 }, SMALL_FACES).model;
    const out = exec(o, 'SET_HEIGHT', EAVE_S, SMALL_FACES);
    expect(out.result.status).toBe('COMMITTED');
    expect(out.model.state).toBe('VALID_SOLID');
    sound(out.model, SMALL_FACES.toleranceProfile);
    expect(out.result.patch.added).toEqual([]);
    expect(out.result.patch.deleted).toEqual([]);
    const outer = Object.values(out.model.vertices).filter((/** @type {any} */ v) => v.p[1] < -1e-6);
    expect(outer).toHaveLength(2);
    for (const v of /** @type {any[]} */ (outer)) {
      expect(Math.abs(v.p[2] - 5.1875)).toBeLessThanOrEqual(1e-9);
      expect(Math.abs(v.p[1] + 0.5)).toBeLessThanOrEqual(1e-9);
    }
    const strip = Object.keys(out.model.faces).find((f) => out.model.faces[f].tags.includes('OVERHANG') && out.model.faces[f].surfaceKind === 'RoofSurface');
    expect(out.model.faces[/** @type {string} */ (strip)].supportPlane).toEqual(out.model.faces['f-roof-s'].supportPlane);
    inverseRestores(o, out);
  });
});

describe('SET_HEIGHT BASE', () => {
  it('EH-07: base -1 moves only the ground plane; footprint record follows', () => {
    const m = gable();
    const out = exec(m, 'SET_HEIGHT', { kind: 'BASE', z: -1 });
    expect(changedPlanes(m, out.model)).toEqual(['f-ground']);
    expect(Math.abs(metrics(out.model).volumeM3 - 600)).toBeLessThanOrEqual(0.01);
    sound(out.model);
    inverseRestores(m, out);
  });

  it('EH-08: base at or above the eave -> INVALID_GEOMETRY; FIXED_POINT on a base vertex -> CONSTRAINT_CONFLICT', () => {
    expect(exec(gable(), 'SET_HEIGHT', { kind: 'BASE', z: 5 }).result.error.code).toBe('INVALID_GEOMETRY');
    const m = structuredClone(gable());
    m.constraints = { 'c-fix': { id: 'c-fix', kind: 'FIXED_POINT', entityIds: ['v-b0'], hard: true } };
    expect(exec(m, 'SET_HEIGHT', { kind: 'BASE', z: -1 }).result.error?.code).toBe('CONSTRAINT_CONFLICT');
  });
});
