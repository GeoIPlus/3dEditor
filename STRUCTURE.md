# STRUCTURE - GeoIPlus/3dEditor

Status: **target layout, proposed**. Folders marked *(3D-NN)* do not exist yet; the row named creates them. The package
boundary is fixed by ADR 3D-02 (decision D-17 sets the hybrid model, the ADR sets the details).

## 1. Layout

```
AGENTS.md, CLAUDE.md, STRUCTURE.md   agent manual, entry point, this file
.claude/skills/<name>/SKILL.md       procedures loaded on demand (task-intake, wp-session, ...)
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
packages/geo-model3d/  (3D-05, 3D-09) server-only kernel, protection P4, DOM-free Node ESM
  src/brep/ import/ ops/ solve/ validate/ export/ cloud/   (proposed split, HANDOVER §7)
services/kernel/       (3D-23)        command API host for the kernel; ports: command, storage, point, validation
contracts/model3d/     (3D-06)        only if ADR 3D-02 places them here (Q-08)
fixtures/              (3D-07)        small synthetic golden fixtures and their generator
```

## 2. Dependency rules (to be enforced by `check:arch`, 3D-05)

1. `geo-model3d` imports no DOM, no three.js, nothing from `shared_compnents` client packages.
2. Nothing in `shared_compnents` or geoviewer client code may depend on `geo-model3d` (P4, D-06). Proven on build
   output: the kernel carries a canary marker and CI fails if any client bundle contains it (D-24, ADR 3D-27).
3. Public API of a package only through its `index.js`.
4. A new dependency between packages needs an ADR.
