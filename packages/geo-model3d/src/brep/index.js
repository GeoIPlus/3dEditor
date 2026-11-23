// `brep` module of geo-model3d (3D-09; spec §4): canonical model, primary planes, derived vertices, half-edge, local
// frame, transactions and versions, deterministic serialisation, RTG projection. A leaf of the module DAG
// (3D-ADR-0002 C1 rule 2): `solve`, `import`, `export`, `validate`, `cloud` and `ops` import it, it imports no module.
export { dot, add, sub, scale, cross, norm, distance, unsign0 } from './vec.js';
export { signedDistance, isUnitPlane, planeFromPoints, normalGram, derivePoint } from './plane.js';
export { localFrame, translationMapping, cosSinDeg, localDirToMetric } from './frame.js';
export { buildIndex, checkTopology, faceRings, edgeFaceIds, endVertexId, FINALISED_STATES } from './halfedge.js';
export { vertexPlaneViolations, inconsistentJunctions, rederive } from './derive.js';
export { roofGraph, isRoofFace } from './rtg.js';
export { canonicalJson, saveModel, loadModel, isolatedCopy } from './serialize.js';
export { diffModels, applyPatch, modelLevelChanges, COLLECTIONS } from './patch.js';
export { transact, transactPatch } from './transaction.js';
