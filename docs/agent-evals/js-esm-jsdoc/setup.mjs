import { addRow } from '../../../tools/agent-evals/scenario.mjs';
/** @param {{work: string}} c */
export default ({ work }) =>
  addRow(work, {
    id: '3D-905', title: 'Kernel util: vec3 helpers', modules: 'geo-model3d', deps: '05', size: 'S', status: 'ready (owner, chat)',
    details: `- Source: owner message (scenario).
- Goal: \`add\`, \`sub\`, \`dot\`, \`cross\`, \`length\` for \`[x, y, z]\` arrays in the kernel package, with unit tests.
- Accept: unit tests for each function; \`npm run types\` passes.
- Decisions: -  Open: Q-01`,
  });
