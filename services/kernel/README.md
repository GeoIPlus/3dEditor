# services/kernel

- Status: implemented in part - points port and LAS-whole adapter (3D-22), COPC-by-box adapter (3D-70); handler, server,
  other ports: 3D-23
- Protection: P4 (server-only host of the kernel; never in a browser bundle)
- WP: 3D-22 (points), 3D-70 (COPC)   Spec: [docs/specs/3dqm-spec.md](../../docs/specs/3dqm-spec.md) §9, §11
- Source/donor: new; LAS layout from the ASPRS LAS Specification 1.4 R15 (2019); COPC layout from the COPC 1.0
  specification (copcio/copcio.github.io @a6336f7)
- Runtime dependencies: `laz-perf` 0.0.7 (Apache-2.0, WASM; LAZ chunk decoder only), [3D-ADR-0009](../../docs/decisions/adr/3D-ADR-0009-copc-laz-decoder.md)

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
- `src/adapters/copc-points.js` - `createCopcPointsAdapter({ path, openSource?, decode? })`: one local COPC 1.0 file;
  the header is read once, each query reads the hierarchy pages and decodes only the nodes whose cube meets the box
  (`decodeChunk`, `laz-perf`), then filters exactly (`inBox`). Positional reads, one file handle per query.
- `src/adapters/copc-format.js` - `readCopcHeader`, `readPage`, `nodeCube`, `boxesMeet`, `selectNodes(readRange, h, box)`
  (child pages read only when their key meets the box); refusals are `LasFormatError`.
- `src/cloud-points.js` - `worldBoxOf(frame, cloudCrs, selection)`, `readLocalPoints(dataset, frame, selection)`
  with `PointsDataset { port, horizontalCrs }` (3D-69, D-196): LOCAL `PointSelection` (D-132) -> box of the
  dataset's world -> port -> LOCAL points for `fitPlane` / `deviationStats` (kernel `localBoxToCloud`, `cloudToLocal`).

## Rules and invariants
- The dataset's horizontal CRS comes from its descriptor, set by the host from the CP 3DQM extension `dataset` member
  (SC 3D-43) or from the CRS the user set when opening it (D-165, D-196); adapters never read the file's CRS records.
  Another horizontal CRS than the building's is reprojected by the kernel (D-164), on the same datum only (D-197);
  the dataset shares the building's vertical CRS (D-93).
- Mapping `LasFormatError` and read failures to the error registry is 3D-23's (wire binding) - `TBD`.
- LAS whole: the whole file is held in memory (interim). COPC: only header, pages and meeting chunks are read.
- Node cubes: root = info VLR centre +/- halfsize (spec text); below it EPT key naming [A] (copclib 2.6.3 derives
  cubes from the LAS header bounds instead; this reader follows the spec).
- `fitPlane` (RANSAC) depends on the input point order: the same points from the LAS and the COPC adapter can give
  different inlier counts (GT-20: 444 vs 439, both inside the golden bounds).
- `laz-perf` is used only here, never in `packages/geo-model3d` (3D-ADR-0009, D-109).

## Tests and golden tests
`test/points.test.js` (Vitest `unit`): LAS 1.0/1.2/1.3/1.4 x formats 0, 1, 3, 5, 6, 10 written in memory by
`test/las-writer.js` (no committed binaries), refusals (LAZ bit, signature, truncation, short record, version, short
file), port contract, single read and retry, abort, rotated-frame world box, plane fit through the port.
`test/copc-format.test.js`: header refusals, cubes, pages, node selection and child-page pruning on synthetic bytes.
`test/copc.test.js`: committed COPC files `test/data/gt-20.copc.laz`, `gt-21.copc.laz` (D-140; built by
`tools/copc-fixture/make_copc.py`): equality with the LAS copy over six boxes, decoded-node counts, GT-20 / GT-21
through the adapter, no `laz-perf` in the kernel.
`test/cloud-crs.test.js` (3D-69): GT-I1 in EPSG:4937 vs EPSG:25832 with one generated UTM cloud (seeded, 10 %
outliers): `FIT_PLANE` planes agree within 1.1e-6 m, heatmap values within 2.8e-4 m (`planarTolM` 0.02); same-CRS path
bit for bit; WGS 84 cloud over ETRS89 building -> `INVALID_CRS` `DATUM_MISMATCH`.
Golden GT-20 / GT-21 run on the kernel functions (`packages/geo-model3d/test/golden/`).
