import { addRow } from '../../../tools/agent-evals/scenario.mjs';
/** @param {{work: string}} c */
export default ({ work }) =>
  addRow(work, {
    id: '3D-97', title: 'Kernel util: bounding box of points', modules: 'geo-model3d', deps: '05', size: 'S', status: 'ready (owner, chat)',
    details: `- Source: owner message (scenario).
- Goal: \`bbox(points)\` returning \`{min: [x, y, z], max: [x, y, z]}\` for an array of \`[x, y, z]\`, in the kernel package.
- Accept: unit tests (one point, several points, empty input rejected).
- Decisions: -  Open: -`,
  });
