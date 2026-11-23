# @geoiplus/geo-model3d

- Status: implemented - `brep` core (3D-09); other modules follow their rows (3D-10..3D-22)
- Protection: P4 - server-only (D-06, D-07); never in a browser bundle, no DOM, no three.js (AGENTS.md §2)
- WP: 3D-05 (bootstrap), 3D-09 (core), 3D-32 (crs)   Spec: [docs/specs/3dqm-spec.md](../../docs/specs/3dqm-spec.md) §3, §4
- Source/donor: new; third-party runtime code permissive only ([3D-ADR-0004](../../docs/decisions/adr/3D-ADR-0004-kernel-language-boolean-licences.md));
  `robust-predicates` not adopted (D-118)
- Spike: `spike/move-edge/` (3D-08), throwaway, not exported; see its [card](spike/move-edge/README.md)
- Third-party runtime code: `proj4` 2.23.0 (MIT; deps `mgrs` 1.0.0 MIT, `wkt-parser` 1.9.0 MIT), used by
  `src/crs/` only ([3D-ADR-0004](../../docs/decisions/adr/3D-ADR-0007-crs-transform.md), accepted D-125); `src/crs/epsg-table.json`
  generated from PROJ 9.8.1 `proj.db` (EPSG v12.029; EPSG terms of use: Q-43)

## Purpose
Geometry kernel for editing LoD2 building models (planes primary, vertices derived, D-08). Runs in Node unchanged,
no I/O, clock or randomness (3D-ADR-0002 C1 rule 1).

## Public API (index.js)
Inputs and outputs are `contracts/model3d/` shapes only (C1 rule 3).
- `P4_CANARY` - the canary literal (format `geoiplus-p4-canary:geo-model3d:<32 hex>`, [3D-ADR-0001](../../docs/decisions/adr/3D-ADR-0001-contracts-location-and-p4-canary.md)).
- `worldToLocal(frame, points)`, `localToWorld(frame, points)` - contract `CoordinateFrame` + `V3[]`; projected CRS
  (translation by `originWorld`, rotation by `buildingAxisDeg`). Geographic CRSs: import (3D-10) composes `crs` (3D-32).
- `canonicalJson(value)` - canonical JSON (sorted keys, no `-0`); `save -> load -> save` is byte-identical (K-11).
- Names fixed for later rows (D-119): `executeCommand` (3D-14..3D-21), `importBuilding` (3D-10),
  `exportBuilding` (3D-11), `validateModel` (3D-12), `fitPlane`, `deviationStats` (3D-22).

## Modules (`src/`, DAG of 3D-ADR-0002 C1 rule 2, enforced by `check:arch`)
`brep` (3D-09) is the leaf every other module imports. Its surface (`src/brep/index.js`), for kernel modules only:

| File | Contents |
|---|---|
| `vec.js`, `plane.js` | vectors; `normal · p + d = 0`; `derivePoint(planes, numericEpsilon)`: 3 planes exact, 4+ least squares with residual; null below the Gram-determinant rank threshold |
| `frame.js` | `localFrame(frame, metric?)`: local = Rz(-buildingAxisDeg) · metric; metric mapping injected (D-116), default `world - originWorld` |
| `halfedge.js` | `buildIndex` (rings by `nextId`, faces of vertex, shell of face), `checkTopology` (spec §4 r7; internal kinds `LINK`, `TWIN_*`, `SHELL_FACE`, `VERTEX_FACE`; `validate` maps them to codes) |
| `derive.js` | `vertexPlaneViolations` (shared invariant helper for every op row, spec §4 Accept 2), `inconsistentJunctions` (`INCONSISTENT_JUNCTION`, residual > `topologySnapTolM`), `rederive` (D-70: EXPLICIT -> DERIVED when a face changes) |
| `patch.js`, `transaction.js` | `diffModels`, `applyPatch`; `transact(model, mutate)`: isolated copy, version + 1, forward / inverse patch, lineage; `transactPatch` for Undo / Redo as new versions |
| `rtg.js`, `serialize.js` | `roofGraph` (projection, canonical ids only); `saveModel` / `loadModel` / `isolatedCopy` |

## Internal modules
- `src/crs/` (3D-32): `resolveCrs`, `createMetricFrame` (projected: translation; geographic: local ENU),
  `writeBackVertices` (untouched vertices keep file integers, D-70), `decodeVertex`; throws `CrsError` with code
  `INVALID_CRS`. Not in `index.js`; `import` / `export` (3D-10, 3D-11) call it. Spec §4a.

## Rules and invariants
- Every target of `package.json` `exports` imports `./src/canary.js`; `canary.js` is listed in `sideEffects`.
- `check:arch`: no DOM / `three`; no file over 300 lines; kernel source imports no I/O modules and references no
  `process`, timers, `fetch`, `performance`, `crypto`, `Date.now`, `Math.random`, `new Date()` (`kernelNoIo`); imports
  follow the module DAG (`kernelModuleDag`); only `packages/geo-model3d/`, `services/kernel/`, `tools/bench/` import the
  package (D-117); negative control builds the entry for the browser and requires the marker.
- A transaction never writes its input: refusal returns the input object, a throw leaves it untouched.
- Readings marked [A] in code: junction residual = largest distance of the least-squares point; rank threshold =
  `numericEpsilon` on det(NᵀN); finalised states = `VALID_SOLID`, `APPROVED`; roof face = `RoofSurface`; lineage
  covers Face / HalfEdge / Vtx; model-level changes (`state`, `frame`) are reported beside the patch (Q-31).

## Tests and golden tests
- `test/brep/` (geometry, model, transaction; 3D-09): every golden input sound, on its planes, byte-identical
  `save -> load -> save`; broken copies reported; patches and lineage valid against the contracts (Ajv).
- Golden: `test/golden/gt-25.golden.test.js` (GT-25, world -> local -> world <= 0.001 m; measured 0 m).
- Cost on the bench scenes (3D-09, warm, 300 requests): sawtooth-199 index 0.59 ms, topology 0.53 ms, transaction with
  re-derivation 3.9 ms p50 / 6.8 ms p95; sawtooth-499 transaction 14.2 / 22.5 ms. Clone and diff dominate (~2 ms each
  at 199 faces); a dirty-tracking draft is the next step if a gate needs it.
- `test/canary.test.js`: marker format, entry exports it.
- `test/crs/`: registry, ENU accuracy against closed-form ECEF and GeographicLib oracles, round trip of
  `test/crs/fixtures/gt-i1-epsg4937.cityjson.json` (made by `test/crs/make-fixture.mjs` from GT-I1). Golden tests: none yet (3D-07).
