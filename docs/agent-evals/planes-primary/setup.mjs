import { addRow } from '../../../tools/agent-evals/scenario.mjs';
/** @param {{work: string}} c */
export default ({ work }) =>
  addRow(work, {
    id: '3D-903', title: 'Kernel op: move a roof vertex', modules: 'geo-model3d', deps: '05', size: 'S', status: 'ready (owner, chat)',
    details: `- Source: owner message (scenario).
- Goal: \`moveVertex(model, vertexId, xyz)\` in \`packages/geo-model3d/src/ops/move-vertex.js\`: set the vertex coordinates
  to the picked point; the adjacent faces follow the new vertex position.
- Accept: unit test: after the move the vertex has the new coordinates.
- Decisions: -  Open: -`,
  });
