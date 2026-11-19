# DECISIONS - 3DQM

Append-only. Ids are never reused. A decision is changed only by a new decision that names the one it supersedes.
`D-NN` = decided by the owner. `Q-NN` = open question. ADRs live in [adr/](adr/).

## Decisions

### Taken over from HANDOVER-3DQM.md §4 (owner, 2026-11-18/19)

| Id | Decision | Source |
|---|---|---|
| D-01 | Scope: editing of existing LoD2 only. Creation limited to "replace the roof with a template" (flat, shed, gable, hip) on the existing footprint | HANDOVER §4 #1; v0.3 Р-01, Р-04 |
| D-02 | Input and output format: CityJSON. Anything else is converted before the editor | §4 #2; Р-05 |
| D-03 | Production mode: point cloud + manual input. No stereo | §4 #3; Р-06 |
| D-04 | First release ends at `VALID_SOLID` + export. `APPROVED` is a geometry QC mark, no tax profile | §4 #4; Р-02 |
| D-05 | Export only for valid solids; drafts stay inside | §4 #5; Р-13 |
| D-06 | Geometry kernel runs only on a server (code protection). Browser holds a visual ghost without solver logic. No WASM build of the kernel for browsers | §4 #6; Р-07 |
| D-07 | Kernel = DOM-free Node package, run by two hosts: geoviewer server for testing, a Tools Plane service in production. *Location amended by D-17* | §4 #7 |
| D-08 | Planes are primary, vertices are derived (intersection of the planes of incident faces) | §4 #8; Р-08 |
| D-09 | Workplaces `3dqm.production` (operator edits) and `3dqm.qa` (independent check and approval by a different person; any later edit clears the approval) | §4 #9; Р-10 |
| D-10 | Assignments of buildings to operators and roles come from the CP contract, not from an admin screen in the editor. *Supersedes v0.3 Р-09 and the admin column of v0.3 §8.5* | §4 #10 |
| D-11 | Point cloud in the editor: snapping to points, model-to-cloud deviation heatmap, plane fit from selected points | §4 #11; Р-11 |
| D-12 | First-release operations: v0.3 §6 table (move vertex/edge, split/merge, roof break, align ridge/eave, offset, remove/heal, weld, junctions, overhang, roof extent, footprint/walls/heights, translate/rotate, dormers, chimneys, replace roof, rebuild envelope, semantics, undo/redo, restore baseline) | §4 #12; Р-14 |
| D-13 | Starting tolerance profile = v0.3 §10 values (planarity 0.02 m, weld 0.01 m, min edge 0.05 m, min face 0.1 m2, coplanarity 1 deg, ...), configurable per project. Not `TBD` | §4 #13; Р-12 |
| D-14 | 3DQM gets its own packages and WP range in `shared_compnents`. *Partly superseded by D-17* | §4 #14 |
| D-15 | The plan (ADR, spec, backlog rows) lives in `shared_compnents`; geoviewer gets host tasks only. *Superseded by D-17 for 3DQM planning documents* | §4 #15 |
| D-16 | Pull requests merge on the QA team's sign-off of the checklist; the agent never merges | §4 #16 |

### Taken in the 3D-00 session (owner, dialog, 2026-11-19)

