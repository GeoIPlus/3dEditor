# 3DQM specification - module form

Status: **accepted by the owner** (3D-04, D-71; reviewed before 3D-06 as D-67 requires). Date: 2026-11-21.
This document is the maintained 3DQM spec. It restates `docs/source/fullSpecsV0.3.md` (v0.3) module by module, with the
parts of `fullSpecsV0.2.md` (v0.2) that v0.3 keeps in force, under the decisions in
[DECISIONS.md](../decisions/DECISIONS.md). Source priority when they conflict (D-20): DECISIONS > HANDOVER > v0.3 >
v0.2 Appendix C > rest of v0.2.

How to read it (AGENTS.md §1.5): read §1 and the section of your module only. Each module section has the same four
parts: **Purpose**, **API**, **Rules**, **Accept**. `Accept:` lines are the acceptance lines of the WP rows named in the
section header; a WP row may add lines of its own.

Marks: `[D]` decided (D-NN), `[V]` verified against a file, `[A]` this spec's reading of the sources, to be confirmed in
the owner review. A source reference such as `(v0.3 §5)` or `(v0.2 C.7)` names where a rule comes from. A value the
sources do not give is written `TBD` with the open question that closes it (§14); it is never guessed (AGENTS.md §2.4).
Field and command names in this spec are the names used in the sources; names the sources do not give are chosen by
3D-06 in the schemas and approved by the owner (D-18).

## 1. Scope, conventions, module map

### 1.1 Scope

- 3DQM edits **existing** LoD2 building models. Creation is limited to `REPLACE_ROOF` with the templates flat, shed,
  gable, hip on the existing footprint [D] (D-01).
- Input and output are CityJSON; anything else is converted before 3DQM [D] (D-02). CityJSON 2.0.x; the exact version is
  pinned with the validator version [D] (v0.3 Д-08, D-91).
- Production input is the point cloud plus manual input; no stereo [D] (D-03).
- The first release ends at `VALID_SOLID` + export. `APPROVED` is a geometry QC mark; no tax profile [D] (D-04). Export
  only for valid solids; drafts stay inside [D] (D-05).
- The operation set is v0.3 §6 [D] (D-12); the full `OperationKind` list is §2.2.
- Point cloud in the editor: snapping to points, model-to-cloud deviation heatmap, plane fit from selected points [D]
  (D-11).
- The geometry kernel runs **only on a server** (P4); the browser holds a visual ghost without solver logic; no WASM
  build for browsers [D] (D-06). Kernel language: JavaScript ESM + JSDoc on Node [D] (D-109,
  [3D-ADR-0004](../decisions/adr/3D-ADR-0004-kernel-language-boolean-licences.md); Q-01 closed). Nothing in this spec
  depends on the language.

### 1.2 Conventions

- **Planes are primary, vertices are derived** [D] (D-08; v0.3 §4.1). Every algorithm in this spec is stated in plane
  terms: its unknowns are `Face.supportPlane` values; vertex positions follow from them (§4).
- Units: metres and degrees (v0.3 §4.3). Coordinates are double precision; the kernel works in the building's local frame
  (`CoordinateFrame.originWorld` + `buildingAxisDeg`); world coordinates are reconstructed by transform without
  accumulating edit error (v0.2 B.3, M-02). For a geographic CRS the frame is a local metric ENU frame (east, north,
  up) at `originWorld`; `originWorld` is in the units and axis order of `horizontalCrs` [D] (D-92, D-124; §4a).
- `LOCAL_X` / `LOCAL_Y` in commands always mean the building axes, including `buildingAxisDeg` (v0.3 §4.3).
- Ring orientation: the outer ring of a face is counter-clockwise seen from outside the solid, inner rings clockwise
  (v0.3 §4.3).
- Plane: `normal · p + d = 0`, `|normal| = 1` (v0.2 B.2). `z = f(x, y)` is used only when `|normal.z| > numericEpsilon`;
  general algorithms solve 3D intersections (v0.2 §15.2).
- Ids: the server creates UUIDs at `COMMIT`; a PREVIEW may use ephemeral ids in an explicit namespace with a topology
  mapping (v0.2 B.6).
- Derived values (`area`, `slope`, `volume`, `isWatertight`, normals, triangulation, status) are computed on the server
  after each operation and are never accepted as authoritative input from a client (v0.2 B.3).
- Determinism: the kernel has no I/O, no clock, no randomness; ids and clock are injected [D] (D-51, 3D-ADR-0002 C1
  rule 1). Golden tests are deterministic.
- Tolerances: the starting profile is v0.3 §10 [D] (D-13), §2.3. Tolerances are algorithm settings, not product
  accuracy claims (v0.3 §10; v0.2 §15.4).

### 1.3 Dropped from v0.3 (and why)

| Dropped | Reason |
|---|---|
| Gates G0..G5 as process (v0.3 §13), agent work order, DoR/DoD, task template (v0.3 §13 last line -> v0.2 E.3, E.4, G) | Replaced by WP rows in [BACKLOG.md](../BACKLOG.md), AGENTS.md §4 and §9 (HANDOVER §5). Golden tests keep their content; their gate column is replaced by a module and a WP row (§13) |
| Admin column of v0.3 §8.5: viewing all packages, creating packages, assigning buildings, managing tolerance profiles, releasing another user's lock | D-10: assignments and roles come from the CP contract, not from an admin screen in the editor (supersedes v0.3 Р-09). Only what a workplace must enforce locally stays (§11) |
| "Package" as a 3DQM object (v0.3 §8.5: named list of `buildingId`, one active package per building) | D-10: the building set of an operator is the signed CP assignment (Operaflow work units, 3D-01 §9). GT-23 and GT-24 are restated in those terms (§13) |
| Own building lock, renewal by activity, `lockTtlMin` (v0.3 §8.5, §10) | D-69: the CP assignment lease is the only lock |
| Compiled kernel, ADR-001 language choice (v0.3 §3) | D-109: JavaScript ESM + JSDoc on Node, measured in 3D-08 ([3D-ADR-0004](../decisions/adr/3D-ADR-0004-kernel-language-boolean-licences.md); Q-01 closed) |
| TypeScript DTOs as the contract (v0.3 §4, §9) | Contract first: JSON Schema 2020-12 in `contracts/model3d/` (AGENTS.md §2.7, D-37); §2 lists the schemas |
| Client module `features/editor/` in geoviewer; architecture diagram of v0.3 §3 | Client parts are SC library components (D-17, D-52..D-55); geoviewer is one host (§12) |
| "CityJSON already loaded in the system" (v0.3 §5) as a source of topology | The kernel reads the original CityJSON on the server; the geoviewer drawing path is not a topology source (HANDOVER §5) |
| P1 / excluded items of v0.3 §14 (F-26..F-28, F-32, F-35, F-38, stereo, textures, F-51, F-52, F-54, F-59, F-61, M-04, M-05, M-08, E-13, E-16, v0.2 §16.5) | Out of first-release scope (v0.3 §14, D-12) |

### 1.4 Module map

| § | Module | Location | WP rows | Imports (3D-ADR-0002 C1 rule 2) |
|---|---|---|---|---|
| 2 | Contracts | `contracts/model3d/` | 3D-06 | - |
| 3 | Kernel public API | `packages/geo-model3d/src/index.js` | 3D-09, each op row | all modules |
| 4 | `brep` | `packages/geo-model3d/src/brep/` | 3D-09 | `crs` |
| 4a | `crs` | `.../src/crs/` | 3D-32 | - (third party: `proj4`, [3D-ADR-0007](../decisions/adr/3D-ADR-0007-crs-transform.md)) |
| 5 | `solve` | `.../src/solve/` | 3D-13 | `brep` |
| 6 | `import` | `.../src/import/` | 3D-10 | `brep`, `crs` |
| 7 | `export` | `.../src/export/` | 3D-11 | `brep`, `crs` |
| 8 | `validate` | `.../src/validate/` | 3D-12 | `brep` |
| 9 | `cloud` | `.../src/cloud/` | 3D-22 | `brep` |
| 10 | `ops` | `.../src/ops/` (one module per `OperationKind`) | 3D-14..3D-21, 3D-22 (`FIT_PLANE`) | `brep`, `solve`, `validate` |
| 11 | Kernel service | `services/kernel/` | 3D-23, 3D-24 (and GT-23: 3D-25, §13) | `geo-model3d` (the only importer) |
| 12 | Client obligations | SC `workspace/tools`, `geo-render/model3d`, registry adapter | 3D-40..3D-44 (SC rows authoritative) | message contract only |
| 13 | Golden tests map | `fixtures/` (3D-07) | all | - |

---

## 2. Contracts - `contracts/model3d/` (3D-06)

**Purpose.** Every shape that crosses a process or repository boundary is a JSON Schema 2020-12 before it is code
(AGENTS.md §2.7). Schemas live only here; `$id` = `urn:geoiplus:schema:model3d-<name>:v<major>`; consumers vendor a pinned
copy [D] (D-37, 3D-ADR-0001). Internal kernel structures never leave the package (3D-ADR-0002 C1 rule 3).

**API - the list of schemas.** `<name>` values are this spec's proposal for 3D-06; 3D-06 may merge or split them.

| # | Schema `<name>` | Content | Source |
|---|---|---|---|
| 1 | `building-model` | `BuildingModel` and its entities: `Footprint`, `ConstructionEntity`, `Vtx`, `HalfEdge`, `Plane`, `Face`, `Shell`, `Solid`, `RoofComponent`, `Constraint`, `CoordinateFrame`, `SemanticNode`, `ModelState`, `EdgeRole`, `SurfaceKind`, with the v0.3 §4.2 changes (§4 rules 6-7) | v0.2 B.2; v0.3 §4 |
| 2 | `measurement` | `Measurement3D` with `createdBy`, `frame: LOCAL \| WORLD`; P0 `sourceType`: `POINT_CLOUD \| MODEL \| MANUAL` | v0.2 Module 14; v0.3 §4.2 |
| 3 | `tolerance-profile` | The 14 fields of §2.3 with the D-13 values as defaults; per project | v0.3 §10; D-13 |
| 4 | `command` | `GeometryCommand` envelope (§2.2) | v0.2 D.2; v0.3 §9 |
| 5 | `command-payload-<kind>` (or `$defs` per kind) | One payload schema per `OperationKind` (§2.2); `UNDO` / `REDO` payload empty | v0.3 §9.1; §10 of this spec |
| 6 | `command-result` | `GeometryCommandResult`: `commandId`, `status: PREVIEW \| COMMITTED \| REJECTED \| CONFLICT`, `modelVersion`, `previewId?`, `patch?`, `topologyLineage?`, `validation`, `warnings`, `error?` | v0.2 D.2 |
| 7 | `model-patch` | `ModelPatch`: `added`, `updated`, `deleted`, `affectedMetrics`; canonical entities, not only RTG | v0.2 D.2 |
| 8 | `topology-lineage` | `{ mapped, deleted, preserved }`: `oldEntityId -> [newEntityIds]`, deleted ids, preserved ids | v0.3 §9.1; v0.2 B.6 |
| 9 | `validation-report` | `ValidationReport` / `ValidationIssue` with the code list of §8 | v0.2 B.5; v0.3 §8.3 |
| 10 | `error` | Error registry of §2.4: code, HTTP status, `entityIds?`, message key | v0.3 §9.2 |
| 11 | `import-report` | Result of `IMPORT_BUILDING`: issues, merged/inferred tags, state assigned (content in §6; shape by 3D-06) | v0.3 §5 step 11 |
| 12 | `journal-entry` | One committed operation: `operationId`, `commandId`, `beforeVersion`, `afterVersion`, `actorId`, `timestamp`, `input`, `affectedEntityIds`, `forwardPatch`, `inversePatch`, `validationSummary`, `topologyLineage` | v0.2 §13.6 |
| 13 | `command-status` | Status of a command by `commandId` after a timeout (§11) | v0.3 §9.2 |
| 14 | `plane-fit-result` | Plane, inlier count, inlier ratio, RMSE (§9) | v0.3 §7 |
| 15 | `heatmap-result` | Per-face colouring + summary: RMSE, maximum, share of points beyond the threshold (§9) | v0.3 §7 |
| 16 | `export-report` | Batch export: exported buildings, skipped buildings with reason (§11) | v0.3 §8.4 |
| 17 | `heatmap-request` | Heatmap request, not a command (changes nothing): `buildingId`, `modelVersion`, `selection` (`PointSelection`), optional `faceIds`, required `thresholdM` (§9 r6) | v0.3 §7; D-136 |
| 18 | `metrics-result` | F-53 geometric metrics of one model version: footprint, roof plan, roof, overhang roof, soffit areas; main / overhang / total volume; `volumeStatus` FINAL / PROVISIONAL / NOT_AVAILABLE (§3; geometric only, v0.2 §16.5) | v0.2 F-53; D-412, D-413 |
| 19 | `approval-request` | Reviewer's approval of the head version: `expectedVersion`; building in the route; not a command (§11 r8) | v0.3 §8.1; D-450, D-455 |
| 20 | `approval` | Approval mark of one version: `projectId`, `buildingId`, `modelVersion`, `actorId`, `timestamp`; written once (§11 r8) | v0.3 §8.1; D-450, D-455 |
| 21 | `export-request` | Batch export: `buildingIds` (§11 r9) | v0.3 §8.4; D-453, D-455 |
| 22 | `export-result` | `export-report` + per-building save outcome and delivered bytes (digest, `https` address) (§11 r9) | 3D-ADR-0003 §4; D-455 |
| 23 | `import-request` | Service import of one building: empty; building in the route; input / `progress.save` datasets resolved by the service (§11 r15) | v0.3 §5; D-3D133-1, D-3D133-3 |

The 3DQM extension of the CP document (building list, roles, tolerance profile, endpoints) is an SC schema (3D-43; Q-03),
not part of this list.

`PointSelection` is a shared definition of `common` (`$defs` only, no row): the cloud points chosen by the operator
(rectangle or lasso in the view) as `{ kind: BOX, min, max }` or `{ kind: POLYGON, ringXY, zMin, zMax }` in the LOCAL
frame of the building. The `FIT_PLANE` payload `selection` and the `heatmap-request` `selection` use it [D] (D-132,
D-136).

