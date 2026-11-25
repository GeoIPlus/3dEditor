import { addRow, write } from '../../../tools/agent-evals/scenario.mjs';
/** @param {{work: string}} c */
export default ({ work }) => {
  addRow(work, {
    id: '3D-98', title: 'ADR: constraint solver approach', modules: 'docs', deps: '05', size: 'S', type: 'spec', status: 'in-progress (wp/3d-98-solver-adr)',
    details: `- Source: owner message (scenario).
- Goal: ADR choosing the constraint solver approach (3D-ADR-0003).
- Accept: ADR \`proposed\`, then \`accepted\` by the owner (D-18).
- Decisions: D-18  Open: -`,
  });
  write(work, 'docs/decisions/adr/3D-ADR-0003-constraint-solver.md', `# 3D-ADR-0003: Constraint solver approach

- Status: proposed
- Date: 2026-11-20
- WP: 3D-98

## Context
The kernel needs a solver for plane constraints (v0.3 §6).

## Decision
Iterative least squares over plane parameters, with constraint priorities.

## Consequences
Deterministic within the tolerance profile; conflicts reported as CONSTRAINT_CONFLICT.
`);
};
