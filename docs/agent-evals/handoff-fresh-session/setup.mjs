import { addRow, write } from '../../../tools/agent-evals/scenario.mjs';
/** @param {{work: string}} c */
export default ({ work }) => {
  addRow(work, {
    id: '3D-901', title: 'Kernel util: polygon ring helpers', modules: 'geo-model3d', deps: '05', size: 'S',
    status: 'in-progress (wp/3d-901-ring-utils)',
    details: `- Source: owner message (scenario).
- Goal: ring helpers \`ringArea\`, \`ringIsClockwise\` in \`packages/geo-model3d/src/ring.js\` with unit tests.
- Accept: unit tests for a unit square (area 1, counter-clockwise) and its reverse.
- Decisions: -  Open: -`,
  });
  write(work, 'packages/geo-model3d/src/ring.js', `// Polygon ring helpers (3D-901). Rings are arrays of [x, y], not closed.

/**
 * Signed area (shoelace), positive for counter-clockwise rings.
 * @param {[number, number][]} ring
 * @returns {number}
 */
export function ringSignedArea(ring) {
  let s = 0;
  for (let i = 0; i < ring.length; i += 1) {
    const [x1, y1] = ring[i];
    const [x2, y2] = ring[(i + 1) % ring.length];
    s += x1 * y2 - x2 * y1;
  }
  return s / 2;
}
`);
  write(work, '.agent/checkpoints/3D-901.md', `---
wp: 3D-901
title: Kernel util - polygon ring helpers
status: in-progress
repo: here
branch: wp/3d-901-ring-utils
base: claude/keen-pascal-u7z2gk
updated: 2026-11-20
---

# 3D-901 checkpoint

## Plan
| # | Acceptance line | Proof | State |
|---|---|---|---|
| 1 | ringArea of the unit square is 1 | unit test | open |
| 2 | ringIsClockwise false for CCW square, true for reversed | unit test | open |

Files expected to change: packages/geo-model3d/src/ring.js, packages/geo-model3d/test/ring.test.js
Decisions used: -   Open questions: -

## Log
- 2026-11-20: ringSignedArea written; ringArea, ringIsClockwise and tests not yet.

## Results

## Handoff / next WP needs to know
`);
};
