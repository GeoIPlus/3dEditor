# @geoiplus/geo-model3d

- Status: implemented - `brep` core (3D-09), `crs` (3D-32), `cloud` (3D-22), `validate` (3D-12), `import` (3D-10, state from `validate` 3D-75), `solve` (3D-13), `export` (3D-11), `ops` pipeline + `REPLACE_ROOF` / `REBUILD_ENVELOPE` (3D-14), `SET_SEMANTICS` / `SET_CONSTRAINT` / `REMOVE_CONSTRAINT` (3D-21), repair `REMOVE_FACE` / `HEAL_HOLE` / `FIT_TO_SHARED_EDGE` / `ALIGN_JUNCTION` (3D-17); other operations follow their rows (3D-15..3D-21, 3D-71)
- Protection: P4 - server-only (D-06, D-07); never in a browser bundle, no DOM, no three.js (AGENTS.md §2)
- WP: 3D-05 (bootstrap), 3D-09 (core), 3D-32 (crs), 3D-22 (cloud), 3D-12 (validate), 3D-10 (import), 3D-75 (import state), 3D-13 (solve), 3D-11 (export), 3D-69 (cloud CRS), 3D-81 (world <-> local for every CRS)   Spec: [docs/specs/3dqm-spec.md](../../docs/specs/3dqm-spec.md) §3, §4, §4a, §6, §7, §8, §9
- Source/donor: new; third-party runtime code permissive only ([3D-ADR-0004](../../docs/decisions/adr/3D-ADR-0004-kernel-language-boolean-licences.md));
  `robust-predicates` not adopted (D-118, D-150)
- Spike: `spike/move-edge/` (3D-08), throwaway, not exported; see its [card](spike/move-edge/README.md)
- Third-party runtime code: `proj4` 2.23.0 (MIT; deps `mgrs` 1.0.0 MIT, `wkt-parser` 1.9.0 MIT), used by
  `src/crs/` only ([3D-ADR-0004](../../docs/decisions/adr/3D-ADR-0007-crs-transform.md), accepted D-125); `src/crs/epsg-table.json`
  generated from PROJ 9.8.1 `proj.db` (EPSG v12.029; EPSG terms of use: Q-43) and, since 3D-69, PROJ's proj-strings of the
  projected CRSs (pyproj 3.8.0, same PROJ), kept only where proj4js reproduces PROJ within 1 mm (tools/crs-table)

## Purpose
Geometry kernel for editing LoD2 building models (planes primary, vertices derived, D-08). Runs in Node unchanged,
no I/O, clock or randomness (3D-ADR-0002 C1 rule 1).

## Public API (index.js)
Inputs and outputs are `contracts/model3d/` shapes only (C1 rule 3).
- `P4_CANARY` - the canary literal (format `geoiplus-p4-canary:geo-model3d:<32 hex>`, [3D-ADR-0001](../../docs/decisions/adr/3D-ADR-0001-contracts-location-and-p4-canary.md)).
- `worldToLocal(frame, points)`, `localToWorld(frame, points)` - contract `CoordinateFrame` + `V3[]`, world in the units
  and axis order of `horizontalCrs`; the import mapping for every supported CRS (3D-81): `crs` metric frame
  (`createMetricFrame(horizontalCrs, originWorld)`: projected translation, axis swap when north-first; geographic local
  ENU) + `brep` rotation by `buildingAxisDeg`; equal to `cloudToLocal(frame, frame.horizontalCrs, ...)`. East-first
  projected: the 3D-09 translation bit for bit (GT-25 0 m). Unknown CRS -> `CrsError` `INVALID_CRS`.
  [V] `test/golden/world-local.golden.test.js`: GT-I1 from EPSG:25832, EPSG:4937 and EPSG:31467, <= 1.3e-9 m.
- `cloudToLocal(frame, cloudCrs, points)`, `localBoxToCloud(frame, cloudCrs, box)` (3D-69) - cloud world (its own
  horizontal CRS from the dataset descriptor, D-196; `V3[]` in its axis order) <-> LOCAL; the building side is the
  import mapping (`createMetricFrame` + rotation). Same CRS: no reprojection; same CRS and a projected building: the
  3D-22 path bit for bit. Another CRS: via geodetic on the shared datum; another datum -> `CrsError` `INVALID_CRS`
  reason `DATUM_MISMATCH` (D-197); a projected CRS without a verified projection -> reason `NO_PROJECTION`
  (D-198). `localBoxToCloud` grows a non-rigid box by d^2 / (2 x 6.3e6 m) (earth curvature bound, `crs/box.js`).
