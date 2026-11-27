// `sources` port (3D-24, D-453): what the export of one building needs besides its model - the CityJSON document
// it was imported from (kernel `exportBuilding` input, read only), the reference of its `progress.save` dataset
// (one per building, D-83) and the basis of the next save (D-430: the read the results were made on, then the own
// last save). The host fills it: service import is row 3D-133; until then the memory adapter (dev, tests).

/**
 * @typedef {object} BuildingSource
 * @property {any} cityjson parsed CityJSON document of the import
 * @property {string} saveRef `progress.save` dataset of the building (`datasets` port reference)
 * @property {import('../results.js').SaveBasis} basis
 */

/**
 * @typedef {object} SourcesPort
 * @property {(p: string, b: string) => Promise<BuildingSource | undefined>} source `undefined` when the building has none
 * @property {(p: string, b: string, entityTag: string) => Promise<void>} saved records a `SAVED` entity tag: the next
 *   basis is `{ kind: 'tagged', entityTag }`
 */

/** Operations of the port (start-up check of the handler). */
export const SOURCES_OPERATIONS = Object.freeze(['source', 'saved']);

/** @param {unknown} port @returns {port is SourcesPort} */
export const isSourcesPort = (port) => typeof port === 'object' && port !== null
  && SOURCES_OPERATIONS.every((k) => typeof /** @type {any} */ (port)[k] === 'function');
