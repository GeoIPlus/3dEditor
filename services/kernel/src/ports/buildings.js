// `buildings` port (3D-133, D-3D133-1): where the data of one building is, as the CP document names it (D-83) - the
// input CityJSON dataset, the Building's CityObject id in it and the building's own `progress.save` dataset. The host
// fills it from the CP document (3DQM extension, 3D-43; Operaflow adapter 3D-62); until then the memory adapter (dev,
// tests). The client never names a dataset: the import request is empty (contract `import-request`).

/**
 * @typedef {object} BuildingLocation
 * @property {string} inputRef input CityJSON dataset (`datasets` port reference)
 * @property {string} [cityObjectId] the Building's CityObject id; default the `buildingId` [A] (mapping: Q-32)
 * @property {string} saveRef the building's `progress.save` dataset (one per building, D-83)
 */

/**
 * @typedef {object} BuildingsPort
 * @property {(p: string, b: string) => Promise<BuildingLocation | undefined>} locate `undefined`: the document names
 *   no such building
 */

/** Operations of the port (start-up check of the handler). */
export const BUILDINGS_OPERATIONS = Object.freeze(['locate']);

/** @param {unknown} port @returns {port is BuildingsPort} */
export const isBuildingsPort = (port) => typeof port === 'object' && port !== null
  && BUILDINGS_OPERATIONS.every((k) => typeof /** @type {any} */ (port)[k] === 'function');
