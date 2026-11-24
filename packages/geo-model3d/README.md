# @geoiplus/geo-model3d

- Status: implemented - `brep` core (3D-09), `crs` (3D-32), `cloud` (3D-22), `validate` (3D-12); other modules follow their rows (3D-10..3D-21)
- Protection: P4 - server-only (D-06, D-07); never in a browser bundle, no DOM, no three.js (AGENTS.md §2)
- WP: 3D-05 (bootstrap), 3D-09 (core), 3D-32 (crs), 3D-22 (cloud), 3D-12 (validate)   Spec: [docs/specs/3dqm-spec.md](../../docs/specs/3dqm-spec.md) §3, §4, §4a, §8, §9
- Source/donor: new; third-party runtime code permissive only ([3D-ADR-0004](../../docs/decisions/adr/3D-ADR-0004-kernel-language-boolean-licences.md));
  `robust-predicates` not adopted (D-118, D-143)
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
- `fitPlane(points, selection, profile)` (3D-22) - points `Float64Array` x y z interleaved, LOCAL frame; contract
  `PointSelection`; `{ result: plane-fit-result }` or `{ error }` (`INVALID_MEASUREMENT` with `pointCount` /
  `inlierRatio`; `INVALID_PAYLOAD` for malformed points or selection).
- `deviationStats(model, points, request, profile)` (3D-22) - contract `heatmap-request` -> `{ result: heatmap-result }`
  or `{ error }` (`INVALID_PAYLOAD`: unknown `faceIds`, missing threshold, bad selection).
- `validateModel(model, { mode, targetState, tolerances, clock, affectedEntityIds?, fullSolid?, findings?,
  externalValidator? }) -> Promise<ValidationReport>` (3D-12, spec §8): contract `validation-report` out; see `validate` below.
- Names fixed for later rows (D-119): `executeCommand` (3D-14..3D-21), `importBuilding` (3D-10),
  `exportBuilding` (3D-11).

## Modules (`src/`, DAG of 3D-ADR-0002 C1 rule 2, enforced by `check:arch`)
`brep` (3D-09) is the leaf every other module imports. Its surface (`src/brep/index.js`), for kernel modules only:

| File | Contents |
|---|---|
| `vec.js`, `plane.js` | vectors; `normal · p + d = 0`; `derivePoint(planes, numericEpsilon)`: 3 planes exact, 4+ least squares with residual; null below the Gram-determinant rank threshold |
| `frame.js` | `localFrame(frame, metric?)`: local = Rz(-buildingAxisDeg) · metric; metric mapping injected (D-116), default `world - originWorld` |
| `halfedge.js` | `buildIndex` (rings by `nextId`, faces of vertex, shell of face), `checkTopology` (spec §4 r7; internal kinds `LINK`, `TWIN_*`, `SHELL_FACE`, `VERTEX_FACE`; `validate` maps them to codes) |
| `derive.js` | `vertexPlaneViolations` (shared invariant helper for every op row, spec §4 Accept 2), `inconsistentJunctions` / `junctionSpread` (`INCONSISTENT_JUNCTION`: spread of the 3-plane points > `topologySnapTolM`, D-145), `rederive` (D-70: EXPLICIT -> DERIVED when a face changes) |
| `patch.js`, `transaction.js` | `diffModels`, `applyPatch`; `transact(model, mutate)`: isolated copy, version + 1, forward / inverse patch, lineage; `transactPatch` for Undo / Redo as new versions |
| `rtg.js`, `serialize.js` | `roofGraph` (projection, canonical ids only); `saveModel` / `loadModel` / `isolatedCopy` |

## `validate` (3D-12; spec §8; imports `brep` only)
Surface `src/validate/index.js` for kernel modules (`ops` uses `runChecks` and `newErrors` in its pipeline):

