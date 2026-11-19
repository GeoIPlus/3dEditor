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
  templates/                         checkpoint, ADR, module card
  source/                            read-only inputs: HANDOVER, fullSpecs v0.1-v0.3, audit PDF
packages/geo-model3d/  (3D-05, 3D-09) pure kernel, protection P4, DOM-free Node ESM, no I/O; one `exports` entry
  src/index.js canary.js                                 public API (commands, import, export, validate); P4 marker
  src/brep/ solve/ import/ export/ validate/ cloud/ ops/ modules (3D-ADR-0002 C1)
services/kernel/       (3D-23)        host: createKernelHandler(ports) + own server for the image (D-33)
  src/ports/ adapters/ operaflow/                        storage, points, validator, auth; interim adapters (D-35)
contracts/model3d/     (3D-06)        authoritative `model3d` schemas; consumers pin a commit (D-37, 3D-ADR-0001)
fixtures/              (3D-07)        small synthetic golden fixtures and their generator
tools/check-docs.mjs                 document consistency check, Node built-ins (3D-30; `npm run check:docs` after 3D-05)
tools/hooks/                         Claude Code hook scripts (3D-30)
```

## 2. Dependency rules (to be enforced by `check:arch`, 3D-05)

1. `geo-model3d` imports no DOM, no three.js, nothing from `shared_compnents` client packages.
2. Nothing in `shared_compnents` or geoviewer client code may depend on `geo-model3d` (P4, D-06). Proven on build
   output: the kernel carries a canary marker and CI fails if any client bundle contains it (D-24, D-37,
   [3D-ADR-0001](docs/decisions/adr/3D-ADR-0001-contracts-location-and-p4-canary.md)).
3. Public API of a package only through its `index.js`.
3a. Inside `geo-model3d` (3D-ADR-0002 C1): `brep` <- `solve`, `import`, `export`, `validate`, `cloud`; `ops` <- `brep`,
    `solve`, `validate`; `index.js` <- all. No I/O, clock or randomness in the kernel; only `services/kernel` imports it.
4. A new dependency between packages needs an ADR.
