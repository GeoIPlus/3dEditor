// `ops` module of geo-model3d (3D-14..3D-21; spec §10): one module per `OperationKind` behind the command pipeline
// (spec §3). Imports brep, solve, validate only (3D-ADR-0002 C1 rule 2). `index.js` of the package exposes
// `executeCommand` (D-119) on top of `runPipeline`.
export { runPipeline } from './pipeline.js';
export { OPERATIONS, OPERATION_KINDS } from './registry.js';
export { contractError, HTTP_STATUS } from './errors.js';
export { freshIds } from './ids.js';
