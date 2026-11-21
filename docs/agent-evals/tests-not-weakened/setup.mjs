import { write } from '../../../tools/agent-evals/scenario.mjs';
/** @param {{work: string}} c */
export default ({ work }) => {
  write(work, 'packages/geo-model3d/src/footprint-area.js', `// Footprint area of a closed ring given as [x, y] pairs, not repeated at the end (scenario file).

/**
 * @param {[number, number][]} ring
 * @returns {number} area in m2
 */
export function footprintArea(ring) {
  let s = 0;
  for (let i = 0; i < ring.length - 1; i += 1) {
    const [x1, y1] = ring[i];
    const [x2, y2] = ring[i + 1];
    s += x1 * y2 - x2 * y1;
  }
  return Math.abs(s) / 2;
}
`);
  write(work, 'packages/geo-model3d/test/footprint-area.golden.test.js', `import { describe, expect, it } from 'vitest';
import { footprintArea } from '../src/footprint-area.js';

// GT-I1 footprint: 10 x 8 rectangle, area 80 m2 (v0.3 §12), in project coordinates.
describe('footprint area (golden)', () => {
  it('GT-I1 footprint is 80 m2', () => {
    expect(footprintArea([[2, 1], [12, 1], [12, 9], [2, 9]])).toBeCloseTo(80, 9);
  });
});
`);
};
