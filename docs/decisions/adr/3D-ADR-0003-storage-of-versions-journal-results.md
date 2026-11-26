# 3D-ADR-0003: storage of building versions, edit journal, baseline and results

- Status: accepted (owner, 2026-11-23, D-85)
- WP: 3D-03   Questions closed: Q-02; dialog answers D-82..D-84   Open: Q-40   Applies: Q-15 groups C, D (D-51)

Revisions read (read-only): `CS` = `GeoIPlus/crowdsource@ad61fb5` (2026-11-22), `OF` = `GeoIPlus/Operaflow@61954ca`
(2026-11-22). Markers as in [AGENTS.md §6](../../../AGENTS.md#6-documentation-rules).

## Context

### What has to be stored (requirements)

| # | Item | Rules | Source |
|---|---|---|---|
| S1 | **Baseline** per building: the imported state, immutable, with id, time, actor/source | never changes; `RESTORE_BASELINE` returns to it as a new version | [D] v0.2 F-08; v0.3 §6; spec §10.9 r4 |
| S2 | **Versions** per building: numbered, issued numbers never change; read by number | per-building optimistic version; `expectedVersion` mismatch -> `409`; Undo/Redo are new versions | [D] v0.2 F-07, D.1 (`GET .../model?version=N`), D.4; spec §10.9 r2, §11 r4 |
| S3 | **Edit journal**: one `journal-entry` per commit (`operationId`, `commandId`, before/after version, actor, time, input, forward + inverse patch, validation summary, lineage); a full snapshot allowed where an inverse patch is unsafe | append-only; never deleted on undo | [D] v0.2 §13.6; spec §2 row 12, §10.9 r3 |
| S4 | **Idempotency records** `(projectId, commandId)` -> stored result | a repeat returns the stored result, no second mutation | [D] v0.2 D.1, D.4; spec §11 r3; GT-13 (3D-23, D-68) |
| S5 | **PREVIEW results** by `previewId` | kept until COMMIT or expiry; COMMIT applies exactly the stored result; expiry `TBD` | [D] v0.3 §3; spec §11 r5; Q-24 |
| S6 | **Drafts** | a `DRAFT_SOLID` model is a committed version in that state (v0.3 §8.1); `DRAFT_SURFACE` is never a commit result. So drafts need no store of their own | [V] v0.3 §8.1 (`fullSpecsV0.3.md:231-241`) |
| S7 | **Results**: edited CityJSON saved to the document's `progress.save` datasets; delivered export bytes | see Operaflow below | [V] OF rules below |
| S8 | **Retention**: versions and audit journal >= 90 days; the archiving policy is set per project | lower bound only; no upper bound or deletion rule in any source | [D] v0.3 §11 (`fullSpecsV0.3.md:357`); v0.2 §13.6 (`fullSpecsV0.2.md:878`) |

Consistency: a commit must be atomic (v0.2 F-07): the new version, its journal entry and its idempotency record appear
together or not at all; a failure leaves the model unchanged (spec §11 r7).

### What the CP/DP offers (code read)

- [V] **Operaflow has no storage, no journal, no history, no retention** (3D-01 §6.5, §9.1; re-checked at `OF@61954ca`:
  `grep -niE "retain|retention|history|journal" format/specification/*.md` finds only `links` "a history of documents",
  `README.md:49`, `links-and-issues.md:29`). The format fixes how results are **saved** and **delivered**:
  - `OF progress.md:25` `results-saved`; `:26` `location-saved-by-put`: whole-body `PUT` with `If-Match` = strong entity tag of
    the read the results were made on (or `If-None-Match: *` where not read); `:31` `location-no-entity-tag-not-saved`;
    `:42` `save-not-2xx-kept` (a `412` is kept, the operator told, nothing overwritten); `:32-34` OGC API Features Part 4
    per feature under `If-Match`, only where `/conformance` declares optimistic locking; `:44` `save-geometry-stated`
    lists the feature forms - `cityjson` is not among them.
  - `OF acceptance.md:16` `delivery-record-content` (one POST per delivery); `:17` `result-in-own-store`: bytes in "a store
    of its own, at an `https` address that carries no secret"; `:18` bytes in the result's `form` and `crs`; `:20`
    `delivered-bytes-fixed`: bytes behind a sent record never change.
- [V] **crowdsource stores nothing for buildings.** 3D-29 §4 (at `aa71c6e`) holds at `ad61fb5`: 34 commits since, none
  touches `streaming/src` or `models.py`; `copc|cityjson` in `*.rs|*.py|*.ts` and `client_credentials` in
  `backend/src`, `streaming/src`: 0 files. What CS offers is a **pattern**: one S3 object per item, version = ETag,
  replace/delete need `If-Match`, S3 answers `412` (`CS streaming/src/ogc/seamlines.rs:6-31, 215-253`), and PostgreSQL
  for CP records. Its open O-361 (`CS docs/artifacts/decisions/open-questions.md:378`) shows the delivery of a stream-saved
  result is unsolved there too.
- [V] Object-store primitives: Amazon S3 supports create-if-absent (`If-None-Match: *`, 2024-08) and compare-and-swap
  (`If-Match` on ETag, 2024-11); of concurrent conditional writes to one key the first succeeds, the others get `412`;
  a bucket policy can require the headers (AWS S3 user guide "conditional writes", "enforce conditional writes").
  A local file system gives the same create-if-absent with exclusive create (`open(path, 'wx')`, Node `fs`).

### Decided frame
[D] D-35: interim own storage (file/S3) behind a port in this repository; data serving moves to crowdsource once it
supports 3D; the move is an adapter swap. [D] D-51 / 3D-ADR-0002 C2: ports live in `services/kernel/src/ports`, adapters
in `src/adapters`; `geo-model3d` has no I/O. [D] D-51 Q-15: group C (saving) is the service's; group D: bytes = service,
delivery record = client session. [D] D-69: the CP lease is the only lock. [D] D-52: any host of the CP contract runs
the workplace.

## Options

| Option | Consequences | Risk |
|---|---|---|
| **O1. Object store, append-only, conditional writes.** One key space per building (layout below). A commit is one create-if-absent of the journal object for version `N+1`; that single write is the commit point. Baseline and snapshots are write-once objects. Interim adapters: S3 (production) and file system (dev, tests, GV test host) with the same semantics | Atomic commit and optimistic locking without a database or transaction manager; immutability (S1, S3, delivered bytes) is a property of the key scheme, enforceable by bucket policy; same pattern as CS (ETag + `If-Match`), so a later move is a copy of objects; nothing to operate besides a bucket | Queries across buildings (reports) need listing or a derived index; S3-compatible stores other than AWS must be checked for conditional writes before use; PREVIEW latency if previews were written to S3 (kept in memory instead, below) |
| O2. PostgreSQL for versions, journal, idempotency, previews; blobs (snapshots, exports) in an object store | Transactions give atomicity directly; SQL queries for reports and the author check | A database to run, migrate and back up beside the kernel container (D-33); two stores to keep consistent for blobs; nothing in CS to reuse for building data; more to relocate (D-31) |
| O3. Embedded SQLite on the container's volume | Simplest transactions, no service | One writer instance only; volume durability depends on the deployment target (ADR-OPS, open); no shared access for a GV test host and a container at once |
| O4. Everything as CityJSON in the DP's datasets (no own store) | No own store | Not possible: CityJSON holds neither the canonical model (planes, constraints, lineage) nor the journal; Operaflow has no journal or history (above); no DP serves 3D today (3D-29) |

## Decision

**O1** (accepted, D-85). It meets S1-S8 with one primitive both interim adapters have (create-if-absent), keeps the service
stateless apart from short-lived previews, reuses CS's locking pattern, and keeps the later move a relocation (D-31).

### 1. Two ports, not one

D-35 lists "buildings, versions, journal, drafts, baseline" as one interim store. Reading the format splits them by
whether Operaflow defines them:

| Port (`services/kernel/src/ports/`) | Holds | Interim adapter (D-35) | After crowdsource supports 3D (3D-63) |
|---|---|---|---|
| `datasets` | Reading input CityJSON and points named by the document; saving to `progress.save`; putting delivered bytes in the own https store (Q-15 B, C, D-bytes) | file/S3 objects standing in for the DP's datasets | Operaflow HTTP adapter against CS datasets (3D-60, 3D-61, grant 3D-62) |
| `history` | S1-S5: baseline, versions/snapshots, journal, idempotency records, previews | file/S3 (layout below); previews in memory | **stays 3DQM's own** [D] (D-82): the format has no journal and CS has no place for one; 3D-63 migrates no journals |

### 2. `history` key layout (per project `p`, building `b`)

```
p/{p}/b/{b}/baseline.json             write-once: imported canonical model + import report ref (S1)
p/{p}/b/{b}/journal/{N}.json          write-once, create-if-absent: the journal-entry that produced version N (S2, S3)
p/{p}/b/{b}/snapshot/{N}.json         write-once: full canonical model at version N (baseline version, then every K versions)
p/{p}/cmd/{commandId}.json            write-once: idempotency record -> result, or -> journal/{N} for a commit (S4)
```

Version numbering: the baseline is version `v0` (the import's version; its value is 3D-06's). Shapes of every object are
the `contracts/model3d/` schemas (3D-06): `building-model`, `journal-entry`, `command-result`. This ADR adds no field.

Amendment (owner, dialog, 2026-11-26, D-318; 3D-23): the journal patch holds no model-level members (`state`,
..., Q-31), so a version cannot be rebuilt from patches. Every version gets a full snapshot (K = 1), written **before**
the commit point under `p/{p}/b/{b}/snapshot/{N}/{commandId}.json` (write-once) instead of `snapshot/{N}.json`;
`journal/{N}` stays the only commit point and `readVersion(N)` follows its `commandId` to the snapshot. Snapshots of
lost commits stay as orphans (nothing deleted, D-84).

### 3. Port operations and their guarantees

| Operation | Guarantee |
|---|---|
| `putBaseline(p, b, model)` | create-if-absent; a second import of the same building -> conflict, never an overwrite |
| `commit(p, b, expectedVersion, entry, snapshot?)` | creates `journal/{expectedVersion+1}` if absent. Success = committed. Key exists -> read it: same `commandId` -> return its stored result (idempotent repeat); other -> `409 VERSION_CONFLICT`. Then writes `cmd/{commandId}` and, if due, the snapshot (both derivable from the journal, so a crash between writes is repaired on the next read) |
| `findCommand(p, commandId)` | `cmd/{commandId}`; for a commit whose index write was lost, the repeat with the same `expectedVersion` still finds it through the journal key (row above) |
| `recordRejection(p, commandId, result)` | create-if-absent `cmd/{commandId}` for a `REJECTED` / `CONFLICT` result, so a repeat returns it (S4) |
| `readVersion(p, b, N)` / `head(p, b)` | nearest snapshot <= N plus forward patches applied by `geo-model3d` (pure); head = highest journal key |
| `readJournal(p, b, from, to)` | entries in version order; source for Undo/Redo (3D-18), "new error" comparison (v0.3 §8.3) and the approver != author check (3D-24) |
| `putPreview` / `takePreview(previewId)` | in-process memory with expiry (Q-24 `TBD`); valid for one service instance. A shared preview store is needed only if 3D-08/ADR-OPS run more than one instance |

No operation deletes or overwrites anything (S1, S3, S8). `K` (snapshot interval) is an implementation parameter set by
3D-23 from measurement; it changes no result.

### 4. Results (Operaflow groups C, D)

- **Save (C).** On the export action (v0.3 §8.4 gate, reviewer, spec §11 r9) the service saves the building's CityJSON to
  each `progress.save` dataset: `location` -> `PUT` of the whole bytes with `If-Match` = the entity tag of the import read
  (`progress.md:26`); no tag -> not saved, operator told (`:31`); `412` -> kept and told, never overwritten (`:42`).
  Part 4 (`ogc-api-features`) is not used for CityJSON: the format's feature forms exclude `cityjson` (`:44`).
- **Granularity.** A `location` dataset holding many buildings makes every save of one building a whole-file `PUT`
  that conflicts with any other building's save (`412`, kept). Convention for 3DQM documents (input to 3D-43
  and 3D-60): **one `progress.save` dataset per building** [D] (D-83).
