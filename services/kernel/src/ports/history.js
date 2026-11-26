// `history` port of the kernel service (3D-23; 3D-ADR-0003 §1-§3, D-82..D-85, D-318): baseline, versions
// (one snapshot per version), journal, idempotency records. PREVIEW results are not here (process memory, 3D-109).
// The port is built by `createHistory` (../history.js) over an append-only object store; adapters implement only the
// store (file: adapters/file-store.js; memory: adapters/memory-store.js; S3: row 3D-111). The store has no delete
// and no overwrite (D-84, D-85): `create` is the only write and it is create-if-absent.

/**
 * Append-only object store: JSON values under `/`-separated keys.
 * @typedef {object} ObjectStore
 * @property {(key: string, value: unknown) => Promise<boolean>} create writes `value` if `key` is absent; `true` when
 *   written, `false` when the key exists (never overwritten). Of concurrent creates of one key exactly one is `true`.
 * @property {(key: string) => Promise<any>} get the stored value, `undefined` if absent
 * @property {(prefix: string) => Promise<string[]>} list names directly under `prefix` (no `/` in a name), sorted
 */

/**
 * Idempotency record `p/{p}/cmd/{commandId}.json` (3D-ADR-0003 §2, S4).
 * @typedef {{ kind: 'COMMITTED', buildingId: string, version: number } | { kind: 'RESULT', buildingId: string, result: any }} CommandRecord
 *   COMMITTED -> the result is derived from `journal/{version}`; RESULT -> a stored result that changed nothing
 *   (REJECTED, CONFLICT, or a `noChange` COMMIT, D-301)
 */

/**
 * Outcome of `commit`.
 * @typedef {{ status: 'committed', entry: any } | { status: 'repeat', entry: any } | { status: 'conflict', entry: any }} CommitOutcome
 *   `repeat`: `journal/{N+1}` already holds this `commandId` (idempotent repeat); `conflict`: another command holds
 *   it (`409 VERSION_CONFLICT`); `entry` is the stored journal entry in every case
 */

/**
 * @typedef {object} HistoryPort
 * @property {(p: string, b: string, model: any) => Promise<boolean>} putBaseline create-if-absent of the imported model
 *   (S1); `false` when the building already has a baseline (never overwritten)
 * @property {(p: string, b: string) => Promise<any>} readBaseline `undefined` if the building is unknown
 * @property {(p: string, b: string) => Promise<number | undefined>} head newest version (highest journal key, else the
 *   baseline version); `undefined` for an unknown building
 * @property {(p: string, b: string, n: number) => Promise<any>} readVersion the model at version `n` (baseline or the
 *   snapshot of `journal/{n}`), `undefined` if there is none
 * @property {(p: string, b: string, from?: number, to?: number) => Promise<any[]>} readJournal entries with
 *   `from <= afterVersion <= to`, oldest first
 * @property {(p: string, b: string, entry: any, snapshot: any) => Promise<CommitOutcome>} commit snapshot
 *   `snapshot/{N}/{commandId}`, then create-if-absent `journal/{N}` (the commit point, N = `entry.afterVersion`), then the
 *   idempotency record
 * @property {(p: string, commandId: string, hint?: { buildingId: string, expectedVersion: number }) => Promise<any>} findCommand
 *   the stored `command-result` of `commandId`, or `undefined`. With `hint`, a commit whose record write was lost is
 *   found through `journal/{expectedVersion + 1}` (3D-ADR-0003 §3)
 * @property {(p: string, b: string, commandId: string, result: any) => Promise<any>} recordResult create-if-absent of a
 *   result that changed nothing (ADR `recordRejection`, also used for a `noChange` COMMIT); returns the stored result
 *   (the earlier one if the record exists)
 */

/** Operations of the port (start-up check of the handler, adapter tests). */
export const HISTORY_OPERATIONS = Object.freeze(['putBaseline', 'readBaseline', 'head', 'readVersion', 'readJournal', 'commit', 'findCommand', 'recordResult']);

/** @param {unknown} port @returns {port is HistoryPort} */
export const isHistoryPort = (port) => typeof port === 'object' && port !== null
  && HISTORY_OPERATIONS.every((k) => typeof /** @type {any} */ (port)[k] === 'function');

/** @param {unknown} store @returns {store is ObjectStore} */
export const isObjectStore = (store) => typeof store === 'object' && store !== null
  && ['create', 'get', 'list'].every((k) => typeof /** @type {any} */ (store)[k] === 'function');

/**
 * A key segment from an id (contract `EntityId`: any non-empty string, Q-26): percent-encoded, so `/`, `\` and NUL
 * never split a key; `.` and `..` are encoded too (keys never leave the store root). One id -> one segment.
 * @param {string} s
 */
export function segment(s) {
  if (typeof s !== 'string' || s.length === 0) throw new TypeError(`history: invalid key segment ${JSON.stringify(s)}`);
  const e = encodeURIComponent(s);
  return /^\.{1,2}$/.test(e) ? e.replaceAll('.', '%2E') : e;
}

/** Key layout of 3D-ADR-0003 §2 with the D-318 snapshot key. */
export const keys = {
  building: (/** @type {string} */ p, /** @type {string} */ b) => `p/${segment(p)}/b/${segment(b)}`,
  baseline: (/** @type {string} */ p, /** @type {string} */ b) => `${keys.building(p, b)}/baseline.json`,
  journalDir: (/** @type {string} */ p, /** @type {string} */ b) => `${keys.building(p, b)}/journal`,
  journal: (/** @type {string} */ p, /** @type {string} */ b, /** @type {number} */ n) => `${keys.journalDir(p, b)}/${version(n)}.json`,
  snapshot: (/** @type {string} */ p, /** @type {string} */ b, /** @type {number} */ n, /** @type {string} */ c) =>
    `${keys.building(p, b)}/snapshot/${version(n)}/${segment(c)}.json`,
  command: (/** @type {string} */ p, /** @type {string} */ c) => `p/${segment(p)}/cmd/${segment(c)}.json`,
};

/** @param {number} n */
function version(n) {
  if (!Number.isSafeInteger(n) || n < 0) throw new TypeError(`history: invalid version ${n}`);
  return String(n);
}
