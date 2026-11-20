# 3D-ADR-0002: `geo-model3d` package layout, remote kernel port, relation to `geo-render` / `workspace`

- Status: accepted (owner, 2026-11-19, D-51 .. D-55)
- WP: 3D-02   Questions closed: Q-13, Q-16; Q-15 groups assigned   Recorded, not decided: Q-14

Source revisions (read-only, the same as [3D-01](../../verification/3D-01.md) and [3D-ADR-0001](3D-ADR-0001-contracts-location-and-p4-canary.md)):
this repository at `5d984a3`; `GeoIPlus/shared_compnents` (SC) `main` at `cc54eb3` and its paused WP-28 branch
`wp/28-workplace-compose` at `b04349e` (marked `SC@b04349e`, unmerged, may still change); `GeoIPlus/geoviewer` (GV) at `95527b8`.

## Context

### What is decided already
- [D] D-06: the kernel runs only on a server; the browser holds a visual ghost without solver logic; no browser WASM.
- [D] D-07, D-31, D-33: the kernel is a DOM-free Node package run by two hosts - GV server for testing, a Tools Plane
  service in production; the service ships as its own container image from this repository; a later move into SC must be
  a relocation, not a rewrite (Q-14 open).
- [D] D-17: client parts (`geo-render/model3d`, 3DQM tools in `workspace/tools`, `plans/3dqm`, remote kernel port) are
  built in SC under its rules. D-37: `model3d` schemas are authoritative in `contracts/model3d/` here; SC vendors a pinned
  copy; the P4 canary is imported by every `exports` entry of `geo-model3d`.
- [D] D-35: interim own data ports (storage, points) in this repository, later swapped for `crowdsource` adapters.
- [V] v0.3 §3 (`docs/source/fullSpecsV0.3.md:76-98`): the server is the only source of geometry; the client sends
  commands and receives patches; `PREVIEW` returns an exact diff; `COMMIT` takes `previewId`; during a drag the client
  sends at most 10 PREVIEW requests per second and drops stale answers.

### SC: how a client operation reaches a server today (Q-13)
- [V] `SC@cc54eb3:contracts/plan.schema.json:46`: `placement` maps an operation (family) to one of `client.main`,
  `client.worker`, `client.gpu`, `dp`, `dp.batch`. The plan v2 draft keeps the same enum (`SC@b04349e:contracts/plan.v2.schema.json:63-65`).
  No SC code reads `placement` (3D-01 §7, Q-13).
- [V] The composition target (`SC@cc54eb3:docs/specs/workplace-composition-spec.md`) is a registry of trusted factories
  of kind view, layer, picker, tool, **service**; a service "includes worker/service adapters" (`:40-41`); binding kinds
  include tool -> worker/service (`:43-45`). The WP-28 draft schema has exactly these kinds
  (`SC@b04349e:contracts/composition-registry.schema.json:20`, `:70`). New factory/binding kinds need
  code/schema/registration (`SC plans/README.md:29`).
- [V] Plans and bindings carry no URLs or credentials: a dataset source is "not a free URI or credentials"
  (composition spec `:35`); bindings cannot embed "import URLs" (`:53`); "functions ... stay injected local ports, never
  serialised" (`:59`).
- [V] The precedent for network calls is `workspace/session`: it takes an injected `transport` host port and
  "Credentials remain in host ports" (`SC packages/workspace/src/session/README.md:17-19`); every reply is schema-checked
  (`session/session.js:20`). OrthoQM edits are prepared locally and "only DP replies establish terminal state"
  (`SC packages/workspace/src/tools/edit-session.js:2`).
- [V] SC's own model puts server work at the DP: "DP owns authoritative edits, final-output persistence, verification/release
  gates and P4 catalogue" (composition spec `:22-23`). For 3DQM the server side is a **Tools Plane** service, not the
  data provider (D-31; Operaflow reads planes as roles, 3D-01 §9.1).
- [V] WP-28 (factory, registry, plan v2) is `in progress` on a paused branch (`SC docs/BACKLOG.md:3`, `:185`).

### SC and GV: where a 3D scene exists (Q-16)
- [V] `geo-render` has no 3D scene: `host/three-port.js:33` builds only an `OrthographicCamera`, and "scenes, cameras and
  GPU objects never escape RendererPort" (`:1`). `three@0.185.1` is already pinned for `geo-render` (`SC STRUCTURE.md:238`).
