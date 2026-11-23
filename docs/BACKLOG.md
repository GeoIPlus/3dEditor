# BACKLOG - 3DQM work packages

New rows enter only through the [`task-intake`](../.claude/skills/task-intake/SKILL.md) skill. Pick the lowest-numbered
`ready` row whose dependencies are `done` ([AGENTS.md §4](../AGENTS.md#4-workflow-for-one-wp)). One WP = one branch =
one session = one PR.

Statuses: `proposed` (intake done, waiting for the owner), `ready` (set by the owner only), `blocked` (reason),
`in-progress` (branch), `review` (PR or local description), `done`, `superseded` (replacing id), `dropped` (reason).
Size: S (< 1 day of agent work), M (up to ~3 days), L (larger; split when it has more than one acceptance group).
Repo: `here` = GeoIPlus/3dEditor; `shared` = GeoIPlus/shared_compnents; `geoviewer`. For `shared`/`geoviewer` rows
this is a mirror (D-23): the row in that repository is authoritative and its id is given in brackets once it exists.
Gate: the v0.3 §13 gate the row serves (G0..G5); gates are traceability only, the process is this backlog.

## Progress overview

Updated: 2026-11-23 (3D-00 accepted D-48; 3D-02, 3D-05, 3D-31 ready D-49, D-50; 3D-02 accepted D-56, merged; 3D-47, 3D-48, 3D-51 added by 3D-02; 3D-05 accepted D-59, merged; 3D-28 ready D-60; 3D-47, 3D-48, 3D-51 ready D-61, 3D-47 started; 3D-28 accepted D-65, merged; 3D-04 ready D-66; 3D-06 ready D-67; 3D-04 accepted D-71, merged; 3D-31 accepted D-73, merged; 3D-03 ready D-74; 3D-06 accepted D-78, merged; 3D-07 ready D-79; 3D-64 added by intake; 3D-64 ready D-81; 3D-03 accepted D-87, merged; Q-11 closed D-88..D-94, intake 3D-32, 3D-33; 3D-32 ready D-95; 3D-64 accepted D-98, merged; 3D-65 added by 3D-64 (D-97); 3D-07 accepted D-103, merged; 3D-08 ready D-104; 3D-65 ready D-105; 3D-65 review D-106; 3D-65 accepted D-107, merged; 3D-46 ready D-108; 3D-08 accepted D-113, merged; 3D-66..3D-68 added by 3D-08 (D-112); 3D-09 ready D-115; 3D-09 accepted D-120, merged; 3D-32 accepted D-127, merged; 3D-10, 3D-12 ready D-128; 3D-13, 3D-22, 3D-66, 3D-67 ready D-129).

| Progress | Rows |
|---|---:|
| Done | 18 / 55 |
| Review | 0 |
| In progress | 1 |
| Ready | 9 |
| Proposed (waiting for the owner to set `ready`) | 26 |
| Blocked (external access or data) | 1 |

**Implementation progress: 0 %** of code; 18/55 rows done. Planning done: agent manual and backlog (3D-00, D-48), verification
notes 3D-01 and 3D-29 ([3D-01](verification/3D-01.md), [3D-29](verification/3D-29.md)), agent tooling 3D-30 (D-47), ADR kernel package and remote port 3D-02 (D-56), repository bootstrap 3D-05 (D-59), agent evals 3D-28 (D-65, baseline 16/19 tasks hold, D-64), 3DQM spec 3D-04 ([docs/specs/3dqm-spec.md](specs/3dqm-spec.md), D-71), code-graph spike 3D-31 (D-73, result: defer), contract schemas 3D-06 ([contracts/model3d](../contracts/model3d/README.md), D-78), ADR storage 3D-03 ([3D-ADR-0003](decisions/adr/3D-ADR-0003-storage-of-versions-journal-results.md), D-87), spec update 3D-64 (D-98), latency spike and kernel ADRs 3D-08 ([3D-08 note](verification/3D-08.md): PREVIEW p95 5.4 ms / 150 ms; JS on Node, D-109..D-111, D-113).
**Running:** SC 3D view port + host 3D-47 (D-61), CityJSON import 3D-10 and validation 3D-12 (D-128); solver 3D-13, point cloud 3D-22, spec/AGENTS ADR refs 3D-66, licence check 3D-67 (D-129).

```mermaid
flowchart TB
  subgraph done["DONE"]
    D32["3D-32 CRS support (geographic)"]
    D09["3D-09 B-Rep core"]
    D08["3D-08 Latency spike + kernel ADRs"]
    D07["3D-07 Golden fixtures"]
    D31["3D-31 Spike: code graph / read cache"]
    D04["3D-04 3DQM spec"]
    D28["3D-28 Agent evals"]
    D02["3D-02 ADR kernel package and boundary"]
    D01["3D-01 Verification note"]
    D29["3D-29 Verify crowdsource CP/DP"]
    D27["3D-27 Early ADR: contracts location + P4 canary"]
    D30["3D-30 Agent tooling"]
    D00["3D-00 Agent manual, intake, backlog"]
    D05["3D-05 Repository bootstrap"]
    D06["3D-06 Contract schemas"]
    D03["3D-03 ADR storage (Operaflow)"]
    D64["3D-64 Spec: apply D-76, D-77"]
    D65["3D-65 Schema text: D-76 in FIT_TO_SHARED_EDGE"]
  end
  subgraph review["REVIEW"]
  end
  subgraph ready["READY"]
    D67["3D-67 Licence allow-list check"]
    D66["3D-66 Apply 3D-08 ADRs to spec, AGENTS"]
    D22["3D-22 Point cloud functions"]
    D13["3D-13 Constraint solver"]
    D12["3D-12 Validation"]
    D10["3D-10 CityJSON import"]
    D46["3D-46 SC: P4 canary scan"]
    D47["3D-47 SC: 3D view port + host"]
    D48["3D-48 SC: apps/3dqm host"]
    D51["3D-51 geoviewer scene3d adapter"]
  end
  subgraph g0["G0 - plan, contracts, spike (PROPOSED)"]
  end
  subgraph g1["G1 - kernel core, import, export (PROPOSED)"]
    D11["3D-11 CityJSON export"]
  end
  subgraph g2g4["G2..G4 - operations and cloud (PROPOSED)"]
    D14["3D-14 Replace roof, rebuild envelope"]
    D15["3D-15 Core edits"]
    D16["3D-16 Ridge, eave, elevations"]
    D17["3D-17 Repair ops"]
    D18["3D-18 History"]
    D19["3D-19 Envelope ops"]
    D20["3D-20 Installations"]
    D21["3D-21 Semantics, constraints cmds"]
    D33["3D-33 Inter-building validation (P1)"]
    D69["3D-69 Point cloud CRS vs. building CRS"]
  end
  subgraph g5["G5 - service, QC, E2E (PROPOSED)"]
    D23["3D-23 Kernel service"]
    D68["3D-68 Latency bench: COMMIT, import, concurrency"]
    D24["3D-24 QC and export rules"]
    D25["3D-25 E2E on mock"]
  end
  subgraph client["shared / geoviewer / crowdsource mirrors (PROPOSED)"]
    D40["3D-40 geo-render model3d"]
    D41["3D-41 Remote kernel port"]
    D42["3D-42 3DQM tools"]
    D43["3D-43 plans/3dqm"]
    D44["3D-44 3DQM UI panels"]
    D45["3D-45 SC: pinned model3d schemas"]
    D50["3D-50 geoviewer host adapter"]
    D60["3D-60 crowdsource 3D project + CityJSON"]
    D61["3D-61 crowdsource COPC stream"]
    D62["3D-62 crowdsource server grant"]
    D63["3D-63 Swap to crowdsource adapters"]
  end
  subgraph blocked["BLOCKED"]
    D26["3D-26 Real-data import - samples Q-07"]
  end
  D00 --> D01
  D01 --> D29
  D29 --> D03
  D03 --> D60
  D29 --> D61
  D29 --> D62
  D22 --> D63
  D23 --> D63
  D60 --> D63
  D61 --> D63
  D62 --> D63
  D01 --> D27
  D27 --> D02
  D27 --> D05
  D27 --> D06
  D05 --> D28
  D30 --> D31
  D00 --> D30
  D30 --> D05
  D01 --> D02
  D01 --> D03
  D01 --> D04
  D02 --> D04
  D00 --> D05
  D02 --> D06
  D04 --> D06
  D06 --> D07
  D04 --> D64
  D06 --> D64
  D06 --> D65
  D08 --> D66
  D05 --> D67
  D08 --> D67
  D08 --> D68
  D10 --> D68
  D15 --> D68
  D23 --> D68
  D22 --> D69
  D32 --> D69
  D05 --> D08
  D06 --> D08
  D07 --> D08
  D08 --> D09
  D09 --> D10
  D32 --> D10
  D02 --> D32
  D06 --> D32
  D64 --> D32
  D12 --> D33
  D09 --> D12
  D10 --> D11
  D12 --> D11
  D09 --> D13
  D12 --> D14
  D13 --> D14
  D13 --> D15
  D13 --> D16
  D12 --> D17
  D13 --> D17
  D09 --> D18
  D16 --> D18
  D14 --> D19
  D12 --> D20
  D13 --> D20
  D13 --> D21
  D09 --> D22
  D18 --> D23
  D06 --> D23
  D03 --> D23
  D12 --> D24
  D23 --> D24
  D24 --> D25
  D43 --> D25
  D50 --> D25
  D10 --> D26
  D11 --> D26
  D06 --> D40
  D02 --> D41
  D40 --> D42
  D41 --> D42
  D06 --> D43
  D41 --> D43
  D42 --> D44
  D06 --> D45
  D27 --> D45
  D27 --> D46
  D45 --> D40
  D45 --> D43
  D23 --> D50
  D43 --> D50
  D02 --> D47
  D47 --> D40
  D06 --> D41
  D45 --> D41
  D43 --> D48
  D47 --> D48
  D47 --> D51
  D50 --> D51
```

## Work-package status

| WP | Title | Repo | Modules | Depends on | Gate | Size | Status |
|---|---|---|---|---|---|---|---|
| 3D-00 | Agent operating manual, `task-intake` and `wp-session` skills, decisions log, this backlog | here | AGENTS.md, .claude/skills, docs | - | G0 | S | done (D-48) |
| 3D-01 | Verification note: HANDOVER §5-§7 and v0.3 §2 checked against code (shared_compnents = Tools Plane, geoviewer, Operaflow = CP + DP) | here | docs/verification | 00 | G0 | S | done (D-34; merged into base, no PR) |
| 3D-02 | ADR: `geo-model3d` package - internal layout, remote kernel port, relation to `geo-render`/`workspace` (contracts location and P4 check moved to 3D-27) | here | docs/decisions | 01, 27 | G0 | M | done (D-56; merged into base, no PR; [3D-ADR-0002](decisions/adr/3D-ADR-0002-kernel-package-and-remote-port.md), D-51..D-55) |
| 3D-03 | ADR: storage of building versions, edit journal and results | here | docs/decisions | 01, 29 | G0 | M | done (D-87; merged into base, no PR; [3D-ADR-0003](decisions/adr/3D-ADR-0003-storage-of-versions-journal-results.md) accepted D-85, D-82..D-84) |
| 3D-04 | Spec `docs/specs/3dqm-spec.md`: v0.3 in module form, C.8/C.11 in plane terms, golden tests mapped to modules | here | docs/specs | 01, 02 | G0 | L | done (D-71; merged into base, no PR) |
| 3D-05 | Repository bootstrap: npm workspace, Vitest, `tsc --checkJs`, `check:arch` (300 lines, P4 canary + negative control per 3D-ADR-0001), `check:docs`, `backlog:sync`, CI | here | root, tools | 00, 27 | G0 | M | done (D-59; merged into base, no PR) |
| 3D-06 | Contract schemas `model3d`: model, commands (all `OperationKind`), patch, lineage, validation report, error registry, tolerance profile | here (D-37) | contracts | 04, 27 | G0 | L | done (D-78; merged into base, no PR; schemas [contracts/model3d](../contracts/model3d/README.md), D-75..D-77) |
| 3D-07 | Golden fixtures: format and synthetic CityJSON/point sets for GT-I1..GT-25 | here | fixtures | 06 | G0 | M | done (D-103; merged into base, no PR; [fixtures](../fixtures/README.md)) |
| 3D-08 | Latency spike: prototype `MOVE_EDGE` on GT-03, p95; ADRs kernel language/Boolean (ADR-001), solver (ADR-S), bench rig (ADR-012) | here | geo-model3d (spike), docs | 05, 06, 07 | G0 | M | done (D-113; merged into base, no PR; [note](verification/3D-08.md): p95 5.4 ms / 150 ms; 3D-ADR-0004..0006 accepted D-109..D-111) |
| 3D-09 | Kernel core: half-edge B-Rep, primary planes, derived vertices, local frame, transactions, versions | here | geo-model3d/brep | 08 | G1 | L | done (D-120; merged into base, no PR) |
| 3D-10 | Import I-01: CityJSON -> canonical model + RTG + baseline | here | geo-model3d/import | 09, 32 | G1 | L | ready (D-128) |
| 3D-11 | Export: canonical model -> CityJSON, opaque data round-trip | here | geo-model3d/export | 10, 12 | G1 | M | proposed |
| 3D-12 | Validation: FAST_PREVIEW, COMMIT_VALIDATION, FINAL_VALIDATION (val3dity), severity by state | here | geo-model3d/validate | 09 | G1 | L | ready (D-128) |
| 3D-13 | Constraint solver and conflict diagnostics | here | geo-model3d/solve | 09 | G3 | L | ready (D-129) |
| 3D-14 | `REPLACE_ROOF` R-01..R-04, `REBUILD_ENVELOPE` | here | geo-model3d/ops | 12, 13 | G2 | L | proposed |
| 3D-15 | Core edits: `MOVE_VERTEX`, `MOVE_EDGE`, `OFFSET_FACE`, `SPLIT_FACE`, `INSERT_ROOF_BREAK`, `MERGE_FACES`, `REMOVE_DETAILS`, `STRAIGHTEN_FACE`, `TRIM_FACE`, `EXTEND_FACE` | here | geo-model3d/ops | 13 | G3 | L | proposed |
| 3D-16 | `ALIGN_RIDGE`, `ALIGN_EAVE`, `MATCH_ELEVATIONS` | here | geo-model3d/ops | 13 | G3 | M | proposed |
| 3D-17 | Repair: `REMOVE_FACE`, `HEAL_HOLE`, `FIT_TO_SHARED_EDGE`, `ALIGN_JUNCTION` | here | geo-model3d/ops | 12, 13 | G3/G4 | L | proposed |
| 3D-18 | History: `UNDO`, `REDO`, `RESTORE_BASELINE` (idempotent `commandId`, `expectedVersion` moved to 3D-23, D-68) | here | geo-model3d | 09, 16 | G3 | M | proposed |
| 3D-19 | Envelope: `RESIZE_ROOF`, `SET_OVERHANG`, `REGULARIZE_FOOTPRINT`, `ALIGN_WALL`, `SET_HEIGHT`, `TRANSLATE_BUILDING`, `ROTATE_BUILDING` | here | geo-model3d/ops | 14 | G4 | L | proposed |
| 3D-20 | Installations: `ADD_DORMER`, `ADD_CHIMNEY`, `REMOVE_INSTALLATION`; limited Boolean (v0.3 §14, K-12) | here | geo-model3d/ops | 12, 13 | G4 | L | proposed |
| 3D-21 | `SET_SEMANTICS`, `SET_CONSTRAINT`, `REMOVE_CONSTRAINT` | here | geo-model3d/ops | 13 | G3 | S | proposed |
| 3D-22 | Point cloud: point port (box query) with interim adapter reading COPC by box / LAS whole (D-35), `FIT_PLANE` (RANSAC + SVD), deviation heatmap | here | geo-model3d/cloud | 09 | G4 | M | ready (D-129) |
| 3D-23 | Kernel service: command API PREVIEW/COMMIT/`previewId`, idempotent `commandId` + `expectedVersion` (GT-13, D-68), rate limit, error registry, command status, storage port with interim file/S3 adapter (D-35) | here | service | 03, 06, 18 | G5 | L | proposed |
| 3D-24 | QC and export rules: state transitions, approver != author (enforced by 3DQM: the Operaflow format has no separation-of-duties rule), reset on edit, export gate, batch export report | here | geo-model3d, service | 12, 23 | G5 | M | proposed |
| 3D-25 | E2E on CP/DP mock: import -> edit -> validate -> approve -> export -> re-import | here | e2e | 24, 43, 50 | G5 | M | proposed |
| 3D-26 | Import acceptance on real roofer and TerraSolid output; tolerance profile calibration | here | geo-model3d/import, fixtures | 10, 11 | G1 | M | blocked (sample data path, Q-07) |
| 3D-27 | Early ADR: location of `model3d` contract schemas (Q-08) and P4 canary check of client bundles (Q-09) | here | docs/decisions | 01 | G0 | S | done (D-39; merged into base, no PR) |
| 3D-29 | Verify `GeoIPlus/crowdsource` as the CP/DP implementation: data serving, storage, versions, point-cloud forms, auth, deployment | here | docs/verification | 01 | G0 | S | done (D-36; merged into base, no PR) |
| 3D-30 | Agent tooling: `merge-wp` skill, `tools/check-docs.mjs` + Stop hook, `docs/source` edit guard, read-only permission allow list | here | .claude, tools | 00 | G0 | S | done (D-47; merged into base, no PR) |
| 3D-28 | Agent evals: 6-8 golden agent tasks + one per hard rule, rubric, runner, two runs each, baseline in DECISIONS | here | docs/agent-evals | 05 | G0 | M | done (D-65; merged into base, no PR) |
| 3D-31 | Spike: codebase graph / read-cache tool (MCP or skill) measured on cross-repo reading tasks, with vs. without | here | .claude, docs/agent-evals | 30 | G0 | M | done (D-73; merged into base, no PR; result: defer, [eval](agent-evals/3D-31-code-graph.md)) |
| 3D-60 | crowdsource: 3D project type and CityJSON building dataset kind (Operaflow-conformant) | crowdsource | backend, streaming | 03, 29 | G5+ | L | proposed (D-35; under crowdsource's own process) |
| 3D-61 | crowdsource: point clouds as COPC `stream` datasets (box reads by the client of the stream) | crowdsource | streaming | 29 | G5+ | M | proposed (D-35) |
| 3D-62 | crowdsource: client-credentials (server-to-server) grant for supporting-application services | crowdsource | backend, auth | 29 | G5+ | M | proposed (D-35) |
| 3D-63 | Swap 3DQM interim `datasets` adapters for crowdsource datasets; migrate stored input buildings (the `history` store stays own, D-82) | here | service, geo-model3d/cloud | 22, 23, 60, 61, 62 | G5+ | M | proposed (D-35) |
| 3D-64 | Spec update: apply D-76 (Q-20 refusal codes) and D-77 (Q-21 severities) to `docs/specs/3dqm-spec.md`; list contract questions Q-26..Q-39 | here | docs/specs | 04, 06 | G0 | S | done (D-98; merged into base, no PR) |
| 3D-32 | CRS support: server-only transform module, local metric frame (ENU) per building, ADR for the library; spec and schema update for geographic CRSs (D-92) | here | geo-model3d (frame), services/kernel, docs, contracts | 02, 06, 64 | G1 | M | done (D-127; merged into base, no PR; [3D-ADR-0007](decisions/adr/3D-ADR-0007-crs-transform.md); EPSG terms Q-43 open) |
| 3D-33 | Inter-building validation (shared walls, overlaps between buildings), P1 (D-89) | here | geo-model3d/validate | 12 | P1 | M | proposed |
| 3D-65 | Schema text: `FIT_TO_SHARED_EDGE` `maxDisplacementM` description cites D-76 instead of open Q-20 / "3D-06 proposes" | here | contracts | 06 | G0 | S | done (D-107; merged into base, no PR) |
| 3D-66 | Apply accepted 3D-08 ADRs to spec and AGENTS.md: spec §1.3, §5 r8, §10.4 r5, §11 r14; AGENTS.md §2 rule 8 cites 3D-ADR-0004 | here | docs | 08 | G0 | S | ready (D-129) |
| 3D-67 | Licence allow-list check in `check:arch`: kernel and service runtime dependencies permissive only (3D-ADR-0004 decision 3) | here | tools/check-arch | 05, 08 | G1 | S | in-progress (wp/3d-67-licence-check) |
| 3D-68 | Latency bench beyond PREVIEW: COMMIT of a simple operation, import up to 500 faces, PREVIEW under concurrent requests (v0.3 §11) | here | tools/bench | 08, 10, 15, 23 | G5 | M | proposed (D-112) |
| 3D-69 | Point cloud CRS vs. a geographic-CRS building: reproject points into the building metric frame on the server, or refuse a mismatch (D-126) | here | geo-model3d/cloud, services/kernel | 22, 32 | G4 | M | proposed |
| 3D-40 | `geo-render/model3d`: draw edited building from patches against the 3D view port, hide source layer, ghost, pick by entity id | shared | geo-render | 06, 45, 47; shared WP-19, WP-20 | G3 | L | proposed (Q-16 closed by D-54: 3D host split out to 3D-47; UI per brandbook, D-40) |
| 3D-41 | Remote kernel port: `model3d-kernel` registry service adapter, host-injected transport, Tools Plane placement value in plan v2 | shared | plans/registry, workspace, contracts | 02, 06, 45; shared WP-28 | G3 | M | proposed (Q-13 closed by D-52, D-53) |
| 3D-42 | 3DQM tools: E-04 state machine, selection, snapping incl. point cloud, numeric input, PREVIEW throttling | shared | workspace/tools | 40, 41; shared WP-24 | G3 | L | proposed (UI per brandbook, D-40) |
| 3D-43 | `plans/3dqm`: `production` and `qa` plans, 3DQM contract extension schema | shared | plans, contracts | 06, 41, 45; shared WP-21, WP-28 | G5 | M | proposed (Q-03 shape known, 3D-01 §6; extension URI content-named, no product) |
| 3D-44 | 3DQM UI panels: validation issues, constraint inspector, heatmap legend, QC approve/return | shared | workspace/ui | 42; shared WP-23, WP-25 | G4/G5 | M | proposed (UI per brandbook, D-40) |
| 3D-45 | Pinned `model3d` schemas in `shared_compnents`: `contracts/vendor/3deditor/` + `provenance.json` hash check; how client code loads them | shared | contracts | 06, 27 | G3 | S | proposed (D-37) |
| 3D-47 | `geo-render` 3D view port and perspective host (camera, controls, point drawing); SC ADR first | shared | geo-render | 02; shared WP-19 | G3 | L | ready (D-61; started in a fresh cloud session; UI per brandbook, D-40) |
| 3D-48 | `apps/3dqm`: independent 3DQM host that assembles the workplace from the CP document | shared | apps | 43, 47; shared WP-28 | G5 | M | ready (D-61; waits for 3D-43, 3D-47, SC WP-28; D-55; UI per brandbook, D-40) |
| 3D-46 | P4 canary scan of `shared_compnents` browser outputs + rule "no `geo-model3d` dependency" | shared | tools, CI | 27 | G0 | S | ready (D-37, D-108; starts in a fresh session on `GeoIPlus/shared_compnents`) |
| 3D-50 | geoviewer host adapter: add `@geoiplus/*` dependencies (none today), mount workplace, kernel route on server (mounts `createKernelHandler`, 3D-ADR-0002), file storage port for tests, P4 canary scan of the client build | geoviewer | host | 23, 43 | G5 | M | proposed (UI per brandbook, D-40) |
| 3D-51 | geoviewer `scene3d` adapter implementing the 3D view port (entity-id pick, model3d drawing in GV) | geoviewer | scene3d | 47, 50 | G5 | M | ready (D-61; waits for 3D-47, 3D-50; D-54; UI per brandbook, D-40) |

## Details

### 3D-00 Agent operating manual and backlog
- Source: owner message 2026-11-19. Goal: rules for agent sessions, documentation, handoffs and intake.
- Accept: AGENTS.md, CLAUDE.md, STRUCTURE.md, skills `task-intake` and `wp-session`, templates, DECISIONS.md with
  D-01..D-27 and Q-01..Q-13, this backlog; owner questions asked as dialog and recorded.

### 3D-01 Verification note
- Goal: each [V]/[A] item of HANDOVER §5-§7 and v0.3 §2 checked against code with file references; corrections listed.
- Accept: `docs/verification/3D-01.md`; every item marked confirmed / corrected / not checkable (why); Q-12, Q-13
  answered or narrowed; how geoviewer consumes `@geoiplus/*` recorded; Operaflow (CP, D-29): workplace contract
  shape, assignment/roles, data/storage and point-cloud access (narrows Q-02..Q-05); list of Operaflow conformance
  requirements for the kernel service (Q-15, D-31). Read-only in other repositories.

### 3D-02 ADR kernel package and boundary
- Accept: `3D-ADR-0002` answers Q-13 and HANDOVER §7 Q2 (remote port), the internal package layout and the relation
  to `geo-render`/`workspace`, with options and a recommendation; owner-approved (D-18). Builds on 3D-27.

### 3D-03 ADR storage
- Accept: `3D-ADR-0003` proposes one option for versions, journal, baseline and results after reading CP/DP code;
  retention >= 90 days (v0.3 §11) addressed; conforms to Operaflow (D-31, Q-15).
- 3D-01 input: Operaflow holds no storage. Dataset `version`, `PUT` + `If-Match` / OGC API Features saves and immutable
  deliveries are in the format; the journal, drafts and retention are 3DQM's own ([verification §9](verification/3D-01.md#9-operaflow-as-cp--dp-data-point-clouds-conformance-d-30-d-31-q-15)).
- Result: [3D-ADR-0003](decisions/adr/3D-ADR-0003-storage-of-versions-journal-results.md): append-only object store (S3 / file) with conditional writes; ports `history` (own for good, D-82)
  and `datasets` (swapped in 3D-63); one `progress.save` dataset per building (D-83, input to 3D-43, 3D-60); nothing
  deleted (D-84). Open for 3D-24: Q-40.

### 3D-04 3DQM spec
- Accept: one section per module (purpose, API, rules, `Accept:` lines); contracts as a list of schemas; C.8 and C.11
  restated in plane terms (D-08); each golden test of v0.3 §12 assigned to one module and one row; v0.3 process text
  (gates, agent template) dropped; admin functions removed (D-10). Owner reviews before 3D-06 starts.

### 3D-05 Repository bootstrap
- Accept: `npm ci && npm run check` pass on the empty skeleton; a planted client-side import of `geo-model3d`, a 301-line
  file, a DOM global in the kernel and the P4 canary planted in a test bundle each fail `check:arch` (tests for the
  checker). Per [3D-ADR-0001](decisions/adr/3D-ADR-0001-contracts-location-and-p4-canary.md) (D-37): the canary value
  is generated once; `check:arch` fails if an `exports` entry of `geo-model3d` does not import the canary module; the
  negative control (minified Vite browser build of each entry) finds the marker in every output, else CI fails. `check:docs` fails on a planted count mismatch, a graph node without a row, a duplicate D/Q id, a dead link
  and a row without `Accept:`. `backlog:sync` reads a pinned ref of the other BACKLOG (fixture in tests, no network)
  and CI fails on drift (D-25). `check:docs` also rejects provisional decision ids `D-3D<wp>-<n>` on the base (D-38). Commands of AGENTS.md §5 exist.

### 3D-06 Contract schemas
- Accept: JSON Schema 2020-12 for every `OperationKind` payload (v0.3 §9.1), result, patch, `topologyLineage`
  `{mapped, deleted, preserved}`, validation report, error registry (v0.3 §9.2), tolerance profile (D-13 values as
  defaults); valid and invalid examples per schema; Ajv 2020 compiles all. Owner-approved (D-18). Location
  `contracts/model3d/` here; every `$id` matches `urn:geoiplus:schema:model3d-<name>:v<n>` (D-37, 3D-ADR-0001). L: split by intake if
  the command schemas and the model schemas review separately.

### 3D-07 Golden fixtures
- Accept: fixture format recorded; inputs for GT-I1..GT-I4, GT-01..GT-25 generated by a script, byte-identical on
  regeneration; expected values copied from v0.3 §12 with the checks of its last paragraph reproduced in a test.

### 3D-08 Latency spike and kernel ADRs
- Accept: prototype `MOVE_EDGE` on GT-03 in the chosen language; p95 server PREVIEW for a 200-face building measured on
  the recorded rig; result vs. 150 ms target. If it fails: escalate to the owner (D-06), no client fallback. ADRs for
  kernel language/Boolean library and licences (closes Q-01) and solver approach, owner-approved.

### 3D-09 .. 3D-24 Kernel, operations, service
- 3D-02 changes (`change-wp`, [3D-ADR-0002](decisions/adr/3D-ADR-0002-kernel-package-and-remote-port.md), D-51):
  3D-09 Accept adds: `check:arch` enforces the module DAG of the ADR (C1 rule 2), no I/O in `geo-model3d` (no `fs`/`net`/
  `http(s)`/`child_process`/`process.env`, no `Date.now`/`Math.random`), only `services/kernel` imports it.
  3D-23 Accept adds: `services/kernel` exports `createKernelHandler(ports)` (plain Node, mountable by geoviewer, 3D-50) and
  its own server for the image (D-33); every request and reply validates against `contracts/model3d/`.
- 3D-08 changes (`change-wp`, D-111, Q-42): 3D-23 Accept adds: `npm run bench` gate re-run on the production
  instance class of the service image; numbers and fingerprint recorded; a miss is an owner escalation (D-06).
- Accept lines come from `docs/specs/3dqm-spec.md` (3D-04). Golden tests per row:
  3D-09 GT-25; 3D-10 GT-I1..GT-I3; 3D-11 GT-I4; 3D-14 GT-01..GT-05; 3D-15 GT-08, GT-10; 3D-16 GT-07, GT-09;
  3D-17 GT-06, GT-11, GT-19; 3D-18 GT-12; 3D-19 GT-14..GT-16; 3D-20 GT-17, GT-18; 3D-22 GT-20, GT-21;
  3D-23 GT-13 (D-68); 3D-24 GT-22, GT-24 (GT-23 is enforced from the CP contract, D-10: test belongs to 3D-25).
- Every operation: atomic commit, PREVIEW before COMMIT, hard-constraint conflict -> refusal without partial change,
  lineage in the result, "commit adds no new errors for the current state" (v0.3 §6).

### 3D-25 E2E
- Accept: the v0.3 G5 E2E chain on the CP/DP mock in both workplaces; GT-23 (building outside assignment -> 403).

### 3D-26 Real-data import
- Accept: import + export round-trip of the owner's roofer and TerraSolid samples; tolerance profile adjustments
  proposed as decisions, not edited silently. Binaries stay outside git unless the owner allows.

### 3D-27 Early ADR: contracts location and P4 canary
- Source: owner dialog 2026-11-19 (D-24). Goal: close the repository seam before contracts and bootstrap start.
- Accept: `3D-ADR-0001` closes Q-08 (one authoritative location of `model3d` schemas, how the other repository
  consumes them at a pinned version) and Q-09 (canary marker format, which bundles CI scans in each repository);
  owner-approved (D-18). Reads `shared_compnents` contracts/build setup; read-only there.

### 3D-29 Verify crowdsource as CP/DP implementation
- Source: owner dialog 2026-11-19 (D-32). Goal: replace the assumption "Operaflow = DP" by facts.
- Accept: `docs/verification/3D-29.md` with `crowdsource` revision and file:line references: what CP/DP roles it
  implements, how it serves datasets (forms, `stream`/COPC, box reads), where versions/results/journals live, auth,
  deployment; Q-02, Q-05, Q-14 narrowed; D-32 confirmed or corrected. Read-only in `crowdsource`.

### 3D-30 Agent tooling (D-46)
- Source: claude-code-setup analysis, owner dialog 2026-11-19. Goal: cut repeated coordinator work and ad-hoc checks.
- Accept: (1) `.claude/skills/merge-wp/SKILL.md`: ancestry check, merge, provisional ids `D-3D<wp>-n` -> final `D-NN`
  with all references rewritten, backlog recount, branch delete attempt, session archive (D-38, D-42).
  (2) `tools/check-docs.mjs` (Node, no deps): overview counts = table, mermaid nodes = rows, unique D/Q ids in the
  decision table, no provisional ids, relative links resolve, every row has an Accept line or a Details entry; exit 1
  with one line per problem; tests on planted faults in `tools/check-docs.test.mjs` runnable with `node --test`.
  (3) `.claude/settings.json`: Stop hook runs the script only when `docs/` changed (quiet on success); PreToolUse hook
  refuses Edit/Write under `docs/source/`; allow list for read-only git/grep. (4) Each hook demonstrated once with output.
  3D-05 later folds the script into `npm run check`.

### 3D-28 Agent evals
- Source: owner dialog 2026-11-19 (D-27). Goal: prove the instructions by measurement.
- Accept: `docs/agent-evals/<task>/` with prompt, start state, rubric graded on the final result; tasks at least:
  intake of a new request, chore vs. non-chore, refuse a client import of the kernel, mark an unknown tolerance
  `TBD`, refuse to re-open a decision, handoff to a fresh session, question asked as a dialog; plus one per hard rule
  of AGENTS.md §2. Every task run twice; scores recorded in DECISIONS.md. A rule change is kept only if evals hold.

### 3D-31 Spike: codebase graph / read-cache tool (D-50)
- Source: owner message 2026-11-19 (Codebase Memory MCP and similar graph/cache tools against repeated code reading).
- Goal: decide with measured data whether one local code-graph or read-cache tool lowers cost per task without lowering
  result quality.
- Scope in: check which candidate tools exist and what they need (codebase-memory-mcp first; others only if their
  repository is found); pick one that runs fully locally (no code sent to external services); install it for the
  session only; one fixed cross-repo reading task on code that exists (`GeoIPlus/shared_compnents` and/or `geoviewer`,
  e.g. "where would the remote kernel port plug in, what does it touch"), run twice with and twice without the tool.
  Scope out: permanent install in `.claude/settings.json` or the environment setup script (needs a new owner decision),
  indexing `docs/source` (markdown, not code), more than one tool per run.
- Accept: `docs/agent-evals/3D-31-code-graph.md` with tool name, version, install steps actually run, the task text,
  a rubric, and per run: cost, context tokens, tool calls, turns, rubric score; tool-definition count added; a
  recommendation (adopt / defer until kernel code exists / reject) that follows from the numbers; noise stated
  (n=2 per arm). Vendor claims are cited as claims, not results.
- Decisions: D-43, D-50  Open: -

### 3D-32 CRS support (D-92, D-93)
- Source: owner dialog 2026-11-23 (Q-11, v0.3 Д-04 changed). Goal: import, edit and export buildings in geographic CRSs
  without losing the exact round trip.
- Scope in: ADR for the transform library (server-only, licence, version pin; P4: nothing in a browser bundle); a module
  that maps a building to a local metric ENU frame and back; export converts back only vertices changed by an edit,
  untouched vertices keep their file coordinates (D-70); spec import/export rules and `INVALID_CRS` wording updated
  (after 3D-64), and every `Q-11` marker in the spec replaced by D-88..D-94; schema change only if a field is needed
  (owner approval, D-18). Scope out: vertical datum transforms
  (D-93: heights as in the file), point cloud reprojection.
- Accept: round trip of a geographic-CRS fixture with no edits is exact (GT-I4 rule, 0.001 m); an edited building
  re-exports with changed vertices within the tolerance profile; a projected-CRS file takes the same path unchanged;
  unknown CRS -> `INVALID_CRS`; `check:arch` shows the module unreachable from client bundles.
- Decisions: D-04, D-06, D-07, D-70, D-88..D-94  Open: -

### 3D-33 Inter-building validation, P1 (D-89)
- Source: owner dialog 2026-11-23 (Q-11, v0.3 Д-05). Goal: find shared-wall gaps and overlaps between adjacent buildings.
- Accept: TBD when P1 is planned (spec section and golden tests to be written first).
- Decisions: D-89  Open: -

### 3D-60 .. 3D-63 Data serving in crowdsource (D-35)
- Source: owner dialog 2026-11-19 after 3D-29. 3D-60..3D-62 are added in `crowdsource` by a session working there under
  its rules; this backlog mirrors them (D-25). 3D-63 is the 3DQM side of the move.
- Accept 3D-63: same golden tests pass against crowdsource adapters as against the interim adapters; no change to
  kernel code outside adapters; stored building versions and journals migrated with a recorded check.

### 3D-45, 3D-46 shared_compnents mirrors from 3D-27 (class `external`; D-37, [3D-ADR-0001](decisions/adr/3D-ADR-0001-contracts-location-and-p4-canary.md))
- 3D-45 Accept: SC vendors the schemas into `contracts/vendor/3deditor/` + `provenance.json`; an edited copy fails SC
  `npm run check`; a `revision` bump passes; the loading module is named (`sync-contract-assets.js:11` skips vendor/).
- 3D-46 Accept: SC CI scans its browser outputs (ADR table "what each repository scans") for the canary pattern and
  rejects a `geo-model3d` dependency; a planted synthetic marker per output kind and a planted dependency each fail.

### 3D-40 .. 3D-50 Mirrors
- UI rows (3D-40, 3D-42, 3D-44, 3D-50) follow `GeoIPlus/brandbook` (D-40); acceptance includes the brand checks of the
  repository they are built in.
- Rows are added in the other repository by a session working there, under its AGENTS.md; this row records the id
  and status. 3D-40 depends on Q-12; 3D-41 on Q-13; 3D-43 on Q-03.
- 3D-01 changes (intake `change-wp`, 2026-11-19; [verification note](verification/3D-01.md)):
  - 3D-40: `geo-render` has only a 2D orthographic host and XY picking; geoviewer `scene3d` picks points, not entity ids.
    The 3D scene source (new `geo-render` module vs geoviewer host port) is decided in 3D-02; split 3D-40 if it grows.
- 3D-27 (`change-wp`, D-37): 3D-40/3D-43 depend on 3D-45. 3D-50 also scans GV `client/dist` (+ `.map`) for the canary; a planted marker fails it.
  - 3D-41: Accept adds "a plan placement value or binding that a remote (Tools Plane) kernel port can use; WP-28's
    compose executes it" - today `placement` (`dp`, `dp.batch`) is declarative only.
  - 3D-43: the extension follows `extension-orthoqm.schema.json` (assignment, dataset, production, runtime,
    deliverable) under a content-named URI (Operaflow `extension-names-no-product`); buildings as `work.units`.
  - 3D-50: geoviewer consumes no `@geoiplus/*` package today; Accept adds the registry token in its CI and Docker build.
- 3D-02 changes (`change-wp` / `external`, 2026-11-19, [3D-ADR-0002](decisions/adr/3D-ADR-0002-kernel-package-and-remote-port.md)):
  - 3D-40 Accept: draws only through the 3D view port of 3D-47; an entity id survives drawing and picking.
  - 3D-41 Accept: a `model3d-kernel` service factory in `plans/registry` validates every request/reply against the vendored
    `model3d` schemas (3D-45) and sends it through a host-injected `kernelTransport(request, {signal})`; a stale PREVIEW
    reply is dropped; a plan with a URL or credential is rejected; plan v2 gets a Tools Plane placement value (D-53).
    Waits for SC WP-28 (factory, registry, plan v2; paused on its branch).
  - 3D-43 Accept adds: the 3DQM extension `runtime` declares the kernel service endpoint (D-52).
  - 3D-50 Accept adds: the server route mounts `createKernelHandler` from `services/kernel`; how GV obtains it (pinned SHA
    or tarball) is the GV row's choice. The 3D view adapter is 3D-51.

### 3D-47 SC 3D view port and perspective host
- Source: 3D-02, owner dialog 2026-11-19 (D-54). Goal: a 3D view in `geo-render` that any host can use.
- Scope in: SC ADR; 3D view port (add/remove object, camera, pick ray); perspective host module on `three@0.185.1`;
  point drawing. Scope out: building drawing (3D-40), tools (3D-42).
- Accept: SC ADR accepted under SC rules; a port contract test that 3D-51 reuses; scenes/cameras never escape the port.
- Decisions: D-17, D-40, D-54  Open: Q-06 (LidarQM reuse)

### 3D-48 SC `apps/3dqm`
- Source: 3D-02, owner dialog 2026-11-19 (D-55). Goal: an independent 3DQM host beside geoviewer.
- Accept: assembles the 3DQM workplace from a CP document on the SC CP/DP mock using 3D-47, 3D-41 and `plans/3dqm`;
  the P4 canary scan (3D-46) covers its build.
- Decisions: D-17, D-52, D-55  Open: -

### 3D-51 geoviewer `scene3d` adapter
- Source: 3D-02, owner dialog 2026-11-19 (D-54). Goal: GV is a second host of the same 3D view port.
- Accept: the 3D-47 port contract test passes against the GV adapter; picking returns entity ids for model3d objects.
- Decisions: D-07, D-54  Open: -

### 3D-64 Spec update: apply D-76 and D-77
- Source: owner message 2026-11-23, found at the 3D-06 merge (checkpoint 3D-06 handoff). 3D-04 is `done`, so this is a new row.
- Goal: the maintained spec states the refusal codes and severities the owner decided in 3D-06 instead of `TBD`.
- Scope in: spec §8 rule 4 (severity table gains `SOLID_OVERLAP`, `UNDERCONSTRAINED_GEOMETRY`, `INVALID_MEASUREMENT`,
  `EXPORT_SCHEMA_ERROR`, `PRECISION_LOSS` per D-77); refusal codes per D-76 in §2.4, §10.1 rule 6, §10.3 rule 6, §10.5
  (API default and rule 5), §10.6 rule 2; §14 rows Q-20, Q-21 marked closed (as Q-19); §2 or §14 points to the contract
  open questions Q-26..Q-39 ([contracts/model3d](../contracts/model3d/README.md)). Scope out: any other spec change;
  schema changes (D-75..D-77 are already in `contracts/model3d/`).
- Accept: no spec line calls Q-20 or Q-21 open or a Q-20 code `TBD`; the five codes appear in the §8 rule 4 table with
  the D-77 severities, and each D-76 refusal is named with its code where the spec lists that refusal; §14 marks Q-20 /
  Q-21 closed by D-76 / D-77 and lists Q-26..Q-39; `npm run check` passes (the contract test parses spec §2.2-§2.4, so
  those tables keep their shape).
- Decisions: D-76, D-77, D-75  Open: -

### 3D-69 Point cloud CRS vs. building CRS (D-126)
- Source: 3D-32 session 2026-11-23, owner dialog (D-126). Found because point cloud reprojection is out of 3D-32.
- Goal: snapping, `FIT_PLANE` and the heatmap work when the building is in a geographic CRS (D-92) and the point cloud is
  in another horizontal CRS (typically LAS/COPC in UTM), or the mismatch is refused with a clear code.
- Scope in: compare the cloud's horizontal CRS with the building's; option A: reproject points into the building's
  metric frame on the server (`proj4` and the `crs` module of 3D-32 exist, 3D-ADR-0007); option B: refuse the mismatch;
  the choice is an owner question before the row is `ready`. Scope out: vertical datum transforms (D-93: the cloud must
  share the vertical CRS), datum shifts needing grids (I/O, 3D-ADR-0002 C1 rule 1).
- Accept: a fixture pair (building EPSG:4937, cloud EPSG:25832, same place) gives the same `FIT_PLANE` result and
  heatmap values as the all-UTM case within `planarTolM` (option A), or a defined refusal code (option B); a cloud in
  the same CRS takes the path unchanged.
- Decisions: D-92, D-93, D-126  Open: choice A/B (owner, at `ready`)

### 3D-65 Schema text: D-76 in the `FIT_TO_SHARED_EDGE` payload
- Source: 3D-64 session 2026-11-23, owner dialog (D-97). Found while applying D-76 to the spec.
- Goal: the `maxDisplacementM` description of `contracts/model3d/command-payload-fit-to-shared-edge.schema.json` states
  the decision (D-76: no default, required) instead of "the sources give none (Q-20); 3D-06 proposes \"always explicit\"".
- Scope in: that `description` string only. Scope out: any keyword, `required`, `$id` or version change; other schemas
  (`validation-report` already cites D-77).
- Accept: `grep -rn "Q-20\|proposes" contracts/model3d/*.json` finds no stale wording; the schema's validation behaviour
  is unchanged (contract tests pass unchanged); `npm run check` passes; owner approves the text (D-18).
- Decisions: D-75, D-76, D-97  Open: -

### 3D-66 Apply the accepted 3D-08 ADRs to the spec and AGENTS.md
- Source: 3D-08 session 2026-11-23, owner dialog (D-109..D-112).
- Goal: the spec and the agent manual state the accepted decisions instead of `TBD` / "working rule".
- Scope in: spec §1.3 row "Compiled kernel" -> D-109; §5 rule 8 and §10.4 rule 5 -> 3D-ADR-0005 O1 (Q-17 closed);
  §11 rule 14 -> 3D-ADR-0006; §14 Q-17 row closed; AGENTS.md §2 rule 8 cites 3D-ADR-0004 (owner approves the AGENTS.md
  text, §10). Scope out: any other spec change; §10.5 / §10.7 / §10.8 keep their wording (they link Q-17, now closed).
- Accept: `grep -n "Q-17\|ADR-S" docs/specs/3dqm-spec.md` shows only references to the closed question / accepted ADR;
  AGENTS.md §2 rule 8 no longer says "not yet an owner decision"; `npm run check` passes.
- Decisions: D-109, D-110, D-111  Open: -

### 3D-67 Licence allow-list check in `check:arch`
- Source: 3D-08, 3D-ADR-0004 decision 3 (D-109, D-112).
- Goal: a runtime dependency with a non-permissive licence cannot enter the kernel or the service unnoticed.
- Scope in: rule in `tools/check-arch` over the installed runtime dependency tree of `packages/geo-model3d` and
  `services/*`: licence in the allow list (MIT, ISC, BSD-2-Clause, BSD-3-Clause, Apache-2.0, Unlicense, BSL-1.0), else a
  problem. Scope out: devDependencies; other repositories.
- Accept: a negative-control test with a fake GPL dependency fails the rule; the current tree passes; `npm run check`
  passes.
- Decisions: D-109  Open: -

### 3D-68 Latency bench beyond PREVIEW
- Source: 3D-08 (v0.3 §11 rows 2 and 4 not measured; 3D-ADR-0006 "not covered"), D-112.
- Goal: measured numbers for COMMIT of a simple operation (p95 <= 1 s), import of a building up to 500 faces (<= 2 s,
  assumption) and PREVIEW under concurrent requests, on the 3D-ADR-0006 rig.
- Scope in: bench scenes and modes in `tools/bench` against the real kernel (3D-10, 3D-15) and service (3D-23).
  Scope out: FINAL_VALIDATION (external validator, Q-10); network.
- Accept: `npm run bench` reports COMMIT and import p95 and PREVIEW p95 at a stated concurrency with the rig
  fingerprint; results vs v0.3 §11 recorded in a verification note; a miss is an owner escalation (D-06).
- Decisions: D-111  Open: Q-42