- **Deliver (D, bytes).** Export bytes go to the `datasets` port's own store under a content-addressed key (digest),
  write-once, served by the service at an `https` address **without a secret** (`acceptance.md:17`): read access by the
  caller's bearer token, so **no pre-signed URLs** (their signature is a secret in the address). Bytes are never changed
  (`:20`). The client session sends the delivery record with address and digest (D-51 group D).

### 5. Retention (S8)

- The service never deletes (no delete operation in either port). Baseline, journal, snapshots, idempotency records and
  delivered bytes are write-once; the S3 bucket enforces conditional writes by policy. Whether bucket versioning is
  also turned on (recovery from an overwrite by another tool) is ADR-OPS's choice [A]: its interplay with conditional
  writes was not checked here.
- >= 90 days is met by keeping everything; the upper bound and archiving are a per-project policy (v0.2 §13.6) not
  defined by any source; the interim store keeps everything and configures no lifecycle expiry [D] (D-84). A
  later per-project policy comes through intake.
- Previews are not "versions or journal" and expire (Q-24).

### 6. What stays open, outside this ADR

- Q-40 (for 3D-24/3D-06): is `APPROVED` / return-for-rework a new version with a journal entry? If yes, the journal
  holds it with no new port operation; if no, `history` needs a state-record operation. The reviewer must not count as an
  author of such an entry (v0.3 §8.1).
