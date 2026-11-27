# @geoiplus/geo-model3d

- Status: implemented - `brep` core (3D-09), `crs` (3D-32), `cloud` (3D-22), `validate` (3D-12), `import` (3D-10, state from `validate` 3D-75), `solve` (3D-13), `export` (3D-11), `ops` pipeline + `REPLACE_ROOF` / `REBUILD_ENVELOPE` (3D-14), `MOVE_VERTEX` / `MOVE_EDGE` / `OFFSET_FACE` / `SPLIT_FACE` / `INSERT_ROOF_BREAK` / `MERGE_FACES` (3D-15), `SET_SEMANTICS` / `SET_CONSTRAINT` / `REMOVE_CONSTRAINT` (3D-21), `FIT_PLANE` command (3D-71), `UNDO` / `REDO` / `RESTORE_BASELINE` (3D-18), repair `REMOVE_FACE` / `HEAL_HOLE` / `FIT_TO_SHARED_EDGE` / `ALIGN_JUNCTION` (3D-17); other operations follow their rows (3D-15..3D-21, 3D-71)
- Protection: P4 - server-only (D-06, D-07); never in a browser bundle, no DOM, no three.js (AGENTS.md §2)
- WP: 3D-05 (bootstrap), 3D-09 (core), 3D-32 (crs), 3D-22 (cloud), 3D-12 (validate), 3D-10 (import), 3D-75 (import state), 3D-13 (solve), 3D-11 (export), 3D-69 (cloud CRS), 3D-81 (world <-> local for every CRS)   Spec: [docs/specs/3dqm-spec.md](../../docs/specs/3dqm-spec.md) §3, §4, §4a, §6, §7, §8, §9
- Source/donor: new; third-party runtime code permissive only ([3D-ADR-0004](../../docs/decisions/adr/3D-ADR-0004-kernel-language-boolean-licences.md));
  `robust-predicates` not adopted (D-118, D-150)
- Spike: the 3D-08 `spike/move-edge/` was removed by 3D-121 (D-357); `npm run bench` measures `executeCommand` through the
  kernel service command API (3D-ADR-0006)
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
- `computeMetrics(model, { toleranceProfile })` (3D-116; v0.2 F-53; D-412..D-415) - contract `metrics-result`:
  geometric metrics of the main building (solids not owned by a `BuildingInstallation` node): footprint and roof plan
  as exact XY unions, roof / overhang roof / soffit 3D areas, total volume and its split into main and overhang
  (boundary-loop closure of each OVERHANG group, D-414); `volumeStatus` FINAL / PROVISIONAL / NOT_AVAILABLE from a
  fresh `runChecks` (D-413); never mutates the model; geometric only, not tax values (v0.2 §16.5). The nine
  metric members are the `affectedMetrics` names; patches keep `[]` until 3D-130 (an empty list means "not
  computed yet", not "unchanged").
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
- `executeCommand(model, command, { toleranceProfile, clock, ids?, previewId?, previousIssues?, points? })` -> `{ result,
  model, journal?, modelLevel? }` (3D-14, spec §3, D-119). Sync, pure. `result` is a contract `command-result`:
  PREVIEW (`previewId`, default `<commandId>-preview` [A]; the input model object returned, nothing persisted),
  COMMITTED (`model` = new version, `journal` = contract `journal-entry` without `operationId` / `actorId`, which the
  service adds; `modelLevel` names model-level members changed beside the patch, e.g. `state`, Q-31), REJECTED /
  CONFLICT (`error` = contract `error`; the input model object returned unchanged). Kernel-side refusals before the
  operation: unknown kind `INVALID_PAYLOAD`, a kind without a module yet `INTERNAL`, other `buildingId` `NOT_FOUND`,
  stale `expectedVersion` `VERSION_CONFLICT` (status CONFLICT, as the contract example) [A]. Implemented kinds:
  `REPLACE_ROOF`, `REBUILD_ENVELOPE`; see `ops` below. `points` (3D-71): for `FIT_PLANE` the points the service read
  for the payload `selection` (Float64Array, x y z, LOCAL; services/kernel `commandPoints`); `index.js` gives the op a
  `planeFit(selection)` closure over `cloud.fitPlane`, so `ops` does not import `cloud` (module DAG unchanged).
  History kinds `UNDO`, `REDO`, `RESTORE_BASELINE` (3D-18) take
  `options.history = { journal, baseline?, actorId }`: the building's journal entries oldest first (with `actorId`), the
  immutable baseline, the authenticated actor; see `ops` history below.

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
| `geometry.js` | degenerate edge / face (`minEdgeLengthM`, `minFaceAreaM2`; a verified overhang end cap is measured with its end wall, `caps.js`), non-planar face (`planarTolM`), ring orientation vs support-plane normal, shell orientation by signed volume, junctions |
| `caps.js` | verified overhang end cap (3D-117, D-343): ten conditions C1..C10 (WallSurface + OVERHANG triangle, non-degenerate, manifold, neighbours end wall / strip / soffit, strip-soffit edge at the apex, vertical, coplanar with the end wall, no self-intersection or overlap, cap + wall area >= `minFaceAreaM2`); never on the tag alone, never throws |
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
3D-15..3D-21, 3D-71 add `{ run(draft, payload, ctx) }` entries), `contractError`, `freshIds`, `runHistory` /
`historyStacks` / `HISTORY_KINDS` (3D-18).

