// `cloud` module of geo-model3d (3D-22; spec §9): plane fit and model-to-cloud deviation on points passed in as typed
// arrays (3D-ADR-0002 C1). Imports only `brep` (module DAG); reads no file and no point source (the service's points
// port does, D-35).
export { fitPlane, RANSAC } from './fit-plane.js';
export { deviationStats } from './deviation.js';
