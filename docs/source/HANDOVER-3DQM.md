# HANDOVER - 3DQM (online editor of ready-made LoD2 building models)

Date: 2026-11-19. Written for the coding agent that continues this work in Codex with access to all repositories.
Source session: specification review and owner interview (Claude). Owner: Andy.

**Your first session produces a plan only. No implementation code. Stop when the deliverables of §9 exist and wait for
the owner.**

Each statement below is marked: **[D]** decided by the owner, **[V]** verified by reading repository documents on
2026-11-18/19, **[A]** assumption or proposal of the previous session - verify before relying on it.

---

## 1. What 3DQM is

- [D] An online editor of **existing** LoD2 building models. Models come from roofer, TerraSolid, or a customer. An operator
  fixes roof and envelope geometry against a point cloud, brings the building to a valid solid and exports CityJSON.
- [D] Not in the product: tax valuation, jurisdictions, measurement profiles, stereo and image measurement, texturing,
  building models from scratch.
- [D] 3DQM is the third solution of the **Tools Plane**, beside OrthoQM and LidarQM.

## 2. System context

| Plane | Role |
|---|---|
| Control Plane (CP) | Orchestrator. Issues the contract that says which components form a workplace and who works on what |
| Data Plane (DP) | Manages data only |
| Tools Plane | Home of the workplaces: OrthoQM, LidarQM, 3DQM |

- [D] Components are modular and are assembled into a workplace from a CP contract. `shared_compnents` is the component
  library. `geoviewer` is **one host** of these components and the convenient place to test them.
- [V] OrthoQM lives in `shared_compnents` today; part of its functionality was ported from `geoviewer` (donor).
- [V] `shared_compnents` is still under development: work packages WP-00...WP-35, several modules `planned`.

## 3. Read first, in each repository

| Repository | Read | Why |
|---|---|---|
| `shared_compnents` | `AGENTS.md` (all), `STRUCTURE.md`, `docs/BACKLOG.md`, `docs/decisions/DECISIONS.md`, `docs/specs/orthoqm-library-spec.md` §5 (protection) and the workplace/plan specs | Your working rules and the target structure. **These rules win over this handover** |
| `geoviewer` | `AGENTS.md`, `.agent/PROJECT_INDEX.md`, `BACKLOG.md` "Open now", `docs/lod2-reconstruction.md` | Host rules; the existing LoD2 reconstruction track (LOD2-1...LOD2-20) |
| CP, DP, Tools Plane repositories | Their agent manuals and contract definitions | The previous session never saw them - see §8 |

Functional source documents (the owner supplies them; propose `shared_compnents/docs/specs/3dqm/source/`):

- `fullSpecsV0.3.md` - **authoritative for functional scope**: operations, state model, validation, golden tests.
- `fullSpecsV0.2.md`, Appendix C only - formal algorithms referenced by v0.3.
- The review of v0.2 (51 defects) - background; do not re-open what v0.3 already closed.

## 4. Decisions already taken - do not re-open

