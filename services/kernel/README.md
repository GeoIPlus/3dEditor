# services/kernel

- Status: implemented in part - points port and LAS-whole adapter (3D-22), COPC-by-box adapter (3D-70); `history` port,
  memory and file store, COMMIT path, command status (3D-23); command API: 3D-23.1; handler, server, auth, `datasets`:
  3D-23.2; S3 store: 3D-23.3
- Protection: P4 (server-only host of the kernel; never in a browser bundle)
- WP: 3D-22 (points), 3D-70 (COPC), 3D-23 (history, COMMIT)   Spec: [docs/specs/3dqm-spec.md](../../docs/specs/3dqm-spec.md) §9, §11
- Source/donor: new; LAS layout from the ASPRS LAS Specification 1.4 R15 (2019); COPC layout from the COPC 1.0
  specification (copcio/copcio.github.io @a6336f7)
- Runtime dependencies: `laz-perf` 0.0.7 (Apache-2.0, WASM; LAZ chunk decoder only), [3D-ADR-0009](../../docs/decisions/adr/3D-ADR-0009-copc-laz-decoder.md)

## Purpose
Host of `geo-model3d` (3D-ADR-0002 C2, D-51): all I/O and ports live here, the kernel stays pure. 3D-22 adds the
points port (box query) with the interim "LAS whole" adapter (D-35, D-133).

## Public API
No `index.js` yet (the handler `createKernelHandler(ports)` is 3D-23.2). Modules:
- `src/ports/history.js` - `ObjectStore { create(key, value) -> boolean, get(key), list(prefix) }` (append-only:
  create-if-absent is the only write), `HistoryPort` (3D-ADR-0003 §3: `putBaseline`, `readBaseline`, `head`,
  `readVersion`, `readJournal`, `commit`, `findCommand`, `recordResult` = ADR `recordRejection`), `keys` (layout of
  ADR §2 with `snapshot/{N}/{commandId}.json`, D-3D23-5), `segment` (ids percent-encoded into one key segment).
- `src/history.js` - `createHistory(store)`: the port over a store; `resultOfEntry(entry)`: the COMMITTED
  `command-result` of a journal entry (the kernel's COMMIT result has exactly these members).
- `src/adapters/memory-store.js` - `createMemoryStore()`; `src/adapters/file-store.js` - `createFileStore({ root,
  settleMs? })`: exclusive create (`wx`), `get` re-reads a file another writer is still filling for up to `settleMs`.
- `src/commit.js` - `createCommitService({ history, toleranceProfile, clock, newOperationId?, pointsFor? })` ->
  `{ commit(command, { actorId }), status(projectId, commandId) }`; replies `{ httpStatus, body }` with a contract
  `command-result`, `command-status` or `error` body.
- `src/errors.js` - `HTTP_STATUS` (spec §2.4), `errorKey`, `errorReply(code, entityIds?, message?)`.
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
  `commandPoints(dataset, model, command)` (3D-71): for `FIT_PLANE` the LOCAL points of the payload `selection`, passed
  as `executeCommand(model, command, { points })`; `undefined` for other operations; a selection without finite bounds
  reads nothing (empty array, the kernel refuses `INVALID_PAYLOAD`).

## Rules and invariants
- COMMIT order (spec §11 r3, r4; GT-13): stored reply of `(projectId, commandId)` (record, else `journal/{expectedVersion
  + 1}` when the record write was lost) -> head; `expectedVersion != head` -> `409 VERSION_CONFLICT` by the service,
  before the kernel (spec §3 r1) -> `executeCommand` on the head version (history kinds get the journal, the baseline
  and the authenticated actor, D-291..D-294) -> snapshot `snapshot/{N+1}/{commandId}`, then create-if-absent
  `journal/{N+1}` (the only commit point), then `cmd/{commandId}`. Lost race -> rerun on the new head -> 409.
- Every reply that changed nothing (REJECTED, CONFLICT, a `noChange` COMMIT, D-301) is stored, so a repeat returns it;
  a conflicting `commandId` is never re-applied (v0.2 D.4): the client sends a new one.
- The envelope's `actorId` is replaced by the authenticated user before the kernel runs (spec §11 r1); journal entries
  get `operationId` (UUID unless injected, Q-26) and that `actorId`.
- A version is a full snapshot (K = 1): journal patches hold no model-level members (`state`, Q-31). Snapshots of lost
  commits stay as orphans; nothing is deleted (D-84). `check:arch` `storeAppendOnly` refuses delete / rename /
  truncate / overwrite calls in `src/adapters/*-store.js`.
- `IN_PROGRESS` status is known only to the instance that runs the command (single instance, 3D-ADR-0003 §3).
- [A] File store: a process killed inside the one write after the exclusive create leaves a truncated file; `get`
  throws after `settleMs` (store damage, never guessed). Dev / tests / GV test host only; production is S3 (3D-23.3).
- The dataset's horizontal CRS comes from its descriptor, set by the host from the CP 3DQM extension `dataset` member
  (SC 3D-43) or from the CRS the user set when opening it (D-165, D-196); adapters never read the file's CRS records.
  Another horizontal CRS than the building's is reprojected by the kernel (D-164), on the same datum only (D-197);
  the dataset shares the building's vertical CRS (D-93).
- Mapping `LasFormatError` and read failures to the error registry is 3D-23.1's - `TBD`.
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
`test/fit-plane-command.test.js` (3D-71): GT-20 at a UTM origin through an in-memory port: world box of the
selection, the committed measurement equals the LOCAL fit; other operations and bad selections read nothing.
`test/history.test.js` (3D-23): the port contract suite `test/history-contract.js` on the memory and the file store
(concurrent commits on one version, repeat, crash after the journal write, baseline twice, no overwrite, 8-way create
race), key encoding, file settle. `test/commit.test.js`: journal entry with operationId and authenticated actor,
UNDO / REDO / RESTORE_BASELINE through the service, refusal and noChange write nothing, stale version before an
operation the kernel lacks, concurrent commits (file store) and concurrent repeat, status DONE / IN_PROGRESS / 404;
every reply validated with Ajv. `test/gt-13.golden.test.js`: GT-13 on both stores (`npm run golden`).
Golden GT-20 / GT-21 run on the kernel functions (`packages/geo-model3d/test/golden/`).