History (`history.js`, 3D-18, spec §10.9; D-291..D-294): not a registry entry - `executeCommand` dispatches the three kinds
to `runHistory`, because they need the journal and baseline and pass no commit gate. Same envelope checks and output
shape as the pipeline; payload must be `{}`. `historyStacks(journal)` replays: an edit (incl. `RESTORE_BASELINE`) pushes
and clears redo, `UNDO` moves the top to redo, `REDO` back; a journal that does not replay or end at the model version
-> `INTERNAL` (service fault). UNDO applies the top entry's `inversePatch` (original ids), REDO its `forwardPatch`,
RESTORE_BASELINE the baseline (entities and model-level members); each a new version; `state` and shell `isClosed`
from validation. Refusals: empty stack / already baseline `INVALID_PAYLOAD`; top of another actor `FORBIDDEN` (with its
`commandId`). Idempotency on `commandId` is the service's (3D-23, D-68). Limitation: model-level members other than
`state` are not restored by UNDO / REDO, a patch cannot carry them (Q-31).

Pipeline (`pipeline.js`, spec §3 r1-r6; the op context carries `actorId` and the optional `planeFit`, 3D-71): kernel envelope checks -> `brep.transact` (isolated copy): operation module
builds the candidate in plane terms -> constraint step (`constraints.js`: hard constraint on a removed entity ->
`CONSTRAINT_CONFLICT`, soft one dropped, D-213; model constraints compiled and solved for the operation's
`movableFaceIds` / conditions, re-checked at the result) -> overhang rebuild (`dependents.js`, 3D-124, D-384,
3D-ADR-0010 B1: a payload naming a dependent overhang entity -> `INVALID_PAYLOAD` except `SET_OVERHANG` / `SET_HEIGHT`,
D-385, checked before the transaction; every well-formed overhang is taken off before the operation, the plain eave
DERIVED, and re-added after the constraint step through `addOverhang` with the same ids and the input width in plan
measured from the (new) wall; eave half-edge, its vertices, wall and end walls must keep their ids, else
`INVALID_TOPOLOGY`; `addOverhang` refusals stand; rebuild noise <= `numericEpsilon` snapped to the input; constraints
naming dependent entities sit out the solve, then every hard constraint is checked with all planes fixed ->
`CONSTRAINT_CONFLICT`; operations in `SELF_REBUILD` of the registry - SET_OVERHANG, SET_HEIGHT, ALIGN_WALL,
RESIZE_ROOF, REGULARIZE_FOOTPRINT - are not detached) -> overhang guard (`overhang-guard.js`, 3D-120, D-372, D-373:
last check for what the rebuild does not cover - a strip that was coplanar with its parent roof face and is no longer
within `planarTolM` of it -> `INVALID_TOPOLOGY`, model unchanged) -> `runChecks` COMMIT_VALIDATION with full solid, shell
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
| `fit-plane.js` (3D-71) | `FIT_PLANE` (spec §10.12 r4, §9 r4-r5): payload checked (`apply`, `faceId` for FACE_PLANE only, unknown face -> `INVALID_PAYLOAD`), fit refusals passed on (`INVALID_MEASUREMENT` with `pointCount` / `inlierRatio`, the face named); `MEASUREMENT` adds a PLANE measurement `[[nx, ny, nz, d]]` LOCAL, σ = RMSE on all three axes, `fit` RANSAC_SVD, `MEASURED`, `createdBy` = `actorId`, `sourceId` null (D-280, -2); `FACE_PLANE` sets the face's `supportPlane` (outward sign kept) and re-derives its vertices, hard constraints re-checked by the constraint step (D-282). No points from the service -> `INTERNAL` [A] |
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