| # | Decision | Mark |
|---|---|---|
| 1 | Scope: editing of existing LoD2 only. Creation is limited to "replace the roof with a template" (flat, shed, gable, hip) on the existing footprint | D |
| 2 | Input and output format: CityJSON. Anything else is converted before the editor | D |
| 3 | Production mode: point cloud + manual input. No stereo | D |
| 4 | The first release ends at `VALID_SOLID` + export. `APPROVED` is a geometry QC mark, no tax profile | D |
| 5 | Export only for valid solids; drafts stay inside | D |
| 6 | The geometry kernel runs **only on a server** (code protection). The browser holds a visual ghost without solver logic. No WASM build of the kernel is shipped to browsers | D |
| 7 | Kernel = a DOM-free Node package in `shared_compnents`, run by **two hosts**: the geoviewer server for testing, a Tools Plane service in production | D |
| 8 | Planes are primary, vertices are derived (intersection of the planes of incident faces) | D |
| 9 | Workplaces: `3dqm.production` (operator edits) and `3dqm.qa` (independent check and approval by a different person; any later edit clears the approval) | D |
| 10 | Assignments of buildings to operators and roles come from the CP contract, not from an admin screen inside the editor | D |
| 11 | Point cloud in the editor: snapping to points, model-to-cloud deviation heatmap, plane fit from selected points | D |
| 12 | Operations of the first release: move vertex/edge, split/merge face, roof break, align ridge/eave, offset face, remove/heal face, weld gaps and repair multi-plane junctions, overhang and roof extent, footprint/walls/heights, translate/rotate, dormers and chimneys, replace roof, rebuild envelope, semantics, undo/redo, restore baseline | D |
| 13 | Starting tolerance profile (v0.3 §10: planarity 0.02 m, weld 0.01 m, min edge 0.05 m, min face 0.1 m2, coplanarity 1 deg, ...). Owner-approved starting values, configurable per project - record them in `DECISIONS.md`, they are not `TBD` | D |
| 14 | Development model: 3DQM gets **its own packages and its own WP range in `shared_compnents`**; it does not move to a separate repository and does not start inside geoviewer | D |
| 15 | The plan (ADR, spec, backlog rows) lives in `shared_compnents`; geoviewer gets host tasks only | D |
| 16 | Pull requests merge on the QA team's sign-off of the checklist; the agent never merges on its own judgement | D |

Unclear and to confirm with the owner: decision 16 was given for "who approves ADRs, schemas and merges". Treat QA
sign-off as the merge gate. For ADRs and contract schemas ask the owner whether QA sign-off is enough or his word is needed.

## 5. Where v0.3 contradicts the repositories - resolve in your plan

| v0.3 says | Repositories say | Resolution |
|---|---|---|
| Compiled kernel (Rust or C++) | JavaScript ESM with JSDoc everywhere; TypeScript only in `geoviewer/infra/aws-cdk` [V] | Kernel in JavaScript on Node. Protection is the same (server-only). Latency is the only open risk - see §7 |
| DTOs written as TypeScript interfaces | Contract first: JSON Schema 2020-12 in `contracts/`, types derived [V] | Rewrite v0.3 §4 and §9 as schemas |
| Gates G0...G5, agent task template | WP rows in `docs/BACKLOG.md`, one WP per branch, PR and fresh session, checkpoints [V] | Map the gates to WPs; drop the v0.2/v0.3 process text |
| Roles "operator / reviewer / admin", admin assigns batches, building locks | Assignment and roles come from CP (decision 10) | Remove admin functions from the editor scope; keep only what a workplace must enforce locally |
| "CityJSON is already loaded" | The geoviewer client parser turns CityJSON into GeoJSON 3D polygons for drawing (`formats/cityjson.js`) [V, from the module index] | Import into the kernel must read the original CityJSON on the server; the drawing path is not a source of topology |
| Client module `features/editor/` in geoviewer | Tools belong to `workspace/tools`, drawing to `geo-render`; geoviewer is a host | Client parts are library components; geoviewer only mounts them |
| No file size rule | Files at most 300 lines, enforced by `check:arch` in both repositories [V] | Size the WPs accordingly - the kernel is dozens of small modules |
| v0.2 Appendix C algorithms C.8 (weld) and C.11 (move vertex) move vertices | Decision 8: planes are primary | Rewrite these two algorithms in plane terms inside the spec before any implementation WP |

## 6. Facts about the repositories

Verified from documents, not from code - confirm in code before you build on them:

- [V] geoviewer: npm workspaces; server = Express + ws (`apps/viewer-web/server`), storage `fs | s3 | stac`, sign-in at
  `/auth/login`, server vaults for secrets; client = vanilla JS + Vite, Leaflet, three.js.
- [V] geoviewer 3D view: `apps/viewer-web/client/src/features/scene3d/` with a content registry
  (`content/registry.js`) and content modules `cityjson.js`, `model-geometry.js`, `points.js`, `terrain.js`, `tiles3d.js`,
  `gltf.js`. Owner's statement: three.js 0.185.1, own `renderer.js`, `OrbitControls`, LAZ through `laz-perf`, no Potree.
