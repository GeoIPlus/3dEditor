// `crs` module of geo-model3d (3D-32): a leaf of the module DAG (3D-ADR-0007 amends 3D-ADR-0002 C1 rule 2:
// `crs` <- `brep`, `import`, `export`). Server-only (P4): reachable only through the package entry, which carries the canary.
export { resolveCrs, normaliseCrsRef, CrsError, INVALID_CRS, CRS_TABLE_SOURCE } from './registry.js';
export { createMetricFrame, boxCentre } from './frame.js';
export { writeBackVertices, decodeVertex, roundingDecimals, DEGREE_EXTRA_DECIMALS } from './write-back.js';
export { createCrsMapping } from './reproject.js';