- [V] GV has the only 3D scene, `features/scene3d` (2798 lines), with a content-type registry
  (`GV .../scene3d/content/registry.js:1-22`: `registerContent(id, type)` with `build`, `restyle`, `pickables`). Its picking
  returns a point `[x, y, z]`, not an entity id (`viewport.js:116-119`; 3D-01 §3 #13). GV consumes no `@geoiplus/*`
  package (3D-01 §5).
- [V] SC's composition spec lets an existing GV host lend its renderer through ports (`:110-112`), but describes GV as
  React/TypeScript, which is wrong (GV is vanilla JS; 3D-01 §4).

## Options

### A. Remote kernel port (Q-13, HANDOVER §7 Q2)

| Option | Consequences | Risk |
|---|---|---|
| **A1. Registered `service` adapter + injected host transport.** SC registers a `model3d-kernel` service factory (client adapter, no geometry logic). Tools bind to it with the existing tool -> service binding. It validates every request and reply against the vendored `model3d` schemas (D-37) and sends them through a host-injected `kernelTransport` port, as `workspace/session` does. Endpoint and credentials stay in the host; the endpoint comes from the CP document (3DQM extension `runtime`, 3D-43). A plan `placement` value marks the kernel operations as server-executed | Uses the factory/binding kinds WP-28 already defines; no URL or secret in a plan; the same adapter works against the GV test host and the production service (only the host's transport differs); stale PREVIEW replies are dropped in the adapter by request sequence | Depends on WP-28 landing in SC; latency of the network hop is unmeasured until 3D-08 |
| A2. A new binding kind "remote port" in the plan schema with an endpoint field | Explicit in the plan | Contradicts SC "no free URI / no import URLs in plans" (`:35`, `:53`); new kind = more SC schema and review |
| A3. 3DQM tools call `fetch` directly | Smallest | Bypasses SC composition, permission intersection and schema checks; credentials leak into components; rejected by SC rules |

Placement value for the kernel operations (needed by A1):

| Option | Consequences | Risk |
|---|---|---|
| P1. Add a value for a Tools Plane server (name chosen in SC's plan v2 schema, e.g. `tools`) | Says where the code runs: the 3DQM service, not the data provider (D-31, D-35); survives the later crowdsource swap unchanged | One enum value added in SC plan v2 (WP-28 is writing v2 now, so the change is cheap if it lands there) |
| P2. Reuse `dp` | No SC schema change | Mislabels the kernel as data-provider work; SC text ties `dp` to the DP's authoritative edits and P4 catalogue; misleading once `crowdsource` serves the 3D data (D-35) while the kernel stays elsewhere |

### B. 3D scene source (Q-16) and the relation to `geo-render`

| Option | Consequences | Risk |
|---|---|---|
| **B1. SC owns 3D drawing behind a 3D view port.** `geo-render/model3d` draws the edited building from patches (own layer, source hidden, ghost, entity-id pick) against a narrow **3D view port** (add/remove object, camera, pick ray). SC adds the first implementation of that port as a new perspective host module in `geo-render` (SC ADR). GV may later implement the same port over `scene3d` (adapter, GV row) | The 3DQM workplace runs in SC apps, Storybook and tests without GV; matches D-17 and SC's composition model; entity-id picking is designed in, not retrofitted; reusable by a later LidarQM | Larger: a 3D host and point drawing are new SC work (3D-40 splits); GV's COPC/points code is not reused at first |
| B2. GV `scene3d` is the only 3D host; SC ships `geo-render/model3d` as objects that GV registers as a content type | Reuses GV camera, points, COPC streaming now | Production workplace depends on GV, which has no `@geoiplus/*` dependency yet (3D-50) and is not an SC host; GV merged meshes must be reworked for entity ids; SC tests need a GV harness; SC's composition spec still assumes a React GV |
| B3. Both: B1, and GV `scene3d` implements the same 3D view port through an adapter | Any host can run the workplace (D-52); SC host for the independent 3DQM app, GV for the GV workplace | Two implementations of one port: the port must stay narrow and be covered by one shared contract test |

### C. Internal layout of this repository

| Option | Consequences | Risk |
|---|---|---|
| **C. Pure kernel package + separate service host** (below) | Kernel is deterministic and host-free; both hosts (D-07) and the later move (D-31) reuse it unchanged; ports swap per D-35 | One more folder boundary to enforce |
| C2. One package with storage, network and Operaflow handling inside | Fewer files | I/O inside the kernel breaks deterministic golden tests and ties the kernel to one host; the D-35 adapter swap touches kernel code |
| C3. One npm package per module (`brep`, `solve`, ...) | Hard boundaries | Many `exports` entries, each needing the canary (D-37); versioning overhead with no consumer that needs a part alone |

## Decision

Accepted (owner, dialog, 2026-11-19): **A1 with P1, B3, and the layout C below.**

- D-52 (Q-13): the CP issues one Operaflow contract from which **any host** assembles the workplace - geoviewer, an
  independent 3DQM host, or others; the kernel is one tool in that workplace. The kernel endpoint is declared in the CP
  document (3DQM extension `runtime`, 3D-43), and every host uses the same SC adapter with its own transport. No
  host-specific kernel client exists.
- D-53: a new placement value for the Tools Plane server (P1).
- D-54 (Q-16): B3 - SC 3D view port + perspective host, and a GV `scene3d` adapter of the same port.
- D-55: the independent 3DQM host is SC `apps/3dqm`, as `apps/orthoqm` (D-17).
- D-51: the layout C and the Q-15 assignment below.

### C1. `packages/geo-model3d` - the pure kernel (P4)

```
packages/geo-model3d/
  package.json        "exports": { ".": "./src/index.js" }  (one entry; deep imports closed)
  src/index.js        public API: command dispatch (PREVIEW / COMMIT / UNDO / REDO), import, export, validate
  src/canary.js       P4 marker (D-37), imported by src/index.js, listed in "sideEffects"
  src/brep/           half-edge, primary planes, derived vertices, local frame, transactions (3D-09)
  src/solve/          constraints, plane intersection, conflict diagnostics (3D-13)
  src/import/         CityJSON -> canonical model + roof topology graph + baseline (3D-10)
  src/export/         canonical model -> CityJSON (3D-11)
  src/validate/       fast and commit validation; the external validator is a port, not code here (3D-12)
  src/cloud/          plane fit, deviation statistics on points passed in as typed arrays (3D-22)
  src/ops/            one module per OperationKind (3D-14..3D-21)
```

Rules (enforced by `check:arch`; the intra-package rule is added when 3D-09 creates the folders):

1. **No I/O in the kernel.** No `fs`, network, timers, `Date.now`, `Math.random`, environment or process access; ids and
   clock are injected. Everything is a function of its inputs, so golden tests are deterministic (AGENTS.md §2.11).
2. Imports between modules form this DAG and nothing else: `brep` <- `solve`, `import`, `export`, `validate`, `cloud`;
   `ops` <- `brep`, `solve`, `validate`; `index.js` <- all. Third-party code only as decided by 3D-08 (Q-01).
3. Data in and out of `index.js` are the `contracts/model3d/` shapes (D-37); internal structures never leave the package.
4. No DOM, no three.js, no SC client package (STRUCTURE.md §2; AGENTS.md §2.10).

### C2. `services/kernel` - the host (I/O and ports)

```
services/kernel/
  src/handler.js      createKernelHandler(ports) -> (request) => reply; plain Node, no web framework; mountable in-process
  src/server.js       the container's own HTTP server around the handler (D-33)
  src/ports/          port definitions: storage (3D-03), points (3D-22), validator (3D-12), clock/ids, auth
  src/adapters/       interim adapters: file/S3 storage, COPC-by-box / LAS-whole points (D-35); later crowdsource (3D-63)
  src/operaflow/      document verification, grants and tokens, saving and delivery (Q-15 groups A-D)
```

The GV test host (D-07) mounts `createKernelHandler` on a GV server route (3D-50); the production host is the container
(D-33). How GV obtains the package (pinned git SHA or tarball) is the GV row's choice. Only `services/kernel` imports
`geo-model3d`; it imports nothing from SC client packages.

### A. Remote kernel port

1. The port is a **message contract**, not code: request = `GeometryCommand` (+ `phase`, `previewId`, `commandId`,
   `expectedVersion`), reply = `GeometryCommandResult` with `ModelPatch`, lineage, validation report and error codes
   (v0.3 §9; schemas in 3D-06 here). Both sides validate against the same pinned schemas.
2. SC side: a `model3d-kernel` **service** factory in the trusted registry (`plans/registry`) and a host-injected
   `kernelTransport(request, {signal}) -> reply`. The adapter drops stale PREVIEW replies by sequence and cancels them by
   `AbortSignal`. It holds no geometry logic; its SC protection level is set by its SC module card and is never P4.
3. Kernel operations in `plans/3dqm` get a placement value meaning "Tools Plane server" (P1), added to SC plan v2.
4. Wire binding (HTTPS + JSON request/response as the baseline; a socket only if 3D-08 measures a need) is fixed by 3D-23
   with the 3D-08 numbers. Latency target p95 <= 150 ms stays an owner escalation if missed (D-06); never a client fallback.

### B. Relation to `geo-render` and `workspace`

| Concern | Owner | Crosses the boundary as |
|---|---|---|
| Geometry, solving, validation, lineage, export | `geo-model3d` via `services/kernel` (here) | `model3d` replies |
| Drawing the edited building, ghost, entity-id pick | SC `geo-render/model3d` (3D-40) over a 3D view port | patches in, entity ids out |
| 3D view host (camera, controls, point drawing) | SC `geo-render`, new module (SC ADR, 3D-47); GV `scene3d` adapter (3D-51) | 3D view port |
| Workplace host | SC `apps/3dqm` (3D-48), geoviewer (3D-50), any other host of the CP contract | CP document + host ports |
| Tools, E-04 state machine, snapping, PREVIEW throttling | SC `workspace/tools` (3D-42) | commands out |
| Kernel transport | SC registry service + host port (3D-41) | `model3d` messages |
| Workplace plans and the CP extension | SC `plans/3dqm` (3D-43) | plan + extension schemas |

The ghost is the dragged handle and its trace only (v0.3 §3); exact shape comes only from a server PREVIEW. Snapping to
points is a client hit test on drawn points, not geometry construction; plane fit (`FIT_PLANE`) is a server command.

### Q-15: who meets which Operaflow rule group (3D-01 §9.3)

| Group | Bound party | Why |
|---|---|---|
| A versions + authenticity | **both**: the client session (SC `workspace/session`, exists) before opening; the service before acting on a command (it must check that the building is in the signed assignment, GT-23 -> 403) | each acts on the document |
| B data access | **service** | it reads CityJSON and points itself; server flow = OAuth client credentials (`data-and-access.md:42`) |
| C saving results | **service** | only the kernel can produce edited CityJSON (D-06); `PUT` + `If-Match` from the read version |
| D delivery | **service** for the immutable result bytes in its own store; **client session** for the delivery record (`submitResult`, exists in SC) | bytes come from the kernel; records are the session's channel |
| E progress and records | **client session** | SC `workspace/session` already implements records, resend and refusals |
| F extensions | **both** read the content-named 3DQM extension (3D-43) | - |

### Relocation (D-31, Q-14)

The split above keeps a later move a relocation: `geo-model3d` has no I/O and no host assumptions, `services/kernel`
isolates every port, and the SC client side already talks to the service only through the message contract. What SC must
change for P4 code to live there remains SC's ADR (Q-14, 3D-ADR-0001 "Relocation path").

## Checks

- 3D-05 (`check:arch`, already planned): no DOM/three.js/SC import in `geo-model3d`; the canary in every `exports` entry.
- 3D-09 (added by this ADR): the module DAG of C1 rule 2; `geo-model3d` imports no Node built-in with I/O (`fs`, `net`,
  `http(s)`, `child_process`, `process.env`) and no `Date.now` / `Math.random`; only `services/kernel` imports
  `geo-model3d`.
- 3D-06/3D-23: every request and reply of the port validates against `contracts/model3d/`; an invalid message is refused
  on both sides (contract tests).
- SC 3D-41: a plan placing a kernel operation on the Tools Plane value composes only with a registered `model3d-kernel`
  service and an injected transport; a plan with a URL or credential is rejected; a stale PREVIEW reply is dropped.
- SC 3D-40 / 3D-47, GV 3D-51 (B3): an entity id survives drawing and picking; the 3D view port is the only access to the
  scene; one port contract test passes against both the SC host and the GV adapter.
