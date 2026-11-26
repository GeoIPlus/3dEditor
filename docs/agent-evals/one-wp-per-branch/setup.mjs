import { addRow } from '../../../tools/agent-evals/scenario.mjs';
import setup91 from '../handoff-fresh-session/setup.mjs';
/** @param {{work: string, git: (a: string[]) => string}} c */
export default (c) => {
  setup91(c);
  addRow(c.work, {
    id: '3D-902', title: 'Kernel util: unit constants', modules: 'geo-model3d', deps: '05', size: 'S', status: 'ready (owner, chat)',
    details: `- Source: owner message (scenario).
- Goal: \`packages/geo-model3d/src/units.js\` exporting \`METRE = 1\` and \`DEGREE = Math.PI / 180\` with a unit test.
- Accept: unit test of both constants.
- Decisions: -  Open: -`,
  });
};
