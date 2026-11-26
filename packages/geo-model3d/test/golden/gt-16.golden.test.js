// GT-16 (v0.3 §12; spec §13; row 3D-19): TRANSLATE_BUILDING (100, 50, 2) on the GT-03 gable.
import { describe, expect, it } from 'vitest';
import { envelopeRun } from './envelope.golden.helpers.js';
import { metrics, faceArea } from '../ops/helpers.js';

describe('GT-16 TRANSLATE_BUILDING', () => {
  const r = envelopeRun('GT-16');
  const a = r.expected.assert, tol = r.expected.tolerance;

  it('commits a VALID_SOLID with the PREVIEW patch, the same ids and a journal warning (v0.3 §6)', () => {
    expect(r.commit.result.status).toBe('COMMITTED');
    expect(r.commit.result.patch).toEqual(r.preview.result.patch);
    expect(r.commit.model.state).toBe('VALID_SOLID');
    for (const k of /** @type {const} */ (['vertices', 'halfEdges', 'faces'])) expect(Object.keys(r.commit.model[k]).sort()).toEqual(Object.keys(r.model[k]).sort());
    expect(r.commit.journal.warnings.some((/** @type {string} */ w) => w.startsWith('TRANSLATE_BUILDING: rigid move'))).toBe(true);
  });

  it('every vertex moved exactly by the vector; volume and areas unchanged', () => {
    for (const [id, v] of Object.entries(r.model.vertices)) {
      const p = r.commit.model.vertices[id].p;
      for (let i = 0; i < 3; i++) expect(Math.abs(p[i] - (/** @type {any} */ (v).p[i] + a.vector[i]))).toBeLessThanOrEqual(1e-9);
    }
    const before = metrics(r.model), after = metrics(r.commit.model);
    expect(a.volumeUnchanged && Math.abs(after.volumeM3 - before.volumeM3) <= tol.volumeM3).toBe(true);
    for (const f of Object.keys(r.model.faces)) expect(Math.abs(faceArea(r.commit.model, f) - faceArea(r.model, f))).toBeLessThanOrEqual(tol.areaM2);
    expect(a.areasUnchanged).toBe(true);
  });
});