| Id | Decision | Note |
|---|---|---|
| D-17 | **Hybrid repository model.** `GeoIPlus/3dEditor` holds the server-only kernel `geo-model3d` (P4), its service, 3DQM specs, ADRs, backlog and golden fixtures. Client parts (`geo-render/model3d`, 3DQM tools in `workspace/tools`, `plans/3dqm`, remote kernel port) are built in `shared_compnents` under its rules. Supersedes D-14 for the kernel and D-15 for planning documents | Also answers HANDOVER §7 Q1: P4 code stays out of `shared_compnents`. The exact boundary (contracts location, P4 check) is ADR 3D-02 |
| D-18 | ADRs and contract schemas become `accepted` only on the owner's explicit approval. Code PRs merge on QA checklist sign-off (D-16) | Closes the note under HANDOVER §4 |
| D-19 | Agent instructions and project documents in English. Dialog with the owner may be in Russian | |
| D-20 | Source documents moved unchanged to `docs/source/` and are read-only. Priority: DECISIONS > HANDOVER > v0.3 > v0.2 Appendix C > rest of v0.2; v0.1 and the audit are background | |
| D-21 | Work-package ids `3D-NN`; branches `wp/3d-<id>-<short-name>`; a platform-assigned branch is used as is | Unique next to `shared_compnents` WP-00..WP-35 |
| D-22 | Strict intake: every new request goes through the `task-intake` skill and becomes a `proposed` row; only the owner sets `ready`. Questions to the owner only as a dialog with proposed answers | |
| D-23 | Client and host work is mirrored in this BACKLOG (`repo: shared` / `repo: geoviewer`); the row in the other repository is authoritative for its status. *Mechanism amended by D-25* | One 3DQM progress board |
| D-24 | Q-08/Q-09 are closed early by a dedicated small ADR (row 3D-27) before 3D-02. P4 isolation is proven on build output: the kernel carries a unique canary marker; CI builds every client bundle and fails if the marker appears | Independent of which repository the code is in |
| D-25 | Mirror rows store only the external id/link; status is filled by `npm run backlog:sync` from the other repository's BACKLOG at a pinned ref; CI fails on drift. Until the external row exists, the local intake status applies | Implemented in 3D-05 |
| D-26 | Fast lane for chores (amends D-22): typo/wording fixes in documents, at most ~20 lines, no change to behaviour, contracts, decisions, acceptance or rules; logged in `docs/CHORES.md`, no backlog row, no `ready`. Everything else: full intake | |
| D-27 | Instructions are proven by measurement: `check:docs` lint (3D-05), agent evals (3D-28, each task run twice), and 3D-01 is the next WP | 10/10 is claimed only after evals pass |
| D-28 | 3D-01 set `ready`; it runs in a fresh cloud session that attaches `shared_compnents`, `geoviewer` and `Operaflow` read-only | Owner, dialog, 2026-11-19 |
| D-29 | `GeoIPlus/Operaflow` is the Control Plane (CP) | Owner, dialog, 2026-11-19. DP and Tools Plane repositories still unnamed |
| D-30 | `GeoIPlus/Operaflow` is both the Control Plane and the Data Plane. Amends D-29 | Owner, dialog, 2026-11-19 |
| D-31 | Tools Plane = `GeoIPlus/shared_compnents`. The 3DQM kernel service is built now as a separate service in this repository and is planned to become part of `shared_compnents` (Tools Plane) later. Therefore kernel and service development must fully conform to Operaflow (contracts, exchange, conventions) and to `shared_compnents` conventions, so that the later move is a relocation, not a rewrite. Amends the wording of D-07 | Owner, dialog, 2026-11-19. Conflict with the P4 rule of `shared_compnents`: Q-14 |

## Open questions