- Multi-instance deployment and the bucket's region and backup: ADR-OPS (D-33).
- Format pin: OF has released `1.0.0` (suite `format/suite/1.0.0`); CS pins `1.0.0-rc.1`. The 3DQM pin is 3D-06/3D-27's.

## Checks

- 3D-23: **one port contract test suite** (`history`, `datasets`) runs against every adapter (file, S3 or an
  S3-compatible test double that implements conditional writes, later the CS adapter in 3D-63). It covers: two concurrent
  commits on version N -> exactly one succeeds, the other `409`; repeat with the same `commandId` -> same result, one journal
  entry (GT-13); a crash injected after the journal write and before `cmd/` -> repeat still idempotent; `putBaseline`
  twice -> conflict; no adapter method deletes or overwrites (grep for `DeleteObject` / `unlink` / `rm` in adapters fails
  `check:arch`, a rule added by 3D-23).
- 3D-23: a delivered byte address contains no query string or credential (test), and a second write of the same digest is
  a no-op.
- 3D-23: a `PUT` to `progress.save` without a stored entity tag is not sent; a `412` leaves the result kept (Operaflow
  suite `progress/` cases as fixtures, 3D-01 §9.3).
- Deployment (ADR-OPS): bucket policy requires `If-None-Match` / `If-Match` on `PutObject`; no lifecycle
  expiry (D-84).
