// Memory adapter of the `sources` port (3D-24): dev, tests, GV test host until service import (3D-24.2) fills it.

/**
 * @returns {import('../ports/sources.js').SourcesPort & {
 *   set: (p: string, b: string, source: import('../ports/sources.js').BuildingSource) => void }}
 */
export function createMemorySources() {
  /** @type {Map<string, import('../ports/sources.js').BuildingSource>} */
  const all = new Map();
  /** @param {string} p @param {string} b */
  const key = (p, b) => JSON.stringify([p, b]);
  return {
    source: async (p, b) => {
      const s = all.get(key(p, b));
      return s && { cityjson: s.cityjson, saveRef: s.saveRef, basis: { ...s.basis } };
    },
    saved: async (p, b, entityTag) => {
      const s = all.get(key(p, b));
      if (!s) throw new Error(`sources: no source of ${b}`);
      all.set(key(p, b), { ...s, basis: { kind: 'tagged', entityTag } });
    },
    set: (p, b, source) => { all.set(key(p, b), { ...source, basis: { ...source.basis } }); },
  };
}