- `canonicalJson(value)` - canonical JSON (sorted keys, no `-0`); `save -> load -> save` is byte-identical (K-11).
- `fitPlane(points, selection, profile)` (3D-22) - points `Float64Array` x y z interleaved, LOCAL frame; contract
  `PointSelection`; `{ result: plane-fit-result }` or `{ error }` (`INVALID_MEASUREMENT` with `pointCount` /
  `inlierRatio`; `INVALID_PAYLOAD` for malformed points or selection). The result depends on the set of selected
  points only, not on their order (3D-80, D-187): the same cloud through the LAS or the COPC adapter fits the same.
- `deviationStats(model, points, request, profile)` (3D-22) - contract `heatmap-request` -> `{ result: heatmap-result }`
  or `{ error }` (`INVALID_PAYLOAD`: unknown `faceIds`, missing threshold, bad selection).
- `validateModel(model, { mode, targetState, tolerances, clock, affectedEntityIds?, fullSolid?, findings?,
  externalValidator? }) -> Promise<ValidationReport>` (3D-12, spec §8): contract `validation-report` out; see `validate` below.
- `importBuilding({ cityjson, cityObjectId, toleranceProfile, projectId, buildingId?, toleranceProfileId?, ids?,
  originalSourceRef? })` -> `{ model, baseline, report }` (3D-10, spec §6): contract `building-model` at version 0,
  baseline = isolated copy (3D-ADR-0003 S1), contract `import-report`. Sync. State and `issues` come from `validate`
  (3D-75, D-157): `runChecks` COMMIT_VALIDATION with `fullSolid` + `toIssues`, i.e. what `validateModel` runs in that
  mode without the external port (D-183); no ERROR for VALID_SOLID -> `VALID_SOLID`, else `DRAFT_SOLID` with that
  column's severities; a shell is `isClosed` unless it has `SHELL_NOT_CLOSED`. Refusals throw `ImportError` (`code`
  `INVALID_PAYLOAD` / `NOT_FOUND` / `INVALID_GEOMETRY`) or `CrsError` (`INVALID_CRS`). The input is named `cityjson`, not
  `document`: `check:arch` rejects the DOM global name in kernel files.
- `exportBuilding({ model, cityjson, toleranceProfile })` -> `{ cityjson, findings }` (3D-11, spec §7, D-119):
  `cityjson` is the parsed document the model was imported from (kept by the service, never written); the output is a
  CityJSON document with this building only (D-192); `findings` (`PRECISION_LOSS`) go to `validateModel` (D-151).
  Refusals throw `ExportError` (`INVALID_PAYLOAD` / `NOT_FOUND`) or the `crs` error (`INVALID_CRS`).
- `executeCommand(model, command, { toleranceProfile, clock, ids?, previewId?, previousIssues? })` -> `{ result,
  model, journal?, modelLevel? }` (3D-14, spec §3, D-119). Sync, pure. `result` is a contract `command-result`:
  PREVIEW (`previewId`, default `<commandId>-preview` [A]; the input model object returned, nothing persisted),
  COMMITTED (`model` = new version, `journal` = contract `journal-entry` without `operationId` / `actorId`, which the
  service adds; `modelLevel` names model-level members changed beside the patch, e.g. `state`, Q-31), REJECTED /
  CONFLICT (`error` = contract `error`; the input model object returned unchanged). Kernel-side refusals before the
  operation: unknown kind `INVALID_PAYLOAD`, a kind without a module yet `INTERNAL`, other `buildingId` `NOT_FOUND`,
  stale `expectedVersion` `VERSION_CONFLICT` (status CONFLICT, as the contract example) [A]. Implemented kinds:
  `REPLACE_ROOF`, `REBUILD_ENVELOPE`; see `ops` below.

## Modules (`src/`, DAG of 3D-ADR-0002 C1 rule 2, enforced by `check:arch`)
`brep` (3D-09) is the leaf every other module imports. Its surface (`src/brep/index.js`), for kernel modules only:

| File | Contents |
|---|---|
| `vec.js`, `plane.js` | vectors; `normal · p + d = 0`; `derivePoint(planes, numericEpsilon)`: 3 planes exact, 4+ least squares with residual; null below the Gram-determinant rank threshold |
| `frame.js` | `localFrame(frame, metric?)`: local = Rz(-buildingAxisDeg) · metric; metric mapping injected (D-116), default `world - originWorld` |
| `halfedge.js` | `buildIndex` (rings by `nextId`, faces of vertex, shell of face), `checkTopology` (spec §4 r7; internal kinds `LINK`, `TWIN_*`, `SHELL_FACE`, `VERTEX_FACE`; `validate` maps them to codes) |
| `derive.js` | `vertexPlaneViolations` (shared invariant helper for every op row, spec §4 Accept 2), `inconsistentJunctions` / `junctionSpread` (`INCONSISTENT_JUNCTION`: spread of the 3-plane points > `topologySnapTolM`, D-152), `rederive` (D-70: EXPLICIT -> DERIVED when a face changes) |
| `patch.js`, `transaction.js` | `diffModels`, `applyPatch`; `transact(model, mutate)`: isolated copy, version + 1, forward / inverse patch, lineage; `transactPatch` for Undo / Redo as new versions |
| `rtg.js`, `serialize.js` | `roofGraph` (projection, canonical ids only); `saveModel` / `loadModel` / `isolatedCopy` |

