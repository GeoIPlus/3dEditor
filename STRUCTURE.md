# STRUCTURE - GeoIPlus/3dEditor

Status: **target layout, proposed**. Folders marked *(3D-NN)* do not exist yet; the row named creates them. The package
boundary is fixed by ADR 3D-02 (decision D-17 sets the hybrid model, the ADR sets the details).

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
  templates/                         checkpoint, ADR, module card
  source/                            read-only inputs: HANDOVER, fullSpecs v0.1-v0.3, audit PDF
package.json, package-lock.json      npm workspace root, scripts of AGENTS.md §5 (3D-05)
tsconfig.json, vitest.config.mjs     `tsc --checkJs` (no DOM lib); Vitest projects `unit` and `golden` (3D-05)
.github/workflows/check.yml          CI: `npm ci && npm run check` (3D-05)
packages/geo-model3d/  (3D-05, 3D-09) server-only kernel, protection P4, DOM-free Node ESM; skeleton + canary (3D-05)
  src/canary.js                      P4 canary module, imported by every `exports` entry (3D-ADR-0001)
  src/brep/ import/ ops/ solve/ validate/ export/ cloud/   (proposed split, HANDOVER §7; layout decided by 3D-02)
services/kernel/       (3D-23)        command API host for the kernel; ports: command, storage, point, validation
contracts/model3d/     (3D-06)        authoritative `model3d` schemas; consumers pin a commit (D-37, 3D-ADR-0001)
fixtures/              (3D-07)        small synthetic golden fixtures and their generator
tools/check-docs.mjs                 document consistency check, Node built-ins (3D-30)
tools/check-docs-run.mjs             `npm run check:docs`: strict on every branch except `wp/*` (D-38) (3D-05)
tools/check-arch/                    `npm run check:arch`: rules in config.mjs, negative-control browser build (3D-05)
tools/backlog-sync/                  `npm run backlog:sync`: sources.json, pins/<repo>/ snapshots + provenance (3D-05)
tools/hooks/                         Claude Code hook scripts (3D-30)
```

## 2. Dependency rules (enforced by `npm run check:arch` since 3D-05; paths in `tools/check-arch/config.mjs`)

1. `geo-model3d` imports no DOM, no three.js, nothing from `shared_compnents` client packages. Only
   `packages/geo-model3d/`, `services/` and `tools/` may import it (3D-05 [A], refined by 3D-02).
2. Nothing in `shared_compnents` or geoviewer client code may depend on `geo-model3d` (P4, D-06). Proven on build
   output: the kernel carries a canary marker and CI fails if any client bundle contains it (D-24, D-37,
   [3D-ADR-0001](docs/decisions/adr/3D-ADR-0001-contracts-location-and-p4-canary.md)).
3. Public API of a package only through its `index.js`.
4. A new dependency between packages needs an ADR.