- [V] `shared_compnents`: packages `geo-core`, `geo-data`, `geo-render`, `geo-qa`, `geo-ortho`, `workspace`, `plans`;
  apps `orthoqm`, `playground`, `cp-dp-mock`. `three@0.185.1` is pinned for `geo-render`.
- [V] `STRUCTURE.md` §4: a 3D model algorithm goes into **a new domain package `geo-model3d` - ADR first**.
- [V] `STRUCTURE.md` §3: `workspace` reaches `geo-ortho` only through schema-defined Worker ports registered by
  `plans/registry`, never by import. Adding a dependency needs an ADR.
- [V] Protection levels P0...P4 (library spec §5). P4 = server-only, never shipped to a client. The rule text says no P4
  code exists in this repository's client packages and server counterparts live in the DP repository.
- [V] geoviewer already runs a LoD2 **reconstruction** track (roofer; tasks LOD2-1...LOD2-20, releases R5...R7). It has no
  editor. Task `LOD2-8` waits for the owner: 10 questions and 3 sample buildings with export ZIPs.
- [V] geoviewer hard rule: the server never imports `@oblique/viewer-core`; the Docker image ships `geo-core`, the server
  and the built client.

Not known to the previous session: `geo-render` has `raster2d`, `overlay`, `pick` and no 3D scene module in
`STRUCTURE.md`; whether a 3D scene component is planned in the library or stays in geoviewer was not checked.

## 7. Proposed target shape [A] - a starting point for your ADR, not a decision

```
contracts/model3d/                 building model, edit commands, patches, validation report, tolerance profile
packages/geo-model3d/              server-only, DOM-free, Node
  src/brep/        half-edge, planes, derived vertices
  src/import/      CityJSON -> canonical model + roof topology graph
  src/ops/         one module per edit operation
  src/solve/       constraints, plane intersection, conflict diagnostics
  src/validate/    fast and commit validation
  src/export/      canonical model -> CityJSON
  src/cloud/       plane fit, deviation statistics
packages/geo-render/src/model3d/   drawing of the edited building, ghost, picking by entity id
packages/workspace/src/tools/      edit tools, tool state machine, snapping
plans/3dqm/                        production.plan.json, qa.plan.json
```

Host ports the kernel needs, each a schema-defined boundary: command port (preview / commit / undo), storage port
(versions, journal, baseline), point port (points of a cloud inside a box), validation port (external validator).

Questions this shape raises and your ADR must answer:

1. `geo-model3d` is server-only, yet the repository states that P4 code does not live here. Options: a server-only
   package with a `check:arch` rule that no client package, plan chunk or app bundle may import it; or the package lives
   in the Tools Plane repository. Decision 7 says "package in `shared_compnents`" - find the way that keeps the
   protection rule true and mechanically checked.
2. The kernel-to-client link crosses a network, not a Worker port. Check that the plan and port model of
   `workspace/plan` can describe a remote port; if not, say what must be added and in which WP of the library.
3. Latency. The previous session proposed server preview p95 <= 150 ms for a building of up to 200 faces. A JavaScript
   kernel on Node may or may not meet it. Plan a measurement WP early (prototype `MOVE_EDGE` on a gable roof). If the
   target fails, the question goes back to the owner - you do not decide to ship kernel code to the browser.
4. External validation used val3dity in v0.3. Check how a native tool fits a Node host and the Docker image.

## 8. Open questions you resolve by reading CP, DP and Tools Plane code

| # | Question | Mark |
|---|---|---|
| 1 | Where do building versions, the edit journal and results live? The owner delegated this to you: read the DP and CP repositories and propose one option in an ADR | D (delegated) |
| 2 | Shape of the CP contract for a workplace; how OrthoQM extends the exchange document (`extension-orthoqm.schema.json`) and what the 3DQM extension must carry (building list, roles, tolerance profile, data references) | A |
| 3 | How the Tools Plane runs a server-side component today, if at all; where the 3DQM kernel service would be deployed | A |
| 4 | How a workplace obtains point cloud data from DP, and whether a server component can read the source LAS/LAZ by box | A |
| 5 | What exists in LidarQM that 3DQM can reuse (point cloud reading, selection, 3D view) | A |
| 6 | Sample data: the owner said he will place CityJSON samples from roofer and TerraSolid with their point clouds in a repository or bucket and give you the path. Ask for the path; record it; do not commit large binaries without asking | D |

