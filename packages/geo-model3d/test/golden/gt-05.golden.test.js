// GT-05 (v0.3 §12; spec §13; row 3D-14): R-03 on an L-shaped footprint -> UNSUPPORTED_FOOTPRINT, model unchanged.
import { describe, expect, it } from 'vitest';
import { canonicalJson } from '@geoiplus/geo-model3d';
import { readFixture } from '../brep/helpers.js';
import { goldenRun } from './replace-roof.golden.helpers.js';

describe('GT-05 REPLACE_ROOF GABLE on an L footprint', () => {
  const r = goldenRun('GT-05');
  it('refused UNSUPPORTED_FOOTPRINT in PREVIEW and COMMIT, model unchanged', () => {
    for (const out of [r.preview, r.commit]) {
      expect(out.result.status).toBe('REJECTED');
      expect(out.result.error.code).toBe(r.expected.assert.refusal);
      expect(out.result.modelVersion).toBe(r.model.version);
      expect(out.model).toBe(r.model);
    }
    expect(r.expected.assert.modelUnchanged).toBe(true);
    expect(canonicalJson(r.model)).toBe(canonicalJson(readFixture('GT-05', 'input.model.json')));
  });
});
