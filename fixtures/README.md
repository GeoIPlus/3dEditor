# fixtures - golden test fixtures GT-I1..GT-I4, GT-01..GT-29

- Status: implemented (3D-07), accepted (D-103). Inputs proposed where v0.3 §12 is silent are marked `[P]` and wait for the
  owner's review (D-99).
- Protection: none (synthetic test data; no kernel code).
- WP: 3D-07   Spec: [docs/specs/3dqm-spec.md §13](../docs/specs/3dqm-spec.md#13-golden-tests---module-and-wp-row)
- Source: v0.3 §12 (tests, expected values, reference checks), v0.2 F.3 (fixture structure), decisions D-99..D-102.
  GT-26 and later: the owner-accepted spec §13 row (from spec §10.6, D-331, D-332; 3D-105), not in v0.3 §12.
  Generator: [tools/golden-fixtures/](../tools/golden-fixtures/) (new code, no third-party code).

## Purpose

One directory per golden test of v0.3 §12. Each holds the input, the steps a test runner performs, and the expected
values **copied verbatim** from v0.3 §12. The kernel and service rows of spec §13 write the runners (`*.golden.test.js`,
`npm run golden`); this row writes only the data and proves it consistent. Expected values are never edited to fit code
(AGENTS.md §2.11; v0.2 F.4).

## Format (from v0.2 F.3)

`fixtures/GT-<id>/` contains only these files; every file is generated, UTF-8, `\n` line ends.

| File | Present in | Content |
|---|---|---|
| `input.cityjson.json` | GT-I1..GT-I4 | CityJSON 2.0 document, one `Building` with one LoD 2.2 `Solid`, integer vertices with `transform` (scale 0.001) |
| `input.model.json` | GT-01..GT-25 | canonical `BuildingModel`, valid against `contracts/model3d/building-model.schema.json` |
| `input.model.<suffix>.json` | GT-19 (`fixed`), GT-24 (one per building) | further models; a step names its model with `model` |
| `input.points.json` | GT-20, GT-21 | `{ frame: "LOCAL", points: [[x, y, z], ...] }` [P] (point source port is 3D-22's) |
| `truth.points.json` | GT-20, GT-21 | `{ outlierIndices }`: for fixture tests only, never sent to the kernel |
| `input.world.json` | GT-25 | `{ frame: "WORLD", crs, points }`: world coordinates of the model vertices |
| `input.context.json` | GT-22..GT-24 | `{ actors: [{ id, roles }], assignments: [{ id, actorId, buildingIds, leaseRef }], exportRequiresApproval }` [P] |
| `steps.json` | all | ordered steps, see below |
| `expected.json` | all | see below |
| `README.md` | all | the test in words, every `[P]` / `[A]` / `TBD` choice with its reason, the independent check |

Steps (`steps.json`, an array; a runner executes them in order on the model named by `model`, default `input.model.json`):

| `step` | Fields | Meaning |
|---|---|---|
| `IMPORT` | `document`, `cityObjectId`, `toleranceProfile` | kernel import API (spec §6) |
| `COMMAND` | `command` (`command.schema.json`), `model?`, `note?` | a COMMIT [A]: a runner that needs PREVIEW first sends the same command as PREVIEW and copies `previewId`; versions follow `expectedVersion` 1, 2, ... |
| `EXPORT` | `note` | kernel export API (spec §7) |
| `REQUEST` | `name`, `actorId`, `params`, `shape` | service request that is not a command (heatmap, status, final validation, batch export, model read); wire shape `TBD` until 3D-22 / 3D-23 / 3D-24 |
| `WORLD_LOCAL_ROUNDTRIP` | `points` | world -> local -> world with the model frame (spec §4) |

`expected.json`:

| Member | Content |
|---|---|
| `source` | `document`, `section`, `gate`, and the `input` and `expected` cells of the v0.3 §12 row, verbatim (Russian); for GT-26 and later `document` is the spec, `section` §13, no `gate`, the cells of the spec §13 row (3D-105) |
| `tolerance` | area +/- 0.01 m2, volume +/- 0.01 m3 (§12 preamble) unless the row states its own |
| `assert` | machine-readable values of that row; every number and every `CODE` in it appears in the verbatim cells |
| `decided` | values a later decision adds (e.g. D-76 refusal code for GT-11), each with its `D-NN` |
| `owner` | `module` and `row` from spec §13 |

Deviations from v0.2 F.3 [P]: `expected.metrics.json`, `expected.validation.json` and `expected.properties.json` are one
`expected.json` (one place for the verbatim text); `command.json` is `steps.json` (several tests are sequences).

## Rules and invariants

- Regenerate with `npm run fixtures` (`node tools/golden-fixtures/cli.mjs`; `--check` reports differences). Never edit
  a fixture by hand; change the generator. Output is byte-identical on every platform: the generator uses only
  arithmetic and `Math.sqrt` (no trigonometry, logarithm, clock or `Math.random`); noise is a seeded mulberry32 with
  Irwin-Hall normals.
- Frame: local, X east, Y north, Z up, metres; rings counter-clockwise seen from outside. Base footprint 10 x 8 at the
  origin, ridge along X at y = 4 (GT-I1). Ids are readable fixed strings (`f-roof-s`, `he-<face>-<i>`, `v-<key>`) [P],
  since the `EntityId` format is open (Q-26).
- Imported models (GT-01..GT-04, GT-06, GT-19, GT-24 b) keep explicit vertices with `sourceRef` (D-70); models that are
  operation results (the GT-03 gable for GT-07..GT-25) have derived vertices.
- Every fixture is checked by an independent computation in the tests (v0.2 F.3), not by kernel code.

## Proposed inputs (`[P]`, D-99..D-102) - for the owner's review

| Test | Proposal |
|---|---|
| all | ids; model `version` 1; CRS EPSG:25832, `verticalCrs` null; actor `usr-operator`; project `prj-golden`; profile id `tp-default` |
| GT-I1..I4 | CityJSON writer conventions: mm integers, translate (512000, 6170000, 0), one semantic surface per face |
| GT-I2 | north ridge edge at y = 4.03 (horizontal gap), hexagonal gable walls (D-101); `OPEN_BOUNDARY` count reading open (Q-41) |
| GT-I3 | each slope split along the diagonal from its first eave corner |
| GT-01..04 | start model = the imported GT-I1 gable (D-100); GT-04 `slopesDeg` = atan(3/4) in degrees |
| GT-05 | L footprint (0,0) (10,0) (10,4) (4,4) (4,8) (0,8), flat roof Z = 5 |
| GT-06 | `maxDisplacementM` 0.05, north slope movable |
| GT-08 | split line x = 5 on the south slope |
| GT-09 | target (0,4.5,8.3)-(10,4.5,8.3) |
| GT-10 | hard `FIXED_POINT` on the west ridge end, target (0,4,8.5) |
| GT-11 | the north slope is removed; heal copies the south plane |
| GT-13 | repeated command = GT-07; stale command = `TRANSLATE_BUILDING` (1,0,0) |
| GT-17 | chimney on the south slope at (5, 2, 6.5) |
| GT-18 | dormer outline x 4..6, y 1..2.5 in plan; `heightM` 1 (its meaning is Q-38) |
| GT-19 | pyramid 8 x 8, eave 5, rise 3 / run 4; east slope lifted 0.05 m at the apex (vertical); primary = south; "Fixed" = hard `ON_PLANE` on the three others |
| GT-20, GT-21 | 500 points (450 + 50 outliers 1.5..3 m off the plane), plan x 0..10, y 0..4, noise along Z, 0.1 mm, seed 20 (D-102); selection = LOCAL box around all points, whole metres outward (3D-22, D-132) |
| GT-22..24 | roles `3dqm.production` / `3dqm.qa`; one assignment per actor; GT-24 buildings: GT-03 gable, GT-I2 gap gable (draft), GT-04 hip |

## Open questions touched

Q-41 (GT-I2 open-edge count, 3D-10), Q-10 (val3dity, GT-I4), Q-18 (`FIT_PLANE` selection, GT-20: set by D-132), Q-26 (id format),
Q-32 (CityObject -> `buildingId`), Q-38 (dormer / chimney dimensions, GT-17, GT-18), Q-39 (lease fields, GT-22..24),
service request shapes of 3D-23 / 3D-24 (the heatmap request is `heatmap-request`, D-136). None is guessed: each appears as `TBD` where it matters.

## Tests

`tools/golden-fixtures/test/*.test.mjs` (Vitest project `unit`, part of `npm test`):
`fixtures.test.mjs` - 29 directories = spec §13; committed bytes = fresh generation; no stale file; no randomness or
transcendental functions in the generator; 28 models valid against `building-model`, 29 commands against `command`;
half-edge, plane and vertex-on-plane invariants of every model.
`expected.test.mjs` - every `expected.json` row text occurs verbatim in `docs/source/fullSpecsV0.3.md`; every number and
code of `assert` appears in it; the four reference checks of the §12 last paragraph (GT-04, GT-07, GT-14, GT-21).
`geometry.test.mjs` - independent area / volume / counts of the inputs and of the reference shapes behind the §12 numbers
(GT-01..04, 07, 14, 15, 16), GT-20 least-squares fit on the inliers, GT-21 mean normal distance in the heatmap buffer.