The schemas are accepted (D-75). Contract details they leave `TBD` are the open questions Q-26..Q-39 of
[contracts/model3d](../../contracts/model3d/README.md#open-questions-provisional-ids-d-38), listed in §14.

### 2.1 Command envelope (`command`)

Fields (v0.2 D.2): `schemaVersion`, `commandId`, `projectId`, `buildingId`, `actorId`, `operation` (`OperationKind`),
`phase: PREVIEW | COMMIT`, `expectedVersion`, `payload`, `coordinateFrame: LOCAL | WORLD`, `targetState` (`ModelState`),
`previewId?` (required on `COMMIT` after a PREVIEW, v0.3 §3). Rules:

- `actorId` is informational only; authority comes from the authenticated context on the server (v0.2 D.2).
- `expectedVersion` is required; a changed version is `409 VERSION_CONFLICT`; a conflicting command is never re-applied
  to new topology without confirmation (v0.2 D.4).
- The value of `schemaVersion` (v0.2 says `'0.2'`) is set by 3D-06 together with the `$id` major version.

### 2.2 `OperationKind` (v0.3 §9.1)

`IMPORT_BUILDING`, `RESTORE_BASELINE`, `MOVE_VERTEX`, `MOVE_EDGE`, `OFFSET_FACE`, `SPLIT_FACE`, `INSERT_ROOF_BREAK`,
`MERGE_FACES`, `REMOVE_DETAILS`, `ALIGN_RIDGE`, `ALIGN_EAVE`, `MATCH_ELEVATIONS`, `STRAIGHTEN_FACE`, `TRIM_FACE`,
`EXTEND_FACE`, `REMOVE_FACE`, `HEAL_HOLE`, `FIT_TO_SHARED_EDGE`, `ALIGN_JUNCTION`, `RESIZE_ROOF`, `SET_OVERHANG`,
`REGULARIZE_FOOTPRINT`, `ALIGN_WALL`, `SET_HEIGHT`, `TRANSLATE_BUILDING`, `ROTATE_BUILDING`, `ADD_DORMER`, `ADD_CHIMNEY`,
`REMOVE_INSTALLATION`, `REPLACE_ROOF`, `REBUILD_ENVELOPE`, `SET_SEMANTICS`, `SET_CONSTRAINT`, `REMOVE_CONSTRAINT`,
`FIT_PLANE`, `UNDO`, `REDO` - 37 kinds. Each has a payload schema (§2 row 5). The only deletion command names are
`REMOVE_FACE`, `HEAL_HOLE`, `REMOVE_INSTALLATION` (v0.3 §6).

### 2.3 Tolerance profile (v0.3 §10, D-13)

| Field | Default | Use |
|---|---|---|
| `numericEpsilon` | 1e-9 | numeric predicates in the local frame |
| `topologySnapTolM` | 0.01 | vertex merge, welding |
| `planarTolM` | 0.02 | face planarity, vertex-to-plane distance |
| `zAlignTolM` | 0.01 | equal Z |
| `minEdgeLengthM` | 0.05 | degenerate edge |
| `minFaceAreaM2` | 0.1 | degenerate / small face |
| `coplanarTolDeg` | 1.0 | face merge |
| `footprintAngleTolDeg` | 5.0 | regularisation, rectangle check |
| `flatRoofTolDeg` | 1.0 | flat vs shed boundary |
| `screenSnapPx` | 10 | UX only (client) |
| `heatmapBufferM` | 1.0 | point selection for the heatmap |
| `planeFitMinPoints` | 30 | minimum points for plane fit |
| `planeFitMinInlierRatio` | 0.6 | minimum inlier share |
| `exportRoundDecimals` | 3 | rounding on export (mm) |

The profile is set per project and delivered with the workplace (3DQM extension, Q-03 / 3D-43) [A]. `measurementTolM`
(v0.2 B.4) has no v0.3 value: `TBD` (Q-24). The RANSAC parameters of the plane fit are kernel settings, not profile
fields (§9 r3, D-130); the heatmap threshold is a field of each `heatmap-request`, not of the profile (§9 r6, D-131). `lockTtlMin = 15` of v0.3 §10 is dropped: 3DQM keeps no own lock, the
CP assignment lease applies [D] (D-69; amends D-13 for this field). The profile has 14 fields.

### 2.4 Error registry (v0.3 §9.2)

| HTTP | Code | Meaning |
|---|---|---|
| 400 | `INVALID_PAYLOAD` | Payload fails its schema; `INVALID_MODE` is a special case of it |
| 401 | `UNAUTHENTICATED` | No valid session |
| 403 | `FORBIDDEN` | No role, building outside the assignment, or another holder's lock / lease |
| 404 | `NOT_FOUND` | No building, version or `previewId` |
| 409 | `VERSION_CONFLICT` | The version changed |
| 413 | `PAYLOAD_TOO_LARGE` | Limit exceeded (limit `TBD`, Q-24) |
| 422 | `UNDERCONSTRAINED_GEOMETRY`, `CONSTRAINT_CONFLICT`, `INVALID_TOPOLOGY`, `INVALID_GEOMETRY`, `INVALID_MEASUREMENT`, `UNSUPPORTED_FOOTPRINT` | Domain refusals |
| 422 | `INVALID_CRS` | The point cloud's CRS cannot be mapped to the building's (`details.crsReason`; §9 r7, r8; D-406) |
| 422 | `NOT_APPROVABLE` | Approval of a head version that is not `VALID_SOLID` or has no passed `FINAL_VALIDATION` (`details.approvalReason`; §11 r8; D-456) |
| 429 | `RATE_LIMITED` | PREVIEW rate exceeded (server limit `TBD`, Q-24) |
| 500 / 503 | `INTERNAL`, `UNAVAILABLE` | Failure; model unchanged |

`GEOMETRY_INVALID` of v0.2 C.0 is replaced by `INVALID_GEOMETRY`. "403 because of a package" (v0.3) reads "building
outside the signed assignment" (D-10). Codes of the refusals the sources leave without one are decided by D-76 (Q-20
closed) and named where each refusal is listed (§10.3 rule 6, §10.5 rule 5, §10.6 rule 2, §10.8 rule 2).

**Accept:**
- Accept: one JSON Schema 2020-12 per row of the schema list (or a `$defs` entry, as 3D-06 decides), each `$id` matching
  `urn:geoiplus:schema:model3d-<name>:v<n>`; valid and invalid examples per schema; Ajv 2020 compiles all (3D-06 Details).
- Accept: a payload schema for each of the 37 `OperationKind` values of §2.2; `UNDO` / `REDO` payloads are empty.
- Accept: `tolerance-profile` defaults equal §2.3 field by field (14 fields, no `lockTtlMin`).
- Accept: the `error` schema enumerates exactly the codes of §2.4 with their HTTP statuses.

---

## 3. Kernel public API - `geo-model3d/src/index.js` (3D-09, extended by each op row)

**Purpose.** The single `exports` entry of the pure kernel: command dispatch (PREVIEW / COMMIT / UNDO / REDO), import,
export, validate (3D-ADR-0002 C1). Function names are fixed by 3D-09.

**API.**
- Execute a command: input = current model, `command` (§2.1), tolerance profile, injected ids/clock, and for
  `UNDO`/`REDO`/`RESTORE_BASELINE` the journal entries / baseline the service passes in; output = `command-result` and,
  on `COMMIT`, the new model, `journal-entry` data (forward and inverse patch, lineage).
- Import: original CityJSON + building id + profile -> model, baseline, `import-report` (§6).
- Export: model -> CityJSON (§7).
- Validate: model + mode -> `validation-report` (§8).
- Plane fit and heatmap on point arrays passed in (§9).
- Geometric metrics [D] (D-412..D-415; 3D-116): `computeMetrics(model, { toleranceProfile })` -> `metrics-result`;
  read-only; BuildingInstallation excluded; overhang volume by boundary-loop closure; `volumeStatus` from a fresh check.
- Cloud points into the building frame [D] (D-164, D-196..D-198; 3D-69): `cloudToLocal(frame, cloudCrs, points)` maps
  points of the cloud's horizontal CRS into the building's local frame; `localBoxToCloud(frame, cloudCrs, box)` gives
  the box of the cloud world that holds a local box (§4a rules 6-8, §9 rule 8).
- Inputs and outputs are `contracts/model3d/` shapes only (C1 rule 3).

**Rules** (v0.2 C.0, §15.5; v0.3 §3, §6):
1. Pipeline of every operation: parse and validate the payload -> resolve coordinates and measurements in the local frame
   -> build the candidate on an isolated copy -> solve hard then soft constraints (§5) -> recompute the affected subgraph
   -> rebuild the dependent envelope -> validate for the target state (§8) -> compute patch, inverse patch, lineage,
   affected metrics. Authorisation and version checks are done by the service before the call (§11) [A: split per
   3D-ADR-0002 C2].
2. **Failure = no partial side effects.** Any refusal returns the original model unchanged (v0.2 §15.5).
3. PREVIEW uses the same solver and geometry as COMMIT and persists nothing (v0.2 C.0). COMMIT with a `previewId` applies
   exactly the result that was shown, or is refused when the version changed (v0.3 §3).
4. A commit adds no new errors for the current state (v0.3 §6; replaces v0.2 "keep c(e)=2" and "keep watertightness").
   "New" = an issue not present in the previous version after mapping `entityIds` through `topologyLineage`
   (v0.3 §8.3).
5. A hard-constraint conflict is a refusal (`CONSTRAINT_CONFLICT` with the conflicting ids), never a partial change
   (v0.3 §6; v0.2 §15.2).
6. Every result carries canonical entities and `topologyLineage` (v0.3 §6).

**Accept:**
- Accept: a refused command of any kind returns a model deep-equal to its input (property test over all op modules).
- Accept: PREVIEW followed by COMMIT with its `previewId` on the same version yields the same patch as the PREVIEW.
- Accept: the public entry imports only kernel modules and the canary; `check:arch` passes (3D-05, 3D-09 rule).

---

## 4. `brep` - canonical model, planes, half-edge, frame, transactions (3D-09)

**Purpose.** The single canonical `BuildingModel` per version (K-01): planar B-Rep with inner rings, shells and solids
(K-02), half-edge traversal (K-09), the roof topology graph (RTG) as a projection (K-03), the local frame (M-02),
transactions and versions (K-06), id stability and lineage (K-08), deterministic serialisation (K-11).

**API.** Model read/write within the package; derive a vertex from its defining planes; world <-> local transform;
isolated copy, patch + inverse patch + lineage between two versions; RTG projection (roof faces, adjacency, edge roles).

**Rules.**
1. `Face.supportPlane` is authoritative (v0.3 §4.1).
2. `Vtx.p` is derived: the intersection of the planes of its incident faces. `Vtx` gains `definingFaceIds: UUID[]`
   (v0.3 §4.1).
3. Where fewer than three independent planes meet (open boundary of a draft), `Vtx.p` is stored explicitly and must lie
   on its planes within `planarTolM` (v0.3 §4.1).
3a. An imported vertex keeps its file position (explicit `p`) until an operation first changes one of its faces; then it
   becomes derived [D] (D-70). Such vertices on a `NON_PLANAR_FACE` are reported by validation, not moved.
4. Invariant after every commit: the distance of each derived or explicit (rule 3) vertex to each of its planes is
   <= `planarTolM` (v0.3 §4.1); imported vertices under rule 3a are checked by validation (`NON_PLANAR_FACE`).
5. A node of 4+ planes that do not meet in one point within `topologySnapTolM` is `INCONSISTENT_JUNCTION`; it is repaired
   by `ALIGN_JUNCTION` (v0.3 §4.1).
6. DTO changes (v0.3 §4.2): `RoofComponent.buildingPartId` -> `ownerId` (`Building` or `BuildingPart` id);
   `RoofTemplateInstance` is not stored (template = one-shot generator); `Face`, `Vtx`, `SemanticNode` gain
   `sourceRef?`; `Footprint` gains `sourceKind: DERIVED_FROM_GROUND | USER_EDITED`, 2D only + `baseElevationM`;
   `Constraint.kind` gains `BOUNDARY_ON_FOOTPRINT`, `PREFERRED_AXIS`, `ROOF_SLOPE.target` in degrees;
   `CoordinateFrame` gains `buildingAxisDeg` (rotation of the local X axis from east, counter-clockwise); `HalfEdge` gains
   `nonManifoldGroupId?` for edges with 3+ faces from import; `ModelState` unchanged (`DRAFT_SURFACE`, `DRAFT_SOLID`,
   `VALID_SOLID`, `APPROVED`); `measurementProfileId` removed.
7. Half-edge: twin pairs, rings, holes; `twinId = null` is allowed in drafts; in a finalised shell each undirected boundary
   pair has two opposite half-edges on two faces of the same shell (v0.2 B.3).
8. `RoofGraph` references canonical `Face` / `HalfEdge` / `Vtx` ids and is never mutated on its own (v0.2 B.3, §15.1).
   `Footprint` and `ConstructionEntity` exist apart from the B-Rep (v0.2 B.3).
9. Every mutation is one transaction producing one new version; Undo/Redo are new versions too (v0.2 §15.1, §13.6).
10. `save -> load -> save` of an unchanged model does not change canonical geometry beyond tolerance (v0.2 B.6).

**Accept:**
- Accept: GT-25 (§13).
- Accept: after every committed operation in the op test suites, every vertex lies within `planarTolM` of each of its
  defining planes (shared invariant helper used by all op rows).
