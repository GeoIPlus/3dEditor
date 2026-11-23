# STRUCTURE - GeoIPlus/3dEditor

Status: **target layout, proposed**. Folders marked *(3D-NN)* do not exist yet; the row named creates them. The package
boundary is fixed by [3D-ADR-0002](docs/decisions/adr/3D-ADR-0002-kernel-package-and-remote-port.md) (decision D-17 sets the hybrid model, the ADR sets the details).

## 1. Layout

```
AGENTS.md, CLAUDE.md, STRUCTURE.md   agent manual, entry point, this file
.claude/skills/<name>/SKILL.md       procedures loaded on demand (task-intake, wp-session, merge-wp, ...)
.claude/settings.json                hooks (Stop: check-docs; PreToolUse: docs/source guard) + read-only allow list (3D-30)
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
  src/solve/ import/ export/ validate/ cloud/ ops/      modules (3D-ADR-0002 C1; later rows)
  test/brep/ test/golden/                               unit tests; golden tests `*.golden.test.js` (GT-25: 3D-09)
  spike/move-edge/                                      3D-08 latency spike, throwaway, not exported (card README.md)
  src/crs/                                               CRS table (generated), metric/ENU frame, write-back; `proj4` (3D-32, 3D-ADR-0007)
services/kernel/       (3D-23)        host: createKernelHandler(ports) + own server for the image (D-33); ports `history`, `datasets` per 3D-ADR-0003
  src/ports/ adapters/ operaflow/                        storage, points, validator, auth; interim adapters (D-35)
contracts/model3d/     (3D-06)        authoritative `model3d` schemas; consumers pin a commit (D-37, 3D-ADR-0001)
  <name>.schema.json examples/<name>.json test/           53 schemas ($id urn:geoiplus:schema:model3d-<name>:v1), valid/invalid examples, Ajv test (3D-06; card README.md)
fixtures/GT-<id>/                    golden fixtures of v0.3 §12, generated; format in fixtures/README.md (3D-07)
tools/golden-fixtures/               fixture generator (`npm run fixtures`) and its tests (3D-07)
tools/check-docs.mjs                 document consistency check, Node built-ins (3D-30)
tools/check-docs-run.mjs             `npm run check:docs`: strict on every branch except `wp/*` (D-38) (3D-05)
tools/check-arch/                    `npm run check:arch`: rules in config.mjs, negative-control browser build (3D-05); kernel DAG and no-I/O rules in kernel-rules.mjs (3D-09)
tools/backlog-sync/                  `npm run backlog:sync`: sources.json, pins/<repo>/ snapshots + provenance (3D-05)
tools/bench/                         `npm run bench`: server PREVIEW latency bench, scenes, rig fingerprint, spike tests (3D-08, 3D-ADR-0006)
tools/hooks/                         Claude Code hook scripts (3D-30)
tools/crs-table/                     generator of `geo-model3d/src/crs/epsg-table.json` from PROJ proj.db (3D-32)
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
    `solve`, `validate`; `index.js` <- all; `crs` (3D-32) is a leaf of `brep`, `import`, `export`. No I/O, clock or
    randomness in kernel source. Enforced since 3D-09 (`kernelModuleDag`, `kernelNoIo`).
4. A new dependency between packages needs an ADR.
