// 3D-19: TRANSLATE_BUILDING and ROTATE_BUILDING (spec §10.10 r6, r7; D-345). Acceptance: ROTATE 90 deg keeps
// volume and areas and writes the journal warning. Metrics by the test helpers, not by the kernel.
import { describe, expect, it } from 'vitest';
import { metrics, faceArea } from './helpers.js';
import { gable, exec, sound, inverseRestores } from './envelope.helpers.js';

const withData = () => {
  const m = structuredClone(gable());
  const meas = (/** @type {string} */ id, /** @type {string} */ frame, /** @type {number[]} */ p) => ({
    id, geometry: { kind: 'POINT', coordinates: [p] }, sourceType: 'MANUAL', sourceId: 'src-t', horizontalCrs: 'EPSG:25832',
    verticalCrs: null, frame, status: 'MEASURED', createdBy: 'usr-t',
  });
  m.measurements = { 'm-loc': meas('m-loc', 'LOCAL', [0, 0, 5]), 'm-world': meas('m-world', 'WORLD', [5, 4, 8]) };
  m.constraints = { 'c-fix': { id: 'c-fix', kind: 'FIXED_POINT', entityIds: ['v-r0'], hard: true, target: [0, 4, 8] } };
  return m;
};

describe('ROTATE_BUILDING', () => {
  it('90 deg about the footprint centroid keeps volume and every face area, writes the journal warning (acceptance)', () => {
    const m = gable();
    const out = exec(m, 'ROTATE_BUILDING', { angleDeg: 90 });
    expect(out.result.status).toBe('COMMITTED');
    expect(out.model.state).toBe('VALID_SOLID');
    sound(out.model);
    expect(Math.abs(metrics(out.model).volumeM3 - metrics(m).volumeM3)).toBeLessThanOrEqual(0.01);
    for (const f of Object.keys(m.faces)) expect(Math.abs(faceArea(out.model, f) - faceArea(m, f))).toBeLessThanOrEqual(0.01);
    expect(out.journal.warnings.some((/** @type {string} */ w) => w.startsWith('ROTATE_BUILDING: rigid move'))).toBe(true);
    // centroid (5, 4): corner (0, 0) -> (9, -1); the footprint ring rotates with the building
    expect(out.model.vertices['v-b0'].p).toEqual([9, -1, 0]);
    expect(out.model.footprints['fp-1'].outerRing[0]).toEqual([9, -1]);
    expect(out.model.faces['f-wall-s'].supportPlane.normal).toEqual([1, 0, 0]);
    inverseRestores(m, out);
  });

  it('LOCAL measurements and constraint targets rotate once; WORLD ones stay and are named in the warning', () => {
    const m = withData();
    const out = exec(m, 'ROTATE_BUILDING', { angleDeg: 90 });
    expect(out.result.status).toBe('COMMITTED');
    expect(out.model.measurements['m-loc'].geometry.coordinates).toEqual([[9, -1, 5]]);
    expect(out.model.measurements['m-world']).toEqual(m.measurements['m-world']);
    expect(out.model.constraints['c-fix'].target).toEqual([5, -1, 8]);
    expect(out.journal.warnings).toContain('WORLD-frame measurements remain unchanged after the rigid building transformation (D-345): 1: m-world');
    inverseRestores(m, out);
  });

  it('a non-90 angle keeps the solid valid; 0 and 360 deg are no-op commits', () => {
    const out = exec(gable(), 'ROTATE_BUILDING', { angleDeg: 17.5 });
    expect(out.model.state).toBe('VALID_SOLID');
    sound(out.model);
    for (const deg of [0, 360]) {
      const z = exec(gable(), 'ROTATE_BUILDING', { angleDeg: deg });
      expect(z.result.status).toBe('COMMITTED');
      expect([...z.result.patch.added, ...z.result.patch.updated, ...z.result.patch.deleted]).toEqual([]);
    }
  });
});

describe('TRANSLATE_BUILDING', () => {
  it('moves LOCAL measurements and fixed-point targets by the vector, keeps WORLD ones (D-345)', () => {
    const m = withData();
    const out = exec(m, 'TRANSLATE_BUILDING', { vector: [1, 2, 3] });
    expect(out.result.status).toBe('COMMITTED');
    expect(out.model.measurements['m-loc'].geometry.coordinates).toEqual([[1, 2, 8]]);
    expect(out.model.measurements['m-world']).toEqual(m.measurements['m-world']);
    expect(out.model.constraints['c-fix'].target).toEqual([1, 6, 11]);
    expect(out.model.footprints['fp-1'].baseElevationM).toBe(3);
    inverseRestores(m, out);
  });

  it('a hard constraint tied to a WORLD measurement is checked at its real-world place -> CONSTRAINT_CONFLICT', () => {
    const m = withData();
    m.constraints['c-fix'] = { ...m.constraints['c-fix'], measurementId: 'm-world' };
    const out = exec(m, 'TRANSLATE_BUILDING', { vector: [1, 0, 0] });
    expect(out.result.status).toBe('REJECTED');
    expect(out.result.error.code).toBe('CONSTRAINT_CONFLICT');
    expect(out.model).toBe(m);
  });

  it('a hard constraint that cannot be verified (TBD kind) refuses the move (D-345)', () => {
    const m = withData();
    m.constraints = { 'c-tbd': { id: 'c-tbd', kind: 'BOUNDARY_ON_FOOTPRINT', entityIds: ['he-f-ground-0'], hard: true } };
    const out = exec(m, 'TRANSLATE_BUILDING', { vector: [1, 0, 0] });
    expect(out.result.error?.code).toBe('CONSTRAINT_CONFLICT');
    expect(out.result.error.entityIds).toEqual(['c-tbd']);
  });

  it('zero vector is a no-op commit; a bad vector is INVALID_PAYLOAD', () => {
    const z = exec(gable(), 'TRANSLATE_BUILDING', { vector: [0, 0, 0] });
    expect(z.result.status).toBe('COMMITTED');
    expect([...z.result.patch.added, ...z.result.patch.updated, ...z.result.patch.deleted]).toEqual([]);
    expect(exec(gable(), 'TRANSLATE_BUILDING', { vector: [1, 2] }).result.error.code).toBe('INVALID_PAYLOAD');
  });
});
