# services/kernel

- Status: implemented in part - points port and LAS-whole adapter (3D-22), COPC-by-box adapter (3D-70); `history` port,
  memory and file store, COMMIT path, command status (3D-23); command API: PREVIEW store, COMMIT by `previewId`, rate
  and size limits, error mapping, contract validation (3D-109); handler, HTTPS server, auth / lease, heatmap request
  (3D-110); val3dity adapter of the `validate` port (3D-74); `datasets` port, memory and file byte store, save / deliver results (3D-128); QC (FINAL_VALIDATION request,
  approval), export gate, batch export, serving route of delivered bytes, `sources` port (3D-24); service import,
  `buildings` port, store adapter of `sources` (3D-133); S3 store: 3D-111
- Protection: P4 (server-only host of the kernel; never in a browser bundle)
- WP: 3D-22 (points), 3D-70 (COPC), 3D-23 (history, COMMIT), 3D-109 (command API), 3D-110 (handler, server, auth), 3D-128 (datasets), 3D-74 (val3dity adapter), 3D-24 (QC, export), 3D-133 (import)   Spec: [docs/specs/3dqm-spec.md](../../docs/specs/3dqm-spec.md) §9, §11
- Source/donor: new; LAS layout from the ASPRS LAS Specification 1.4 R15 (2019); COPC layout from the COPC 1.0
  specification (copcio/copcio.github.io @a6336f7)
- Runtime dependencies: `laz-perf` 0.0.7 (Apache-2.0, WASM; LAZ chunk decoder only), [3D-ADR-0009](../../docs/decisions/adr/3D-ADR-0009-copc-laz-decoder.md);
  `ajv` 8.18.0 + `ajv-formats` 3.0.1 (MIT; contract validation, D-351)

## Purpose
Host of `geo-model3d` (3D-ADR-0002 C2, D-51): all I/O and ports live here, the kernel stays pure. 3D-22 adds the
points port (box query) with the interim "LAS whole" adapter (D-35, D-133).

## Public API
No `index.js` yet; a host imports `src/handler.js` (GV test host, 3D-50) and the image `src/server.js`. Modules:
- `src/handler.js` (3D-110) - `createKernelHandler({ history, auth, leases, toleranceProfile, clock, now,
  pointsDataset?, newOperationId?, newPreviewId?, contracts? })` -> `(request) => Promise<reply>`; request
  `{ method, url, headers, body }` (body: stream, chunks, bytes or string), reply `{ status, headers, body }` (JSON
  string, `cache-control: no-store`). Routes (`src/routes.js`, D-404): `POST /api/projects/{p}/commands`
  (PREVIEW / COMMIT), `GET /api/projects/{p}/commands/{commandId}` (status), `POST /api/projects/{p}/heatmap`
  (`heatmap-request` -> `heatmap-result`), `GET /api/projects/{p}/buildings/{b}/model?version=N` (v0.2 D.1; head when
  no version; `state` reads `APPROVED` when the version has an approval, D-450). 3D-24 (src/qc-routes.js):
  `POST /api/projects/{p}/buildings/{b}/final-validation` (empty body -> `validation-report`),
  `POST /api/projects/{p}/buildings/{b}/approval` (`approval-request` -> `approval`), `POST /api/projects/{p}/export`
  (`export-request` -> `export-result`), `GET /api/projects/{p}/results/{sha256}` (delivered bytes,
  `application/json`). Any other route or method -> `404`. Optional ports for 3D-24: `externalValidator` (3D-74),
  `datasets`, `sources`, `publicBase`, `projectSettings` (`exportRequiresApproval`, default `false`, D-90). 3D-133:
  `POST /api/projects/{p}/buildings/{b}/import` (`import-request` `{}` -> `201 import-report`; operator + lease;
  `409 VERSION_CONFLICT` when the building has a baseline); needs the optional ports `datasets`, `sources` and
  `buildings`, else `503 UNAVAILABLE`.
- `src/server.js` - `createKernelServer({ handler, tls: { key, cert } })`: Node `https` (3D-ADR-0002 A.4), no
  framework; `nodeListener(handler)` for a host's own server. TLS material comes from the deployment (ADR-OPS).
- `src/ports/auth.js` - `AuthPort { authenticate(token) -> { actorId, roles } | undefined }`, `LeasesPort
  { current(projectId, buildingId) -> { leaseRef, leaseEpoch, holderId } | undefined }`, `ROLES` (`3dqm.production`,
  `3dqm.qa`), `LEASE_HEADER` (`X-3DQM-Lease: <leaseRef>;<leaseEpoch>`, D-403), `parseLeaseHeader`.
