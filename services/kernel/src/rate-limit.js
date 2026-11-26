// PREVIEW rate limit of the kernel service (3D-109, D-316): at most 20 requests per sliding one-second window per
// (authenticated user, building), in process memory; above it `429 RATE_LIMITED`. A refused request is not counted.

export const PREVIEW_RATE = 20;
export const RATE_WINDOW_MS = 1000;

/** @param {{ now: () => number, limit?: number, windowMs?: number }} deps `now`: milliseconds (injected clock) */
export function createRateLimiter(deps) {
  const limit = deps.limit ?? PREVIEW_RATE;
  const windowMs = deps.windowMs ?? RATE_WINDOW_MS;
  /** @type {Map<string, number[]>} key -> accepted request times, oldest first */
  const hits = new Map();

  /** Drops keys with no request in the window (bounded memory). @param {number} t */
  function sweep(t) {
    for (const [k, times] of hits) if (times[times.length - 1] <= t - windowMs) hits.delete(k);
  }

  /**
   * @param {string} actorId @param {string} projectId @param {string} buildingId
   * @returns {boolean} `true` when the request is admitted (and counted)
   */
  function admit(actorId, projectId, buildingId) {
    const t = deps.now();
    if (hits.size > 1024) sweep(t);
    const key = JSON.stringify([actorId, projectId, buildingId]);
    const times = (hits.get(key) ?? []).filter((x) => x > t - windowMs);
    if (times.length >= limit) {
      hits.set(key, times);
      return false;
    }
    times.push(t);
    hits.set(key, times);
    return true;
  }

  return { admit };
}