| File | Contents |
|---|---|
| `codes.js` | one table code -> severity in DRAFT_SOLID / VALID_SOLID (spec §8 rule 4, D-77) + scope [A]; `DRAFT_SURFACE` -> draft column, `APPROVED` -> valid column (D-146) |
| `modes.js` | `runChecks`: FAST_PREVIEW = local checks of the affected faces + one ring of neighbours [A]; COMMIT_VALIDATION = whole-model invariants, shell closure / orientation, self-intersection of the affected volume, everything with `fullSolid`; FINAL = full COMMIT + external port |
| `structure.js` | open boundary, non-manifold edge / vertex (fans), shell closure and connectivity; brep structural kinds -> codes [A] |
| `geometry.js` | degenerate edge / face (`minEdgeLengthM`, `minFaceAreaM2`), non-planar face (`planarTolM`), ring orientation vs support-plane normal, shell orientation by signed volume, junctions |
| `intersect.js`, `polygon.js` | ring self-intersection (x-sweep), face pairs piercing / overlapping in one shell; tolerance predicates only (D-143) |
| `overlap.js` | `SOLID_OVERLAP` between bodies of one building (crossing faces, vertex deeper than `planarTolM`, centroid; winding number); never between buildings (D-89) |
| `lineage.js` | "new" issues: an old issue's ids mapped through `topology-lineage` meet the new issue's ids -> not new [A]; `newErrors` = commit gate of spec §8 rule 7 |
| `external.js` | external validator port type; val3dity code -> contract code, fallback `EXPORT_SCHEMA_ERROR` [A]; binding = 3D-73 (D-141/2, [3D-ADR-0008](../../docs/decisions/adr/3D-ADR-0008-val3dity-binding.md)) |
| `report.js` | dedupe, deterministic order, message = localisation key `model3d.validation.<camelCode>` [A] (D-91), `validatorVersion` `geo-model3d-validate/1` (+ port version in FINAL) [A] |

Readings [A] (maps of `codes.js`, `structure.js`, `external.js`) are reviewed by the owner at acceptance (Q-45).
Findings of other modules (solve, crs, export, cloud, import) enter as `findings` and get scope and severity from the
same table (D-144). FAST_PREVIEW never sets `isValidForTargetState` (spec §8 rule 1).

## Internal modules
- `src/crs/` (3D-32): `resolveCrs`, `createMetricFrame` (projected: translation; geographic: local ENU),
  `writeBackVertices` (untouched vertices keep file integers, D-70), `decodeVertex`; throws `CrsError` with code
  `INVALID_CRS`. Not in `index.js`; `import` / `export` (3D-10, 3D-11) call it. Spec §4a.

- `src/cloud/` (3D-22, spec §9): `fit-plane.js` (RANSAC on triples, then least squares on the consensus set:
  centroid + smallest eigenvector of the scatter matrix, `eigen.js` Jacobi), `deviation.js` + `polygon.js` (nearest face
  polygon within `heatmapBufferM`, signed normal distance, D-135), `points.js` (selection filter), `rng.js`
  (mulberry32). RANSAC (D-130): inlier distance `planarTolM`, adaptive iterations for 99.9 %, at most 1000, fixed
  seed. Readings marked [A]: fitted normal oriented z > 0 (then y, x); a point on a ring boundary follows the crossing
  rule; empty heatmap summary reports zeros.

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
- `test/validate/` (3D-12): every code x {DRAFT_SOLID, VALID_SOLID} (Accept 1), lineage "new" via real transactions
  (Accept 2), FINAL with a stub port (Accept 3), modes, every golden input (VALID_SOLID inputs clean); all reports valid
  against `validation-report` (Ajv). Cost (3D-12, warm, this container): sawtooth-199 FAST 6.4 ms p50 / 9.1 ms p95,
  COMMIT (one face affected) 12.1 / 16.6, full solid 23.3 / 32.4; sawtooth-499 FAST 29.1 / 41.5, full 111.8 / 150.3.
- Golden: `test/golden/gt-25.golden.test.js` (GT-25, world -> local -> world <= 0.001 m; measured 0 m).
- Golden GT-20 (`gt-20.golden.test.js`): normal deviation 0.0051 deg (<= 0.2), RMSE 0.00778 m (<= 0.015), inliers
  444 / 500 = 0.888 (>= 0.85). GT-21 (`gt-21.golden.test.js`): south slope mean 0.07935 m over 447 points
  (0.080 +/- 0.005). Both run the kernel functions; the `FIT_PLANE` command step is 3D-71.
- `test/cloud/` (3D-22): fit (clean, outliers, determinism, selection, refusals at 29 points and ratio < 0.6, Ajv
  against `plane-fit-result` / `error`), heatmap (assignment, buffer, `faceIds`, polygon edge distance, refusals, Ajv
  against `heatmap-request` / `heatmap-result`), eigen solver, generator, ring test.
- Cost on the bench scenes (3D-09, warm, 300 requests): sawtooth-199 index 0.59 ms, topology 0.53 ms, transaction with
  re-derivation 3.9 ms p50 / 6.8 ms p95; sawtooth-499 transaction 14.2 / 22.5 ms. Clone and diff dominate (~2 ms each
  at 199 faces); a dirty-tracking draft is the next step if a gate needs it.
- `test/canary.test.js`: marker format, entry exports it.
- `test/crs/`: registry, ENU accuracy against closed-form ECEF and GeographicLib oracles, round trip of
  `test/crs/fixtures/gt-i1-epsg4937.cityjson.json` (made by `test/crs/make-fixture.mjs` from GT-I1). Golden tests: none yet (3D-07).