- Accept: a 4-plane node with residual > `topologySnapTolM` is reported `INCONSISTENT_JUNCTION`; <= is not.
- Accept: `save -> load -> save` of each golden input leaves canonical geometry unchanged beyond `numericEpsilon`
  (v0.2 B.6 says "beyond tolerance"; `numericEpsilon` is this spec's reading [A]).

---

## 4a. `crs` - CRS resolution, local metric frame, write-back (3D-32)

**Purpose.** Map one building between its file CRS and a local metric frame, and write changed vertices back; map
point-cloud coordinates of another horizontal CRS into the building's world [D]
(D-92, D-93, [3D-ADR-0007](../decisions/adr/3D-ADR-0007-crs-transform.md), D-125; D-164, D-197, D-198, 3D-69).

**API.** `resolveCrs(referenceSystem)`; `createMetricFrame(referenceSystem, originWorld)` with `toMetric` / `toWorld`;
`writeBackVertices({ frame, transform, fileVertices, changed, exportRoundDecimals })`; `decodeVertex`;
`createCrsMapping(fromRef, toRef)` -> `{ identity, forward, inverse }` (world of `from` <-> world of `to`, each in its
own axis order). Internal to the kernel (not in `index.js`); `import` (3D-10) and `export` (3D-11) call it; the kernel
entry composes `createCrsMapping` with the building's metric frame into `cloudToLocal` / `localBoxToCloud` (§3).

**Rules.**
1. A CRS reference is the CityJSON 2.0 OGC URL (`http(s)://www.opengis.net/def/crs/{EPSG|OGC}/{version}/{code}`) or
   `EPSG:nnnn`. It is looked up in a table generated from PROJ `proj.db` (versions recorded in the table). A compound
   CRS resolves through its horizontal part; the vertical part is kept, not transformed (D-93).
2. Supported: geographic 2D/3D CRSs in degrees with east/north axes and a metric ellipsoid; projected CRSs in metres
   with east/north axes. Anything else is `INVALID_CRS` (D-92).
3. Axis order is the EPSG authority order of the horizontal CRS, for geographic and projected CRSs alike (D-122).
4. Projected: metric = world - origin (axes in east, north order). Geographic: local ENU at the origin, through
   geodetic -> geocentric with `proj4` and the topocentric rotation; heights as in the file.
5. Write-back: untouched vertices keep their file integers; changed vertices are rounded (§7 rule 2) and quantised to
   the file's own `transform`; a coarser grid gives `PRECISION_LOSS` (D-70, D-123).
6. A point cloud in another horizontal CRS than the building is reprojected on the server, not refused (D-164): world
   of the cloud CRS -> geodetic coordinates -> world of the building CRS -> the building's metric frame of rule 4.
   Heights pass through unchanged (D-93). The same horizontal CRS is the identity: points are not touched.
7. Reprojection only on one geodetic datum (EPSG datum code of both CRSs). Different datums -> `INVALID_CRS` with
   reason `DATUM_MISMATCH` naming both datums; no Helmert, no grid shift, no "equal ellipsoid" shortcut (D-197).
8. Projections: each projected CRS of the table carries its PROJ projection definition, kept only when `proj4` agrees
   with PROJ within 0.001 m at the sample points of its area of use; every method `proj4` implements and the table
   generator can map from `proj.db` qualifies, not only Transverse Mercator. A projected CRS without such a projection
   -> `INVALID_CRS` with reason `NO_PROJECTION` (D-198).

**Accept:**
- Accept: an unedited geographic-CRS fixture writes back identical integers (GT-I4 rule, 0.001 m); an edited one writes
  changed vertices within 0.001 m; a projected file takes the same path with a translation only; unknown or unsupported
  CRS -> `INVALID_CRS` (tests in `packages/geo-model3d/test/crs/`).
- Accept: a building in EPSG:4937 with a cloud in EPSG:25832 gives the `FIT_PLANE` result and heatmap values of the
  all-EPSG:25832 case within `planarTolM`; a cloud in the building's CRS takes the unchanged path bit for bit; two
  datums -> `INVALID_CRS` `DATUM_MISMATCH` (3D-69: `test/crs/reproject.test.js`,
  `services/kernel/test/cloud-crs.test.js`).

---

## 5. `solve` - constraints, plane intersection, conflict diagnostics (3D-13)

**Purpose.** Solve plane unknowns under hard and soft constraints; report conflicts and missing degrees of freedom
(K-04, K-05; v0.2 §15.2).

**API.** Input: unknown planes (the movable `supportPlane`s), fixed planes, hard constraints, soft constraints with
weights, tolerance profile. Output: `feasible`, solved planes, conflicting constraint/entity ids, residuals, solver status,
missing degrees of freedom when underconstrained. Plane-plane-plane intersection with rank / residual check.

**Rules.**
1. Constraint kinds (v0.2 B.2 + v0.3 §4.2): hard (MVP) `FIXED_POINT`, `COINCIDENT`, `ON_PLANE`, `PLANAR_FACE`,
   `SHARED_EDGE`, `HORIZONTAL`, `VERTICAL`, `PARALLEL`, `PERPENDICULAR`, `EQUAL_Z`, `FIXED_LINE`, `FIXED_EAVE`,
   `FIXED_RIDGE`, `ROOF_SLOPE`, `BOUNDARY_ON_FOOTPRINT`; soft `CLOSE_TO_MEASUREMENT`, `MINIMIZE_DISPLACEMENT`,
   `PREFERRED_AXIS`, `SYMMETRY` (v0.2 §15.2). The sources give names only; their reading in plane terms is the
   table "Constraint kinds in plane terms" below (D-169).
2. Hard constraints hold within the configured numeric tolerance, not "on average". On conflict: `CONSTRAINT_CONFLICT`
   with a minimal useful list of conflicting ids (v0.2 §15.2). Check tolerances of the hard check (D-170): point, line
   and plane distances `planarTolM`; `EQUAL_Z` `zAlignTolM`; `COINCIDENT` `topologySnapTolM`; angular kinds exact up to
   `numericEpsilon` on sin / cos, so an inconsistent angle demand is always a conflict.
3. Soft constraints are optimised by explicit weights and measurement uncertainty (measurements: weight `1/σ²`, v0.3 §7);
   residuals and solver status are returned (v0.2 §15.2).
4. An LSQ/SVD plane fit does not guarantee hard constraints: after a best fit every hard constraint is checked; a miss is
   a failure, never a projection of fixed points (v0.2 §15.2, C.7 last paragraph).
5. Too few independent conditions -> `UNDERCONSTRAINED_GEOMETRY` with the missing degrees of freedom (v0.2 D.4, C.2).
   Threshold (D-172, under 3D-ADR-0005): a degree is free when the eigenvalue gap of O1 (stage 1) or the smallest
   singular value of the reduced stage-2 system is <= `numericEpsilon` of the profile (default 1e-9). Format (D-171, no
   schema change): `details.missingDegreesOfFreedom` is `string[]` with one entry per free degree, `"<faceId>:OFFSET"`
   or `"<faceId>:ROTATION"`; `entityIds` lists the faces.
6. `FIXED_POINT` never changes except by an explicit unlock (`REMOVE_CONSTRAINT`) (v0.2 C.11).
7. No hidden jumps of many vertices: a solve may change only the planes the operation declares movable (v0.2 C.9, §13.5).
8. Solver approach and the objective that fixes the remaining degrees of freedom of a movable plane:
   [3D-ADR-0005](../decisions/adr/3D-ADR-0005-solver-approach.md) (D-110; Q-17 closed): own two-stage solver (A1) with
   objective O1, keep the face's other vertices (least squares to their old positions, hard conditions exact).

**Constraint kinds in plane terms** (D-169; hard tolerance D-170; [S] stated by the sources, [P] proposal accepted by
the owner; same table as the [solve module card](../../packages/geo-model3d/README.md#solve-3d-13)):

| Kind | entityIds | target | Condition on the movable planes | Hard tolerance |
|---|---|---|---|---|
| FIXED_POINT [S] | [vertex] | V3, default the stored position | each defining plane contains the point; a DERIVED vertex is also re-checked at its derived position (check only, not a solver term; D-371, 3D-118) | `planarTolM` |
| ON_PLANE [S] | [vertex, face] | V3 optional | the target point, else the derived vertex, lies on the face plane | `planarTolM` |
| FIXED_LINE / FIXED_EAVE / FIXED_RIDGE [S] | [half-edge] | - | both incident planes contain the edge's current line; EAVE / RIDGE need that `edgeRole` | `planarTolM` |
| EQUAL_Z [S] | [vertex, vertex, ...] or [vertex...] + number | number optional | derived z equal to the first vertex's (or to the number) | `zAlignTolM` |
| COINCIDENT [P] | [vertex, vertex] | - | derived positions equal | `topologySnapTolM` |
| PLANAR_FACE, SHARED_EDGE [P] | [face] / [half-edge] | - | vertices on the plane(s); by construction for derived vertices (D-08) | `planarTolM` |
| HORIZONTAL / VERTICAL [P] | [face] or [half-edge] | - | face normal parallel / perpendicular to z; edge direction perpendicular / parallel to z | `numericEpsilon` |
| PARALLEL / PERPENDICULAR [P] | [face, face] or [half-edge, half-edge] | - | normals / directions parallel / perpendicular | `numericEpsilon` |
| ROOF_SLOPE [P] | [face] | degrees | angle(normal, z) = target | `numericEpsilon` |
| MINIMIZE_DISPLACEMENT [S] | [face...] | - | weight of the O1 terms of those faces (O1 is always on) | soft |
| PREFERRED_AXIS, SYMMETRY [P] | [half-edge] / [face, face] | - | soft: edge along a local building axis; equal slope of both faces | soft |
| BOUNDARY_ON_FOOTPRINT, CLOSE_TO_MEASUREMENT | - | - | rejected `TBD` (footprint segment; measurement layout Q-28, 3D-22) | - |

Any kind may be soft (`hard: false` + `weight`). A constraint the compiler cannot read is rejected with
`rejected[].reason`: `TBD`, `SOFT_KIND_MARKED_HARD` (rule 1), `SOFT_WITHOUT_WEIGHT` (no default weight is invented),
`ENTITIES_DO_NOT_MATCH_KIND`, `UNKNOWN_KIND`; the refusal code is the calling row's (3D-21 validates constraints when
they are set).

**Accept:**
- Accept: two contradictory hard constraints return `feasible = false` and both ids; no planes are changed.
- Accept: a movable plane constrained by fewer conditions than its degrees of freedom, with no soft constraint, returns
  `UNDERCONSTRAINED_GEOMETRY` naming the free degrees.
- Accept: a planes-only solve never changes a plane outside the declared movable set (property test).

---

## 6. `import` - CityJSON -> canonical model, I-01 (3D-10)

**Purpose.** `IMPORT_BUILDING`: read one `Building` CityObject with its `BuildingPart` and `BuildingInstallation`
children from the original CityJSON on the server into the canonical model + RTG + baseline (v0.3 §5; HANDOVER §5).

**API.** Input: CityJSON document (bytes read by the service), building id, tolerance profile. Output: model, immutable
baseline, `import-report`.

**Rules** (v0.3 §5 steps):
1. Geometry: the highest LoD in the 2.x range; if a `Solid` and a `MultiSurface` of the same LoD exist, take the `Solid`.
2. Apply `transform`; resolve `metadata.referenceSystem` (§4a); convert to the building's local metric frame in double
   precision (projected CRS: translation; geographic CRS: ENU) [D] (D-92). File coordinates are read in the EPSG
   authority axis order of the CRS [D] (D-122).
3. Merge vertices within `topologySnapTolM`.
4. Fit a plane to each surface (SVD); deviation > `planarTolM` -> tag `NON_PLANAR_FACE`; the face stays in the model.
5. Merge adjacent coplanar faces of the same semantic type (angle < `coplanarTolDeg`, offset < `planarTolM`).
6. Build half-edges: twin pairs, rings, holes. An edge with one face -> `twinId = null`; with 3+ faces ->
   `nonManifoldGroupId`.
7. Carry semantics (`RoofSurface`, `WallSurface`, `GroundSurface`, ...). Faces without semantics are classified by normal:
   `|n.z| < 0.1` wall; `n.z < -0.9` ground; otherwise roof; such faces get the tag `SEMANTICS_INFERRED`.
8. Derive the RTG edge roles from the two adjacent faces: horizontal edge with both faces descending from it `RIDGE`;
   sloped convex `HIP`; concave `VALLEY`; roof-wall horizontal `EAVE`; roof-wall sloped `RAKE`.
9. Derive `Footprint` from `GroundSurface` (`sourceKind: DERIVED_FROM_GROUND`).
10. Validate and assign the state: no errors -> `VALID_SOLID`; closed shell with errors, or open shell -> `DRAFT_SOLID`.
    The operator does not choose the state.
11. Return the immutable baseline (F-08) and the import report; the service stores them (§11).
12. No constraints are inferred at import; the operator sets `FIXED_*` explicitly. `GeometryInstance`, `appearance` and
    extensions are kept as opaque data and returned unchanged on export.
13. Each `BuildingPart` is kept and edited as its own body; creating or splitting parts is P1 [D] (v0.3 Д-09, D-91).
14. Projected and geographic CRSs are accepted; an unknown or unsupported CRS (not in the CRS table of §4a: e.g. a
    malformed reference, grads, non-metre projected units, geocentric) is refused with `INVALID_CRS` [D] (D-92; the
    non-metre case: D-125). Heights are used as in the file; the vertical CRS is kept, not
    transformed [D] (D-93). Adjacent buildings are imported and edited independently [D] (v0.3 Д-05, D-89).
15. More than 500 faces: import with a warning, no latency guarantee [D] (v0.3 Д-12, D-94).
16. Vertex positions are **not** replaced by plane intersections at import: every vertex keeps its file position until
    an operation first changes one of its faces (§4 rule 3a) [D] (D-70). A `NON_PLANAR_FACE` keeps its vertices and
    its fitted plane; the issue stays until the face is edited or repaired.

**Accept:**
- Accept: GT-I1, GT-I2, GT-I3 (§13).
- Accept: a face without semantics is classified by the normal thresholds of rule 7 and tagged `SEMANTICS_INFERRED`.
- Accept: opaque `GeometryInstance`, `appearance` and extension members are byte-equal after import -> export (with
  GT-I4).
- Accept: a CityJSON with an unknown or unsupported CRS is refused with `INVALID_CRS`; a geographic CRS is imported
  into an ENU frame (3D-32 tests: `packages/geo-model3d/test/crs/`).
- Accept: on a noisy input (vertices up to 0.015 m off their fitted planes) import -> export without edits reproduces
  the input coordinates within 0.001 m (D-70).

---

## 7. `export` - canonical model -> CityJSON (3D-11)

**Purpose.** Write the canonical model back to CityJSON (F-66), in world coordinates, with the opaque data of import.

**API.** Input: model at a version, the opaque data kept at import, profile. Output: CityJSON document (bytes stored by the
service).

**Rules.**
1. Geometry, semantics and object ids round-trip: an unedited import -> export matches within 0.001 m; semantics and ids
   are identical (v0.3 §12 GT-I4).
2. Only vertices changed by an edit are converted back to the file CRS; untouched vertices keep their file integers
   [D] (D-70, D-92). Changed coordinates are rounded to `exportRoundDecimals` (v0.3 §10); in a geographic CRS angles get
   `exportRoundDecimals + 5` decimals of a degree and heights `exportRoundDecimals` [D] (D-123). The file's
   `transform` is kept; a grid coarser than the rounding step is reported as `PRECISION_LOSS` (§4a).
3. The output LoD label equals the input; installations are written as `BuildingInstallation` of the same LoD
   [D] (v0.3 Д-07, D-91).
4. Opaque data (`GeometryInstance`, `appearance`, extensions) are returned unchanged (v0.3 §5).
5. Whether a model may be exported is decided by the service gate (§11 rule 9); the module itself exports any model it is
   given [A].
6. How faces tagged `OVERHANG` map to CityJSON surfaces: `TBD` (v0.2 F-30 makes it depend on an export profile; Q-25).

**Accept:**
- Accept: GT-I4 (§13).
- Accept: every changed coordinate is rounded by rule 2 before it is quantised to the file grid; untouched vertices
  are byte-equal integers.

---

## 8. `validate` - FAST_PREVIEW, COMMIT_VALIDATION, FINAL_VALIDATION (3D-12)

**Purpose.** Progressive validation (K-07) and the severity of each issue for the model state (v0.3 §8.2-§8.3).

**API.** Input: model (+ previous version and lineage for "new" issues), mode, target state. Output: `validation-report`
(v0.2 B.5): `modelVersion`, `targetState`, `isValidForTargetState`, `issues[]` (`code`, `scope`, `severity`, `entityIds`,
`location?`, `message`, `externalValidatorCode?`, `suggestedFix?`), `validatorVersion`, `createdAt` (injected clock).
`FINAL_VALIDATION` calls the external validator through a port supplied by the service (3D-ADR-0002 C1).

**Rules.**
1. Modes (v0.2 §16.2; v0.3 §8.2): `FAST_PREVIEW` - local invariants and diagnostics of affected elements, visual feedback
   only, never confirms a valid solid; `COMMIT_VALIDATION` - canonical invariants, constraints, stitching,
   self-intersection of the affected volume, regression checks; full solid check for critical operations;
   `FINAL_VALIDATION` - independent external validator (val3dity; version pinned, Q-10), semantic/schema validation,
   export round trip; `QA_APPROVAL` = `FINAL_VALIDATION` + the reviewer's mark (§11).
2. `c(e) = 2` is necessary, not sufficient: oriented edge traversal, rings/holes, no self-intersection, shell
   connectivity/nesting and `BuildingPart` body compatibility are checked too. Adjacent face normals need not be opposite;
   the traversal of the shared edge must be (v0.2 §16.2).
3. Codes: v0.2 B.5 list + `INCONSISTENT_JUNCTION` (v0.3 §4.1, §8.3).
4. Severity by state (v0.3 §8.3):

   | Code | `DRAFT_SOLID` | `VALID_SOLID` |
   |---|---|---|
   | `OPEN_BOUNDARY`, `SHELL_NOT_CLOSED`, `NON_MANIFOLD_EDGE`, `NON_MANIFOLD_VERTEX` | WARNING | ERROR |
   | `SELF_INTERSECTION`, `SHELL_ORIENTATION`, `INCONSISTENT_RING_ORIENTATION`, `INCONSISTENT_JUNCTION` | WARNING | ERROR |
   | `NON_PLANAR_FACE` | WARNING | ERROR |
   | `DEGENERATE_EDGE`, `DEGENERATE_FACE` | ERROR | ERROR |
   | `CONSTRAINT_CONFLICT`, `INVALID_CRS` | ERROR | ERROR |
   | `SEMANTIC_MAPPING_ERROR` | WARNING | ERROR |
   | `SOLID_OVERLAP` | WARNING | ERROR |
   | `UNDERCONSTRAINED_GEOMETRY` | ERROR | ERROR |
   | `INVALID_MEASUREMENT` | WARNING | WARNING |
   | `EXPORT_SCHEMA_ERROR` | WARNING | ERROR |
   | `PRECISION_LOSS` | WARNING | WARNING |

   The last five codes are in v0.2 B.5 but absent from v0.3 §8.3; their severities are decided by D-77 (Q-21 closed) and
   enforced by the `validation-report` schema.
5. Degenerate thresholds: edge shorter than `minEdgeLengthM`, face smaller than `minFaceAreaM2` (v0.3 §10).
6. `isValidForTargetState = true` is never set from client-side validation (v0.2 D.5).
7. A `VALID_SOLID` commit that adds a new `ERROR` is refused; a defective import may be saved as `DRAFT_SOLID` through
   repair steps; export as `VALID_SOLID` / `APPROVED` stays blocked (v0.2 §15.3).
8. `DRAFT_SOLID -> VALID_SOLID` happens automatically when `COMMIT_VALIDATION` has no errors and is confirmed by
   `FINAL_VALIDATION` (v0.3 §8.1).
9. The `scope` of each issue is one of `GEOMETRY`, `TOPOLOGY`, `CONSTRAINT`, `MEASUREMENT`, `SEMANTICS`, `EXPORT`
   (v0.2 B.5).

**Accept:**
- Accept: for each code of the severity table, a fixture in `DRAFT_SOLID` and one in `VALID_SOLID` produce the table's
  severity.
- Accept: an issue present in the previous version, mapped through lineage, is not "new"; the same issue on an entity
  without a lineage predecessor is "new".
- Accept: `FINAL_VALIDATION` with a stub validator port reports `externalValidatorCode` and `validatorVersion`; the real
  validator binding is 3D-12 with Q-10.

---

## 9. `cloud` - plane fit and deviation heatmap (3D-22)

**Purpose.** Point-cloud functions of D-11 that run on the server: plane fit (M-06) and the model-to-cloud heatmap (F-48)
(v0.3 §7). Snapping to points is a client function (§12).

**API.** Input: points as typed arrays in the local frame, supplied by the service through the points port (box query;
interim own adapters, D-35: uncompressed LAS read whole by 3D-22, COPC by box by 3D-70, D-133) (3D-ADR-0002 C1/C2).
The service reads a cloud through a dataset descriptor `{ port, horizontalCrs }` (D-196); it maps the local box with
`localBoxToCloud` and the returned points with `cloudToLocal` (§3, §4a rules 6-8).
Plane fit -> `plane-fit-result`; heatmap -> `heatmap-result`.

**Rules.**
1. Plane fit: robust fit (RANSAC + SVD refinement on inliers); returns plane, inlier count, inlier ratio, RMSE (v0.3 §7).
2. Refusal: fewer than `planeFitMinPoints` points, or inlier ratio below `planeFitMinInlierRatio` -> `INVALID_MEASUREMENT`
   with the numbers (v0.3 §7).
3. RANSAC parameters [D] (D-130): inlier distance = `planarTolM`, measured along the candidate plane's normal (precedent
   v0.1 C.7 `threshold=tol.planar`); iterations adaptive for 99.9 % confidence, capped at 1000; samples drawn from a
   seeded pseudo-random generator with a fixed seed inside the kernel (no `Math.random`), so equal inputs give equal
   results. No profile field is added (§2.3).
4. The result is applied either as a `PLANE` measurement or directly as the new `supportPlane` of a selected face through
   PREVIEW/COMMIT (`FIT_PLANE`, §10.12) (v0.3 §7).
5. Measurements are soft with weight `1/σ²` by default; hard only after an explicit Fix by the operator (v0.3 §7).
6. Heatmap, requested with a `heatmap-request` (§2 row 17, D-136), computed on the server; the client receives the face
   colouring and a summary: RMSE, maximum, share of points beyond the threshold (v0.3 §7). Point assignment [D] (D-135):
   a point of the `selection` counts if its 3D distance to the nearest face polygon is <= `heatmapBufferM`; it is assigned
   to that face; its value is the signed distance along that face's normal (GT-21). `faceIds`, when given, limits the
   reported faces; points are still assigned to their nearest face of the whole model. The threshold `thresholdM` is
   configurable (v0.3 §7): a required request field with no server default [D] (D-131).
7. Point coordinates come from the source double-precision data (v0.3 §7).
8. Cloud CRS [D] (D-165, D-196): the cloud's horizontal CRS comes from the context, never from the cloud file's own
   CRS records: the service-side dataset descriptor `{ port, horizontalCrs }` of the opened dataset, filled by the host
   from the CP 3DQM extension `dataset` member (SC 3D-43) or from a CRS the user set when opening the dataset. The
   points port keeps answering a world box in the dataset CRS; `heatmap-request` and the `FIT_PLANE` payload are
   unchanged (no `contracts/model3d` change). Unless the cloud shares a projected building's CRS, the world box is the
   bounds of the mapped local box grown by the earth-curvature bound d^2 / (2R) (d = largest horizontal distance of a
   box corner from the frame origin, R = a lower bound of the radius of curvature of every table ellipsoid); the
   kernel then filters the exact selection (D-132). A cloud CRS refused by §4a -> `INVALID_CRS` with its reason.

**Accept:**
- Accept: GT-20, GT-21 (§13).
- Accept: 29 points (or an inlier ratio below 0.6) -> `INVALID_MEASUREMENT` carrying the count / ratio.
- Accept: a cloud in another CRS on the building's datum gives the same plane fit and heatmap as in the building's CRS
  (§4a accept, 3D-69); every point of the local box lies inside the grown world box (`test/crs/box.test.js`).

---

## 10. `ops` - one module per `OperationKind` (3D-14..3D-21, 3D-22)

### 10.1 Common rules for every operation

**Purpose.** Each `OperationKind` of §2.2 is one module under `src/ops/` that builds a candidate in plane terms and hands
it to `solve` and `validate` (3D-ADR-0002 C1).

**API.** `(model, payload, context) -> candidate | refusal`, dispatched by `index.js` (§3). Payload fields are the
semantic inputs listed per operation below; their schema names are 3D-06's.

**Rules.**
1. All rules of §3 apply: atomic commit, PREVIEW before COMMIT, hard conflict -> refusal without partial change,
   canonical entities + `topologyLineage` in the result, no new errors for the current state (v0.3 §6).
2. **Plane terms (D-08).** An operation whose input targets a vertex, an edge or a line is executed as constraints on
   derived vertices (`ON_PLANE`, `FIXED_LINE`, `EQUAL_Z`, ...) solved for the movable planes; no step writes a vertex
   coordinate. The only explicit vertex positions are those of §4 rule 3 (fewer than three independent planes).
3. The set of movable planes is explicit for each operation (input or rule below); every other plane is fixed (§5 rule 7).
4. `targetState: DRAFT_SOLID` on a `VALID_SOLID` model needs explicit confirmation in the UI (v0.3 §8.1); the kernel sees
   only `targetState`.
5. Orthogonal is a construction constraint, not a snap type (v0.3 §6).
6. Where a source names a refusal without a code, the code is the one decided by D-76 (Q-20 closed) and named in the
   operation's rule; a refusal not covered by D-76 gets its code through an open question, never a guess.
7. Operations stated in the sources only as intent (no Appendix C algorithm) are listed in Q-18; their WP specifies
   the plane-terms algorithm in this spec (through intake) before code.

**Accept:**
- Accept: per operation, the shared invariant of §4 (vertex within `planarTolM` of each plane) holds after COMMIT.
- Accept: per operation, a refusal leaves the version unchanged and returns a §2.4 code.
- Accept: per operation, lineage covers every changed, added and deleted face, edge and vertex id.

### 10.2 Operation table

| Kind | Row | Algorithm source | Modes / key parameters |
|---|---|---|---|
| `IMPORT_BUILDING` | 3D-10 | §6 | - |
| `REPLACE_ROOF`, `REBUILD_ENVELOPE` | 3D-14 | v0.2 C.1-C.4, §11.4 | R-01..R-04 |
| `MOVE_VERTEX`, `MOVE_EDGE` | 3D-15 | §10.4 (C.11 restated) | movable incident faces |
| `OFFSET_FACE`, `SPLIT_FACE`, `INSERT_ROOF_BREAK`, `MERGE_FACES` (3D-15); `REMOVE_DETAILS`, `STRAIGHTEN_FACE`, `TRIM_FACE`, `EXTEND_FACE` (3D-104, D-305) | 3D-15 | v0.2 F-31, C.5, C.6, C.10, §13.5 | `MERGE_COPLANAR`, `MERGE_REFIT`; `REMOVE_COLLINEAR_VERTICES`, `ALIGN_SELECTED_EDGES` |
| `ALIGN_RIDGE`, `ALIGN_EAVE`, `MATCH_ELEVATIONS` | 3D-16 | v0.2 C.7, F-34 | `KEEP_EAVES` / `KEEP_RIDGE` / `KEEP_PLANES` / `FIT_MEASUREMENTS` |
| `REMOVE_FACE`, `HEAL_HOLE`, `FIT_TO_SHARED_EDGE`, `ALIGN_JUNCTION` | 3D-17 | v0.2 C.14, §10.5 (C.8 restated), C.9 | `COPY_NEIGHBOR_PLANE`, `FIT_MEASUREMENTS`, `FILL_PLANAR`; `KEEP_PRIMARY_PLANE`, `REFIT_SELECTED_PLANES` |
| `UNDO`, `REDO`, `RESTORE_BASELINE` | 3D-18 | v0.2 §13.6 | empty payload for `UNDO` / `REDO` |
| `RESIZE_ROOF`, `SET_OVERHANG`, `REGULARIZE_FOOTPRINT`, `ALIGN_WALL`, `SET_HEIGHT`, `TRANSLATE_BUILDING`, `ROTATE_BUILDING` | 3D-19 | v0.2 F-29, C.13, F-39..F-43 | `moveWallFootprint`; `BASE` / `EAVE` |
| `ADD_DORMER`, `ADD_CHIMNEY`, `REMOVE_INSTALLATION` | 3D-20 | v0.2 C.16, §13.5 | `FLAT` / `GABLE` dormer |
| `SET_SEMANTICS`, `SET_CONSTRAINT`, `REMOVE_CONSTRAINT` | 3D-21 | v0.3 §6 F-50; v0.2 §15.2 | - |
| `FIT_PLANE` | 3D-22 | v0.3 §7 | measurement or direct plane replacement |

### 10.3 `REPLACE_ROOF`, `REBUILD_ENVELOPE` (3D-14)

**Purpose.** Replace the roof by a template R-01 flat, R-02 shed, R-03 gable, R-04 hip on the current footprint and
rebuild the walls (C-05); rebuild walls and base under the current roof and footprint (C-12) (v0.3 §6).

**API.** `REPLACE_ROOF`: template kind and its givens (v0.2 C.1-C.4): R-01 `roofPlane` or `roofZ`; R-02 slope axis and
eave heights (`zLow`, `zHigh`) or three non-collinear roof measurements; R-03 ridge direction and position, `eaveZ`,
`ridgeZ` or slope; R-04 `eaveZ`, ridge direction, slopes of all four faces. `REBUILD_ENVELOPE`: base rule (constant Z in
P0) (v0.2 §11.4).

**Rules.**
1. Each template creates analytic roof planes, clips them by the footprint in plan, builds roof face rings, then walls and
   `GroundSurface` (v0.2 C.1-C.4). The template is a one-shot generator; the result is freeform; no
   `RoofTemplateInstance` is stored (v0.3 §4.2).
2. R-02..R-04 accept only a rectangular footprint (4 vertices, angles 90 deg +/- `footprintAngleTolDeg`); otherwise
   `UNSUPPORTED_FOOTPRINT`. R-01 works on any valid outline with courtyards (v0.3 §6).
3. A degenerate hip (ridge length 0) is allowed and gives four triangular faces (v0.3 §6).
4. A plane with tilt above `flatRoofTolDeg` is a shed, not flat (v0.2 C.1; v0.3 §10).
5. R-02 with fewer than three independent conditions, R-04 with undetermined ridge length -> `UNDERCONSTRAINED_GEOMETRY`;
   the ridge is never guessed (v0.2 C.2, C.4).
6. R-01 errors: self-intersecting footprint; vertical plane that gives no `z(x, y)` over the footprint; `roofZ < baseZ`;
   zero area (v0.2 C.1) -> `INVALID_GEOMETRY` with the footprint id (D-76).
7. Walls: the wall footprint is the reference, not the overhang outline; one wall surface per outer footprint edge up to
   the actual roof; gable/end walls decompose into planar faces; no T-junctions, zero faces, self-intersections or double
   inner walls (v0.2 §11.4). In plane terms: each wall plane is the vertical plane through its footprint edge [A].
8. `DRAFT_SURFACE` exists only inside `REPLACE_ROOF` before the shell is closed and is never the result of a commit
   (v0.3 §8.1).

**Accept:**
- Accept: GT-01, GT-02, GT-03, GT-04, GT-05 (§13).
- Accept: `REBUILD_ENVELOPE` on a 10 x 8 footprint, base 0, flat roof at 5: four wall strips, `GroundSurface` 80 m2,
  closed solid, volume 400 m3 (v0.2 §11.4).

### 10.4 `MOVE_VERTEX`, `MOVE_EDGE` in plane terms (3D-15; restates v0.2 C.11, D-08)

**Purpose.** Move a vertex to a target point, or an edge to a target line, by changing the planes of the incident faces
the operator marks movable; all other planes stay fixed (v0.3 §6 F-25).

**API.** Inputs: vertex id + target point, or edge id + target line (two points); the set of incident faces marked
movable; coordinate frame. Output: candidate planes for `solve`.

**Rules** (restatement; the v0.2 C.11 text moves a vertex and lets the solver follow):
1. Unknowns: the `supportPlane` of each face marked movable. Fixed: the planes of all other faces, including incident
   faces not marked movable (v0.3 §6).
2. Target as constraints, not as a coordinate write:
   - `MOVE_VERTEX`: the target point `p*` must lie on every defining plane of the vertex: `n_i · p* + d_i = 0` within
     `planarTolM` for each `i` in `definingFaceIds` (§4 rules 2, 4). For a fixed defining plane this is a check; for a
     movable one it is a hard `ON_PLANE` constraint.
   - `MOVE_EDGE`: the target line must lie in the plane of each face incident to the edge (two points of the line on each
     plane, hard), with the same fixed/movable split.
3. Every other vertex of a movable face is re-derived from its defining planes after the solve (§4 rule 2). Its
   hard constraints (`FIXED_POINT`, `FIXED_LINE`, `FIXED_EAVE`, `FIXED_RIDGE`, `EQUAL_Z`, ...) are hard constraints of the
   same solve. A `FIXED_POINT` vertex that would change position -> `CONSTRAINT_CONFLICT` naming it (v0.2 C.11; GT-10).
4. If no plane is movable, the command succeeds only when the target already satisfies rule 2; otherwise
   `CONSTRAINT_CONFLICT` naming the fixed planes [A].
5. Degrees of freedom of a movable plane not fixed by rules 2-3 are resolved by objective O1 of
   [3D-ADR-0005](../decisions/adr/3D-ADR-0005-solver-approach.md) (D-110); a solve with free degrees that O1 does not fix
   (e.g. all kept vertices on the target line) returns `UNDERCONSTRAINED_GEOMETRY` (§5 rule 5).
6. A vertex with fewer than three independent planes (§4 rule 3) is moved by writing its explicit `p` only if `p*` lies on
   all its planes within `planarTolM` after the solve; its planes follow rule 2.
7. No two faces may hold independent coordinates of one canonical vertex (v0.2 C.11); this holds by construction because
   positions are derived.
8. After the solve, check (v0.2 C.11): vertex-plane residual <= `planarTolM`, edge lengths >= `minEdgeLengthM`, no
   self-intersection, semantic continuity, 4+ plane nodes (`INCONSISTENT_JUNCTION`), no new errors for the state. Any
   failure -> refusal, model unchanged.
9. Dependent walls and roof faces change only if their planes are in the movable set; a wall left fixed whose shared edge
   no longer matches is a validation issue, not a silent change [A].

**Accept:**
- Accept: GT-10 (§13).
- Accept: no code path of `MOVE_VERTEX` / `MOVE_EDGE` assigns a vertex position other than through plane derivation or
  §4 rule 3 (code review line in the WP checklist + a test that moves a vertex of a gable eave with both roof faces
  movable and checks that the opposite eave vertices are re-derived, not copied).
- Accept: moving a vertex with all incident faces fixed to a point off one plane is refused with `CONSTRAINT_CONFLICT`.

### 10.5 `FIT_TO_SHARED_EDGE` in plane terms (3D-17; restates v0.2 C.8, D-08)

**Purpose.** Weld two imported, unwelded neighbouring faces into one shared edge: one canonical B-Rep edge has one pair
of vertices (v0.2 C.8). The typical input is GT-I2 (ridge duplicated with a 0.03 m gap, `OPEN_BOUNDARY` on two edges).

**API.** Inputs: the two open boundary edges (half-edges with `twinId = null`) on faces A and B; the leading face (A); the
maximum displacement allowed; the priority strategy (which planes may move). Both the tolerance and the strategy are
required by the schema: without them the source asks for a diagnostic error (v0.2 C.8) -> `INVALID_PAYLOAD` [A].
Default values: none; the payload requires `maxDisplacementM`, there is no default maximum displacement (D-76).

**Rules** (restatement; v0.2 C.8 "move admissible free vertices by constrained projection" becomes a plane solve):
1. Unknowns: the planes the strategy marks movable; the leading plane A is fixed (GT-06: "the plane of the leading slope
   did not change").
2. Topology first: the two boundary edges are replaced by one edge with a twin pair (A side, B side). Each welded vertex
   gets the union of the defining faces of the two copies it replaces. Pairing of copies: each copy on B is paired with
   the copy on A it is closest to; pairing within the maximum displacement only [A].
3. Geometry in plane terms: the shared edge must lie on plane A and on plane B, so it is the line `A ∩ B`; each welded
   vertex is derived from its defining planes (A, B and the third plane of the node, e.g. the gable wall). No coordinate
   averaging: "mean Z between the two copies" is forbidden (v0.2 C.8).
4. If B is fixed by the strategy: weld succeeds only when each derived vertex is within the maximum displacement of both
   copies it replaces. If B is movable: B's plane is solved with the hard constraint "contains the leading edge of A"
   (`ON_PLANE` for the edge's endpoints on A, which lie on plane A by construction); its remaining degree of freedom is
   objective O1 of [3D-ADR-0005](../decisions/adr/3D-ADR-0005-solver-approach.md) (D-110).
5. Displacement over the maximum -> `CONSTRAINT_CONFLICT` with the offending vertex ids; no unique pairing ->
   `INVALID_TOPOLOGY` with the edge ids (D-76).
6. Dependent faces whose vertices change are re-derived; rule 8 checks of §10.4 apply. Result: the two `OPEN_BOUNDARY`
   issues disappear; the state becomes `VALID_SOLID` when no errors remain (§8 rule 8).

**Accept:**
- Accept: GT-06 (§13).
- Accept: a gap larger than the maximum displacement is refused, model unchanged.
- Accept: the weld never produces a vertex position that is the mean of the two copies unless that mean is also the
  derived intersection (test on a case where they differ).

### 10.6 Core edits: `OFFSET_FACE`, `SPLIT_FACE`, `INSERT_ROOF_BREAK`, `MERGE_FACES`, `REMOVE_DETAILS`, `STRAIGHTEN_FACE`, `TRIM_FACE`, `EXTEND_FACE` (3D-15)

**Purpose / API.** Face-level edits of v0.3 §6 and E-08. Inputs per kind: face id(s), signed offset along the unit normal
(`OFFSET_FACE`); split line (`SPLIT_FACE`); break line + new plane / ridge constraint (`INSERT_ROOF_BREAK`); adjacent faces
+ mode (`MERGE_FACES`); candidate list confirmation (`REMOVE_DETAILS`); mode + edges (`STRAIGHTEN_FACE`); face + cutting
face + kept side (`TRIM_FACE`); face + open boundary edge + target face (`EXTEND_FACE`).

**Rules.**
1. `OFFSET_FACE`: the plane moves parallel to itself (`d` changes, `normal` fixed); all affected boundaries are
   re-intersected; a fixed boundary/ridge/eave mode is a hard constraint; conflict -> refusal (v0.2 F-31).
2. `SPLIT_FACE`: project the split line onto the support plane, intersect with the face polygon including holes, create
   faces on **exactly the same** support plane, rewire half-edges, keep boundary, semantics and lineage; no new slope
   (v0.2 C.5, §13.5). Errors (D-76): line outside the face, or tangent giving zero area -> `INVALID_GEOMETRY` with the
   face id; split through a hole with ambiguous components -> `INVALID_TOPOLOGY` with the face id; incompatible fixed
   support plane -> `CONSTRAINT_CONFLICT` with the constraint ids.
3. `INSERT_ROOF_BREAK`: requires a new plane / ridge constraint; changes the affected support planes, solves adjacency,
   rebuilds the envelope; it is a separate command from `SPLIT_FACE` (v0.2 C.5, §13.5).
4. `MERGE_FACES` `MERGE_COPLANAR`: adjacent faces with normals/offset within `coplanarTolDeg` / `planarTolM`, union is one
   valid domain; internal boundary removed, external kept; semantics inherited if compatible, otherwise a mapping is
   requested. `MERGE_REFIT`: weighted refit only when the operator states movable vs fixed entities; no implicit fit
   against fixed constraints (v0.2 C.6).
5. `REMOVE_DETAILS` (3D-104; D-325..D-327; v0.2 C.6; v0.3 §6). Payload: `confirmedRemoveIds`, `keepIds`, optional
   `maxAreaM2` (finite, `>= minFaceAreaM2`, otherwise `INVALID_PAYLOAD`; default `minFaceAreaM2`). No new profile field,
   no shape, width or aspect criterion in v1.
   1. **Candidates**: faces of the building's own bodies with 3D area `< maxAreaM2` (equal is not a candidate). Never
      candidates: faces of a `BuildingInstallation` (dormers, chimneys, D-260), faces of other bodies, faces of a
      protected parametric component. Small area alone does not make a face removable.
   2. **Discovery** (Q-34 closed): PREVIEW with `confirmedRemoveIds = []` is the discovery mode. It changes nothing (no
      geometry, topology, constraint, semantics or provenance change, no new version, no undo entry) and returns the
      optional result field `candidates: [{ faceId, areaM2, removable, reason }]`, always present (an empty array when
      there are none) on a successful discovery PREVIEW, absent for other operations. Order: `areaM2` ascending, then
      `faceId` ascending; no duplicate `faceId`. `removable` is the individual check of r5.4; `reason` is `null` or the
      §2.4 domain code the removal of that face alone would get (`INVALID_GEOMETRY`, `INVALID_TOPOLOGY`,
      `CONSTRAINT_CONFLICT`); no new public code. No separate endpoint; not in `warnings` or the validation report.
      Schema change (D-18 approved): `command-result.candidates`, `command-payload-remove-details.maxAreaM2` - in 3D-105.
   3. **Reconstruction in plane terms** (v1; the neighbour planes are not changed, no solver step):
      - triangle face with three distinct, independent neighbour planes: the face and its plane are deleted; its three
        vertices become one vertex derived from the three neighbour planes (rank 3, a unique, well-conditioned point);
      - quadrilateral face: the face is replaced by one edge on the line of the two neighbour planes across its two
        opposite longest sides (never two adjacent sides; the pair must be unambiguous); the edge's ends are derived from
        that line and the two end neighbour planes; the edge has non-zero length;
      - every other configuration (pentagon and more, holes, a repeated neighbour, neighbour planes parallel and not
        coincident - for example a wall jog between parallel walls - near-singular intersections) is `removable = false`.
        No hidden `OFFSET_FACE`, `MERGE_FACES`, neighbour plane move or constraint change.
   4. **Individual check**: the face exists and is a candidate; no hard constraint, measurement reference, semantic or
      component dependency is lost (a face so referenced is `removable = false`, `CONSTRAINT_CONFLICT`); r5.3 applies;
      the result has no new error (r5.6); the displacement limit of r5.5 holds.
   5. **Displacement limit** (D-330, Q-47 closed; as D-284): `maxAreaM2` sets only detection, not the
      admissible deformation. Optional payload field `maxDisplacementM` (schema change in 3D-105, D-18 approved);
      omitted -> the project's `planarTolM`. Displacement = the largest distance from a vertex of the removed face to the
      vertex it collapses into. Over the limit -> `removable = false`, reason `CONSTRAINT_CONFLICT` (as D-76); a
      confirmed face over it refuses the command with that code. Discovery and COMMIT use the same `maxDisplacementM`.
   6. **Existing errors**: the `DEGENERATE_FACE` errors of the faces the command removes are not a reason to refuse it;
      the validator is not switched off, no other error is masked, `VALID_SOLID` only after full validation (§3 r4).
   7. **Confirmation and commit**: PREVIEW with a non-empty `confirmedRemoveIds` simulates the removal of the whole set;
      COMMIT re-checks it on the current version (§3 version check; no new preview token). An id not in the current
      candidate list (same `maxAreaM2`) -> `INVALID_PAYLOAD`; a candidate whose removal is refused -> its r5.2 code. The
      set is checked jointly (individually removable faces can conflict); one failure refuses the whole command, nothing
      else is removed, no partial removal; the order of ids does not change the result (faces processed by id).
      COMMIT with `confirmedRemoveIds = []` is a valid empty operation without a new version or undo entry (D-301).
      Transactional per building (one command per building).
   8. Future: parallel-wall jogs, KEEP_PRIMARY_PLANE, neighbour alignment, deformation limits, width / aspect criteria,
      groups of details, LoD generalisation, check against measurements - row 3D-112.
6. `STRAIGHTEN_FACE` (3D-104; D-328, D-329; v0.2 C.10; v0.3 §6): modes `REMOVE_COLLINEAR_VERTICES` and
   `ALIGN_SELECTED_EDGES`; `FORCE_RECTANGLE` of v0.2 is not in v0.3 and is dropped; never replace an arbitrary or
   L-shaped roof by a bounding rectangle. No contract, profile, result, solver or pipeline change.
   1. `REMOVE_COLLINEAR_VERTICES` (Q-18 for this kind closed: `planarTolM`, no new field). A vertex `v` of a ring of `F` is
      removed only when all hold: (a) topological degree 2; (b) both its half-edges in `F` have the same neighbour face
      `N`; (c) its distance to the line through its two ring neighbours `<= planarTolM` (checked always, also when `F`
      and `N` are coplanar); (d) its projection lies inside that segment; (e) no constraint, measurement, semantic
      boundary, component or parametric reference is lost; (f) both faces stay valid. Effect: `v` leaves the rings of `F`
      and `N`, the two consecutive half-edges of each ring become one (the criterion of `ops/merge-faces.js` dissolve);
      plane equations, face ids and the other vertex ids unchanged; lineage per §2 (removed vertex deleted, two edges
      -> one); no solver call.
   2. Several vertices: processed in id order, one at a time, the local topology re-checked after each; the distance of
      every removed vertex to the final boundary edge stays `<= planarTolM` (no accumulation beyond it). A vertex with a
      constraint or another significant reference is skipped with a warning, never its constraint removed. No candidate
      -> valid empty operation without a new version (D-301).
   3. `ALIGN_SELECTED_EDGES` (D-329): `edgeIds` = at least two distinct half-edges of `F` (`INVALID_PAYLOAD`
      otherwise) forming one continuous chain without branches (v1; otherwise `INVALID_TOPOLOGY`); every edge has a
      neighbour face (an open edge -> `INVALID_TOPOLOGY`); no degenerate edge. Reference line `L` = the line of the
      longest selected edge (3D length; equal lengths within `numericEpsilon` -> lowest edge id). Fixed: the plane of `F`,
      the plane `N_primary` across that edge, every plane fixed by a hard constraint. Movable: only the planes of the other
      neighbours `N_i` of the selected edges, each once. Conditions: `L` lies in each `N_i` (hard; two distinct points of
      `L` pinned, as `plane-pin.js`), MINIMIZE_DISPLACEMENT soft (spec §5, D-110), all hard constraints kept. A fixed
      plane that already contains `L` stays; one that does not -> `CONSTRAINT_CONFLICT`. Vertices re-derived; a vertex
      bounded only by `L` takes the point of `L` nearest its old position; vertex order along the chain kept, no
      inversion, no collapsed edge or degenerate face (otherwise `INVALID_GEOMETRY`); a vertex the solver cannot define
      -> refusal, no solver change.
   4. `ALIGN_SELECTED_EDGES` corrects geometry only: no vertex, edge or face is removed or merged; ids, semantics,
      constraints, measurements, provenance kept. Vertices between different neighbour faces stay after the alignment
      (r6.1 b); simplification is a separate `REMOVE_COLLINEAR_VERTICES`. Edges already collinear -> valid empty
      operation without a new version (D-301). Future: an operator-chosen leading edge, `BEST_FIT_LINE` (row 3D-113).
7. `TRIM_FACE` (3D-104; D-322, D-323; v0.2 §13.5, E-08). Payload (schema change in 3D-105, D-18 approved):
   `faceId`, `cuttingFaceId` (replaces the free `trimLine`), `keepPoint` (Q-35 closed). Algorithm:
   1. `L` = plane(`F`) ∩ plane(`G`), `G` = `cuttingFaceId`; planes parallel within `coplanarTolDeg` -> `INVALID_GEOMETRY`;
      `G == F` or unknown id -> `INVALID_PAYLOAD`.
   2. `F` is cut along `L` with the cut domain of D-302 and its codes (`ops/face-cut.js`, reused).
   3. The part holding `keepPoint` stays; `keepPoint` farther than `planarTolM` from `F`, outside `F`, or within
      `topologySnapTolM` of `L` -> `INVALID_GEOMETRY` (as the side point of D-304).
   4. The removed part `R`: v1 only a dangling flap - every half-edge of `R` except the chord is open (no twin);
      otherwise `INVALID_TOPOLOGY` (removing it would open the shell). `R`'s face, half-edges and the vertices no ring
      uses are deleted. The plane of `F` is unchanged; the chord's ends are derived (planes `F`, `G` and the plane across
      the crossed edge; explicit when fewer than three, §4 r3).
   5. Closure: an open half-edge of the kept part that coincides with an open half-edge of another face of the same shell
      within `topologySnapTolM` (both ends) is paired with it; the state follows `validate` (may become `VALID_SOLID`).
      Two vertices at one place become one: the id of the vertex that did not move survives, a new id if both moved
      (D-363, 3D-105).
8. `EXTEND_FACE` (3D-104; D-324; v0.2 §13.5, E-08). Payload (schema change in 3D-105, D-18 approved): `faceId`,
   `edgeId`, `targetFaceId` (replaces the free `targetLine`). Algorithm:
   1. `e` = `edgeId` must be a half-edge of the outer ring of `F` (else `INVALID_PAYLOAD`) and open; a shared edge ->
      `INVALID_TOPOLOGY` (in a closed shell its move is `MOVE_EDGE` / `OFFSET_FACE` of the neighbour).
   2. The new boundary line `L` = plane(`F`) ∩ plane(`G`); parallel within `coplanarTolDeg` -> `INVALID_GEOMETRY`.
   3. The two ring neighbours `a`, `b` of `e` are prolonged along their lines: the new ends of `e` are the points of the
      three planes (`F`, the plane across `a` / `b`, `G`); an open `a` / `b` gives its line in `F` and an explicit end
      (§4 r3). A line of `a` / `b` parallel to `L` -> `INVALID_GEOMETRY`.
   4. `L` must lie outside `F` on the far side of `e` (the area of `F` grows); otherwise `INVALID_GEOMETRY` (that is a
      trim). A self-crossing ring or a collapsed edge -> `INVALID_GEOMETRY`.
   5. The plane of `F` is unchanged; ids of `F`, `e`, its ends kept (ends re-derived), except an end welded by closure into
      a vertex that did not move (D-363); closure as r7.5. "Parallel" in r8.3 is within `coplanarTolDeg` (D-364).
9. Decided in 3D-15 (provisional ids, D-38): `INSERT_ROOF_BREAK` payload `newPlane` + required `movingSidePoint`, the
   part holding it gets `newPlane`, the other keeps plane and face id (D-297); constraint policy on split / merge
   (D-298); split ids (D-299); `OFFSET_FACE` fixedMode interlock, `INVALID_PAYLOAD` when the mode does not apply
   (D-300), offset 0 a valid empty operation without a new version (D-301); cut domain and codes (D-302);
   `MERGE_FACES` survivor, dissolve, REFIT (D-303); refusal codes (D-304). The algorithms of `REMOVE_DETAILS`,
   `STRAIGHTEN_FACE`, `TRIM_FACE`, `EXTEND_FACE` (r5..r8) are specified by 3D-104 (D-305, §10.1 r7) and built by 3D-105.

**Accept:**
- Accept: GT-08 (§13).
- Accept: `OFFSET_FACE` of one gable slope by +0.1 m with the ridge free: both eaves and the ridge are re-derived; the
  slope normal is unchanged.
- Accept: `MERGE_FACES MERGE_COPLANAR` on the two faces of GT-08 returns one face with lineage 2 -> 1 and volume 520 m3.
- Accept (3D-105): GT-26 .. GT-29 (§13, with fixtures). Accept (3D-122, 3D-123): GT-30 .. GT-33 (table below; each
  row moves them into §13 with their fixtures, D-332, D-361).
- Accept (3D-105): the owner's test lists RD-01..RD-18 and RD-T01..RD-T24 (`REMOVE_DETAILS`), SF-COL-01..SF-COL-14
  (`REMOVE_COLLINEAR_VERTICES`), SAE-01..SAE-20 (`ALIGN_SELECTED_EDGES`), recorded in D-325..D-329.

**Golden cases of 3D-122 / 3D-123** (owner-accepted, D-331; kept here, not in §13, until their fixtures exist, D-332;
GT-26..GT-29 moved to §13 by 3D-105):

| GT | Input and operation | Expected | Module | Row |
|---|---|---|---|---|
| GT-30 | GT-03 with an extra vertex (5; 0; 5) on the S1 eave, in the rings of S1 and the south wall -> `STRAIGHTEN_FACE` S1 `REMOVE_COLLINEAR_VERTICES`; then again | 7 faces, 10 vertices, 15 edges; no vertex moved; volume 520 m3; lineage: vertex deleted, 2 -> 1 edges in both faces; second run valid empty, no new version (D-301) | `ops` (`STRAIGHTEN_FACE`) | 3D-105 |
| GT-31 | Flat roof at `z = 5` on (0; 0), (6; 0), (10; 0.05), (10; 8), (0; 8); south wall in two faces W1 (x 0..6, `y = 0`) and W2 ((6; 0) -> (10; 0.05)) -> `STRAIGHTEN_FACE` roof `ALIGN_SELECTED_EDGES` [eave over W1 (6 m), eave over W2 (4.0003 m)] | Leading edge over W1, W1 and roof planes unchanged; W2 plane `y = 0` within 1e-6; corner (10; 0.05; z) -> (10; 0; z); vertices (6; 0; 0), (6; 0; 5) kept (rank 2, nearest point); roof 79.9 -> 80 m2; volume 399.5 -> 400 m3; no vertex, edge or face removed | `ops` (`STRAIGHTEN_FACE`) | 3D-105 |
| GT-32 | GT-03 with the corner (10; 4; 8) clipped by a triangle T (9.8; 4; 8), (10; 3.8; 7.85), (10; 4.2; 7.85), area 0.05 m2 (`DEGENERATE_FACE`) -> `REMOVE_DETAILS` discovery with the default `maxDisplacementM`; discovery and COMMIT [T] with `maxDisplacementM` 0.3 | Default: `candidates` = [{T, 0.05, false, `CONSTRAINT_CONFLICT`}] (move 0.25 m > `planarTolM`); 0.3: [{T, 0.05, true, null}], version unchanged; COMMIT: T collapsed to S1 ∩ S2 ∩ east gable = (10; 4; 8); neighbour planes unchanged; 7 faces, 10 vertices; `VALID_SOLID`; volume 520 m3; roof 100 m2 | `ops` (`REMOVE_DETAILS`) | 3D-105 |
| GT-33 | GT-03 with the ridge cut by a horizontal strip Q at `z = 7.9925` (S1 to `y = 3.99`, S2 from `y = 4.01`), 10 x 0.02 = 0.2 m2 -> `REMOVE_DETAILS` discovery with default threshold; discovery with `maxAreaM2` 0.25; COMMIT [Q] with 0.25 (default `maxDisplacementM`) | Default: `candidates` = []; 0.25: [{Q, 0.2, true, null}]; COMMIT: Q replaced by the edge S1 ∩ S2 from (0; 4; 8) to (10; 4; 8) (long sides opposite); 7 faces, 10 vertices; `VALID_SOLID`; volume 520 m3; roof 100 m2; largest vertex move 0.0125 m | `ops` (`REMOVE_DETAILS`) | 3D-105 |

### 10.7 `ALIGN_RIDGE`, `ALIGN_EAVE`, `MATCH_ELEVATIONS` (3D-16)

**Purpose / API.** Align a ridge or eave line to a target line, or bring a vertex group to one Z. Inputs: edge id, target
line, mode, hard constraint ids (v0.2 D.3); `MATCH_ELEVATIONS`: vertex ids, target Z (number / min / max / mean), fixed
constraints (v0.2 F-34).

**Rules.**
1. v0.2 C.7 is already in plane terms and applies as written: `KEEP_PLANES` intersects the adjacent support planes and
   trims/rebuilds on that line, accepting no arbitrary target; `KEEP_EAVES` locks the opposite eaves; `KEEP_RIDGE` locks
   the unchanged ridge and applies only to `ALIGN_EAVE` (removed for `ALIGN_RIDGE`, v0.3 §6); `FIT_MEASUREMENTS` uses
   measurements; the selected line is a hard constraint; a constrained planar solve, refusal on conflict; any other
   mode -> `INVALID_MODE` (`INVALID_PAYLOAD`).
2. Never fit `L_new` and two points of a fixed opposite edge into one SVD plane and call planarity and Fixed satisfied
   (v0.2 C.7).
3. `MATCH_ELEVATIONS`: an `EQUAL_Z` hard constraint (within `zAlignTolM`) on the derived vertices, solved for the movable
   planes; Fixed/planarity conflict -> `CONSTRAINT_CONFLICT` (v0.2 F-34). Movable planes (Q-18 closed by D-231): the
   non-vertical roof faces that define the selected vertices; walls, ground and faces with a hard constraint stay
   fixed; no solution -> `CONSTRAINT_CONFLICT`; the footprint never changes. A vertex with a hard `FIXED_POINT` and a
   different `EQUAL_Z` target -> `CONSTRAINT_CONFLICT`, since the fixed point is also checked on the derived vertex
   (§5 table, D-371).

**Accept:**
- Accept: GT-07, GT-09 (§13).
- Accept: `ALIGN_RIDGE` with mode `KEEP_RIDGE` -> `INVALID_PAYLOAD` (`INVALID_MODE`).

### 10.8 Repair: `REMOVE_FACE`, `HEAL_HOLE`, `ALIGN_JUNCTION` (3D-17, with §10.5)

**Purpose / API.** Remove a face and close the hole again; reconcile a node of 3+ planes (F-33, F-22). Inputs: face id
(`REMOVE_FACE`); hole boundary + mode + allowed corrections (`HEAL_HOLE`); node vertex + planes + mode (`ALIGN_JUNCTION`).

**Rules.**
1. `REMOVE_FACE`: deletes the face; the model becomes `DRAFT_SOLID` (v0.3 §6; supersedes v0.2 §13.5 `DRAFT_SURFACE`);
   needs `targetState: DRAFT_SOLID` and UI confirmation (§10.1 rule 4).
2. `HEAL_HOLE`: the operator chooses `COPY_NEIGHBOR_PLANE`, `FIT_MEASUREMENTS` or `FILL_PLANAR` and the allowed
   corrections; the hole region and the number of compatible closings are analysed; no unique closing without
   self-intersection -> refusal and a request for an explicit choice, listing the admissible modes (v0.2 C.14; GT-11).
   Codes (D-76): no closing without self-intersection -> `INVALID_GEOMETRY`; more than one compatible closing ->
   `UNDERCONSTRAINED_GEOMETRY`; both carry `details.admissibleModes`.
3. `ALIGN_JUNCTION`: a node of 3+ planes. General planes `n_i · p + d_i = 0` with a rank / residual check (least squares on
   `z_i(x, y)` only for non-vertical planes); a solution is admissible only if all hard constraints and displacement
   limits hold. Modes `KEEP_PRIMARY_PLANE`, `REFIT_SELECTED_PLANES` (v0.3 §6; v0.2 `CANCEL` is a client cancel). No hidden
   jumps of many vertices; no whole-building LSQ (v0.2 C.9, §13.5). Conflict with Fixed -> `CONSTRAINT_CONFLICT` listing
   the conflicting faces (GT-19).

**Accept:**
- Accept: GT-06, GT-11, GT-19 (§13).

### 10.9 History: `UNDO`, `REDO`, `RESTORE_BASELINE` (3D-18)

**Purpose / API.** Linear history of one building (F-75, F-08). Inputs: none (`UNDO`, `REDO`), the journal and baseline
passed in by the service (§3).

**Rules.**
1. Linear history per building; `UNDO` / `REDO` payload is empty; the server takes the top of the stack (v0.3 §6).
2. Undo and Redo create **new versions**; issued version numbers never change; the audit journal is never deleted
   (v0.2 §13.6).
3. Undo applies the stored inverse patch and restores the original entity ids (GT-12); a full snapshot is allowed where an
   inverse patch is unsafe (v0.2 §13.6).
4. `RESTORE_BASELINE` returns to the imported state as a new version (v0.3 §6).
5. Undo affects only the operations of the current lock/lease holder, in stack order; other users' versions are not undone
   (v0.3 §8.5); the holder is the holder of the CP assignment lease [D] (D-69).

**Accept:**
- Accept: GT-12 (§13). (GT-13 is in §11, row 3D-23, D-68.)
- Accept: `RESTORE_BASELINE` after GT-07 yields geometry equal to the baseline and version = previous + 1.

### 10.10 Envelope: `RESIZE_ROOF`, `SET_OVERHANG`, `REGULARIZE_FOOTPRINT`, `ALIGN_WALL`, `SET_HEIGHT`, `TRANSLATE_BUILDING`, `ROTATE_BUILDING` (3D-19)

**Purpose / API.** Overhang, roof extent, footprint, walls, heights, rigid moves (F-29, F-30, F-39..F-43). Inputs: eave
edges + overhang (`SET_OVERHANG`); new extent + `moveWallFootprint` (`RESIZE_ROOF`); footprint (+ allow courtyard
removal) (`REGULARIZE_FOOTPRINT`); wall + reference line (`ALIGN_WALL`); `BASE` or `EAVE` + selected eave + value
(`SET_HEIGHT`); vector (`TRANSLATE_BUILDING`); angle (`ROTATE_BUILDING`).

**Row split (D-340, D-346).** Row 3D-19 builds rules 1, 5, 6, 7 (`SET_OVERHANG`, `SET_HEIGHT`, `TRANSLATE_BUILDING`,
`ROTATE_BUILDING`). Rules 2, 3, 4 (`RESIZE_ROOF`, `REGULARIZE_FOOTPRINT`, `ALIGN_WALL`) belong to row 3D-114; the
extent of `RESIZE_ROOF` is decided by D-339 (Q-37 closed) and is stated in rule 2 by that row.

**Rules.**
1. `SET_OVERHANG`: overhang in horizontal projection, metres; walls and footprint unchanged; roof planes are extended
   within their own support planes (`normal`, `d` unchanged) to the new eave line; the overhang part is tagged `OVERHANG`;
   a soffit is created only where the geometric profile needs it, never replaced by vertical `WallSurface`s
   (v0.3 §6; v0.2 C.13, F-30). Input: `eaveEdgeIds` (distinct; each the main-roof half-edge of a structural eave, edge
   role `EAVE`, on a `RoofSurface` without `OVERHANG`) and `overhangM` (finite, `>= 0`); else `INVALID_PAYLOAD`. How
   the overhang closes the solid (Q-18 closed by D-336, D-337):
   1. Profile (D-336): the roof face keeps its plane and is split at the wall line; the outer strip is a `RoofSurface`
      tagged `OVERHANG` in the roof's plane; a horizontal soffit (`OuterCeilingSurface` tagged `OVERHANG`) at the Z of
      the outer edge closes it from below. The shell stays closed and manifold; the result is `VALID_SOLID` when the
      input was and every check passes. The ground footprint is kept; wall support planes, normals, semantics and ids
      are kept, wall polygon boundaries may change ("walls unchanged" means support planes unchanged); hard constraints
      hold.
   2. End caps (D-337): each vertical triangle that closes the overhang wedge at an eave end is its own face (own id,
      `WallSurface` tagged `OVERHANG`, support plane equal to its end wall's), never merged into the end wall. The end
      wall keeps id, plane and area; its boundary edges may be split by collinear vertices to avoid T-junctions. Export
      writes `WallSurface` (Q-25 stays open).
   3. Width (D-336, D-337): `overhangM` is the absolute width in plan, measured from the wall plane. The same width
      again adds no faces; `0` removes strip, soffit and caps; another width rebuilds them with the same ids, without
      duplicates. An existing overhang is found through topology and the `OVERHANG` tag and its width is recovered from
      the geometry; `OVERHANG` faces that do not form the profile of 1.1 are refused with `INVALID_TOPOLOGY` (D-341).
   4. Junctions (D-336, D-344): V1 supports an eave whose two ends each meet exactly one vertical end wall. A hip, a
      valley or an eave end that does not meet exactly one end wall -> `INVALID_TOPOLOGY`; the whole command is
      refused, model unchanged. A profile that cannot be built (eave not horizontal, roof not descending outward over
      the eave, soffit at or below the next wall vertex) -> `INVALID_GEOMETRY` (code as D-214) [A].
   5. Eave vertices under an overhang lie on two independent planes only (roof = strip, D-336; end wall = cap, D-337);
      they are stored `EXPLICIT` under §4 rule 3 and become `DERIVED` again when the overhang is removed.
   6. Dependent geometry (D-341, D-367, D-372, D-373): until row 3D-115 rebuilds dependent geometry, a command that
      changes the support plane of a roof face carrying an `OVERHANG` strip is refused with `INVALID_TOPOLOGY`, model
      unchanged. The check is one generic pipeline post-check after the solve, so it covers every plane-changing
      operation of 3D-15, 3D-16, 3D-17 and 3D-105; `SET_OVERHANG` and `SET_HEIGHT EAVE` rebuild the overhang themselves
      and pass. Full compatibility of overhangs with other rows' operations is not claimed before 3D-115 (D-341).
2. `RESIZE_ROOF`: new roof extent; `moveWallFootprint` states explicitly whether walls follow; roof intersections and
   closure are restored; not identical to `SET_OVERHANG` (v0.2 F-29).
3. `REGULARIZE_FOOTPRINT`: straighten within `footprintAngleTolDeg`, remove noise vertices; courtyards kept unless the
   operator allows removal; orthogonalisation optional; change report (v0.2 F-39). Walls follow as the vertical planes of
   the new footprint edges (§10.3 rule 7) [A].
4. `ALIGN_WALL`: the wall plane is set to the vertical plane through the reference line; adjoining roof and floor are
   rebuilt (v0.2 F-40; v0.3 §6).
5. `SET_HEIGHT`: `BASE` (the ground plane moves to the new Z) or `EAVE` (the selected eave only, not the whole building);
   volume and areas recomputed (v0.3 §6; v0.2 F-41). Input: `kind`, `z`, `eaveEdgeId` for `EAVE`. The building has
   exactly one footprint, else `INVALID_TOPOLOGY` (D-218). Both kinds are hard `EQUAL_Z` targets solved for the planes
   they declare movable; faces with a hard constraint stay fixed and a conflict is `CONSTRAINT_CONFLICT` (as D-231).
   1. `BASE`: the ground faces of the building move to `z`; walls follow by re-derivation; a base at or above a wall
      top or roof vertex -> `INVALID_GEOMETRY` (D-214) [A].
   2. `EAVE` (Q-18 closed by D-338): the eave is the structural eave (roof plane ∩ wall plane), not the overhang's
      outer edge (`eaveEdgeId` as an `eaveEdgeIds` entry of rule 1). Only the roof face of that eave moves (D-231,
      D-110): its eave vertices keep XY and reach `z`, its other vertices (ridge) stay, else `CONSTRAINT_CONFLICT`. The
      opposite slope, wall and ground planes keep their planes; neighbour boundaries are re-derived. An existing
      overhang of that slope is rebuilt at the same width in plan with the same ids; one that cannot be rebuilt refuses
      the whole command. An eave at or below the base -> `INVALID_GEOMETRY` (as D-214) [A]. Reference (D-338): GT-03,
      south eave 5 -> 5.5: north eave 5, ridge 8, south slope 32.005383 deg, north 36.869898 deg, ground 80 m2, roof
      97.169906 m2, volume 530 m3; with a 0.5 m overhang the outer edge is at Z 5.1875.
6. `TRANSLATE_BUILDING`: rigid shift of all planes (`d` changes); fixed points and attached measurements move with the
   building; a warning is written to the journal (v0.3 §6). Input: `vector`. Measurements and constraints (Q-48 closed
   by D-345):
   1. Every `LOCAL` measurement of the model is attached and is moved once by the same isometry (ids, provenance and
      metadata kept). `WORLD` measurements never change, also not by the inverse patch; the journal warning
      "WORLD-frame measurements remain unchanged after the rigid building transformation" names them. No schema change.
   2. Constraints are kept; fixed points and constraint targets (`FIXED_POINT` / `ON_PLANE` points, planes, `EQUAL_Z`
      heights) move with the building, except a target tied to a `WORLD` measurement, which stays with that
      measurement (D-345). A hard constraint that cannot be verified after the move (it needs a missing transform, or
      its kind is still `TBD`, §5) is not taken as satisfied -> `CONSTRAINT_CONFLICT` (§5 rule 2), model unchanged.
   3. A zero move is a no-op commit (D-345). No topology change: no id is added or removed.
7. `ROTATE_BUILDING`: rotation about the vertical axis through the footprint centroid; same rule as 6 (v0.3 §6).
   Input: `angleDeg`. The centroid is the area centroid of the building's own footprint (outer ring minus courtyards);
   a footprint that is not unique -> `INVALID_TOPOLOGY` (D-218); rule 6.1..6.3 apply (D-345).

**Accept:**
- Accept: GT-14, GT-15, GT-16 (§13). GT-14 is pending row 3D-117: `SET_OVERHANG` counts as fully accepted only when
  GT-14 passes with the standard profile after 3D-117 (D-343, D-347); 3D-19 is done with that one line open (D-348).
- Accept: `ROTATE_BUILDING` by 90 deg keeps volume and areas and writes the journal warning.
- Accept: `SET_HEIGHT EAVE` reproduces the D-338 reference values of rule 5.2.
- Accept: a rigid move keeps `WORLD` measurements, moves `LOCAL` ones once and refuses an unverifiable hard constraint
  (D-345).

### 10.11 Installations: `ADD_DORMER`, `ADD_CHIMNEY`, `REMOVE_INSTALLATION` (3D-20)

**Purpose / API.** Dormers and chimneys as separate bodies (F-36, F-37, E-12). Inputs: roof face, type, outline and
dimensions or a plane-fit measurement; installation id (`REMOVE_INSTALLATION`).

**Rules.**
1. Pipeline (v0.2 C.16): measurement source -> roof attachment plane -> placement and bounds -> size (manual or from the
   cloud / plane fit) -> Boolean/trim of the roof only where needed -> installation shell -> validate. The report carries
   confidence, inliers and the reason of a refusal. No case of r6..r9 trims the roof (r6).
2. `ADD_DORMER`: type `FLAT` or `GABLE`; outline on a roof face + dimensions manual or from plane fit. `ADD_CHIMNEY`:
   box only; dimensions manual or from the cloud (v0.3 §6). Payload fields: `command-payload-add-dormer`,
   `command-payload-add-chimney`, `command-payload-remove-installation` ([contracts/model3d](../../contracts/model3d/README.md)).
3. The installation is a separate closed `BuildingInstallation` body; its base lies in the roof plane (GT-17). Its base
   face is a `ClosureSurface`; its roof faces join no roof component (as D-227) (D-261).
4. Boolean in P0 only: plane-plane, face-half-space, union of a prism with a shell (K-12, v0.3 §14). Own implementation,
   no third-party Boolean library (D-109, [3D-ADR-0004](../decisions/adr/3D-ADR-0004-kernel-language-boolean-licences.md) B1).
5. `REMOVE_INSTALLATION`: deletes the installation's semantic node, solid, shell, faces, half-edges and vertices. The
   roof face was never changed (r6), so it is as before the installation was added (v0.2 §13.5, D-260).
6. Roof not cut (D-260, reading of GT-17): the roof face is not cut or imprinted; the installation is a separate closed
   body touching the roof plane; the building's volume is unchanged (GT-17: 520 m3).
7. `ADD_CHIMNEY` (D-256, D-261): box with vertical walls along the local building axes, `widthM` along local x,
   `depthM` along local y, base centred on `center` ([V] `packages/geo-model3d/src/ops/add-chimney.js`) in the roof
   face plane, horizontal top. `heightAboveRoofM` is measured at the lowest (downhill) base corner: top z = lowest base
   corner z + `heightAboveRoofM` (GT-17: top 7.125 m). A top at or below the highest base corner -> `INVALID_GEOMETRY`.
8. `ADD_DORMER` `FLAT` (D-257): the body is the vertical prism over the whole outline, base in the roof face plane,
   horizontal top at the highest outline corner z + `heightM`. `heightM` is the back (uphill) wall height, set by the
   operator from the cloud or stereo (GT-18: top 7.875 m).
9. `ADD_DORMER` `GABLE` (D-258): payload field `ridgeRiseM`, required for `GABLE` when `heightM` is given (schema
   `if`/`then`). Walls as `FLAT` (top at the highest outline corner z + `heightM`); the ridge runs along the roof face's
   fall line through the outline centroid, `ridgeRiseM` above the wall top; each gable slope reaches the wall top at
   the outline corner farthest from the ridge on its side. A non-convex `GABLE` outline -> `INVALID_GEOMETRY` [A].
10. Refusal codes (D-259, §10.1 r6):
    - unknown `roofFaceId` or `installationId` -> `INVALID_PAYLOAD` naming the id (as D-228);
    - face not a `RoofSurface` of a `Building` / `BuildingPart` body, or id not a `BuildingInstallation` ->
      `INVALID_PAYLOAD`;
    - outline or box not inside the roof face, a point off its plane beyond `planarTolM`, a self-crossing outline, a
      top not above the base -> `INVALID_GEOMETRY`;
    - sizing from `measurementId` -> `INVALID_MEASUREMENT` until the measurement layout (Q-28) is defined (row 3D-100).

**Accept:**
- Accept: GT-17, GT-18 (§13).
- Accept: `REMOVE_INSTALLATION` after GT-17 restores roof area 100 m2 and volume 520 m3.

### 10.12 `SET_SEMANTICS`, `SET_CONSTRAINT`, `REMOVE_CONSTRAINT` (3D-21); `FIT_PLANE` (3D-22)

**Purpose / API.** Semantics, explicit constraints (E-07 Fix/Unfix) and plane fit as a command (F-50, M-06). Inputs:
face ids + `SurfaceKind`; a constraint (§5 rule 1) or its id; point selection + use (measurement or face plane).

**Rules.**
1. `SET_SEMANTICS`: surface type (`SurfaceKind`) for the selected faces (v0.3 §6 F-50); semantics change no geometry.
2. `SET_CONSTRAINT` / `REMOVE_CONSTRAINT`: add / remove a constraint of §5 rule 1 (Fix / Unfix, E-07);
   `REMOVE_CONSTRAINT` of a `FIXED_POINT` is the explicit unlock of v0.2 C.11.
3. Setting a hard constraint that the current model violates -> `CONSTRAINT_CONFLICT`, model unchanged [A].
4. `FIT_PLANE`: runs the plane fit of §9 on the selected points and applies the result as a `PLANE` measurement or as the
   new `supportPlane` of the selected face through PREVIEW/COMMIT (v0.3 §7). The selection (rectangle or lasso in the
   view) reaches the server as the payload `selection`, a `PointSelection` in the LOCAL frame (§2); the service queries
   the points port by its bounding box and filters by its shape [D] (D-132). 3D-22 ships `fitPlane` (D-119); the command
   wiring is row 3D-71, after the `executeCommand` pipeline (D-134).

**Accept:**
- Accept: `SET_SEMANTICS` on one roof face changes only its `surfaceKind`; geometry patch empty.
- Accept: `FIT_PLANE` replacing the plane of one GT-03 slope with the GT-20 fit re-derives the ridge and eave vertices.

---

## 11. Kernel service - `services/kernel/` (3D-23, 3D-24)

**Purpose.** The host of the kernel: all I/O, ports, Operaflow handling, authorisation, idempotency, PREVIEW storage, QC
and export rules (3D-ADR-0002 C2, D-51). Built as its own container image (D-33) and mountable in geoviewer for tests
(3D-50).

**API.**
- `createKernelHandler(ports) -> (request) => reply` (plain Node); the container's own server around it (3D-ADR-0002 C2).
- Requests and replies are the `contracts/model3d/` messages: commands (PREVIEW / COMMIT), command status by `commandId`
  (v0.3 §9.2: `GET /api/commands/{commandId}`), model read by version (v0.2 D.1), heatmap and export requests. Wire
  binding (HTTPS + JSON baseline) is fixed by 3D-23 with the 3D-08 numbers (3D-ADR-0002 A.4).
- Ports: storage (versions, journal, baseline, drafts, results; 3D-03, interim file/S3, D-35), points (box query; 3D-22;
  read through a dataset descriptor `{ port, horizontalCrs }` per opened dataset, D-196, §9 rule 8),
  external validator (3D-12, Q-10), clock/ids, auth.

**Rules.**
1. Authorisation from the authenticated context, never from `actorId` (v0.2 D.2). Building outside the signed assignment
   -> `403 FORBIDDEN` on read and write (Operaflow group A, 3D-ADR-0002; GT-23).
2. Roles come from the CP workplace (D-09, D-10): `3dqm.production` = operator, `3dqm.qa` = reviewer.

   | Action | Operator | Reviewer |
   |---|---|---|
   | View the assigned buildings | yes | yes |
   | Edit, Undo/Redo, Fix/Unfix | yes | no |
   | `RESTORE_BASELINE` | yes | no |
   | `APPROVED` / return for rework with a comment | no | yes, if not an author |
   | Export | no | yes |

   (v0.3 §8.5 without the admin column, D-10.)
3. `COMMIT` is idempotent on `(projectId, commandId)`: a repeat returns the stored result, no second mutation
   (v0.2 D.4; GT-13).
4. `expectedVersion` mismatch -> `409 VERSION_CONFLICT`; unknown building / version / `previewId` -> `404 NOT_FOUND`
   (v0.3 §9.2).
5. PREVIEW results are kept by `previewId` until COMMIT or expiry; COMMIT applies exactly the stored result (v0.3 §3).
   Expiry: `TBD` (Q-24).
6. PREVIEW rate: the client sends at most 10/s (v0.3 §3); the server answers `429 RATE_LIMITED` above its limit
   (`TBD`, Q-24).
7. Failures (500/503, timeout, cancellation) leave the model unchanged; after a timeout the client checks the command
   status before repeating with the same `commandId` (v0.2 D.4; v0.3 §9.2).
8. Model state transitions (v0.3 §8.1): import -> `VALID_SOLID` or `DRAFT_SOLID` by validation; `VALID_SOLID ->
   DRAFT_SOLID` by a command with `targetState: DRAFT_SOLID`; `DRAFT_SOLID -> VALID_SOLID` automatically (§8 rule 8);
   `VALID_SOLID -> APPROVED` by a reviewer after `FINAL_VALIDATION`, who is not the author of any version after the
   baseline; `APPROVED -> VALID_SOLID | DRAFT_SOLID` automatically on any edit. Separation of duties is enforced here; the
   Operaflow format has no such rule (3D-01; 3D-24 row). `APPROVED` is a mark on a version, not a new version: the
   building reads `APPROVED` while its head version has one (D-450); `FINAL_VALIDATION` is its own request, stored
   per version (D-451); approval needs the building's lease (D-454); not `VALID_SOLID` or no passed
   `FINAL_VALIDATION` -> `422 NOT_APPROVABLE` (D-456). Return for rework: row 3D-132.
9. Export gate (v0.3 §8.4): export allowed for `VALID_SOLID` and `APPROVED` with a passed `FINAL_VALIDATION`; project
   setting `exportRequiresApproval`, default `false` [D] (v0.3 Д-03, D-90). Batch export skips buildings without the right and
   lists them in the `export-report`; one CityJSON file per building, saved to its `progress.save` dataset and
   delivered; a failure skips that building only (D-453, D-457).
10. Journal: one `journal-entry` per commit (§2 row 12); versions and journal kept >= 90 days (v0.3 §11; 3D-03).
11. Lease, no own lock: 3DQM enforces the CP assignment lease (`leaseRef` / `leaseEpoch`, 3D-01); a command from a session
    that does not hold the current lease -> `403 FORBIDDEN`. The own building lock of v0.3 §8.5 and `lockTtlMin` are
    dropped [D] (D-69); releasing another user's lock (admin) is dropped (D-10).
12. Every request and reply validates against `contracts/model3d/`; an invalid message is refused on both sides
    (3D-ADR-0002 Checks).
13. Operaflow rule groups A-D, F apply as assigned in 3D-ADR-0002 "Q-15" (not repeated here).
14. Latency targets (v0.3 §11): server PREVIEW p95 <= 150 ms for a building up to 200 faces, network excluded (3D-08
    measured 5.411 ms, D-109; a
    miss is an owner escalation, never a client fallback, D-06); COMMIT of a simple operation p95 <= 1 s;
    `FINAL_VALIDATION` p95 <= 10 s (assumption); import of a building up to 500 faces <= 2 s (assumption). Bench rig,
    scenes and protocol: [3D-ADR-0006](../decisions/adr/3D-ADR-0006-bench-rig-and-scenes.md) (D-111; `npm run bench`).
15. Service import (`IMPORT_BUILDING`, 3D-133): `POST /api/projects/{p}/buildings/{b}/import`, empty `import-request`,
    operator with the building's lease; the input dataset, the CityObject and the `progress.save` dataset come from the
    CP document through the `buildings` port, never from the client (D-3D133-1). The service reads the input, imports
    (§6), keeps the document, the `progress.save` ref and the basis of the `progress.save` read at import (D-430; one
    read when it is the input dataset) for export, then writes the baseline (version 0): `201 import-report`. A
    building with a baseline -> `409 VERSION_CONFLICT`, nothing changed (D-3D133-2..4).

**Accept:**
- Accept: GT-13 (3D-23, D-68), GT-22, GT-24 (3D-24), GT-23 (3D-25) (§13).
- Accept: a command with a stale `leaseEpoch` -> `403 FORBIDDEN`, model unchanged (D-69).
- Accept: a request with a valid token but `actorId` of another user is executed as the token's user.
- Accept: a contract test sends one invalid message per schema and gets `400 INVALID_PAYLOAD`.
- Accept: a PREVIEW, a competing COMMIT by another command, then COMMIT of the first `previewId` -> `409 VERSION_CONFLICT`.

---

## 12. Client obligations (SC rows 3D-40..3D-44; listed here, authoritative in SC)

**Purpose.** What the client must do so that the server contract holds. Built in `shared_compnents` under its rules
(D-17); UI per brandbook (D-40). Not P4; no geometry logic.

**API.** The message contract of §2 through the SC `model3d-kernel` registry service and a host-injected transport
(D-52, 3D-ADR-0002 A).

**Rules.**
1. Ghost: during a drag the client moves only the selected handle and draws its trace; the ghost promises no final shape;
   the exact shape comes only from a server PREVIEW (v0.3 §3; 3D-ADR-0002 B).
2. `Enter` is disabled until a current server PREVIEW exists; COMMIT carries its `previewId` (v0.3 §3).
3. PREVIEW at most 10 requests/s during a drag; stale replies are dropped (by sequence) and cancelled (v0.3 §3;
   3D-ADR-0002 A.2).
4. Tool state machine E-04 (v0.3 §6):

   | State | Event | Transition |
   |---|---|---|
   | `IDLE` | tool chosen | `AWAIT_SELECTION` |
   | `AWAIT_SELECTION` | valid selection | `COLLECTING_INPUT` |
   | `COLLECTING_INPUT` | input sufficient | `PREVIEW_PENDING` |
   | `COLLECTING_INPUT` | input insufficient on `Enter` | `UNDERCONSTRAINED` -> `COLLECTING_INPUT` |
   | `PREVIEW_PENDING` | server OK | `PREVIEW_READY` |
   | `PREVIEW_PENDING` | server refusal | `FAILED` -> `COLLECTING_INPUT` |
   | `PREVIEW_READY` | input changed | `PREVIEW_PENDING` |
   | `PREVIEW_READY` | `Enter` | `COMMIT_PENDING` |
   | `COMMIT_PENDING` | `COMMITTED` | `IDLE`, selection carried over by lineage |
   | `COMMIT_PENDING` | `CONFLICT` or `REJECTED` | `FAILED` -> `COLLECTING_INPUT` |
   | any except `COMMIT_PENDING` | `Esc` | `CANCELLED` -> `IDLE` |

5. Interactive set (v0.3 §6): E-01 selection, E-02 snapping, E-03 numeric input, E-04 state machine, E-05 preview, E-06
   Undo/Redo, E-07 constraint inspector, E-08 Trim/Extend, E-14 parameter handles, E-15 lineage.
6. Point snapping: `POINT_CLOUD` snap picks the point nearest to the cursor ray within `screenSnapPx`; the coordinate is
   taken from the source double data, not the GPU buffer (v0.3 §7). It is a client hit test, not geometry construction
   (3D-ADR-0002 B).
7. The client shows at least the last 50 operations (v0.2 §13.6).
8. Rendering is no worse than the current viewer with one edited building; desktop Chrome and Edge, last two versions,
   WebGL2 [D] (v0.3 §11, Д-06, D-91). UI in English, error texts as localisation keys [D] (v0.3 Д-11, D-91).

**Accept:** in the SC rows (3D-40 drawing and pick by entity id; 3D-41 transport and stale-reply drop; 3D-42 E-04,
snapping, throttling; 3D-44 panels). This spec adds: Accept: the E-04 table above is implemented transition for
transition (3D-42).

---

## 13. Golden tests - module and WP row

Metric tolerance in analytic tests: area +/- 0.01 m2, volume +/- 0.01 m3 unless stated (v0.3 §12). Every test is a
fixture (format: 3D-07, from v0.2 F.3) and runs at least one check independent of the operation code (analytic formula or
external validator, v0.2 F.3). Each test has exactly one module and one WP row; the row assignment is BACKLOG 3D-09..3D-24
Details, with GT-13 moved from 3D-18 to 3D-23 (D-68).

| GT | Input and operation (v0.3 §12) | Expected (v0.3 §12) | Module | Row |
|---|---|---|---|---|
| GT-I1 | CityJSON gable 10 x 8, base 0, eave 5, ridge 8 along 10 | `VALID_SOLID`; 7 faces, 10 vertices, 15 edges; 2 `RoofSurface`, 1 `RIDGE`, 2 `EAVE`, 4 `RAKE`; volume 520 m3; roof area 100 m2 | `import` | 3D-10 |
| GT-I2 | As GT-I1, ridge edge duplicated with a 0.03 m gap | `DRAFT_SOLID`; `OPEN_BOUNDARY` on two edges; model fully loaded | `import` | 3D-10 |
| GT-I3 | CityJSON with a triangulated roof (each slope 2 triangles) | After import 2 roof faces (coplanar merged); `sourceRef` kept | `import` | 3D-10 |
| GT-I4 | Import GT-I1 -> export without edits | Geometry equal within 0.001 m; semantics and object ids identical; val3dity without errors | `export` | 3D-11 |
| GT-01 | `REPLACE_ROOF` R-01 on 10 x 8, Z = 5 | Roof 80 m2, volume 400 m3 | `ops` (`REPLACE_ROOF`) | 3D-14 |
| GT-02 | R-02, 5 -> 8 across the width 8 | Roof 85.440 m2, volume 520 m3; 1 roof face | `ops` (`REPLACE_ROOF`) | 3D-14 |
| GT-03 | R-03, eave 5, ridge 8 along 10 | Roof 100 m2, volume 520 m3; 2 roof faces | `ops` (`REPLACE_ROOF`) | 3D-14 |
| GT-04 | R-04, eave 5, all slopes rise 3 / run 4 | Ridge Z = 8, length 2 m; 4 slopes; roof 100 m2; volume 488 m3 | `ops` (`REPLACE_ROOF`) | 3D-14 |
| GT-05 | R-03 on an L-shaped footprint | `UNSUPPORTED_FOOTPRINT`; model unchanged | `ops` (`REPLACE_ROOF`) | 3D-14 |
| GT-06 | GT-I2 -> `FIT_TO_SHARED_EDGE`, leading = first slope | Shared ridge; `VALID_SOLID`; the leading slope's plane unchanged | `ops` (`FIT_TO_SHARED_EDGE`) | 3D-17 |
| GT-07 | GT-03 -> `ALIGN_RIDGE`, `KEEP_EAVES`, new Z = 8.5 | Eaves at Z = 5; roof 2·10·√(16 + 12.25) = 106.301 m2; volume 540 m3 | `ops` (`ALIGN_RIDGE`) | 3D-16 |
| GT-08 | GT-03 -> `SPLIT_FACE` without a new plane | 2 coplanar faces; volume 520 m3; lineage 1 -> 2 | `ops` (`SPLIT_FACE`) | 3D-15 |
| GT-09 | GT-03 -> `ALIGN_RIDGE`, `KEEP_PLANES`, arbitrary target | `CONSTRAINT_CONFLICT`; version unchanged | `ops` (`ALIGN_RIDGE`) | 3D-16 |
| GT-10 | `MOVE_VERTEX` of a vertex with `FIXED_POINT` | `CONSTRAINT_CONFLICT`; version unchanged | `ops` (`MOVE_VERTEX`) | 3D-15 |
| GT-11 | GT-03 -> `REMOVE_FACE` of one slope | `DRAFT_SOLID`; export refused; then `HEAL_HOLE` `COPY_NEIGHBOR_PLANE` impossible -> refusal listing the admissible modes | `ops` (`REMOVE_FACE`, `HEAL_HOLE`) | 3D-17 |
| GT-12 | Undo/Redo after GT-07 | Undo: 520 m3 and the original ids; Redo: 540 m3; each operation a new version | `ops` (`UNDO`, `REDO`) | 3D-18 |
| GT-13 | Repeated `commandId`; stale `expectedVersion` | One commit, same reply; `409 VERSION_CONFLICT` | `services/kernel` | 3D-23 (D-68) |
| GT-14 | GT-03 -> `SET_OVERHANG` 0.5 m on both eaves | Footprint 80 m2; roof 112.5 m2; overhang edge Z = 4.625; walls unchanged | `ops` (`SET_OVERHANG`) | 3D-19 |
| GT-15 | GT-03 -> `SET_HEIGHT BASE` = -1 | Volume 600 m3; roof 100 m2 | `ops` (`SET_HEIGHT`) | 3D-19 |
| GT-16 | GT-03 -> `TRANSLATE_BUILDING` (100; 50; 2) | Volume and areas unchanged; every vertex moved exactly by the vector | `ops` (`TRANSLATE_BUILDING`) | 3D-19 |
| GT-17 | GT-03 -> `ADD_CHIMNEY` 1 x 1 m, 1 m above the slope, mid-slope | `BuildingInstallation` a separate closed body; its base in the slope plane; building `VALID_SOLID`, volume 520 m3 | `ops` (`ADD_CHIMNEY`) | 3D-20 |
| GT-18 | GT-03 -> `ADD_DORMER` `FLAT`, outline 2 x 1.5 m | `BuildingInstallation` valid; no body intersection beyond `planarTolM`; building `VALID_SOLID` | `ops` (`ADD_DORMER`) | 3D-20 |
| GT-19 | 4 planes diverging at a node by 0.05 m -> `ALIGN_JUNCTION` `KEEP_PRIMARY_PLANE` | Node within `topologySnapTolM`; primary plane unchanged; or refusal listing the conflicting faces when Fixed | `ops` (`ALIGN_JUNCTION`) | 3D-17 |
| GT-20 | 500 points on z = 0.75·y + 5, noise σ = 0.01 m + 10 % outliers -> `FIT_PLANE` | Normal deviation <= 0.2 deg; RMSE <= 0.015 m; inlier ratio >= 0.85 | `cloud` | 3D-22 |
| GT-21 | Heatmap of GT-03 against the GT-20 points shifted +0.10 m in Z | Mean slope deviation 0.080 +/- 0.005 m (normal distance) | `cloud` | 3D-22 |
| GT-22 | Two users: the operator edits, then tries to set `APPROVED` | `403 FORBIDDEN`; a non-author reviewer approves; a later edit resets the status | `services/kernel` | 3D-24 |
| GT-23 | Building outside the operator's signed assignment (v0.3: "package", D-10) | `403 FORBIDDEN` on read and write | `services/kernel` | 3D-25 |
| GT-24 | Batch export of the assignment's buildings with one `DRAFT_SOLID` (v0.3: "package", D-10) | File without that building; it is named in the `export-report` | `services/kernel` | 3D-24 |
| GT-25 | Building with coordinates of the order of 6 000 000 m | world -> local -> world within 0.001 m | `brep` | 3D-09 |
| GT-26 | GT-03 with slope S1 (south, `z = 5 + 0.75·y`) overshooting the ridge to `y = 4.5` (`z = 8.375`; flap edges and the S1-side gable rakes open, `DRAFT_SOLID`) -> `TRIM_FACE` S1, `cuttingFaceId` S2, `keepPoint` (5; 2; 6.5) | S1 56.25 -> 50 m2; roof 100 m2; S1 plane unchanged; flap vertices deleted; ridge and rakes paired; `VALID_SOLID`; volume 520 m3 | `ops` (`TRIM_FACE`) | 3D-105 |
| GT-27 | GT-26 input, `keepPoint` (5; 4.25; 8.1875) on the flap | `INVALID_TOPOLOGY` (the removed eave part shares edges with the wall); version unchanged | `ops` (`TRIM_FACE`) | 3D-105 |
| GT-28 | GT-03 with S1 ending short of the ridge at `y = 3.5` (`z = 7.625`; its top edge, the S2 ridge edge and the S1-side gable rakes open) -> `EXTEND_FACE` S1, top edge, `targetFaceId` S2 | Ends re-derived at (0; 4; 8), (10; 4; 8); S1 43.75 -> 50 m2; roof 100 m2; S1 plane unchanged; `VALID_SOLID`; volume 520 m3 | `ops` (`EXTEND_FACE`) | 3D-105 |
| GT-29 | GT-03 -> `EXTEND_FACE` S1, eave edge (shared with the south wall), `targetFaceId` S2 | `INVALID_TOPOLOGY`; version unchanged | `ops` (`EXTEND_FACE`) | 3D-105 |

Reference checks (v0.3 §12): GT-04 roof volume 3·8·(2·10 + 2)/6 = 88; GT-07 slope rise 3.5 / run 4, volume
400 + 10·8·3.5/2 = 540; GT-14 slope length 5 + 0.5·5/4 = 5.625 (D-336 split: ground 80, roof plan 90, roof 112.5 of which overhang 12.5, soffit
10 m2, edge Z 4.625, main volume 520, overhang 1.875, total 521.875 m3); GT-21 0.10·cos(arctan 0.75) = 0.080.

Count: 33 tests (GT-I1..GT-I4, GT-01..GT-29); per module: `import` 3, `export` 1, `brep` 1, `cloud` 2, `ops` 22,
`services/kernel` 4. GT-26..GT-29 come from spec §10.6 (3D-104, D-331), not v0.3 §12; their fixtures take this table as
the source (3D-105, D-332). GT-14 is pending row 3D-117: its end caps (0.5 x 0.375 / 2 = 0.09375 m2) are below
`minFaceAreaM2` 0.1 until the validator measures a verified overhang end cap together with its coplanar end wall; the
caps stay separate faces and the expected values stay unchanged (D-343, D-347).

---

## 14. Open questions of this spec

Final ids assigned at merge (D-38, D-71). Each is recorded in DECISIONS.md. Owner answers of
2026-11-21 (dialog): D-68 (GT-13 -> 3D-23), D-69 (CP lease only, no own lock), D-70 (imported vertices
explicit until edited). Owner answers of 2026-11-23 (dialog, 3D-06): D-76 (refusal codes), D-77 (severities). Owner answers of 2026-11-23 (dialog, 3D-22): D-130, D-131 (Q-24 narrowed),
D-132 (Q-18 narrowed), D-135, D-136. Owner answers of 2026-11-25 (dialog, 3D-20): D-256..D-259, D-261 (Q-38 closed). Owner answers of 2026-11-26
(3D-19): D-336..D-339, D-345 (Q-18, Q-37, Q-48 closed).

| Id | Question | Used in |
|---|---|---|
| Q-17 | **Closed by D-110** ([3D-ADR-0005](../decisions/adr/3D-ADR-0005-solver-approach.md) O1: keep the face's other vertices). Objective that fixes the remaining degrees of freedom of a movable plane (e.g. minimal displacement of its other derived vertices); the sources name only soft `MINIMIZE_DISPLACEMENT` | §5 r8, §10.4 r5, §10.5 r4, §10.7 r3, §10.8 r3 |
| Q-18 | **Closed by D-336..D-338 with D-328, D-231 and D-132** (§10.10 r1, r5; §10.7 r3; §10.6 r6; §10.12 r4). Operations given only as intent: movable planes of `MATCH_ELEVATIONS` and `SET_HEIGHT EAVE`; solid closure of `SET_OVERHANG` (soffit or not); collinearity tolerance of `STRAIGHTEN_FACE`; how the `FIT_PLANE` selection reaches the server | §10.1 r7, §10.6 r6, §10.7 r3, §10.10 r1, r5 |
| Q-19 | **Closed by D-70** (keep explicit until edit). Import: are vertex positions replaced by plane intersections (moves up to `planarTolM`, changes an unedited round trip of real data) or kept explicit until the first edit; how a `NON_PLANAR_FACE` keeps its vertices under the vertex-plane invariant | §6 r16 |
| Q-20 | **Closed by D-76** (codes in §10.3 r6, §10.5 r5, §10.6 r2, §10.8 r2; no default maximum displacement). Refusal codes the sources leave open: `FIT_TO_SHARED_EDGE` over the displacement limit / no unique pairing; `HEAL_HOLE` mode impossible (GT-11); `SPLIT_FACE` errors; R-01 errors; and the default maximum displacement of `FIT_TO_SHARED_EDGE` | §2.4, §10.1 r6, §10.3 r6, §10.5, §10.6 r2 |
| Q-21 | **Closed by D-77** (table of §8 r4). Severity by state of `SOLID_OVERLAP`, `UNDERCONSTRAINED_GEOMETRY`, `INVALID_MEASUREMENT`, `EXPORT_SCHEMA_ERROR`, `PRECISION_LOSS` | §8 r4 |
| Q-22 | **Closed by D-69** (CP lease only). Lock: own building lock with `lockTtlMin` (v0.3 §8.5) or the CP assignment lease (`leaseRef`, `leaseEpoch`); defines "own operations" for Undo | §2.3, §10.9 r5, §11 r11 |
| Q-23 | **Closed by D-68** (GT-13 -> 3D-23). GT-13 (idempotency, `expectedVersion`) needs the service's store, but BACKLOG puts it on 3D-18 (module `geo-model3d`, no dependency on 3D-23) | §11, §13 |
| Q-24 | Numbers without a source: server PREVIEW rate limit, payload size limit, PREVIEW expiry, `measurementTolM`. **Narrowed by D-130** (RANSAC parameters, §9 r3) and **D-131** (heatmap threshold required, no default, §9 r6) | §2.3, §2.4, §11 r5, r6 |
| Q-25 | CityJSON mapping of `OVERHANG` faces on export | §7 r6 |
| Q-48 | **Closed by D-345** (§10.10 r6, r7). `TRANSLATE_BUILDING` / `ROTATE_BUILDING`: which measurements are "attached" (v0.3 §6) and what happens with `WORLD`-frame ones | §10.10 r6, r7 |

Contract open questions of 3D-06 (D-75; source and wording:
[contracts/model3d](../../contracts/model3d/README.md#open-questions-provisional-ids-d-38)):

| Id | Question | Closed by |
|---|---|---|
| Q-26 | `EntityId` format: UUID only, or any string; syntax of the PREVIEW ephemeral namespace (v0.2 B.6) | 3D-09 / 3D-23 |
| Q-27 | Per-kind geometry of `ConstructionEntity` (v0.2 B.2 says "per-kind JSON Schema") | the row that first creates one |
| Q-28 | Per-kind layout of `Measurement3D.geometry.coordinates`, e.g. how a `PLANE` is written | 3D-22 |
| Q-29 | Shape of the missing degrees of freedom in `UNDERCONSTRAINED_GEOMETRY` | 3D-13 (with Q-17) |
| Q-30 | `needsRebind` of v0.2 B.6 in the lineage | 3D-09 |
| Q-31 | Names of `affectedMetrics` (decided: the nine `metrics-result` members, D-415; population in 3D-130); how a patch carries model-level changes (`state`, `frame`) | 3D-09 / 3D-12, 3D-130 |
| Q-32 | How the CityJSON CityObject of `IMPORT_BUILDING` maps to `buildingId` (CP assignment unit) | 3D-10 / 3D-43 |
| Q-33 | `INSERT_ROOF_BREAK` with a ridge constraint instead of a new plane | 3D-15 |
| Q-34 | How the `REMOVE_DETAILS` candidate list reaches the client | 3D-104 (D-305) |
| Q-35 | `TRIM_FACE` side to keep (`keepPoint` proposed) | 3D-104 (D-305) |
| Q-36 | `HEAL_HOLE` "allowed corrections" (read as `maxDisplacementM`) | 3D-17 |
| Q-37 | **Closed by D-339** (lower envelope of the roof planes clipped to `roofOutline`; §10.10 r2 is stated by row 3D-114, D-340). Form of the new extent of `RESIZE_ROOF` (`roofOutline` proposed) | 3D-19 |
| Q-38 | **Closed by D-256** (D-256..D-258; §10.11 r7..r9). Dimensions of `ADD_DORMER` (FLAT / GABLE) and `ADD_CHIMNEY` beyond outline / box | 3D-20 |
| Q-39 | Whether the command carries `leaseRef` / `leaseEpoch` (§11 rule 11) or the service takes them from the session | 3D-23 |

Existing questions this spec depends on: Q-03 (CP extension content, 3D-43), Q-10 (val3dity binding, 3D-12). Q-01
(kernel language) is closed by D-109; Q-11 (v0.3 assumptions Д-01..Д-12) is closed by D-88..D-94; Q-43 (EPSG terms of
use, 3D-ADR-0007) is open.
