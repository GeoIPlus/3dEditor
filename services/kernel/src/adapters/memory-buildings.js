// Memory adapter of the `buildings` port (3D-133): dev, tests and the GV test host until the CP document adapter
// (3D-43 / 3D-62) fills it.

/**
 * @returns {import('../ports/buildings.js').BuildingsPort & {
 *   set: (p: string, b: string, location: import('../ports/buildings.js').BuildingLocation) => void }}
 */
export function createMemoryBuildings() {
  /** @type {Map<string, import('../ports/buildings.js').BuildingLocation>} */
  const all = new Map();
  /** @param {string} p @param {string} b */
  const key = (p, b) => JSON.stringify([p, b]);
  return {
    locate: async (p, b) => {
      const l = all.get(key(p, b));
      return l && { ...l };
    },
    set: (p, b, location) => { all.set(key(p, b), { ...location }); },
  };
}
