# @geoiplus/geo-model3d

- Status: planned (empty skeleton from 3D-05; layout decided by 3D-02, code from 3D-09)
- Protection: P4 - server-only (D-06, D-07); never in a browser bundle, no DOM, no three.js (AGENTS.md §2)
- WP: 3D-05 (bootstrap)   Spec: `docs/specs/3dqm-spec.md` (3D-04, not written yet)
- Source/donor: new; third-party runtime code: `proj4` 2.23.0 (MIT; deps `mgrs` 1.0.0 MIT, `wkt-parser` 1.9.0 MIT), used by
  `src/crs/` only ([3D-ADR-0004](../../docs/decisions/adr/3D-ADR-0004-crs-transform.md), proposed); `src/crs/epsg-table.json`
  generated from PROJ 9.8.1 `proj.db` (EPSG v12.029; EPSG terms of use: Q-3D32-1)

## Purpose
Geometry kernel for editing LoD2 building models (planes primary, vertices derived, D-08). Runs in Node unchanged.

## Public API (index.js)
- `P4_CANARY` - the canary literal (format `geoiplus-p4-canary:geo-model3d:<32 hex>`, [3D-ADR-0001](../../docs/decisions/adr/3D-ADR-0001-contracts-location-and-p4-canary.md)).
  Exported so tests and the service can assert it; client code must never reach it.

## Internal modules
- `src/crs/` (3D-32): `resolveCrs`, `createMetricFrame` (projected: translation; geographic: local ENU),
  `writeBackVertices` (untouched vertices keep file integers, D-70), `decodeVertex`; throws `CrsError` with code
  `INVALID_CRS`. Not in `index.js`; `import` / `export` (3D-10, 3D-11) call it. Spec §4a.

## Rules and invariants
- Every target of `package.json` `exports` imports `./src/canary.js`; `canary.js` is listed in `sideEffects`.
- Enforced by `npm run check:arch`: kernel files import no DOM globals and no `three`; no source file over 300 lines;
  only `packages/geo-model3d/`, `services/` and `tools/` may import the package; the negative control builds each
  entry for the browser (Vite, minified, source maps) and requires the marker in every output.

## Tests and golden tests
- `test/canary.test.js`: marker format, entry exports it.
- `test/crs/`: registry, ENU accuracy against closed-form ECEF and GeographicLib oracles, round trip of
  `test/crs/fixtures/gt-i1-epsg4937.cityjson.json` (made by `test/crs/make-fixture.mjs` from GT-I1). Golden tests: none yet (3D-07).
