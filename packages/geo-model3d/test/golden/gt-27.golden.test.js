// GT-27 (spec §13 from §10.6, D-331; row 3D-105): TRIM_FACE keeping the flap -> INVALID_TOPOLOGY (the removed eave part
// shares edges with the wall), version unchanged.
import { describe, expect, it } from 'vitest';
import { refusedCase } from './trim-extend.golden.helpers.js';

describe('GT-27 TRIM_FACE keeping the flap', () => {
  const { model, cmd } = refusedCase('GT-27');
  it('independent check: the keep point is on S1 (z = 5 + 0.75 y) beyond the ridge line y = 4', () => {
    const [, y, z] = cmd.payload.keepPoint;
    expect(Math.abs(z - (5 + 0.75 * y))).toBeLessThan(1e-12);
    expect(y).toBeGreaterThan(4);
    expect(model.faces['f-roof-s']).toBeDefined();
  });
});