### Repair operations (3D-17; spec §10.5, §10.8; D-76, D-284..D-287)

| File | Contents |
|---|---|
| `fit-to-shared-edge.js` | `FIT_TO_SHARED_EDGE`: B copies welded into the closest A copies (twin pair opposite, else `INVALID_TOPOLOGY`); welded vertex derived from the union of planes; B movable -> hard ON_PLANE of the A edge ends (O1 for the rest); hard `MAX_DISPLACEMENT` per weld -> `CONSTRAINT_CONFLICT` (minimal set) |
| `remove-face.js` | `REMOVE_FACE`: face, its half-edges and unused vertices deleted, twins opened, shell / roof component updated (empty component deleted [A]); vertices with < 3 independent planes become EXPLICIT; VALID_SOLID target refused by the gate |
| `heal-hole.js`, `heal-closing.js` | `HEAL_HOLE`: edges chained into the new ring (several ways -> `UNDERCONSTRAINED_GEOMETRY`, open -> `INVALID_TOPOLOGY`); plane copied / fitted (POINT measurements, D-215) / fitted to the hole; closing compatible when each boundary vertex moves <= `maxDisplacementM` (default `planarTolM`, D-284), stays on its planes, ring simple with area; else `INVALID_GEOMETRY` with `details.admissibleModes` (D-285); kind by spec §6 r7 + `SEMANTICS_INFERRED` (D-286) |
| `align-junction.js`, `junction-point.js` | `ALIGN_JUNCTION`: node point by majority (planes through the current vertex position within `planarTolM`, containing the fixed planes, spread <= `topologySnapTolM`) else least squares on the fixed planes (D-287); moving planes get "contains the point" (stage 1, O1); optional `maxDisplacementM` per vertex |
| `repair-topology.js` | ring walk, half-edge drop, vertex merge, zero-length edge collapse, the `MAX_DISPLACEMENT` hard condition |

Readings [A] for the owner's review: `HEAL_HOLE` lists `FIT_MEASUREMENTS` as admissible when the model holds >= 3 POINT
measurements (cannot be checked before the points are chosen); `COPY_NEIGHBOR_PLANE` needs a face beside the hole
(`INVALID_PAYLOAD` otherwise); an ambiguous ring gives `admissibleModes: []`; a weld with < 3 independent planes keeps
the A copy explicit; majority = planes through the current node position (with four planes every three meet).
GT-19 "Fixed" variant (hard `ON_PLANE` `[face]` + `Plane` on east, north, west) is refused `CONSTRAINT_CONFLICT`
listing `f-roof-e` since 3D-103 (D-289).
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
## Core edits (3D-15, 3D-105)
Operations on the pipeline (spec §10.4, §10.6; D-297..D-306, D-322..D-324), one entry each in `ops/registry.js`:

| File | Kind | Plane terms |
|---|---|---|
| `move.js` | `MOVE_VERTEX`, `MOVE_EDGE` | target points as hard point-on-plane conditions on movable incident planes; fixed incident planes checked (`CONSTRAINT_CONFLICT`); a hard FIXED_POINT on the moved vertex checked directly (GT-10); O1 for free degrees; only an explicit vertex (fewer than three planes) takes the target as position |
| `offset-face.js` | `OFFSET_FACE` | `d_new = d - offsetM`, pinned by three hard points (`plane-pin.js`); fixedMode interlock (D-300); offset 0 -> `noChange` (D-301) |
| `face-cut.js`, `split-face.js` | `SPLIT_FACE` | cut topology (D-299, D-302), both parts on the same plane, no vertex moved |
| `insert-roof-break.js` | `INSERT_ROOF_BREAK` | same cut; the part holding `movingSidePoint` gets `newPlane` (pinned), neighbours re-derived (D-297) |
| `merge-faces.js` | `MERGE_FACES` | union loops, joint vertices dissolved, COPLANAR / REFIT (D-303) |
| `inherit.js` | - | constraint policy table on split / merge (D-298); lineage in `warnings` (D-306) |
| `trim-face.js` | `TRIM_FACE` (3D-105) | L = plane(F) ∩ plane(`cuttingFaceId`), same cut (D-302); the part holding `keepPoint` stays; only a dangling flap is removed (D-323); plane of F unchanged; closure |
| `extend-face.js` | `EXTEND_FACE` (3D-105) | an open outer edge moves onto L = plane(F) ∩ plane(`targetFaceId`); ends from (F, neighbour plane, G) or an open neighbour's line (explicit); area must grow (D-324); ids kept; closure |
| `face-line.js` | - | plane-plane line, point in face, closure of r7.5: coinciding open half-edges of one shell paired within `topologySnapTolM` |