- `src/adapters/static-auth.js` - `createStaticAuth(tokens)`, `createMemoryLeases()`: dev, tests, GV test host. The CP
  token and lease adapters are later rows (Operaflow group A, 3D-25; grant 3D-62).
- `src/access.js` - `bearerToken`, `authenticate` (401), `requireRole` (403), `checkLease` (403), `ACTIONS`.
- `src/heatmap.js` - `heatmap({ history, toleranceProfile, pointsDataset }, projectId, request)`: the named version,
  points of the LOCAL selection through the building's dataset, kernel `deviationStats`.
- `src/ports/history.js` - `ObjectStore { create(key, value) -> boolean, get(key), list(prefix) }` (append-only:
  create-if-absent is the only write), `HistoryPort` (3D-ADR-0003 §3: `putBaseline`, `readBaseline`, `head`,
  `readVersion`, `readJournal`, `commit`, `findCommand`, `recordResult` = ADR `recordRejection`), `keys` (layout of
  ADR §2 with `snapshot/{N}/{commandId}.json`, D-318), `segment` (ids percent-encoded into one key segment).
- `src/history.js` - `createHistory(store)`: the port over a store; `resultOfEntry(entry)`: the COMMITTED
  `command-result` of a journal entry (the kernel's COMMIT result has exactly these members).
- `src/adapters/memory-store.js` - `createMemoryStore()`; `src/adapters/file-store.js` - `createFileStore({ root,
  settleMs? })`: exclusive create (`wx`), `get` re-reads a file another writer is still filling for up to `settleMs`.
- `src/ports/datasets.js` (3D-128; 3D-ADR-0003 §1, §4) - `DatasetsPort { read(ref) -> { bytes, entityTag } |
  undefined, save(ref, bytes, { ifMatch } | { ifNoneMatch: '*' }) -> { status: 'saved', entityTag } | { status:
  'precondition-failed' },
  putDelivered(p, bytes) -> { digest, created }, readDelivered(p, digest) }`; `ByteStore { create(key, bytes) ->
  boolean, get(key) }`; `sha256`, `entityTag` (interim tags `"{generation}.{sha256}"`), `datasetKeys`
  (`ds/{ref}/{n}.bin`, `p/{p}/delivered/{sha256}.bin`). `src/datasets.js` - `createByteDatasets(store)`: the port over
  a byte store, plus `createDataset(ref, bytes)` (generation 0; the DP's act, dev and tests only). `ifNoneMatch`
  creates generation 0 if absent; an `ifMatch` save checks the tag names the newest generation `n` with its digest and creates generation `n + 1` if absent: compare-and-swap
  without overwrite. `src/adapters/memory-datasets-store.js` - `createMemoryByteStore()`;
  `src/adapters/file-datasets-store.js` - `createFileByteStore({ root, settleMs? })`: exclusive create, bytes + SHA-256
  trailer, `get` re-reads a file still being filled.
- `src/results.js` (3D-128; OF `progress.md` at Operaflow@d2b679c) - `saveResult({ datasets, projectId, ref, bytes,
  basis })`, `basis` = what the read the results were made on showed: `tagged` -> `If-Match`, `absent` (not read, or
  404 / 410) -> `If-None-Match: *`, `untagged` -> `NOT_SAVED` `NO_ENTITY_TAG` (no `PUT` sent); `SAVED.entityTag` is
  the next basis; 412 -> `KEPT` `PRECONDITION_FAILED` + `digest` (bytes in the own store, not delivered);
  `deliverResult({ datasets, publicBase, projectId, bytes })` -> `{ digest, created, address }`;
  `deliveredAddress(publicBase, p, digest)` = `{publicBase}/api/projects/{p}/results/{sha256}` (https only, no
  credential, query or fragment; no pre-signed URL). Not wired into the handler: export action and the serving route
  are 3D-24's.
- `src/qc.js` (3D-24) - `createQc({ history, toleranceProfile, clock, externalValidator? })` -> `{ modelAt(p, b, n),
  finalValidation(p, b), approve(user, p, b, { expectedVersion }) }`; `passed(report)` = `isValidForTargetState` for
  `VALID_SOLID`. `src/export.js` - `createExport({ history, datasets, sources, publicBase, toleranceProfile,
  projectSettings? })` -> `{ exportBatch(p, { buildingIds }) }` -> `{ report, deliveries }`; `SKIP` reason keys [P].
  `src/qc-routes.js` - the four routes above. `src/ports/sources.js` - `SourcesPort { source(p, b) -> { cityjson,
  saveRef, basis } | undefined, put(p, b, source) -> boolean (create-if-absent), saved(p, b, entityTag) }`;
  `src/adapters/memory-sources.js` - `createMemorySources()` (`set`, tests); `src/adapters/store-sources.js` (3D-133,
  D-470) - `createStoreSources(objectStore)`: `p/{p}/doc/{sha256}.json` (document, shared by the buildings of one
  file), `p/{p}/b/{b}/source.json` (written once), `p/{p}/b/{b}/saved/{n}.json` (each `SAVED` tag; the highest is the
  basis); `sourceKeys`.
- `src/import.js` (3D-133; D-467..D-470) - `createImport({ history, datasets, sources, buildings, toleranceProfile })`
  -> `{ importOne(p, b) }`: head exists -> `409`; `buildings.locate` (none -> `404`) -> `datasets.read(inputRef)`
  (none -> `404`, not JSON -> `400`) -> basis from the `progress.save` read (D-430) -> kernel `importBuilding`
  (`ImportError` -> its code; `INVALID_CRS` via `failureReply`) -> `sources.put` -> `putBaseline` (the commit point;
  lost race -> `409`) -> `201 import-report`. A source left by a failed or a concurrent attempt is reused, so a baseline never lacks
  its source. The kernel import needs `toleranceProfile.id` (optional in the contract): hosts give profiles with
  an id. `src/ports/buildings.js` - `BuildingsPort { locate(p, b) -> { inputRef, cityObjectId?, saveRef } |
  undefined }`; `src/adapters/memory-buildings.js` - `createMemoryBuildings()` (`set`).
- `src/commit.js` - `createCommitService({ history, toleranceProfile, clock, newOperationId?, pointsFor? })` ->
  `{ commit(command, { actorId }, lookup?), status(projectId, commandId), execute(model, command), history }`;
  replies `{ httpStatus, body }` with a contract `command-result`, `command-status` or `error` body.
- `src/command-api.js` (3D-109) - `createCommandApi({ ...commit deps, now, newPreviewId?, contracts? })` ->
  `previewOf(result, baseVersion, previewId)`;
  `{ command(message, { actorId }, { authorize? }), commandBody(source, { actorId }, { declaredLength?, authorize? }),
  status(projectId, commandId),
  request(schemaName, message), previewCount() }`: the entry 3D-110's handler calls; every reply contract-validated.
- `src/contracts.js` - `createContractValidator({ dir? })` -> `{ names, check, request, command, reply }` over every
  `contracts/model3d/*.schema.json` (Ajv 2020, strict, formats; `CONTRACTS_DIR`, which the image must ship).
- `src/preview-store.js` - `createPreviewStore({ now, ttlMs?, perKey?, total?, newId? })`: `nextId`, `put`, `get`,
  `delete`, `size` (3D-ADR-0003 `putPreview` / `takePreview`). `src/rate-limit.js` - `createRateLimiter({ now })`
  `.admit(actorId, projectId, buildingId)`. `src/body.js` - `readJsonBody(source, { limit?, declaredLength? })`.
- `src/adapters/val3dity.js` (3D-74) - `createVal3dityValidator({ url, documentOf, timeoutMs?, fetch?, contractsDir? })`
  -> `{ validate({ model, tolerances }), version() }`: the `validate` external-validator port (3D-ADR-0008). Exports
  the model (`exportBuilding`, with the import document from `documentOf`), calls the val3dity image
  ([images/val3dity](../../images/val3dity/README.md)) over [contracts/val3dity](../../contracts/val3dity/README.md),
  returns `{ validatorVersion: 'val3dity 2.7.0', findings }`; `VAL3DITY_PIN`, `parametersOf(profile)` (D-447),
  `findingsOf`. Any image failure rejects with `PortUnavailableError` (-> `503 UNAVAILABLE`). `src/adapters/val3dity-ids.js`
  - `parseVal3dityId`, `entityIdsOf(model, errorId, featureId)` (face / shell / solid / semantic node by export nesting).
  Not wired into a route yet: the FINAL_VALIDATION / export route and the stored import document are later rows.
- `src/errors.js` - `HTTP_STATUS` (spec §2.4), `errorKey`, `errorReply(code, entityIds?, message?, details?)`,
  `PortUnavailableError` (3D-74), `failureReply(err)` (D-353; a kernel `CrsError` -> `422 INVALID_CRS` with `details.crsReason`, D-406).
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
  throws after `settleMs` (store damage, never guessed). Dev / tests / GV test host only; production is S3 (3D-111).
- The dataset's horizontal CRS comes from its descriptor, set by the host from the CP 3DQM extension `dataset` member
  (SC 3D-43) or from the CRS the user set when opening it (D-165, D-196); adapters never read the file's CRS records.
  Another horizontal CRS than the building's is reprojected by the kernel (D-164), on the same datum only (D-197);
  the dataset shares the building's vertical CRS (D-93).
- PREVIEW (3D-109): request validated (envelope, then the payload schema of its `operation`) -> rate 20/s per (user,
  building), sliding 1 s window, refused requests not counted (D-316) -> head -> `executeCommand` once on the head
  version in phase COMMIT: the stored outcome, and the reply derived from it by `previewOf` (D-355; `previewId` =
  UUID, Q-26). Nothing persisted;
  a refused PREVIEW stores nothing. Store: 10 min from creation (D-315), 20 per (user, building) and 2000 in all,
  oldest evicted (D-352); one instance only (3D-ADR-0003 §3).
- COMMIT with `previewId`: stored reply of `commandId` first (a repeat works after the preview is consumed) -> preview
  of another user / project / building, expired or evicted -> `404 NOT_FOUND`; other `operation`, `payload`,
  `targetState` or `coordinateFrame` -> `400 INVALID_PAYLOAD` (D-354; neither is stored) -> `expectedVersion` or the
  preview's version != head -> `409` (stored) -> the stored outcome is committed with the COMMIT's `commandId` and input;
  the kernel does not run again (spec §3 r3). The journal `timestamp` is the commit's; the validation report the
  preview's. The preview is dropped once a COMMIT decided on it.
- Body: bytes counted while reading, above 1 MiB (or a larger `Content-Length`) -> `413` before `JSON.parse` (D-317);
  not JSON -> `400`. Thrown failures: `LasFormatError` -> `500 INTERNAL`, read failure (Node system error code, abort,
  timeout) -> `503 UNAVAILABLE`, other -> `500` (D-353); an invalid reply is replaced by `500 INTERNAL`.
- Handler order (3D-110): route -> bearer token (`401 UNAUTHENTICATED`, before the body is read) -> role (spec §11 r2:
  commands need `3dqm.production`; status, heatmap and model read `3dqm.production` or `3dqm.qa`; else `403`) -> body
  (413 / 400) -> contract -> for a command: body `projectId` = path (`400`), then the lease (`403`) -> command API.
  The envelope's `actorId` is replaced by the token's user (spec §11 r1).
- Lease (D-69, D-403): the `X-3DQM-Lease` header must name the building's current `leaseRef` and `leaseEpoch` and
  the user must be its holder; missing or malformed header, no current lease, stale epoch or another holder -> `403
  FORBIDDEN` before anything is read or run (PREVIEW and COMMIT; a repeat of a stored COMMIT too). Nothing is stored.
- Not yet enforced here: building outside the signed assignment (spec §11 r1, GT-23, 3D-25); the export request's
  `buildingIds` are not checked against the assignment (3D-25). The status route answers any `commandId` of the
  project to a user with a role.
- QC (3D-24; spec §11 r8; D-450, -2, -5, -7): `FINAL_VALIDATION` runs on the head for target `VALID_SOLID`
  (`validateModel`, `fullSolid`, external port); the first report of a version is stored at
  `p/{p}/b/{b}/qc/{N}/final-validation.json` and a repeat returns it without calling the validator [A: deterministic
  per model and validator]; a validator failure stores nothing (`503` for a read failure, else `500`); no port ->
  `503`. Roles: operator and reviewer; no lease. Approval order: role `3dqm.qa` (`403`, before the body) -> body
  `approval-request` -> lease (`403`) -> unknown building (`404`) -> `expectedVersion != head` (`409`) -> the reviewer
  is the `actorId` of any journal entry (`403`; separation of duties is enforced here, the Operaflow format has none)
  -> stored approval of the head returned (written once) -> head not `VALID_SOLID` / no passed stored report -> `422
  NOT_APPROVABLE` (`details.approvalReason`) -> `qc/{N}/approval.json` create-if-absent. An approval makes no version
  and no journal entry; the next commit makes version N+1 without a mark, so the building reads its snapshot state again.
- Export (3D-24; spec §11 r9; D-453, D-457): reviewer only; per building of the request in order: unknown ->
  skipped `unknownBuilding`; state (snapshot or `APPROVED`) not `VALID_SOLID` / `APPROVED` -> `notValidSolid`; with
  `exportRequiresApproval` a `VALID_SOLID` -> `notApproved`; no passed stored report -> `noFinalValidation`; no source
  -> `noSource`; `exportBuilding` on the source document -> bytes (`JSON.stringify`) -> `saveResult` on the source's
  basis (`SAVED` -> `sources.saved`, the next basis; `NOT_SAVED` -> delivered with the reason; `KEPT` -> not delivered,
  skipped `saveKept`) -> `deliverResult`. Any thrown failure skips that building with `failed`; earlier deliveries and
  saves stay (D-84). One CityJSON file per building (the kernel writes one building per document, D-192).
- Heatmap: changes nothing, needs no lease; no dataset opened for the building or unknown version -> `404`; dataset CRS
  on another datum (D-197) or without a projection (D-198) -> `422 INVALID_CRS` (also for FIT_PLANE points).
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
every reply validated with Ajv. `test/command-api.test.js` (3D-109): PREVIEW -> COMMIT same patch without a second
kernel run, derived PREVIEW == kernel PREVIEW (edit, noChange, refusal, UNDO), competing COMMIT -> 409, D-354, expiry and eviction on an injected clock. `test/command-limits.test.js`:
one invalid message per schema -> 400, invalid reply -> 500, 429 on a sliding window, 413 before parsing, failure
mapping. `test/gt-13.golden.test.js`: GT-13 on both stores (`npm run golden`).
`test/handler.test.js` (3D-110): stale `leaseEpoch` -> 403 with head and journal unchanged (PREVIEW and COMMIT),
other lease failures, spoofed `actorId` committed as the token's user, 401 before the body is read, roles, routes,
model read, 413, PREVIEW -> COMMIT through the handler. `test/heatmap.test.js`: heatmap equal to the kernel on the
LOCAL points, another datum -> `422 INVALID_CRS` `DATUM_MISMATCH` (heatmap and FIT_PLANE, nothing committed), 404 /
400 / 401. `test/server.test.js`: COMMIT and status over a real TLS socket (openssl certificate made at test time),
401 / 413 on a body above 1 MiB, no start without TLS material. Bench through the handler: `npm run bench:handler`
(`tools/bench/handler.mjs`).
`test/qc.test.js` (3D-24): FINAL_VALIDATION stored and repeated, DRAFT not passing, validator failure, approval role
/ body / lease / 409 / 404 / 422 reasons / reviewer-author 403 / written once. `test/export.test.js`: gate reasons,
`exportRequiresApproval`, reviewer only, 503 unconfigured, failure skips one building, SAVED basis, KEPT, NOT_SAVED,
serving route. `test/gt-22.golden.test.js` (both stores), `test/gt-24.golden.test.js` (`npm run golden`).
`test/datasets.test.js` (3D-128): the port contract suite `test/datasets-contract.js` (run by every `datasets`
adapter, the CS adapter of 3D-63 too) on the memory and the file byte store: read with a strong tag, save with the
current tag, stale / unknown / weak tag and missing dataset -> 412 with nothing written, `If-None-Match: *` creates once, concurrent saves on one tag,
repeated bytes get a new tag, delivered bytes write-once and a second write of one digest a no-op; tag parsing, file
settle and damage. `test/results.test.js`: the Operaflow scenarios (`format/tests/scenarios/progress.json`) of
`location-saved-by-put`, `location-no-entity-tag-not-saved`, `save-not-2xx-kept` restated on the port, delivered address without query string, credential or fragment.
`test/import.test.js` (3D-133): GT-I1 through the handler -> `201 import-report`, version 0 `VALID_SOLID` with the
GT-I1 counts; second import -> 409 with baseline and source unchanged; export `If-Match` = the import's `progress.save`
read tag, then the own last save; absent -> `If-None-Match: *`; `progress.save` = input -> the input tag; source
survives a new handler on one store; refusals (role, lease, body, unknown building, missing / malformed input,
missing CityObject, unconfigured) change nothing. `test/sources.test.js`: both `sources` adapters, store keys.
Golden GT-20 / GT-21 run on the kernel functions (`packages/geo-model3d/test/golden/`).
