# STRUCTURE - GeoIPlus/3dEditor

Status: **target layout, proposed**. Folders marked *(3D-NN)* do not exist yet; the row named creates them. The package
boundary is fixed by [3D-ADR-0002](docs/decisions/adr/3D-ADR-0002-kernel-package-and-remote-port.md) (decision D-17 sets the hybrid model, the ADR sets the details).

## 1. Layout

```
AGENTS.md, CLAUDE.md, STRUCTURE.md   agent manual, entry point, this file
.claude/skills/<name>/SKILL.md       procedures loaded on demand (task-intake, wp-session, merge-wp, ...)
.claude/settings.json                hooks (Stop: check-docs; PreToolUse: docs/source guard, base-push guard 3D-78) + read-only allow list (3D-30)
.agent/checkpoints/3D-<id>.md        one per WP: plan, state, results, handoff
docs/
  BACKLOG.md                         the 3DQM progress board (incl. mirror rows of other repos)
  CHORES.md                          fast-lane log of trivial document fixes (D-26)
  decisions/DECISIONS.md             D-NN decisions, Q-NN open questions (append-only)
  decisions/adr/3D-ADR-NNNN-*.md     architecture decision records
  specs/3dqm-spec.md                 maintained spec (3D-04)
  verification/                      verification notes against code (3D-01)
  agent-evals/<task>/                agent eval tasks: task.json, prompt.md, setup.mjs, rubric.mjs; results/<label>/ (3D-28)
  templates/                         checkpoint, ADR, module card
  source/                            read-only inputs: HANDOVER, fullSpecs v0.1-v0.3, audit PDF
package.json, package-lock.json      npm workspace root, scripts of AGENTS.md §5 (3D-05)
tsconfig.json, vitest.config.mjs     `tsc --checkJs` (no DOM lib); Vitest projects `unit` and `golden` (3D-05)
.github/workflows/check.yml          CI: `npm ci && npm run check` (3D-05)
packages/geo-model3d/  (3D-05, 3D-09) pure kernel, protection P4, DOM-free Node ESM, no I/O; one `exports` entry
  src/index.js canary.js                                 public API (commands, import, export, validate); P4 marker
  src/brep/                                             half-edge, planes, derived vertices, frame, transactions (3D-09)
  src/cloud/                                             plane fit (RANSAC + SVD), deviation heatmap (3D-22)
  src/validate/                                         progressive validation, severity by state, val3dity port (3D-12)
  src/metrics/                                          F-53 geometric metrics, computeMetrics (3D-116)
  src/import/                                            CityJSON -> canonical model, RTG roles, baseline, report (3D-10); state + issues from validate via index.js (3D-75)
  src/export/                                            canonical model -> CityJSON, opaque data from the input (3D-11)
  src/solve/                                            constraint solver, conflict sets, free degrees (3D-13, 3D-ADR-0005)
  src/ops/                                               command pipeline (executeCommand), REPLACE_ROOF, REBUILD_ENVELOPE (3D-14); MOVE_VERTEX, MOVE_EDGE, OFFSET_FACE, SPLIT_FACE, INSERT_ROOF_BREAK, MERGE_FACES + face cut and constraint inheritance (3D-15); repair REMOVE_FACE, HEAL_HOLE, FIT_TO_SHARED_EDGE, ALIGN_JUNCTION (3D-17); ALIGN_RIDGE, ALIGN_EAVE, MATCH_ELEVATIONS (3D-16); ADD_CHIMNEY, ADD_DORMER, REMOVE_INSTALLATION + installation shell (3D-20); UNDO, REDO, RESTORE_BASELINE (history.js, 3D-18); FIT_PLANE (3D-71); TRANSLATE_BUILDING, ROTATE_BUILDING, SET_HEIGHT, SET_OVERHANG + overhang topology (3D-19); RESIZE_ROOF + lower envelope, ALIGN_WALL (3D-114); overhang guard of the pipeline (3D-120); one module per OperationKind (3D-15..3D-21); REGULARIZE_FOOTPRINT (3D-126)
  test/brep/ test/cloud/ test/validate/ test/import/ test/solve/ test/export/ test/ops/ test/metrics/ test/golden/   unit tests; golden tests `*.golden.test.js` (GT-25: 3D-09; GT-20, GT-21: 3D-22; GT-I1..GT-I3: 3D-10; GT-I4: 3D-11; GT-01..GT-05: 3D-14; GT-08, GT-10: 3D-15; GT-07, GT-09: 3D-16; GT-17, GT-18: 3D-20; GT-14..GT-16: 3D-19 (GT-14 VALID_SOLID since 3D-117); GT-12: 3D-18; GT-20 command step: 3D-71; world-local: 3D-81)
  src/crs/                                               CRS table (generated), metric/ENU frame, write-back; `proj4` (3D-32, 3D-ADR-0007); cloud CRS mapping, box (3D-69)
services/kernel/       (3D-22, 3D-23, 3D-109, 3D-110, 3D-128) host: createKernelHandler(ports) (src/handler.js) + own HTTPS server for the image (src/server.js, D-33); ports `history`, `auth`, `leases`, points, `datasets` (3D-128); command API (PREVIEW store, limits, contract validation)
  src/ports/ adapters/ operaflow/                        storage, points, validator, auth; interim adapters (D-35)
  src/ports/points.js adapters/las-*.js cloud-points.js  points port, LAS-whole adapter, selection -> local points (3D-22), command points (3D-71; card README.md)
  src/adapters/copc-*.js test/data/*.copc.laz            COPC-by-box adapter, `laz-perf` decoder (3D-70, 3D-ADR-0009); committed COPC test files (D-140)
  src/ports/history.js history.js adapters/*-store.js    `history` port over an append-only object store (memory, file; S3 3D-111), D-318 snapshot layout (3D-23)
  src/commit.js errors.js                                COMMIT path over executeCommand (idempotency, expectedVersion 409, journal append), command status (3D-23)
  test/history-contract.js test/gt-13.golden.test.js     port contract suite run on every store adapter; golden GT-13 (3D-23)
  src/ports/datasets.js datasets.js results.js          `datasets` port over an append-only byte store (adapters/*-datasets-store.js: memory, file), save to `progress.save` / deliver results (3D-128)
  test/datasets-contract.js                              `datasets` port contract suite, run by every adapter (CS adapter 3D-63 too) (3D-128)
contracts/model3d/     (3D-06)        authoritative `model3d` schemas; consumers pin a commit (D-37, 3D-ADR-0001)
  <name>.schema.json examples/<name>.json test/           54 schemas ($id urn:geoiplus:schema:model3d-<name>:v1), valid/invalid examples, Ajv test (3D-06; card README.md)
fixtures/GT-<id>/                    golden fixtures of v0.3 §12, generated; format in fixtures/README.md (3D-07)
tools/golden-fixtures/               fixture generator (`npm run fixtures`) and its tests (3D-07)
tools/check-docs.mjs                 document consistency check, Node built-ins (3D-30)
tools/check-docs-run.mjs             `npm run check:docs`: strict on every branch except `wp/*` (D-38) (3D-05); new final ids vs. base, `--fix` (3D-78)
tools/check-docs-{md,ids,overview}.mjs  check-docs parts: markdown helpers, id rules (D-179), generated overview (D-180) (3D-78)
tools/check-docs-decisions.mjs       check-docs DECISIONS.md tables: id tables, status-row shape and ids, rows outside the tables (D-167) (3D-76)
tools/base-branch.mjs                base branch name and coordinator marker (D-178) (3D-78)
tools/budget{,-parse,-calc}.mjs      backlog forecast: ledger + BACKLOG -> "Budget and forecast" block, `--fix` (D-236) (3D-86)
tools/check-arch/                    `npm run check:arch`: rules in config.mjs, negative-control browser build (3D-05); kernel DAG and no-I/O rules in kernel-rules.mjs (3D-09); append-only store adapters in store-rules.mjs (3D-23)
tools/backlog-sync/                  `npm run backlog:sync`: sources.json (row id rule per source), pins/<repo>/ snapshots + provenance (3D-05; first pin pins/shared, 3D-73)
tools/bench/                         `npm run bench`: server PREVIEW latency bench through the command API `createCommandApi` (3D-121, D-357), scenes, rig fingerprint, scene and path tests (3D-08, 3D-ADR-0006); `solve-cost.mjs` (3D-13); `handler.mjs` = `npm run bench:handler`, the same scenes through `createKernelHandler` (3D-110, D-405)
tools/hooks/                         Claude Code hook scripts (3D-30)
tools/crs-table/                     generator of `geo-model3d/src/crs/epsg-table.json` from PROJ proj.db (3D-32) and PROJ proj-strings (3D-69)
tools/copc-fixture/                  generator of `services/kernel/test/data/*.copc.laz` (Python `copclib`, dev-time only, not run by `npm run check`) (3D-70)
tools/agent-evals/                   agent eval runner: headless sessions in throwaway clones, rubric grading (3D-28; costs money, not in `npm run check`)
```

## 2. Dependency rules (enforced by `npm run check:arch` since 3D-05; paths in `tools/check-arch/config.mjs`)

1. `geo-model3d` imports no DOM, no three.js, nothing from `shared_compnents` client packages. Only
   `packages/geo-model3d/`, `services/kernel/` and `tools/bench/` may import it (3D-09, D-117; 3D-ADR-0002).
2. Nothing in `shared_compnents` or geoviewer client code may depend on `geo-model3d` (P4, D-06). Proven on build
   output: the kernel carries a canary marker and CI fails if any client bundle contains it (D-24, D-37,
   [3D-ADR-0001](docs/decisions/adr/3D-ADR-0001-contracts-location-and-p4-canary.md)).
3. Public API of a package only through its `index.js`.
3a. Inside `geo-model3d` (3D-ADR-0002 C1): `brep` <- `solve`, `import`, `export`, `validate`, `cloud`; `ops` <- `brep`,
    `solve`, `validate`; `metrics` <- `brep`, `validate` (3D-116); `index.js` <- all; `crs` (3D-32) is a leaf of `brep`, `import`, `export`. No I/O, clock or
    randomness in kernel source. Enforced since 3D-09 (`kernelModuleDag`, `kernelNoIo`).
4. A new dependency between packages needs an ADR.
5. Every runtime dependency (transitive, devDependencies excluded) of `geo-model3d` and of each `services/<name>` has a
   licence from [3D-ADR-0004](docs/decisions/adr/3D-ADR-0004-kernel-language-boolean-licences.md) decision 3 (D-109):
   MIT, ISC, BSD-2-Clause, BSD-3-Clause, Apache-2.0, Unlicense, BSL-1.0. Read offline from `package-lock.json`;
   a missing licence fails. Enforced since 3D-67 (`licenceAllowList`, with a built-in planted GPL control).