Constraint policy (D-298): split - plane kinds COPY_TO_CHILDREN (PRESERVE_ORIGINAL on a roof break), edge kinds
copied to the new fragment of a crossed edge (FIXED_LINE / FIXED_EAVE / FIXED_RIDGE: TRANSFORM_PARAMETERS, the copy
fixes the fragment's points), vertex kinds PRESERVE_ORIGINAL, TBD / unknown kinds REJECT_IF_UNSUPPORTED; merge -
REBIND_TO_CHILD, duplicates and trivial self relations dropped, hard PERPENDICULAR of one face refused. No kind uses
REBIND_TO_CHILD on a split: no constraint kind names a sub-region of a face.

Limitations (first version, D-302): a cut must cross the outer ring exactly twice and no hole; constraint lineage is
text in `warnings`, not in `topologyLineage` (D-306); after `INSERT_ROOF_BREAK` only the chord's edge role is
recomputed (other roles kept); `FIXED_POINT` without `target` and the FIXED_* edge kinds fix the positions the model
holds before the operation (compile reads the draft before the solve).
TRIM / EXTEND closure vertex rule (owner, D-363): two vertices at one place become one; the unmoved one's id
survives, a new id if both moved (created counts as moved); if neither moved, the edited face's vertex [A]. The survivor
takes the union of defining faces and is DERIVED when they give a unique point within `planarTolM`. "Parallel" for an
EXTEND neighbour line and L: `coplanarTolDeg` (D-364). `STRAIGHTEN_FACE` is 3D-122, `REMOVE_DETAILS` 3D-123 (D-361).

**3D-19** (spec §10.10; D-336..D-345): `rigid-move.js` (TRANSLATE_BUILDING, ROTATE_BUILDING: one isometry on every
plane, vertex, footprint, construction entity, LOCAL measurement and constraint target; WORLD measurements and
targets tied to them stay; centroid of the building footprint; a hard constraint that cannot be verified refuses;
zero move = no-op; journal warning), `set-height.js` (BASE: ground plane solved to the new Z; EAVE: the structural
eave's roof face solved by D-231 / D-110, the ridge must stay -> else CONSTRAINT_CONFLICT; an overhang is taken off,
the slope solved, the overhang rebuilt at the same width with the same ids), `overhang.js` + `set-overhang.js`
(soffit profile of D-336: strip RoofSurface + OVERHANG in the roof plane, OuterCeilingSurface soffit through the
outer edge and level across it (D-3D131-1: exact width at both corners on an eave horizontal within `zAlignTolM`),
WallSurface + OVERHANG end caps in the gable planes; width carried by the soffit plane and recovered from geometry;
same width no-op, 0 removes, a new width keeps every id; unsupported junction -> INVALID_TOPOLOGY, D-344).
Limitations: the eave vertices under an overhang have two independent planes and are EXPLICIT (spec §4 r3), so
operations of other rows do not rebuild an overhang (3D-115); GT-14 caps are below `minFaceAreaM2` and pass as verified caps (3D-117, D-343);
RESIZE_ROOF, ALIGN_WALL: 3D-114 (below); REGULARIZE_FOOTPRINT: 3D-126 (below).

**3D-114** (spec §10.10 r2, r4; D-339, D-346, D-389..D-392): `lower-envelope.js` (lower-envelope test of the roof
planes - no valley edge, no plane below a roof vertex -, strictly convex outline, cells of the lower envelope over the
outline by half-plane clipping, shared corners merged), `resize-roof.js` (RESIZE_ROOF: roof planes kept; V1 = roofs
that are their lower envelope, else INVALID_TOPOLOGY, also with an installation; `moveWallFootprint` true: footprint :=
outline, envelope rebuilt by `envelope.js` with the roof face ids kept, an overhang removed first; false: footprint kept,
the outline must be the footprint offset edge by edge, each outward offset is a D-336 overhang of a structural eave,
otherwise INVALID_TOPOLOGY, D-344), `align-wall.js` (ALIGN_WALL: only the wall plane changes, vertices re-derived, roof
planes kept, eave height recomputed; footprint record follows; an overhang on the wall or its end wall is rebuilt at
the same width with the same ids; a roof face turned over or a junction the kept planes no longer meet -> INVALID_TOPOLOGY).

## `metrics` (3D-116; v0.2 F-53, §16.5; imports `brep`, `validate`)
| File | Contents |
|---|---|
| `index.js` | `computeMetrics`, `METRIC_NAMES` (contract order = `affectedMetrics` names, D-415) |
| `body.js` | main body by structure (semantic node -> solids -> shells; installations out, a shared face = unsupported); ring points relative to the body's min corner (MET-19) |
| `area.js`, `union2d.js` | 3D face areas (Newell, holes subtracted); exact area of a union of polygons with holes (slab method: vertex and crossing x-coordinates, even-odd per polygon, midpoint rule exact per slab; O(E^2)) |
| `volume.js` | signed divergence volume about a local point; outer > 0, void < 0, finite, else null (no `Math.abs`) |
| `status.js` | volume proof: blocking codes (open, non-manifold, orientation, self-intersection, non-planar, junction, overlap, CRS) -> N/A; `DEGENERATE_FACE` / `_EDGE` safe only if every edge > `numericEpsilon` and area / longest edge > `numericEpsilon` (D-413); FINAL needs VALID_SOLID / APPROVED and no VALID-column ERROR on the body |
| `overhang.js` | OVERHANG groups by shared edges; one simple loop (reasons `OPEN`, `BRANCH`, `MULTIPLE_LOOPS`, `ZERO_EDGE`, `NOT_IN_WALL_PLANE`, `SELF_INTERSECTION`, `PROTRUDES`, `ORIENTATION`, `EMPTY`, `OVERLAP`; internal, tests only) in a bordering wall plane within `numericEpsilon`; volume about the loop centroid (the fan closure adds 0); groups proven disjoint by a separating wall or face plane |

**3D-126** (spec §10.10 r3; v0.2 F-39; D-417..D-424): `regularize-plan.js` (pure 2D plan: per ring, chains of walls
within `footprintAngleTolDeg` of their longest wall merge into it, plane and id kept; optional orthogonalisation onto
the 0 / 90 deg grid of the longest outer wall about each edge's midpoint; degenerate rings; vertex shift and area
change), `regularize-courtyard.js` (degenerate courtyard removed with `allowCourtyardRemoval` when its hole lies in one
ground and one roof face, else INVALID_TOPOLOGY), `regularize-footprint.js` (REGULARIZE_FOOTPRINT: wall planes set, roof
planes kept, vertices re-derived, merged walls joined by the MERGE_FACES mechanism with the lineage composed over
successive dissolves; footprint record follows; overhangs rebuilt, refused on a merged-away wall; change report in
`warnings`). No distance limit (D-419); small steps are not touched (D-423).

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

Constraint kinds (D-169, amended by D-289; tolerance of the hard check D-170; [S] stated by the spec, [P] accepted proposal):

| Kind | entityIds | target | Condition on the movable planes | Hard tolerance |
|---|---|---|---|---|
| FIXED_POINT [S] | [vertex] | V3, default the stored position | each defining plane contains the point; a DERIVED vertex is also re-checked at its derived position (check only, not a solver term; D-371, 3D-118) | `planarTolM` |
| ON_PLANE [S] | [vertex, face] | V3 optional | the target point, else the derived vertex, lies on the face plane | `planarTolM` |
| ON_PLANE [D-289] | [face] | Plane (required) | fixed face plane: unit normal equals the target's (scaled to unit, oriented like the stored face normal, D-312) and offset equals its `d` | normal `numericEpsilon`, offset `planarTolM` |
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
- `test/metrics/` (3D-116): MET-01..MET-24 (`metrics.test.js`), VOL-01..VOL-20 (`volume-status.test.js`),
  OVM-01..OVM-35 (`overhang.test.js`, `overhang-topology.test.js`), `unionArea` cases; every result checked against
  `metrics-result` (Ajv); references from `test/ops/helpers.js` or analytic. VOL-05 and OVM-30 are `it.fails` until
  3D-117 (GT-14 FINAL). `test/golden/metrics.golden.test.js`: GT-01..GT-04, GT-07, GT-15 roof area and volume equal
  the fixture and the helpers (FINAL); GT-14 80 / 90 / 112.5 / 12.5 / 10 m2, 520 / 1.875 / 521.875 m3 PROVISIONAL.
- `test/ops/history.test.js`, `test/golden/gt-12.golden.test.js` (3D-18): GT-12 Undo 520 m3 with every entity equal
  to the input version, Redo 540 m3, versions 1 -> 4; RESTORE_BASELINE after GT-07 equal to the baseline, version + 1,
  undoable, clears redo; stack order, redo cleared by an edit, foreign stack top FORBIDDEN, empty stack and
  already-baseline INVALID_PAYLOAD, PREVIEW = COMMIT patch, deterministic output, UNDO into DRAFT_SOLID without gate.
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
  (0.080 +/- 0.005). Both run the kernel functions; GT-20 also runs its step as the `FIT_PLANE` command (3D-71):
  the committed PLANE measurement carries the same fit (since 3D-80: 0.0020 deg, RMSE 0.00765 m, 441 / 500).
- `test/ops/fit-plane.test.js` (3D-71): MEASUREMENT patch (one Measurement3D, layout and σ), PREVIEW = COMMIT;
  FACE_PLANE on GT-03's south slope re-derives `v-e0`, `v-e1`, `v-r0`, `v-r1` (spec §10.12 Accept 2); a fit 0.3 m higher
  gives eaves z 5.3 and ridge y 3.8, z 8.15 (hand-computed); hard FIXED_POINT -> `CONSTRAINT_CONFLICT`; 29 points,
  ratio < 0.6, payload and host refusals, model unchanged.
- `test/cloud/` (3D-22): fit (clean, outliers, determinism, selection, refusals at 29 points and ratio < 0.6, Ajv
  against `plane-fit-result` / `error`), heatmap (assignment, buffer, `faceIds`, polygon edge distance, refusals, Ajv
  against `heatmap-request` / `heatmap-result`), eigen solver, generator, ring test.
- Cost on the bench scenes (3D-09, warm, 300 requests): sawtooth-199 index 0.59 ms, topology 0.53 ms, transaction with
  re-derivation 3.9 ms p50 / 6.8 ms p95; sawtooth-499 transaction 14.2 / 22.5 ms. Clone and diff dominate (~2 ms each
  at 199 faces); a dirty-tracking draft is the next step if a gate needs it.
- `test/solve/` (3D-13): stage-1 parity with the 3D-08 spike, conflicts and minimal sets, underconstrained shapes valid
  against the `error` contract, soft weights against a closed form, compiler table, and the property test of spec §5
  Accept 3 (60 seeded scenarios on GT-03: no plane outside the movable set in the result, input untouched, deterministic).
  `fixed-plane.test.js` (3D-103): ON_PLANE `[face]` + `Plane` target - compile shape and tolerances, rejections, orientation
  and scale of the target, driven plane, conflicts on movable and fixed faces.
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
