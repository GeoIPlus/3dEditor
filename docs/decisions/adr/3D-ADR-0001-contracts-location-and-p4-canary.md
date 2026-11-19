# 3D-ADR-0001: Location of the `model3d` contract schemas and P4 canary check of client bundles

- Status: accepted (owner, 2026-11-19, D-37)
- WP: 3D-27   Questions closed: Q-08, Q-09   Recorded, not decided: Q-14

Source revisions: this repository at `2846dff`; `GeoIPlus/shared_compnents` (SC) at `cc54eb3`, read-only, the same
revision as [3D-01](../../verification/3D-01.md); geoviewer (GV) facts are taken from 3D-01 (`95527b8`), not re-read.

## Context

Facts:

- [D] D-17: the server-only kernel `geo-model3d` (P4), its service, ADRs and fixtures live here; the client parts
  (`geo-render/model3d`, 3DQM tools, `plans/3dqm`, remote kernel port) are built in SC. The `model3d` contracts
  (model, commands, patch, lineage, validation report, error registry, tolerance profile; row 3D-06) cross that
  boundary, so one location must be authoritative (Q-08). AGENTS.md §2.7: a shape that crosses a boundary is a JSON
  Schema 2020-12 before it is code.
- [D] D-24: P4 isolation is proven on build output: the kernel carries a unique canary marker; CI builds every client
  bundle and fails if the marker appears (Q-09 asks the marker format and which bundles each repository scans).
- [D] D-31: the kernel service is planned to move into SC (Tools Plane) later; the move must be a relocation, not a
  rewrite. [D] D-33: the service ships as its own container image built here. Q-14 (P4 code inside SC) stays open.
- [V] SC already owns a pinned-copy mechanism for a foreign contract: Operaflow's schema is copied byte for byte into
  `SC contracts/vendor/operaflow/`, with `provenance.json` holding `repository`, `revision` (full SHA) and per file
  `donorPath` + `sha256` (`SC contracts/vendor/operaflow/provenance.json:1-20`, `README.md:1-7`). The same pattern is
  used for the seameditor donor schemas (`SC contracts/provenance.json`, `contracts/README.md` "Scope and provenance").
- [V] SC's own schemas use repository-neutral ids `urn:geoiplus:schema:<name>:v1` (`SC contracts/camera.schema.json:3`;
  `contracts/README.md` "Library-owned drafts").
- [V] SC ships its contract data to clients through `geo-core/contracts`: `tools/sync-contract-assets.js:11` copies
  `contracts/*.schema.json` into `packages/geo-core/src/contracts/schemas/`, but **excludes `contracts/vendor/`**.
- [V] SC publishes only `@geoiplus/ui`, `@geoiplus/ui-geo`, `@geoiplus/ui-lint` to CodeArtifact (`SC infra/README.md`,
  "Its role"); the stack is built but not deployed. `geo-core`, `geo-render`, `workspace`, `plans` are
  `"private": true`, version `0.0.0` (`SC packages/geo-core/package.json:3-4` and the others). GV has no `@geoiplus/*`
  dependency and no registry credentials (3D-01 §5). A registry-based contract package therefore has no consumer today.
- [V] SC rejects P4 by path and module card only: `SC tools/check-architecture.js:67` (`server`/`server-only`/`p4` path
  segments under `packages|plans|apps`), `:68-69` (card with protection P4), `:77` (registry levels P0-P3 only).
  SC states that source-graph checks do not validate emitted chunks; that belongs to the build, WP-30
  (`SC build/README.md:8-9`); WP-30 is not started (`SC docs/BACKLOG.md:187`, status empty).
