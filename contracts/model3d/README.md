# contracts/model3d

- Status: **accepted** by the owner in a dialog, 2026-11-23 (D-18; D-75). Q-20 and Q-21 closed by D-76, D-77.
- Protection: none (contracts are public messages; the kernel behind them is P4).
- WP: 3D-06   Spec: [docs/specs/3dqm-spec.md §2](../../docs/specs/3dqm-spec.md#2-contracts---contractsmodel3d-3d-06)
- Source/donor: new, from v0.2 Appendix B/D, v0.3 §4, §9, §10 and the spec; no third-party code.

## Purpose

The authoritative JSON Schema 2020-12 contracts of every `model3d` shape that crosses a process or repository boundary
(AGENTS.md §2.7, D-37, [3D-ADR-0001](../../docs/decisions/adr/3D-ADR-0001-contracts-location-and-p4-canary.md)).
Consumers (SC, geoviewer) vendor a byte-for-byte copy pinned to a commit of this repository. Kernel-internal structures
are not here (3D-ADR-0002 C1 rule 3).

## Public API (the schemas)

Every file is `<name>.schema.json` with `$id` `urn:geoiplus:schema:model3d-<name>:v1`. Refs between files use the `$id`.

| Spec §2 row | `<name>` | Root |
|---|---|---|
| - | `common` | `$defs` only: `EntityId`, `V2`, `V3`, `Line2`, `Line3`, `Ring2`, `Plane`, `ModelState`, `SurfaceKind`, `EdgeRole`, `ConstraintKind`, `Frame`, `LocalAxis`, `OperationKind`, lengths, `Version`, `Timestamp`, `PointSelection` (BOX / POLYGON, D-132) |
| 1 | `building-model` | `BuildingModel`; entities in `$defs` (`Footprint`, `ConstructionEntity`, `Vtx`, `HalfEdge`, `Face`, `Shell`, `Solid`, `RoofComponent`, `Constraint`, `ConstraintBody`, `CoordinateFrame`, `SemanticNode`, `SchemaVersion`) |
| 2 | `measurement` | `Measurement3D` |
| 3 | `tolerance-profile` | 14 fields, `default` = D-13 values |
| 4 | `command` | `GeometryCommand`; `payload` dispatched by `operation` |
| 5 | `command-payload-<kind>` | one file per `OperationKind` (37), e.g. `command-payload-move-vertex` |
| 6 | `command-result` | `GeometryCommandResult` |
| 7 | `model-patch` | `ModelPatch` |
| 8 | `topology-lineage` | `{ mapped, deleted, preserved }` |
| 9 | `validation-report` | `ValidationReport`, `ValidationIssue`; severity by state enforced |
| 10 | `error` | error registry: code bound to HTTP status |
| 11 | `import-report` | result of `IMPORT_BUILDING` |
| 12 | `journal-entry` | one committed operation |
| 13 | `command-status` | status by `commandId` |
| 14 | `plane-fit-result` | plane, counts, ratio, RMSE |
| 15 | `heatmap-result` | per-face values + summary |
| 16 | `export-report` | exported / skipped with reason |
| (3D-22) | `heatmap-request` | building, model version, `PointSelection`, optional `faceIds`, required `thresholdM` (D-136; spec §2 row 17) |
| 18 (3D-116) | `metrics-result` | F-53 geometric metrics, `volumeStatus`; owner-approved names (D-412, D-413); the nine metric members are the `affectedMetrics` names (D-415) |

`examples/<name>.json` holds `{ "valid": [...], "invalid": [{ "why", "instance" }] }` (for `common`: per `$defs` entry).

## Rules and invariants

- Marks inside the schemas: `[P]` in a `$comment` = a name or shape the sources do not give, proposed by 3D-06 and
  accepted by the owner (D-75); `[A]` = this schema's reading of a source; `TBD (Q-NN)` = left open, never guessed.
- Every object is closed (`additionalProperties: false`) except `SemanticNode.attributes`, `ConstraintBody` (closed by
  its users with `unevaluatedProperties`) (the `FIT_PLANE` `selection` is a `PointSelection` since D-132).
- Values: the only defaults are the D-13 tolerances. No limit, threshold or default that the sources do not give
  (payload size, PREVIEW rate and expiry, `measurementTolM`: Q-24). The heatmap threshold has no default and is required in `heatmap-request` (D-131); RANSAC parameters are kernel settings (D-130), not contract fields.
- `schemaVersion` of model and command is `"1"` and equals the `$id` major `v1` [P]. A breaking change bumps both.
- Ajv: strict mode except `strictRequired` (it rejects the standard `if`/`then` `required` idiom).

- Changes inside `v1` before the first release, approved per D-18 (precedent `insert-roof-break`, 3D-15): 3D-105 (D-331)
  replaced `trim-face.trimLine` by `cuttingFaceId` (D-322) and `extend-face.targetLine` by `targetFaceId` (D-324), added
  `remove-details.maxAreaM2` (D-326) and `maxDisplacementM` (D-330), and the optional `command-result.candidates` (D-325).
  3D-110 (D-406) added the error code `INVALID_CRS` (422) with `details.crsReason`.

### Proposals accepted by the owner (D-75)

| # | Proposal | Where |
|---|---|---|
| P1 | File layout above; one payload file per kind; shared `common`; `schemaVersion: "1"` | all |
| P2 | `Vtx.positionMode: DERIVED \| EXPLICIT` marks vertices kept at file position (D-70) or with < 3 planes | `building-model` |
| P3 | `Footprint.baseElevationM` required (v0.3 §4.2 "2D + baseElevationM") | `building-model` |
| P4 | Commands target only `DRAFT_SOLID` / `VALID_SOLID`; `REMOVE_FACE` requires `DRAFT_SOLID` | `command` |
| P5 | Result status coupling: PREVIEW has `previewId` + patch + lineage; COMMITTED patch + lineage; REJECTED / CONFLICT `error`, no patch | `command-result` |
| P6 | Error: `messageKey` required, `message` optional, `subcode: INVALID_MODE`, `details` (`admissibleModes`, `missingDegreesOfFreedom`, `pointCount`, `inlierRatio`); INTERNAL 500, UNAVAILABLE 503 | `error` |
| P7 | Tolerance profile: all 14 fields required in a delivered profile; optional `id` | `tolerance-profile` |
| P8 | Patch entity `type` = v0.2 B.2 entity names | `model-patch` |
| P9 | Payload field names of all 37 kinds (each file's `$comment` lists the sourced and the proposed names); the strategy of `FIT_TO_SHARED_EDGE` written as `movableFaceIds` | `command-payload-*` |
| P10 | Shapes of `import-report`, `command-status`, `plane-fit-result`, `heatmap-result` (per-face values, client colours them), `export-report` (`reasonKey`), `journal-entry.validationSummary` = full report, `journal-entry.warnings` | result schemas |
| P11 | Q-20 refusal map below (D-76) | op rows 3D-14, 3D-15, 3D-17 |
| P12 | Q-21 severities below (D-77) | `validation-report` (enforced) |

### Q-20: refusal codes the sources leave open (accepted, D-76)

Meanings follow v0.2 D.4 (`INVALID_GEOMETRY` = self-intersection, degenerate, impossible; `INVALID_TOPOLOGY` = ring /
manifold; `CONSTRAINT_CONFLICT` = hard constraints cannot hold).

| Refusal | Proposed code | Carries |
|---|---|---|
| `FIT_TO_SHARED_EDGE`: displacement over `maxDisplacementM` | `CONSTRAINT_CONFLICT` | offending vertex ids |
| `FIT_TO_SHARED_EDGE`: no unique pairing | `INVALID_TOPOLOGY` | edge ids |
| `FIT_TO_SHARED_EDGE`: default maximum displacement | none: the payload requires it (schema) | - |
| `HEAL_HOLE`: no closing without self-intersection (GT-11) | `INVALID_GEOMETRY` | `details.admissibleModes` |
| `HEAL_HOLE`: more than one compatible closing | `UNDERCONSTRAINED_GEOMETRY` | `details.admissibleModes` |
| `SPLIT_FACE`: line outside the face; tangent with zero area | `INVALID_GEOMETRY` | face id |
| `SPLIT_FACE`: split through a hole, ambiguous components | `INVALID_TOPOLOGY` | face id |
| `SPLIT_FACE`: incompatible fixed support plane | `CONSTRAINT_CONFLICT` | constraint ids |
| R-01: self-intersecting footprint; vertical plane; `roofZ < baseZ`; zero area | `INVALID_GEOMETRY` | footprint id |

### Q-21: severity by state of the five open codes (accepted, D-77)

| Code | `DRAFT_SOLID` | `VALID_SOLID` | Reason |
|---|---|---|---|
| `SOLID_OVERLAP` | WARNING | ERROR | a solid-validity defect, like `SELF_INTERSECTION` |
| `UNDERCONSTRAINED_GEOMETRY` | ERROR | ERROR | a constraint-system defect, like `CONSTRAINT_CONFLICT` |
| `INVALID_MEASUREMENT` | WARNING | WARNING | measurements are soft inputs, not geometry; must not block a valid solid |
| `EXPORT_SCHEMA_ERROR` | WARNING | ERROR | export exists only for valid solids (D-05) |
| `PRECISION_LOSS` | WARNING | WARNING | rounding report (v0.3 §10 `exportRoundDecimals`), not a defect |

## Tests

`contracts/model3d/test/schemas.test.mjs` (Vitest project `unit`, part of `npm test`): `$schema` and `$id` of every file;
Ajv 2020 strict compile of all; spec §2 list covered; the 37 kinds of spec §2.2 equal `OperationKind` and each has a
payload file; `UNDO` / `REDO` empty; tolerance defaults equal the spec §2.3 table; error codes and statuses equal the
spec §2.4 table; lineage members; every example judged as labelled. The spec tables are parsed, not copied.

## Open questions (provisional ids, D-38)

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
| Q-34 | How the `REMOVE_DETAILS` candidate list reaches the client | closed by D-325: optional `command-result.candidates` on a discovery PREVIEW (3D-105) |
| Q-35 | `TRIM_FACE` side to keep (`keepPoint` proposed) | closed by D-323 (`keepPoint`; `cuttingFaceId` replaces `trimLine`, D-322) |
| Q-36 | `HEAL_HOLE` "allowed corrections" (read as `maxDisplacementM`) | 3D-17 |
| Q-37 | Form of the new extent of `RESIZE_ROOF` (`roofOutline` proposed) | 3D-19 |
| Q-38 | Dimensions of `ADD_DORMER` (FLAT / GABLE) and `ADD_CHIMNEY` beyond outline / box | closed by D-256..D-258 (3D-20) |
| Q-39 | Whether the command carries `leaseRef` / `leaseEpoch` (spec §11 rule 11) or the service takes them from the session | 3D-23 |

Also open and not decided here: Q-17 (solver objective), Q-18 (op details incl. the `FIT_PLANE` selection), Q-24 (numbers
without a source), Q-03 (CP extension, 3D-43).
