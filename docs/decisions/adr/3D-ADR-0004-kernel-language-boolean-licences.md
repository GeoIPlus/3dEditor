# 3D-ADR-0004: kernel language, Boolean library and licences (ADR-001)

- Status: accepted (owner, 2026-11-23, D-3D08-1)
- WP: 3D-08   Questions closed: Q-01

## Context

- [D] v0.3 §3 (`fullSpecsV0.3.md:95`): kernel language "Rust or C++" and the Boolean library are ADR-001, decided by a
  spike in G0. HANDOVER §5 (`HANDOVER-3DQM.md:77`): both repositories are JavaScript ESM with JSDoc; proposal = kernel in
  JavaScript on Node, same protection (server-only), latency is the only open risk. Q-01: "decided by measurement".
- [D] The kernel is server-only (P4; D-06, D-07); no WASM build for browsers; a missed latency target goes to the owner,
  never to the client. AGENTS.md §2 rule 8: JS ESM + JSDoc checked by `tsc --checkJs` until this ADR.
- [D] Boolean scope in P0 (`fullSpecsV0.3.md:433`, module 15 K-12): only plane-plane, face-half-space, and union of a
  prism with the shell (installations). Planes are primary (D-08).
- [V] Measurement (3D-08, [verification note](../../verification/3D-08.md), rig of
  [3D-ADR-0006](3D-ADR-0006-bench-rig-and-scenes.md)): MOVE_EDGE server PREVIEW in JavaScript on Node v22.23.5, full
  service path including schema validation of request and reply:

  | Scene | Faces | p50 ms | p95 ms | worst-run p95 ms | max ms |
  |---|---:|---:|---:|---:|---:|
  | GT-03 | 7 | 0.123 | 0.282 | 0.365 | 3.296 |
  | sawtooth-199 (gate) | 199 | 3.447 | **5.411** | 5.798 | 21.023 |
  | sawtooth-499 (D-94) | 499 | 12.832 | 18.731 | 18.912 | 46.812 |

  Target 150 ms: the gate p95 uses 3.6 % of it. The spike does less than the final kernel (stage-1 solve only, a
  subset of FAST_PREVIEW checks), so the margin, not the absolute number, is the result.
- [V] Licences, `npm view <pkg> license version` on 2026-11-23: `manifold-3d` Apache-2.0 (3.5.5); `opencascade.js`
  LGPL-2.1-only (1.1.1); `robust-predicates` Unlicense (3.0.3); `ml-matrix` MIT (6.15.1); `earcut` ISC (3.2.4);
  `clipper2-js` Boost Software License (1.2.4); `@jscad/modeling` MIT (2.13.0); `three-bvh-csg` MIT (0.0.18, built on
  three.js: excluded by AGENTS.md §2 rule 10). [A] not verified in this WP: CGAL is GPL-3+ (some packages LGPL-3+) or
  commercial; Open CASCADE Technology (C++) is LGPL-2.1 with an exception.

## Options - language

| Option | Consequences | Risk |
|---|---|---|
| L1. **JavaScript ESM + JSDoc on Node** (`tsc --checkJs`) | One toolchain with `shared_compnents` and geoviewer; runs in the geoviewer test host and the service image unchanged (D-07, 3D-ADR-0002); measured 27x under the target | Floating-point robustness must be earned (robust predicates, tolerances); a heavier kernel could erode the margin |
| L2. Rust (napi-rs addon in the Node service, or its own service) | Speed, memory safety | Second toolchain and build matrix in the image; FFI boundary for every model; nothing measured needs it |
| L3. C++ with OCCT or CGAL | Mature B-Rep / Boolean libraries | Licences (LGPL / GPL or commercial); OCCT/CGAL are not plane-primary; second toolchain |

## Options - Boolean (P0 scope only)

| Option | Consequences | Risk |
|---|---|---|
| B1. **Own planar operations in the kernel**: plane-plane intersection, clipping of a face polygon by a half-space in its own plane, prism-shell union built from those, with robust 2D/3D orientation predicates | Speaks plane terms (D-08) and canonical ids/lineage directly; no dependency; small, testable surface | Our code must handle degeneracies (touching, coplanar); covered by 3D-20 golden tests GT-17/18 |
| B2. `manifold-3d` (Apache-2.0) as WASM inside the Node service | Robust general mesh Booleans | Triangle-mesh based: results must be re-planarised and re-mapped to faces/ids; heavy for three P0 cases |
| B3. OCCT via `opencascade.js` (LGPL-2.1-only) | Full B-Rep Booleans | LGPL obligations for the service image; large WASM; not plane-primary |

## Decision

1. **L1**: the kernel stays JavaScript ESM + JSDoc on Node (closes Q-01). AGENTS.md §2 rule 8 then cites this ADR
   instead of "working rule". Reopen trigger [P]: the gate scene's p95 in any later bench (3D-ADR-0006 step 5) above
   50 ms (one third of the target) -> profile, then owner dialog before any language change.
2. **B1** for P0: no third-party Boolean library. A general Boolean beyond K-12 P0 needs its own ADR (B2 is the first
   candidate: permissive licence, server-side WASM is allowed by D-06).
3. **Licences** [P]: the kernel and the service image use only permissive licences (MIT, ISC, BSD-2/3, Apache-2.0,
   Unlicense, BSL-1.0); no GPL, LGPL or AGPL code. Every new runtime dependency of the kernel needs an ADR (as
   STRUCTURE.md §2 rule 4 for packages). Candidate helper for B1: `robust-predicates` (Unlicense), decided in 3D-09.

## Checks

- `npm run bench` (3D-ADR-0006) re-measures the trigger of decision 1.
- Today `packages/geo-model3d/package.json` has no dependencies [V]. A mechanical licence allow-list check (e.g. in
  `check:arch`) does not exist yet: proposed as an intake row, not built in 3D-08.