- [V] Browser-reachable outputs today: SC `npm run storybook:build` -> `.cache/storybook` (`SC .github/workflows/check.yml`),
  `apps/react-samples` (`vite build`, `next build`; `SC apps/react-samples/package.json:10-13`), the packed tarballs of
  the three published packages (`SC tools/pack/check.js:1-6`), and private packages consumed as ESM source. GV: Vite
  client build `apps/viewer-web/client/dist`, which the image ships (3D-01 §3 #11, `GV Dockerfile.viewer:25-41`). The
  GV server legitimately runs the kernel as the test host (D-07).
- [V] Exchange extension URIs name the content, never a product (3D-01 §6.3; SC D-22). This governs the 3DQM CP
  extension (3D-43), not schema `$id`s or folder names; noted so the two are not confused.

## Options

### Q-08 - where the `model3d` schemas live

| Option | Consequences | Risk |
|---|---|---|
| **A. Authoritative here** (`contracts/model3d/`); SC (and GV if it ever needs them) consumes a byte-for-byte copy pinned to a commit of this repository, recorded in `provenance.json`, exactly as SC does for Operaflow | Kernel and its contract change in one PR, next to golden fixtures and the tests that prove them (3D-06/07 stay here). SC gets a new vendor folder plus a hash check; an update there is a deliberate row that bumps the revision. No registry or credentials needed. Matches D-17 (kernel owns its semantics) | Copies drift if nobody bumps the pin: mitigated by the pin being explicit and the hash check failing on any edit. Vendored files are not shipped by `sync-contract-assets.js:11` today, so the SC row must decide how client code loads them |
| B. Authoritative in SC (`contracts/model3d/`); this repository vendors the pinned copy | Fits SC's contract tooling (types generation, examples) and the later move (D-31) without a change of owner. But every kernel contract change becomes an SC row under SC's rules and review before the kernel can use it; 3D-06 and parts of 3D-07 move to SC | The producer of commands/patches/validation reports cannot change its own interface; slows G1-G3 where the contract is still being learned |
| C. Authoritative here, published as an npm package to CodeArtifact, consumers pin the version | Standard semver pinning, no copies | Needs publishing infrastructure SC built only for three UI packages and has not deployed; GV has no registry access (3D-01 §5). Premature now; A can switch to C later without changing ids |
| D. A separate contracts repository | Neutral owner | A third repository to keep in sync, with no consumer that needs it; adds a pin on both sides |

### Q-09 - canary marker and what is scanned

| Option | Consequences | Risk |
|---|---|---|
| **1. Pattern canary.** Each P4 package carries `geoiplus-p4-canary:<package>:<32 lowercase hex>`; scanners in every repository match the **pattern**, not the value; a negative control here proves the marker survives a minified browser build | SC and GV need no 3DQM-specific value and catch any future P4 package unchanged. The marker format is the only cross-repository contract; each repository keeps its own ~30-line scanner (no shared code, no registry) | A false positive needs the literal pattern in client output, which only P4 code or a deliberate copy produces |
| 2. Exact-value canary; scanners hold the value | Narrower match | Each new P4 package or value change edits every scanner in every repository |
| 3. Dependency rules only (no output scan) | Cheapest | Contradicts D-24; SC itself says source checks do not validate emitted chunks (`SC build/README.md:8-9`) |
| 4. One scanner package published from here | One implementation | Needs a registry consumer that does not exist (see Q-08 C); couples SC/GV CI to this repository |

## Decision

Accepted (owner, dialog, 2026-11-19, D-37): **Q-08 option A** and **Q-09 option 1**, as specified below.

### Q-08: authoritative location and pinned consumption

1. The only authoritative copy is `contracts/model3d/` in this repository (row 3D-06 becomes `repo: here`).
2. Schema ids are repository-neutral, following SC's convention: `urn:geoiplus:schema:model3d-<name>:v<major>`. The id
   does not change when files move (D-31). A breaking change takes a new major id; the previous one stays until every
   pinned consumer has moved.
3. A consumer pins a **full commit SHA** of this repository. It copies the needed files byte for byte into a vendor folder
   named after the source repository (in SC: `contracts/vendor/3deditor/`, beside `vendor/operaflow/`) with a
   `provenance.json` in SC's existing format (`repository`, `revision`, `files[{file, donorPath, sha256}]`). The
   consumer's CI fails if a file's hash differs from its provenance entry. Updating is a row in the consumer
   repository that changes `revision` and the copies together.
4. How SC client code loads the vendored schemas (types generation, packaging into `geo-core/contracts`, which today
   skips `contracts/vendor/`) is decided by the SC mirror row, under SC's rules. GV consumes `model3d` shapes only
   through SC packages; if it ever needs the schemas, the same mechanism applies.
5. Option C (registry package) remains a later upgrade with the same ids, once a deployed registry has consumers.

### Q-09: marker format

1. Literal: `geoiplus-p4-canary:<package>:<id>`; `<package>` is the unscoped package name (`geo-model3d`), `<id>` 32
   lowercase hex characters (128 bit) drawn once from a CSPRNG at 3D-05 and never changed. Scanner pattern (all
   repositories): `geoiplus-p4-canary:[a-z0-9-]+:[0-9a-f]{32}`. The characters need no escaping in JS, JSON, HTML or
   source maps, so minifiers keep the literal intact.
2. Placement: a `canary` module in the P4 package exports the literal and is imported by **every entry point** listed in
   the package's `exports` map (the only way in; deep imports are closed by `exports`). It is declared in
   `package.json` `sideEffects` so tree shaking keeps it. The kernel's `check:arch` (3D-05) fails if any `exports`
   target does not import it. Documentation may state the format but never the value.
3. The marker is expected in server artefacts (the service image, D-33; the GV server as test host, D-07) and is not
   scanned there.

### Q-09: what each repository scans (CI, after its builds)

| Repository | Scanned | Expectation |
|---|---|---|
| here | **Negative control**: each `exports` entry of `geo-model3d` bundled for the browser with Vite, minified, source maps on | marker **present** in every output; otherwise the canary is broken and CI fails. Without this control a clean scan elsewhere proves nothing |
| here | Any browser-facing output this repository might produce (none is planned, D-17) | marker absent |
| SC | Every browser-reachable output: `.cache/storybook`; `apps/react-samples` builds; the unpacked tarballs of the published packages (the `pack:check` temporary project); every later app or workplace build (`apps/orthoqm` WP-28, `plans/3dqm`, WP-30 protected chunks); the source trees `packages/`, `plans/`, `apps/` (private packages ship as source); `.map` files included | marker absent; plus a dependency rule: no `geo-model3d` in any SC `package.json` or `package-lock.json` |
| GV | `apps/viewer-web/client/dist` after `vite build`, including `.map` files | marker absent; the server tree is not scanned (D-07) |

Limits, stated plainly: the canary detects bundled kernel code, not kernel logic re-typed into a client by hand; that
remains covered by review, SC's path/card rules (`check-architecture.js:67-69`) and D-06.

### Relocation path (D-31, Q-14) - kept open, not decided

If the service later moves into SC, `contracts/vendor/3deditor/` becomes SC's authoritative `contracts/model3d/` with the
same ids, and this repository becomes the consumer or is retired; SC's scanners need no change because they match the
pattern; the kernel's own negative control moves with it. What SC must change (`check-architecture.js:67` path rule, the
P0-P3 registry, a location for server-only code) is SC's ADR before the move (Q-14).

## Checks

- Here (3D-05): `check:arch` verifies every `exports` target of `geo-model3d` imports the canary module; the negative
  control build finds the marker in every entry bundle; a scan of any client output finds none.
- Here (3D-06): every schema `$id` matches `urn:geoiplus:schema:model3d-<name>:v<n>`; schemas only under `contracts/model3d/`.
- SC (mirror row): provenance hash check of `contracts/vendor/3deditor/`; pattern scan of the outputs listed above;
  dependency rule against `geo-model3d`.
- GV (mirror row): pattern scan of `apps/viewer-web/client/dist`.
