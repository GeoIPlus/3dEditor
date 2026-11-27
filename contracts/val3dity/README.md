# contracts/val3dity

- Status: **accepted** by the owner in a dialog, 2026-11-26 (D-18; D-3D74-5). Shape D-3D74-3, parameters D-3D74-4.
- Protection: none. Service-internal: the kernel service <-> the val3dity image (3D-74). Not part of the public
  `contracts/model3d/` set and not in spec §2; consumers (SC, geoviewer) do not vendor it.
- WP: 3D-74   ADR: [3D-ADR-0008](../../docs/decisions/adr/3D-ADR-0008-val3dity-binding.md)

## Schemas (`$id` `urn:geoiplus:schema:val3dity-<name>:v1`)

| `<name>` | Message |
|---|---|
| `validator` | reply of `GET /version`; `validator` member of every validate reply: name, version, pinned commit, CGAL / GEOS / Boost |
| `validate-request` | body of `POST /validate`: `document` (CityJSON of one exported building), `parameters` (`snapTolM`, `planarityD2pTolM`, `planarityNormalsTolDeg`) |
| `validate-response` | reply 200: `validator` + val3dity's own `report` (members the adapter reads are required; others allowed) |
| `error` | any other reply: `BAD_REQUEST` 400, `NOT_FOUND` 404, `PAYLOAD_TOO_LARGE` 413, `VALIDATOR_FAILED` 500, `VALIDATOR_TIMEOUT` 504 |

Examples: `examples/<name>.json` (`valid`, `invalid` with `why`), tested by `test/schemas.test.mjs`.

## Rules
- The adapter checks its request and every reply; a reply outside the contract, any non-200 reply, a refused
  connection, a timeout or another val3dity version / commit than the pin is a port failure -> `503 UNAVAILABLE`,
  model unchanged (D-3D74-5).
- The val3dity error `id` (`coid=..|geom=..|shell=..|face=..`) is val3dity's string; the adapter parses it
  (`services/kernel/src/adapters/val3dity-ids.js`).