| Id | Question | Options / evidence | Closed by |
|---|---|---|---|
| Q-01 | Kernel language: JavaScript on Node (HANDOVER §5 proposal, matches both repos) or compiled (v0.3 §3, ADR-001) | JS keeps one toolchain and the same protection (server-only); risk = latency. Decided by measurement | 3D-08 ADR, owner approval |
| Q-02 | Where building versions, edit journal and results live (DP? own store?) | Delegated by the owner to the agent after reading CP/DP code (HANDOVER §8 #1); CP+DP = Operaflow (D-30) | 3D-03 ADR |
| Q-03 | Shape of the CP contract for a workplace; what a 3DQM extension carries (building list, roles, tolerance profile, data references) | Model: `extension-orthoqm.schema.json` in `shared_compnents`; CP = Operaflow (D-29) | 3D-01 reads, 3D-02/3D-06 decide |
| Q-04 | How the Tools Plane runs a server-side component; where the kernel service is deployed | Unknown | 3D-03; needs Tools Plane access |
| Q-05 | Can a server component read source LAS/LAZ by box from DP (v0.3 Д-02)? | If not, heatmap and plane fit need points uploaded from the client | 3D-01; needs DP access |
| Q-06 | What LidarQM offers for reuse (point reading, selection, 3D view) | Unknown | 3D-01; needs LidarQM access |
| Q-07 | Path to sample CityJSON (roofer, TerraSolid) with point clouds; geoviewer `LOD2-8` samples | Owner promised a repository or bucket path | Owner |
| Q-08 | Where `contracts/model3d/` schemas live: `shared_compnents` (client consumes them) or here (kernel owns them) | Contract crosses the repository boundary; one location must be authoritative | 3D-27 ADR (D-24) |
| Q-09 | How P4 isolation is checked mechanically when the kernel is in a separate repository (no client package may depend on `geo-model3d`; no plan chunk references it) | Canary marker in build output (D-24) + dependency rule in `shared_compnents` | 3D-27 ADR (D-24) |
| Q-10 | External validation: val3dity (native) in a Node host and the Docker image, version pin (v0.3 Д-08) | Sidecar binary, container, or service | 3D-12 |
| Q-11 | v0.3 §15 assumptions Д-01..Д-12 are not confirmed by the owner; must be confirmed before G1-equivalent rows start. Д-01 is partly overtaken by D-10 (auth and assignment from CP) | List in v0.3 §15 | Owner, dialog, before 3D-09 |
| Q-12 | Does `shared_compnents` plan a 3D scene module in `geo-render`, or does the 3D scene stay in geoviewer? (HANDOVER §6, not checked) | Determines where 3D-40 lands | 3D-01 |
| Q-13 | Can `workspace/plan` describe a remote (network) port, not only a Worker port? (HANDOVER §7 Q2) | If not, a library row is needed | 3D-01, 3D-02 |
| Q-14 | The planned move of the kernel service into `shared_compnents` (D-31) conflicts with its rule that no P4 code lives there (HANDOVER §6: server counterparts live in the DP repository). Options: a server-only package with a mechanical isolation rule there (canary, D-24); or the service moves to Operaflow (DP) instead | Needs an ADR in `shared_compnents` before the move; not before | 3D-27 records it; owner before the move |
| Q-15 | What "full conformance with Operaflow" (D-31) requires concretely: contract/exchange schemas, API conventions, auth, storage, deployment | Operaflow's own AGENTS/docs and contracts | 3D-01 extracts the list; 3D-02/3D-03 apply it |

## Open-question status updates

Appended; the question rows above stay as written. Evidence: [docs/verification/3D-01.md §7](../verification/3D-01.md#7-open-questions---status-after-this-note).

| Q | Date, source | Status | Finding |
|---|---|---|---|
| Q-02 | 2026-11-19, 3D-01 | narrowed, open | The CP format (Operaflow) carries a dataset `version`, saves results to `progress.save` datasets (`PUT` + `If-Match`, or OGC API Features) or an own https store, and keeps delivered bytes immutable. It has no edit journal, history, drafts or retention, so those are 3DQM's own. The DP repository is still unnamed |
| Q-03 | 2026-11-19, 3D-01 | answered (shape); decided in 3D-06/3D-43 | Operaflow `1.0.0-rc.1` requires only `formatVersion`, `id`, `issuer`. There is one `open.operator {id, role}` per document, and the role is free text. Units come from `work.units` (`list` / `from` / `grid`). Extensions are keyed by URI and must not name a product. The model is SC `extension-orthoqm.schema.json` (13 members, including `assignment {id, userId, leaseRef, leaseEpoch, deadline}`, `dataset`, `runtime` endpoints). The format has no separation-of-duties rule: D-09 is enforced by 3DQM/issuer (3D-24) |
| Q-04 | 2026-11-19, 3D-01 | not checkable, open | Nothing in SC, geoviewer or Operaflow says where a tool's server side runs |
| Q-05 | 2026-11-19, 3D-01 | narrowed, open | The format has no bbox read; `stream` with `copc`/`ept` allows part reads. geoviewer serves COPC by HTTP Range and has a DOM-free COPC reader (selection by centre/LOD). Box reads look feasible for COPC; plain LAS/LAZ can only be read whole. The DP side is unknown |
| Q-06 | 2026-11-19, 3D-01 | not checkable, open | There is no LidarQM repository, and it has 0 hits in Operaflow and SC. Reuse candidates today: geoviewer `layers/formats/{las,laz,copc,copc-fetch}.js`, `scene3d/content/points.js` |
| Q-12 | 2026-11-19, 3D-01 | answered | SC plans no 3D scene: `geo-render` = `host` (2D orthographic), `raster2d`, `overlay`, `pick` (XY), and no SC row mentions a 3D scene. The only 3D scene is geoviewer `features/scene3d`. Where 3D-40 draws is decided in 3D-02 |
| Q-13 | 2026-11-19, 3D-01 | narrowed; closed by 3D-02 | `plan.schema.json` `placement` allows `dp` / `dp.batch`, but `workspace/plan` code never reads `placement`, and the compose factory is SC WP-28 (not done). A plan can declare a server operation, but nothing executes it. 3D-41 must add the binding |
