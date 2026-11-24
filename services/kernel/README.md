# services/kernel

- Status: implemented in part - points port and LAS-whole adapter (3D-22); handler, server, other ports: 3D-23
- Protection: P4 (server-only host of the kernel; never in a browser bundle)
- WP: 3D-22 (points)   Spec: [docs/specs/3dqm-spec.md](../../docs/specs/3dqm-spec.md) §9, §11
- Source/donor: new; LAS layout from the ASPRS LAS Specification 1.4 R15 (2019); no third-party runtime code

## Purpose
Host of `geo-model3d` (3D-ADR-0002 C2, D-51): all I/O and ports live here, the kernel stays pure. 3D-22 adds the
points port (box query) with the interim "LAS whole" adapter (D-35, D-133).

## Public API
No `index.js` yet (the handler `createKernelHandler(ports)` is 3D-23). Modules:
- `src/ports/points.js` - `PointsPort { queryBox(box, { signal }) -> Promise<Float64Array> }`: points in an inclusive
  world box of the dataset CRS, x y z interleaved, full source precision (spec §9 r7); `isPointsPort`, `inBox`.
- `src/adapters/las-points.js` - `createLasPointsAdapter({ path, read? })`: reads one uncompressed LAS 1.0-1.4 file
  (formats 0-10) once, filters in memory; a failed read is retried on the next query.
- `src/adapters/las-format.js` - `readLasHeader`, `readLasXyz`, `LasFormatError` (LAZ / COPC refused: decoder is a
  later row, D-133).
- `src/cloud-points.js` - `worldBoxOf(frame, selection)`, `readLocalPoints(port, frame, selection)`: LOCAL
  `PointSelection` (D-132) -> world box -> port -> LOCAL points for `fitPlane` / `deviationStats`.

## Rules and invariants
- The dataset is in the building's horizontal CRS and shares its vertical CRS (D-93); the adapter does not read the
  CRS records of the file. Projected CRS frames only (as `worldToLocal`); another CRS is 3D-69 (D-126).
- Mapping `LasFormatError` and read failures to the error registry is 3D-23's (wire binding) - `TBD`.
- The whole file is held in memory (interim; COPC by box replaces it for large clouds).

## Tests and golden tests
`test/points.test.js` (Vitest `unit`): LAS 1.0/1.2/1.3/1.4 x formats 0, 1, 3, 5, 6, 10 written in memory by
`test/las-writer.js` (no committed binaries), refusals (LAZ bit, signature, truncation, short record, version, short
file), port contract, single read and retry, abort, rotated-frame world box, plane fit through the port.
Golden GT-20 / GT-21 run on the kernel functions (`packages/geo-model3d/test/golden/`).
