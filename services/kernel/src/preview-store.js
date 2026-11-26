// In-memory PREVIEW store of the kernel service (3D-109; 3D-ADR-0003 S5, §3 `putPreview` / `takePreview`): a PREVIEW
// result is kept by `previewId` for 10 min from its creation (D-315), at most 20 per (user, building) and 2000 in all,
// the oldest evicted first (D-352). Valid for one service instance (3D-ADR-0003 §3). Expired, evicted and unknown
// ids are not found (-> `404 NOT_FOUND`, spec §11 r4).
import { randomUUID } from 'node:crypto';

export const PREVIEW_TTL_MS = 10 * 60 * 1000;
export const PREVIEWS_PER_KEY = 20;
export const PREVIEWS_TOTAL = 2000;

/**
 * A stored PREVIEW: owner, base version and the kernel's COMMIT outcome on that version.
 * @typedef {{ actorId: string, projectId: string, buildingId: string, baseVersion: number, command: any, outcome: any }} StoredPreview
 */

/**
 * @param {{ now: () => number, ttlMs?: number, perKey?: number, total?: number, newId?: () => string }} deps
 *   `now`: milliseconds (injected clock)
 */
export function createPreviewStore(deps) {
  const { now } = deps;
  const ttlMs = deps.ttlMs ?? PREVIEW_TTL_MS;
  const perKey = deps.perKey ?? PREVIEWS_PER_KEY;
  const total = deps.total ?? PREVIEWS_TOTAL;
  const newId = deps.newId ?? randomUUID;
  /** @type {Map<string, StoredPreview & { key: string, createdAt: number }>} insertion order = creation order */
  const all = new Map();
  /** @type {Map<string, string[]>} (user, building) -> previewIds, oldest first */
  const byKey = new Map();

  /** @param {string} id */
  function drop(id) {
    const e = all.get(id);
    if (!e) return;
    all.delete(id);
    const ids = /** @type {string[]} */ (byKey.get(e.key)).filter((x) => x !== id);
    if (ids.length === 0) byKey.delete(e.key); else byKey.set(e.key, ids);
  }

  function expire() {
    const limit = now() - ttlMs;
    for (const [id, e] of all) {
      if (e.createdAt > limit) break;  // creation order: the rest is younger
      drop(id);
    }
  }

  /** A fresh `previewId` (UUID, Q-26). */
  const nextId = () => newId();

  /** @param {StoredPreview} preview @param {string} [id] its `previewId` (default: a fresh one) @returns {string} */
  function put(preview, id = newId()) {
    expire();
    const key = JSON.stringify([preview.actorId, preview.projectId, preview.buildingId]);
    const ids = byKey.get(key) ?? [];
    while (ids.length >= perKey) drop(/** @type {string} */ (ids.shift()));
    while (all.size >= total) drop(/** @type {string} */ (all.keys().next().value));
    all.set(id, { ...preview, key, createdAt: now() });
    byKey.set(key, [...(byKey.get(key) ?? []), id]);
    return id;
  }

  /** @param {string} id @returns {StoredPreview | undefined} the preview, while it is not expired */
  function get(id) {
    expire();
    return all.get(id);
  }

  return { nextId, put, get, delete: drop, size: () => (expire(), all.size) };
}
