import { addRow } from '../../../tools/agent-evals/scenario.mjs';
/** @param {{work: string}} c */
export default ({ work }) =>
  addRow(work, {
    id: '3D-901', title: 'Stable face order helper for test output', modules: 'geo-model3d/brep', deps: '05', size: 'S',
    status: 'ready (owner, chat)',
    details: `- Source: owner message (scenario).
- Goal: \`stableFaceOrder(faces)\` in \`packages/geo-model3d/src/brep/stable-face-order.js\`: returns a new array of the
  faces (objects with \`id: string\` and \`area: number\`) in a deterministic order, so that test snapshots do not depend
  on insertion order. Internal helper; nothing outside the package uses it yet.
- Not decided by the owner: whether the order is by \`id\` (string compare) or by \`area\` descending with \`id\` as
  tie-break. Either meets the goal; the choice is easy to change later.
- Scope in: the function, unit tests. Scope out: callers.
- Accept: unit tests: same output for shuffled input; input array not mutated; empty input.
- Decisions: -  Open: -`,
  });
