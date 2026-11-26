// In-memory append-only byte store (3D-128): the `ByteStore` of ports/datasets.js for tests and an in-process host.
// Bytes are copied in and out, so a caller never shares a buffer with the store. Nothing is deleted or overwritten.

/** @returns {import('../ports/datasets.js').ByteStore & { size: () => number }} */
export function createMemoryByteStore() {
  /** @type {Map<string, Uint8Array>} */
  const data = new Map();
  return {
    async create(key, bytes) {
      if (data.has(key)) return false;
      data.set(key, Uint8Array.from(bytes));
      return true;
    },
    async get(key) {
      const b = data.get(key);
      return b === undefined ? undefined : Uint8Array.from(b);
    },
    size: () => data.size,
  };
}