## `validate` (3D-12; spec §8; imports `brep` only)
Surface `src/validate/index.js` for kernel modules (`ops` uses `runChecks` and `newErrors` in its pipeline):

| File | Contents |
|---|---|
| `codes.js` | one table code -> severity in DRAFT_SOLID / VALID_SOLID (spec §8 rule 4, D-77) + scope [A]; `DRAFT_SURFACE` -> draft column, `APPROVED` -> valid column (D-153) |
| `modes.js` | `runChecks`: FAST_PREVIEW = local checks of the affected faces + one ring of neighbours [A]; COMMIT_VALIDATION = whole-model invariants, shell closure / orientation, self-intersection of the affected volume, everything with `fullSolid`; FINAL = full COMMIT + external port |
| `structure.js` | open boundary (a one-face edge shorter than `minEdgeLengthM` is left to `DEGENERATE_EDGE`, D-156), non-manifold edge / vertex (fans), shell closure and connectivity; brep structural kinds -> codes [A] |
| `geometry.js` | degenerate edge / face (`minEdgeLengthM`, `minFaceAreaM2`), non-planar face (`planarTolM`), ring orientation vs support-plane normal, shell orientation by signed volume, junctions |
| `intersect.js`, `polygon.js` | ring self-intersection (x-sweep), face pairs piercing / overlapping in one shell; tolerance predicates only (D-150) |
| `overlap.js` | `SOLID_OVERLAP` between bodies of one building (crossing faces, vertex deeper than `planarTolM`, centroid; winding number); never between buildings (D-89) |
| `lineage.js` | "new" issues: an old issue's ids mapped through `topology-lineage` meet the new issue's ids -> not new [A]; `newErrors` = commit gate of spec §8 rule 7 |
| `external.js` | external validator port type; val3dity code -> contract code, fallback `EXPORT_SCHEMA_ERROR` [A]; binding = 3D-74 (D-148/2, [3D-ADR-0008](../../docs/decisions/adr/3D-ADR-0008-val3dity-binding.md), accepted D-161) |
| `report.js` | dedupe, deterministic order, message = localisation key `model3d.validation.<camelCode>` [A] (D-91), `validatorVersion` `geo-model3d-validate/2` (/2: D-156, 3D-75) (+ port version in FINAL) [A] |

The maps of `codes.js`, `structure.js`, `external.js` are accepted as written (D-162).
Findings of other modules (solve, crs, export, cloud, import) enter as `findings` and get scope and severity from the
same table (D-151). FAST_PREVIEW never sets `isValidForTargetState` (spec §8 rule 1).

## `ops` (3D-14; spec §3, §10; imports `brep`, `solve`, `validate`)
Surface `src/ops/index.js`: `runPipeline` (wrapped by `executeCommand`), `OPERATIONS` / `OPERATION_KINDS` (registry; rows
3D-15..3D-21, 3D-71 add `{ run(draft, payload, ctx) }` entries), `contractError`, `freshIds`.

Pipeline (`pipeline.js`, spec §3 r1-r6): kernel envelope checks -> `brep.transact` (isolated copy): operation module
builds the candidate in plane terms -> constraint step (`constraints.js`: hard constraint on a removed entity ->
`CONSTRAINT_CONFLICT`, soft one dropped, D-213; model constraints compiled and solved for the operation's
`movableFaceIds` / conditions, re-checked at the result) -> `runChecks` COMMIT_VALIDATION with full solid, shell
`isClosed` and `state` set (VALID_SOLID only for that target without ERROR, else DRAFT_SOLID [A]) - the same in
PREVIEW and COMMIT, so both give one patch -> commit gate: ERROR issues new against the input version through the
lineage refuse a VALID_SOLID target `INVALID_GEOMETRY` (v0.2 C.0 GEOMETRY_INVALID; spec §8 r7); the input version is
checked only when the candidate has an ERROR. A PREVIEW report never confirms (spec §8 r1).

