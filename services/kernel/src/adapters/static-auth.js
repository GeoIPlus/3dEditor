// Static auth and lease adapters (3D-110): dev, tests and the GV test host (3D-50). The production adapters verify CP
// tokens and read CP assignment leases (Operaflow group A, 3D-25; grant 3D-62); they replace these behind the same ports.

/**
 * @param {Record<string, import('../ports/auth.js').AuthUser>} tokens token -> user
 * @returns {import('../ports/auth.js').AuthPort}
 */
export function createStaticAuth(tokens) {
  const table = new Map(Object.entries(tokens));
  return { authenticate: (token) => table.get(token) };
}

/**
 * Leases held in memory, set by the host (tests: `set`, `clear`).
 * @returns {import('../ports/auth.js').LeasesPort & { set: (p: string, b: string, lease: import('../ports/auth.js').Lease) => void, clear: (p: string, b: string) => void }}
 */
export function createMemoryLeases() {
  /** @type {Map<string, import('../ports/auth.js').Lease>} */
  const leases = new Map();
  const key = (/** @type {string} */ p, /** @type {string} */ b) => JSON.stringify([p, b]);
  return {
    current: (p, b) => leases.get(key(p, b)),
    set: (p, b, lease) => { leases.set(key(p, b), { ...lease }); },
    clear: (p, b) => { leases.delete(key(p, b)); },
  };
}
