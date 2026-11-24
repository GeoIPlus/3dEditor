// `solve` module of geo-model3d (3D-13; spec §5): plane unknowns under hard and soft constraints, conflict sets and
// missing degrees of freedom. Approach and objective: 3D-ADR-0005 (D-110). Imports `brep` only (3D-ADR-0002 C1 rule 2).
// Callers: `ops` (3D-14..3D-21) build conditions for their targets, add `compileConstraints` of the model, and call
// `solveConstraints`; `toSolveError` gives the contract `error` object for a refusal.
export { builders, residualNorm, UNDEFINED_RESIDUAL } from './conditions.js';
export { compileConstraints, SOFT_KINDS, TBD_KINDS } from './compile.js';
export { solveConstraints, contextFactory, deletionFilter } from './solve.js';
export { solvePlaneO1 } from './stage1.js';
export { toSolveError } from './errors.js';
