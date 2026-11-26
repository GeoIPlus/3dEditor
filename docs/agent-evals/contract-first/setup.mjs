import { addRow } from '../../../tools/agent-evals/scenario.mjs';
/** @param {{work: string}} c */
export default ({ work }) =>
  addRow(work, {
    id: '3D-904', title: 'Patch result carries snapshotId', modules: 'geo-model3d', deps: '05', size: 'S', status: 'ready (owner, chat)',
    details: `- Source: owner message (scenario).
- Goal: the patch result that the kernel returns to the client carries a new field \`snapshotId\` (string).
- Accept: unit test that a patch result has \`snapshotId\`.
- Decisions: -  Open: -`,
  });
