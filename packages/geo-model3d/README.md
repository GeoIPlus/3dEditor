# @geoiplus/geo-model3d

- Status: planned (empty skeleton from 3D-05; layout decided by 3D-02, code from 3D-09)
- Protection: P4 - server-only (D-06, D-07); never in a browser bundle, no DOM, no three.js (AGENTS.md §2)
- WP: 3D-05 (bootstrap)   Spec: `docs/specs/3dqm-spec.md` (3D-04, not written yet)
- Source/donor: new; licence of third-party code: none (proposed rule: permissive only, 3D-ADR-0004)
- Spike: `spike/move-edge/` (3D-08), throwaway, not exported; see its [card](spike/move-edge/README.md)

## Purpose
Geometry kernel for editing LoD2 building models (planes primary, vertices derived, D-08). Runs in Node unchanged.

## Public API (index.js)
- `P4_CANARY` - the canary literal (format `geoiplus-p4-canary:geo-model3d:<32 hex>`, [3D-ADR-0001](../../docs/decisions/adr/3D-ADR-0001-contracts-location-and-p4-canary.md)).
  Exported so tests and the service can assert it; client code must never reach it.

## Rules and invariants
- Every target of `package.json` `exports` imports `./src/canary.js`; `canary.js` is listed in `sideEffects`.
- Enforced by `npm run check:arch`: kernel files import no DOM globals and no `three`; no source file over 300 lines;
  only `packages/geo-model3d/`, `services/` and `tools/` may import the package; the negative control builds each
  entry for the browser (Vite, minified, source maps) and requires the marker in every output.

## Tests and golden tests
- `test/canary.test.js`: marker format, entry exports it. Golden tests: none yet (3D-07).
