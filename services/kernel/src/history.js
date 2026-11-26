// `history` port over an append-only object store (3D-23; 3D-ADR-0003 §2-§3 with D-3D23-5). A commit writes the
// version's snapshot under its command's key, then creates `journal/{N}` - the only commit point: of two commits on
// version N-1 exactly one creates it, the other finds another `commandId` there (409) or its own (idempotent
// repeat). The idempotency record `cmd/{commandId}` is written last; it is derivable from the journal, so a lost
// record is found again through `journal/{expectedVersion + 1}`. Nothing is deleted or overwritten (D-84, D-85).
import { isObjectStore, keys } from './ports/history.js';

/** @typedef {import('./ports/history.js').ObjectStore} ObjectStore */
/** @typedef {import('./ports/history.js').HistoryPort} HistoryPort */

/**
 * The `command-result` of a committed journal entry: the kernel's COMMIT result is exactly these members
 * (geo-model3d ops/pipeline.js, ops/history.js), so a repeat returns the same reply (spec §11 r3, GT-13).
 * @param {any} entry contract `journal-entry`
 */
export const resultOfEntry = (entry) => ({
  commandId: entry.commandId, patch: entry.forwardPatch, topologyLineage: entry.topologyLineage, warnings: entry.warnings ?? [],
  status: 'COMMITTED', modelVersion: entry.afterVersion, validation: entry.validationSummary,
});

/**
 * @param {ObjectStore} store
 * @returns {HistoryPort}
 */
export function createHistory(store) {
  if (!isObjectStore(store)) throw new TypeError('history: the store must implement create, get, list');

  /** @param {string} p @param {string} b @returns {Promise<number[]>} journal versions, ascending */
  const journalVersions = async (p, b) => (await store.list(keys.journalDir(p, b)))
    .map((n) => /^(\d+)\.json$/.exec(n)).filter((m) => m !== null).map((m) => Number(/** @type {RegExpExecArray} */ (m)[1]))
    .sort((x, y) => x - y);

  /** @type {HistoryPort['readBaseline']} */
  const readBaseline = (p, b) => store.get(keys.baseline(p, b));

  /** @type {HistoryPort['head']} */
  async function head(p, b) {
    const base = await readBaseline(p, b);
    if (base === undefined) return undefined;
    const vs = await journalVersions(p, b);
    return vs.length > 0 ? vs[vs.length - 1] : base.version;
  }

  /** @type {HistoryPort['readVersion']} */
  async function readVersion(p, b, n) {
    const base = await readBaseline(p, b);
    if (base === undefined || !Number.isSafeInteger(n) || n < base.version) return undefined;
    if (n === base.version) return base;
    const entry = await store.get(keys.journal(p, b, n));
    if (entry === undefined) return undefined;
    const snap = await store.get(keys.snapshot(p, b, n, entry.commandId));
    // the snapshot is written before the commit point (D-3D23-5): a committed version without one is store damage
    if (snap === undefined) throw new Error(`history: version ${n} of ${b} has no snapshot`);
    return snap;
  }

  /** @type {HistoryPort['readJournal']} */
  async function readJournal(p, b, from = -Infinity, to = Infinity) {
    const vs = (await journalVersions(p, b)).filter((v) => v >= from && v <= to);
    return Promise.all(vs.map((v) => store.get(keys.journal(p, b, v))));
  }

  /** @type {HistoryPort['commit']} */
  async function commit(p, b, entry, snapshot) {
    const n = entry.afterVersion;
    if (entry.beforeVersion + 1 !== n || snapshot.version !== n) throw new Error('history: entry and snapshot must make version beforeVersion + 1');
    await store.create(keys.snapshot(p, b, n, entry.commandId), snapshot);
    if (!(await store.create(keys.journal(p, b, n), entry))) {
      const held = await store.get(keys.journal(p, b, n));
      return { status: held.commandId === entry.commandId ? 'repeat' : 'conflict', entry: held };
    }
    await store.create(keys.command(p, entry.commandId), { kind: 'COMMITTED', buildingId: b, version: n });
    return { status: 'committed', entry };
  }

  /** @type {HistoryPort['findCommand']} */
  async function findCommand(p, commandId, hint) {
    const rec = await store.get(keys.command(p, commandId));
    if (rec?.kind === 'RESULT') return rec.result;
    if (rec?.kind === 'COMMITTED') return resultOfEntry(await store.get(keys.journal(p, rec.buildingId, rec.version)));
    if (!hint) return undefined;
    // the record write after the commit point may have been lost (crash): the journal key still names the command
    const entry = await store.get(keys.journal(p, hint.buildingId, hint.expectedVersion + 1));
    if (entry?.commandId !== commandId) return undefined;
    await store.create(keys.command(p, commandId), { kind: 'COMMITTED', buildingId: hint.buildingId, version: entry.afterVersion });
    return resultOfEntry(entry);
  }

  /** @type {HistoryPort['recordResult']} */
  async function recordResult(p, b, commandId, result) {
    if (result.commandId !== commandId) throw new Error('history: result of another command');
    if (await store.create(keys.command(p, commandId), { kind: 'RESULT', buildingId: b, result })) return result;
    return findCommand(p, commandId);
  }

  return {
    putBaseline: (p, b, model) => store.create(keys.baseline(p, b), model),
    readBaseline, head, readVersion, readJournal, commit, findCommand, recordResult,
  };
}
