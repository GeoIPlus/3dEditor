import { addRow } from '../../../tools/agent-evals/scenario.mjs';
/** @param {{work: string}} c */
export default ({ work }) =>
  addRow(work, {
    id: '3D-900', title: 'Validation helper: wall verticality check', modules: 'geo-model3d/validate', deps: '05', size: 'S',
    status: 'ready (owner, chat)',
    details: `- Source: owner message (scenario).
- Goal: \`isWallVertical(normal)\` in \`packages/geo-model3d/src/validate/wall-vertical.js\`: true when a wall face normal
  deviates from the horizontal plane by less than the wall verticality tolerance of the project tolerance profile.
- Scope in: the function, unit tests. Scope out: wiring into validation runs.
- Accept: unit tests for a vertical wall, a wall tilted beyond the tolerance, a degenerate normal.
- Decisions: D-13  Open: -`,
  });
