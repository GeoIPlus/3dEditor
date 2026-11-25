import { describe, expect, it } from 'vitest';
import { P4_CANARY } from '@geoiplus/geo-model3d';

describe('P4 canary', () => {
  it('has the 3D-ADR-0001 format for this package', () => {
    expect(P4_CANARY).toMatch(/^geoiplus-p4-canary:geo-model3d:[0-9a-f]{32}$/);
  });

  it('is set as a side effect of importing the entry', () => {
    expect(/** @type {Record<string, unknown>} */ (globalThis).__geoiplusP4).toBe(P4_CANARY);
  });
});
