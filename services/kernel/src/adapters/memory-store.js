// In-memory append-only object store (3D-23): the `ObjectStore` of ports/history.js for tests and an in-process host.
// Values are kept as JSON text, so a caller never shares an object with the store. Nothing is deleted or overwritten.

/** @returns {import('../ports/history.js').ObjectStore & { size: () => number }} */
export function createMemoryStore() {
  /** @type {Map<string, string>} */
  const data = new Map();
  return {
    async create(key, value) {
      if (data.has(key)) return false;
      data.set(key, JSON.stringify(value));
      return true;
    },
    async get(key) {
      const t = data.get(key);
      return t === undefined ? undefined : JSON.parse(t);
    },
    async list(prefix) {
      const head = `${prefix.replace(/\/+$/, '')}/`;
      const names = new Set();
      for (const k of data.keys()) if (k.startsWith(head)) names.add(k.slice(head.length).split('/')[0]);
      return [...names].sort();
    },
    size: () => data.size,
  };
}