## 9. Deliverables of the first session, then stop

All in `shared_compnents`, on one branch, following its `AGENTS.md`:

1. **Verification note**: each [V] and [A] item of §5-§7 checked against code, with file references; corrections listed.
2. **ADR**: the `geo-model3d` package - location, protection level and its mechanical check, dependencies, remote kernel
   port, relation to `geo-render` and `workspace`.
3. **ADR**: storage of versions, journal and results (§8 question 1).
4. **Spec** `docs/specs/3dqm-spec.md`: v0.3 rewritten in the library's form - modules with purpose, API, rules and
   "Accept:" lines; contracts as a list of schemas; algorithms C.8 and C.11 restated in plane terms; the golden tests of
   v0.3 §12 mapped to modules.
5. **Backlog rows** in `docs/BACKLOG.md` under a separate 3DQM section with their own id range (§10), each with size,
   dependencies, acceptance and status. Include: contracts, measurement of preview latency, kernel core, import, export,
   each operation group, cloud functions, render, tools, plans, geoviewer host adapter.
6. **Host tasks** for geoviewer as a list (rows are added in geoviewer's own `BACKLOG.md` by a session working there).
7. **`DECISIONS.md`**: the decisions of §4 recorded with their source; the open questions of §8 that remain open.
8. **Questions for the owner**: only those that change what is built, each with options.

Do not write library code, schemas or fixtures in this session. Do not open a PR unless the owner asks.

## 10. Working beside the OrthoQM development

The library is being built for OrthoQM at the same time. Rules proposed for 3DQM work [A, approved in principle by
decision 14 - put them into the ADR so they are binding]:

1. **Own id range.** 3DQM work packages use a separate range (for example WP-100 and up) and a separate section of
   `docs/BACKLOG.md`. Never renumber or edit OrthoQM rows.
2. **Own folders.** 3DQM changes touch only `contracts/model3d/`, `packages/geo-model3d/`, `plans/3dqm/` and new
   subfolders it creates in `geo-render` and `workspace`.
3. **Shared files change in separate, minimal PRs**: `STRUCTURE.md`, `docs/BACKLOG.md`, `contracts/common.schema.json`,
   root `package.json`, architecture and CI checks. One purpose per PR, merged quickly, so that long 3DQM branches never
   carry edits to files the OrthoQM sessions also edit.
4. **Use other modules only through their public `index.js`** and only when their status is `implemented`. A `planned`
   module (`workspace/session`, `workspace/tools`, `workspace/ui`) is a dependency in the backlog, not something 3DQM
   implements on its own. If 3DQM needs a change in a shared module, add a backlog row for the library and wait.
5. **No copies.** Do not duplicate a shared module to avoid waiting; a temporary adapter inside 3DQM folders is allowed
   when it is marked with the row that removes it.
6. **geoviewer as host.** geoviewer consumes library packages at pinned versions. Changes in geoviewer are limited to
   the host adapter (mounting the workplace, the kernel route on its server, a file-based storage port for tests).
   Check how geoviewer consumes `@geoiplus/*` today (registry token, versions) before planning this.
7. **Rebase often**; check for an existing session that owns a WP before starting it.

## 11. Waiting for the owner

- Access to the CP, DP and Tools Plane repositories.
- Path to the sample data (§8 question 6).
- Confirmation of who approves ADRs and schemas (note under §4).
- geoviewer task `LOD2-8` - its 3 sample buildings would also serve 3DQM import tests.

## 12. Risks the owner already knows

1. A robust plane-based kernel with constraint solving and conflict diagnostics is the hardest part; feasibility in
   JavaScript within the latency target is unproven.
2. All golden tests of v0.3 are synthetic; import cannot be accepted without real roofer and TerraSolid output.
3. 3DQM depends on library modules that are still `planned`; its schedule follows theirs.
4. v0.3 was written before the repositories were read; where it disagrees with them, the repositories and this
   handover win.