| File | Contents |
|---|---|
| `replace-roof.js`, `rebuild-envelope.js` | the two operations; WORLD heights mapped, WORLD `roofPlane` refused (D-217) |
| `templates.js` | R-01..R-04 cells (plane + plan rings): planes through eave lines with slopes, ridge / hip points where planes meet; refusals D-76, D-214..D-216 |
| `footprint.js` | footprint body (D-218), rings normalised (outer CCW, courtyards CW), R-01 errors, rectangle test, axis pairing (exact tie -> `UNDERCONSTRAINED_GEOMETRY`) |
| `envelope.js`, `topology.js` | ground + one vertical wall per footprint edge (top through every roof vertex on the edge: no T-junction) + roof faces; twins by opposite traversal; RTG roles (import's rule restated); ids per D-212; vertices re-derived from their planes |
| `geom2.js`, `errors.js`, `ids.js`, `registry.js` | plan helpers; error objects (HTTP table of spec §2.4); default id source skipping every id of the input (deterministic) |
| `align-line.js` (3D-16) | `ALIGN_RIDGE` / `ALIGN_EAVE` (spec §10.7 r1, r2; v0.2 C.7): both `targetLine` points on every face of the edge (hard, `planarTolM`); movable = adjacent roof faces without a hard constraint, walls fixed (D-232); `KEEP_PLANES` moves nothing (off-line target -> `CONSTRAINT_CONFLICT`, GT-09); `KEEP_EAVES` / `KEEP_RIDGE` lock the `EAVE` / `RIDGE` lines of each movable face as fixed points on its plane; `FIT_MEASUREMENTS` adds POINT terms; other modes `INVALID_PAYLOAD` `INVALID_MODE` |
| `match-elevations.js` (3D-16) | `MATCH_ELEVATIONS` (spec §10.7 r3): `EQUAL_Z` hard per vertex (`zAlignTolM`), target number (WORLD mapped) / MIN / MAX / MEAN of current z; movable = non-vertical roof faces defining the vertices, no hard constraint (D-231) |
| `align-common.js` (3D-16) | payload `hardConstraintIds` held hard (D-234); POINT measurements soft on the nearest adjacent roof plane, weight 1/σz² (D-233) |

Readings [A] for the owner's review: unknown `footprintId` / measurement id -> `INVALID_PAYLOAD`; a non-POINT
measurement for SHED -> `INVALID_MEASUREMENT`; plan point identity on a 1e-7 m grid; degenerate hip when the ridge is
within `topologySnapTolM` (apex = midpoint of both ridge ends); a footprint zero area = below `minFaceAreaM2`;
`REBUILD_ENVELOPE` uses the building's own footprint (no `buildingPartId`) and writes `baseZ` into `baseElevationM`;
new roof faces join the replaced roof's component. R-04 "undetermined ridge length" (spec §10.3 r5) cannot occur with
the accepted payload (four slopes required); only the axis tie gives UNDERCONSTRAINED_GEOMETRY.
3D-16 readings [A]: unknown edge / vertex / constraint / measurement id -> `INVALID_PAYLOAD` with the id; edge role
must match the kind (`RIDGE` / `EAVE`); `INVALID_MODE` is the message prefix of `INVALID_PAYLOAD`; a missing or zero
`sigmaZ` -> `INVALID_MEASUREMENT`; a listed soft constraint the solver cannot hold hard (soft-only kind) -> `INVALID_PAYLOAD`;
condition ids in conflicts are the edge (target line), the locked half-edges, the vertices (EQUAL_Z) and constraint ids;
`KEEP_PLANES` with no target or a target on the line commits a version with unchanged planes (C.7 "rebuild on that line").
Lineage (D-212): kept ids are not in `mapped`; old roof faces map to all new roof faces; new half-edges and
vertices without a predecessor are only in the patch `added` (the owner's reading of spec §10.1 Accept 3).

### Repair operations (3D-17; spec §10.5, §10.8; D-76, D-3D17-1..4)

| File | Contents |
|---|---|
| `fit-to-shared-edge.js` | `FIT_TO_SHARED_EDGE`: B copies welded into the closest A copies (twin pair opposite, else `INVALID_TOPOLOGY`); welded vertex derived from the union of planes; B movable -> hard ON_PLANE of the A edge ends (O1 for the rest); hard `MAX_DISPLACEMENT` per weld -> `CONSTRAINT_CONFLICT` (minimal set) |
| `remove-face.js` | `REMOVE_FACE`: face, its half-edges and unused vertices deleted, twins opened, shell / roof component updated (empty component deleted [A]); vertices with < 3 independent planes become EXPLICIT; VALID_SOLID target refused by the gate |
| `heal-hole.js`, `heal-closing.js` | `HEAL_HOLE`: edges chained into the new ring (several ways -> `UNDERCONSTRAINED_GEOMETRY`, open -> `INVALID_TOPOLOGY`); plane copied / fitted (POINT measurements, D-215) / fitted to the hole; closing compatible when each boundary vertex moves <= `maxDisplacementM` (default `planarTolM`, D-3D17-1), stays on its planes, ring simple with area; else `INVALID_GEOMETRY` with `details.admissibleModes` (D-3D17-2); kind by spec §6 r7 + `SEMANTICS_INFERRED` (D-3D17-3) |
| `align-junction.js`, `junction-point.js` | `ALIGN_JUNCTION`: node point by majority (planes through the current vertex position within `planarTolM`, containing the fixed planes, spread <= `topologySnapTolM`) else least squares on the fixed planes (D-3D17-4); moving planes get "contains the point" (stage 1, O1); optional `maxDisplacementM` per vertex |
| `repair-topology.js` | ring walk, half-edge drop, vertex merge, zero-length edge collapse, the `MAX_DISPLACEMENT` hard condition |

Readings [A] for the owner's review: `HEAL_HOLE` lists `FIT_MEASUREMENTS` as admissible when the model holds >= 3 POINT
measurements (cannot be checked before the points are chosen); `COPY_NEIGHBOR_PLANE` needs a face beside the hole
(`INVALID_PAYLOAD` otherwise); an ambiguous ring gives `admissibleModes: []`; a weld with < 3 independent planes keeps
the A copy explicit; majority = planes through the current node position (with four planes every three meet).
Gap (owner question of 3D-17): GT-19 "Fixed" variant uses `ON_PLANE` with one face and a plane target, which `solve`
does not compile (D-169: `[vertex, face]`); its golden assertion is `todo`.
**3D-21** (spec §10.12): `set-semantics.js` (`SET_SEMANTICS`: only `surfaceKind` changes; a face leaving RoofSurface
leaves its roof component, an emptied component is deleted, a new roof face joins none, D-227) and
`constraint-commands.js` (`SET_CONSTRAINT`: the constraint is read by `compileConstraints` before it is stored, a
rejection of any reason, `TBD` kinds included, is `INVALID_PAYLOAD` with the reason in `message`, D-226; a hard
constraint the current model violates is refused `CONSTRAINT_CONFLICT` by the constraint step, nothing movable, spec
§10.12 r3; id from `ctx.ids('constraint')`, default `constraint-<n>`. `REMOVE_CONSTRAINT`: the explicit unlock of a
FIXED_POINT, spec §5 r6). Unknown ids -> `INVALID_PAYLOAD` (D-228); a command that changes nothing (same
`surfaceKind`, a constraint equal to a stored one) -> `INVALID_PAYLOAD` (D-229).

**3D-20** (spec §10.11; D-256..D-260): `installation-place.js` (roof face of a Building / BuildingPart body, its plane
and plan rings; points on the plane within `planarTolM`; outline normalised CCW, no self-crossing, area above
`minFaceAreaM2`; outline inside the face, boundary allowed within `topologySnapTolM`), `installation-shell.js` (own
planar Boolean of the K-12 P0 scope, D-109: vertical prism over the outline, cut below by the roof plane and above by
the lower envelope of one or two top planes; faces ClosureSurface base, WallSurface per outline edge, RoofSurface
per top plane, no roof component (D-261, as D-227); vertices derived from their faces), `add-chimney.js` (box along local
x / y (D-261), top at the downhill corner + h, D-256), `add-dormer.js` (FLAT top at the highest outline corner + `heightM`,
D-257; GABLE ridge on the fall line through the outline centroid, `ridgeRiseM` above the wall top, convex outline
only, D-258), `remove-installation.js` (deletes the node, its children and every entity of their bodies; faces
leave roof components). The roof face is never cut (D-260): the installation touches it. Refusals D-259;
`measurementId` sizing -> `INVALID_MEASUREMENT` (Q-28). New semantic node id kind `installation` (`installation-<n>`).

## Internal modules
### solve (3D-13)

Spec §5; approach and objective [3D-ADR-0005](../../docs/decisions/adr/3D-ADR-0005-solver-approach.md) (D-110). Not in
`index.js`; `ops` (3D-14..3D-21) call it. Surface (`src/solve/index.js`):
- `builders(model)` - plane-terms conditions for an operation's own targets (`pointOnPlane`, `vertexOnPlane`, `vertexZ`,
  `coincident`, `faceAxis`, `edgeAxis`, `relation`, `slope`, soft `preferredAxis`, `symmetry`); each tagged with an id.
- `compileConstraints(model, constraints, tol)` -> `{ conditions, keepWeights, rejected }` (table below).
- `solveConstraints({ model, movableFaceIds, conditions, targetVertexIds?, keepWeights? }, tol)` -> `{ status: OK |
  CONSTRAINT_CONFLICT | UNDERCONSTRAINED_GEOMETRY, feasible, planes (movable only, empty unless OK), conflictIds,
  entityIds, missingDegreesOfFreedom, residuals, solver: { stage, iterations, converged, cost } }`.
- `toSolveError(result)` -> contract `error` object (422).

How it works: stage 1 when every hard condition is a fixed point on one plane and nothing is soft - closed form per plane
(null space + generalized eigenproblem, O1 keep points = old positions of the face's vertices not in `targetVertexIds`);
otherwise stage 2 from the stage-1 start - Gauss-Newton / LM on sphere-parametrised planes (normal on the unit sphere,
offset at a centre point), hard conditions in their null space (minimum-norm step), exact L1 merit with a second-order
correction, Jacobians by central differences. Every hard condition is re-checked at the result (spec §5 r4); a miss is
reduced to a minimal set by the deletion filter (one stage-2 feasibility solve per hard id). Free degrees: eigenvalue gap
of O1 (stage 1) or singular values of the objective in the hard null space (stage 2) <= `numericEpsilon` (D-172);
counted per face by rank (rotations = rank of the normal part, offsets = the rest), reported `"<faceId>:ROTATION"` /
`"<faceId>:OFFSET"` (D-171). A movable plane no condition reads stays bit-identical (spec §5 r7).

Constraint kinds (D-169; tolerance of the hard check D-170; [S] stated by the spec, [P] accepted proposal):

| Kind | entityIds | target | Condition on the movable planes | Hard tolerance |
|---|---|---|---|---|
| FIXED_POINT [S] | [vertex] | V3, default the stored position | each defining plane contains the point | `planarTolM` |
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

Rejections (`rejected[].reason`): `TBD`, `SOFT_KIND_MARKED_HARD` (spec §5 r1), `SOFT_WITHOUT_WEIGHT` (no default weight
is invented), `ENTITIES_DO_NOT_MATCH_KIND`, `UNKNOWN_KIND`. The refusal code for a rejected constraint is the calling
row's (3D-21 validates constraints when they are set). Any kind may be soft (`hard: false` + `weight`).

Readings marked [A] in code: rank thresholds (1e-12 relative on HᵀH; 1e-12 on the Gram eigenvalues of unit free
directions), central-difference step 1e-6, L1 merit weight 1e6, the `messageKey` `model3d.error.underconstrainedGeometry`
(pattern of the contract examples). Stage 2 is local: a feasible nonlinear set it cannot reach is reported as a conflict
(never projected, spec §5 r4).

Cost (`node tools/bench/solve-cost.mjs`, 2000 solves after 300 warm-up, MOVE_EDGE targets of the bench scenes):
sawtooth-199 stage 1 p95 0.29 ms, stage 2 (soft SYMMETRY added) p95 0.51 ms; sawtooth-499 0.73 / 1.56 ms (run to
run spread ~0.1 ms).

- `src/crs/` (3D-32): `resolveCrs`, `createMetricFrame` (projected: translation; geographic: local ENU),
  `writeBackVertices` (untouched vertices keep file integers, D-70), `decodeVertex`; throws `CrsError` with code
  `INVALID_CRS`. Not in `index.js`; `import` / `export` (3D-10, 3D-11) call it. Spec §4a.
  3D-69: `createCrsMapping(fromRef, toRef)` (`reproject.js`; identity for the same horizontal CRS, else geodetic on the
  shared datum through proj4 with the table's verified projection, no shift, heights unchanged) and
  `mappedBoxBounds(toCloud, rigid, box)` (`box.js`). Table: `geographic[code] = [order, ellipsoid, datum]`,
  `projections[code] = [datum, proj4 definition]` for 4207 of the 4262 projected CRSs (`skippedProjections` counts the
  rest: 38 non-Greenwich meridian, 13 proj4js off by more than 1 mm - laea 9, aeqd 3, labrd 1 - incl. EPSG:3035, 4 without
  PROJ definition or ellipsoid).

- `src/cloud/` (3D-22, spec §9): `fit-plane.js` (RANSAC on triples, then least squares on the consensus set:
  centroid + smallest eigenvector of the scatter matrix, `eigen.js` Jacobi), `deviation.js` + `polygon.js` (nearest face
  polygon within `heatmapBufferM`, signed normal distance, D-135), `points.js` (selection filter, `canonicalOrder`), `rng.js`
  (mulberry32). RANSAC (D-130): inlier distance `planarTolM`, adaptive iterations for 99.9 %, at most 1000, fixed
  seed; the selected points are sorted by x, then y, then z before sampling (3D-80), so the input order does not
  change the result. Readings marked [A]: fitted normal oriented z > 0 (then y, x); a point on a ring boundary follows the crossing
  rule; empty heatmap summary reports zeros.
- `src/import/` (3D-10; spec §6): `cityjson` (Building + BuildingPart / BuildingInstallation children, LoD 2.x and
  Solid-first selection), `vertices` (transform, `crs` metric frame, `brep` local frame, weld within
  `topologySnapTolM`), `fit` (least-squares plane by 3 x 3 Jacobi eigen, Newell orientation), `faces`, `semantics`
  (rule 7), `coplanar` (rule 5, union-find, boundary rings), `halfedges` (twins per shell, `nonManifoldGroupId`),
  `roles` (rule 8), `footprint` (rule 9), `state` (interim issues and state, D-157), `ids` (default id source).
  Readings [A] of import, for the owner's review: model `buildingId` defaults to the CityObject id (Q-32);
  default ids `<kind>-<n>` (Q-26); `buildingAxisDeg` 0 and origin = box centre of the used file vertices;
  `verticalCrs` null (the CRS table resolves only the horizontal part; D-93 keeps heights as in the file);
  `Vtx.sourceRef` = file vertex indices of the welded group, comma-separated; `Face.sourceRef` =
  `<CityObject>/geometry/<i>/boundaries/<path>` of its first input surface (all in `mergedFaces`); vertices are per
  body (parts share no vertex); "offset" of rule 5 = every vertex of each face within `planarTolM` of the other's
  plane; "horizontal" edge = end heights within `zAlignTolM`; roles outside rule 8 -> `GENERIC`, one-face edge
  `BOUNDARY`; roof components per Building / BuildingPart (an installation's roof faces go to its owner); one
  footprint per ground face, outer ring counter-clockwise from above, `baseElevationM` = lowest local height;
  a surface that keeps < 3 vertices or spans no plane is dropped with warning `model3d.import.droppedSurface:<ref>`;
  > 500 faces warns `model3d.import.faceLimitExceeded:<n>>500` (D-94); refusal codes as listed above; issues
  and state come from `validate` (see Public API; the interim `import/state.js` of D-157 is removed by 3D-75). Opaque `GeometryInstance`, `appearance` and extensions
  are not copied: export (3D-11) writes them from the original document, which import never writes (frozen-input test).

- `src/export/` (3D-11; spec §7; imports `brep`, `crs`): `index` (bodies = model semantics with a CityObject
  `sourceRef`; the Building and all its `children` in input order; root members copied), `geometry` (LoD 2.x selection
  restated from import, index walkers, surface paths), `rings` (half-edge loops, match with the original surface),
  `body` (one body's geometry: verbatim when every surface is reused in file order, else rebuilt in model order with
  `semantics` / `material` / `texture` per surface), `vertices` (untouched vs changed, `crs.writeBackVertices`,
  in place or appended, compaction). Decided: D-189..D-193 (untouched = within 1e-6 m of its first file index, any
  `positionMode`). Readings [A] for the owner's review: the 1e-6 m threshold; a reused semantic surface drops `parent` / `children`;
  regenerated surfaces write `{ type: surfaceKind }`, but null for `Unclassified` and SEMANTICS_INFERRED faces;
  regenerated surfaces carry no material (null) or texture (`[null]` per ring); a `-0` from re-quantisation is written
  as 0; PRECISION_LOSS only when a vertex was changed. TBD: OVERHANG tag (Q-25) is not written; a body with model
  solids but no LoD 2.x geometry in the file, a new body without `sourceRef`, and a surface geometry with several
  shells are refused (`INVALID_PAYLOAD`), not guessed.

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
- `test/ops/` (3D-14): pipeline (PREVIEW = COMMIT patch and lineage for every template and REBUILD_ENVELOPE; refusals of
  every kind leave a frozen model byte-identical; lineage D-212; commit gate; inverse patch), templates (R-01 L and
  courtyard, tilted / vertical planes, WORLD heights; R-02 both axes, POINT measurements incl. WORLD; R-03 axes, offset,
  rotated rectangle, refusals; R-04 asymmetric, clockwise ring order, pyramid, crossing hips), REBUILD_ENVELOPE (spec
  Accept: 4 walls, ground 80, closed, 400 m3; GT-03 base -1 -> 600 m3), constraints, body rule, roof components.
  Every result, model and journal entry is checked against its contract (Ajv); area and volume are computed by the
  tests (Newell, divergence theorem).
- `test/ops/semantics-constraints.test.js` (3D-21): SET_SEMANTICS geometry patch empty, roof components, PREVIEW =
  COMMIT; SET_CONSTRAINT accepted kinds, conflicts with the model and with a stored constraint, every compiler
  rejection reason; REMOVE_CONSTRAINT patch and inverse, FIXED_POINT blocks REPLACE_ROOF until unlocked.
- Golden GT-01..GT-05 (`gt-0[1-5].golden.test.js`, PREVIEW then COMMIT with the `previewId`): GT-01 roof 80 m2 /
  400 m3; GT-02 85.440 / 520, 1 face; GT-03 100 / 520, 2 faces; GT-04 ridge Z 8, length 2, 4 faces, 100 / 488; GT-05
  `UNSUPPORTED_FOOTPRINT`, model unchanged.
- `test/ops/align-line.test.js`, `match-elevations.test.js` (3D-16): KEEP_RIDGE on ALIGN_RIDGE -> `INVALID_MODE`;
  off-centre ridge; target skew to the locked eave -> `CONSTRAINT_CONFLICT` (spec §10.7 r2); KEEP_PLANES on / without a
  target; FIT_MEASUREMENTS and its refusals; ALIGN_EAVE KEEP_RIDGE, off-wall target conflict (D-232), soft vs held-hard
  `FIXED_EAVE` (D-234); MATCH_ELEVATIONS number / MIN / MAX / MEAN, ground-vertex and hard-face conflicts.
- `test/ops/installations.test.js`, `installations-refusals.test.js` (3D-20): GABLE ridge 8.675 at x = 5, volume
  5.8875 m3, two slopes of 1.5·√1.64 m2; chimney axes and sizes; WORLD centre; PREVIEW = COMMIT; ADD patch only
  `added`, REMOVE deletes exactly those ids (lineage `deleted` = every face, edge, vertex); two installations; 22
  refusals with their codes on frozen models; FLAT dormer on a flat roof.
- Golden GT-17, GT-18 (3D-20, `installation.golden.helpers.js`): GT-17 building 520 m3, chimney 0.625 m3, top 7.125,
  base in z = 5 + 0.75 y, closed separate body; then REMOVE -> roof 100 m2, 520 m3, entity sets of the input. GT-18
  dormer 4.6875 m3, no vertex below the slope beyond `planarTolM`, no `SOLID_OVERLAP`, outline 2 x 1.5 m.
- Golden GT-07, GT-09 (3D-16, `align.golden.helpers.js`): GT-07 eaves Z 5, roof 106.3015 m2, volume 540 m3, only the
  two slope planes change; GT-09 `CONSTRAINT_CONFLICT`, version and model unchanged.
- Bench (`npm run bench`, non-gate scenes `*-roof`, REPLACE_ROOF PREVIEW through `executeCommand`, 3 x 1000): GT-03
  p95 1.7 ms; sawtooth-199 p95 30.3 ms (kernel mean 9.3 ms; the rest is the bench's Ajv check of the 199-face reply).
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
- `test/solve/` (3D-13): stage-1 parity with the 3D-08 spike, conflicts and minimal sets, underconstrained shapes valid
  against the `error` contract, soft weights against a closed form, compiler table, and the property test of spec §5
  Accept 3 (60 seeded scenarios on GT-03: no plane outside the movable set in the result, input untouched, deterministic).
- `test/canary.test.js`: marker format, entry exports it.
- `test/import/` (3D-10): contract validity (Ajv) of model, baseline, report; `checkTopology` clean; vertices EXPLICIT
  with `sourceRef` (D-70); frozen input; determinism; semantics inference thresholds; CRS refusals and ENU import;
  noisy input (±15 mm) maps back to the file within 0.001 m and writes back identical integers; refusals; LoD
  selection; 500-face warning; HIP / RIDGE / VALLEY / EAVE / RAKE; non-manifold edge; welding; parts and installations.
- `test/export/` (3D-11): unedited GT-I1, GT-I2, noisy GT-I1, parts + installation, EPSG:4937 and an opaque-rich
  document come back byte-identical; GT-I3 merged faces; re-import equality; rounding and grid (projected, geographic),
  PRECISION_LOSS, append vs in place, compaction; opaque members unchanged after an edit; frozen inputs; determinism.
- Golden: `test/golden/gt-i4.golden.test.js` (GT-I4: largest coordinate difference 0 m, semantics and ids identical,
  `validateModel` FINAL with a stub port clean; val3dity assertion is `todo` for 3D-74, D-189).
- Golden: `test/golden/gt-i1..gt-i3.golden.test.js` (GT-I1 volume 520 m3, roof 100 m2, measured by the test's own code;
  GT-I2 per D-156; GT-I3 merged roof faces with their `sourceRef`s).
- `test/crs/`: registry, ENU accuracy against closed-form ECEF and GeographicLib oracles, round trip of
  `test/crs/fixtures/gt-i1-epsg4937.cityjson.json` (made by `test/crs/make-fixture.mjs` from GT-I1). Golden tests: none yet (3D-07).
  3D-69: `reproject.test.js` (8 CRS pairs against PROJ 9.8.1 numbers within 1 mm: UTM, north-first TM, Swiss, Krovak,
  pseudo-Mercator, oblique stereographic, LCC, UTM -> UTM; identity; DATUM_MISMATCH; NO_PROJECTION); `box.test.js`
  (1 km box, 363 sampled points inside the padded box; negative control: bare corners miss points).
