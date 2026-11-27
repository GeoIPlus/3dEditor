// Service import of one building (3D-133; spec §6, §11; v0.3 §5; D-3D133-1..4): the CP document's input dataset
// (`buildings.locate` -> `datasets.read`) -> kernel `importBuilding` -> source kept for export (`sources.put`: the
// document, the `progress.save` ref and the basis of its read, D-430) -> `putBaseline`, the commit point (version 0).
// A building with a baseline is not imported again: 409, nothing changed. The source is written before the baseline,
// so a baseline never lacks a source; a source left by a failed attempt is the one the next import uses.
import { importBuilding } from '@geoiplus/geo-model3d';
import { errorReply } from './errors.js';

/**
 * @typedef {object} ImportDeps
 * @property {import('./ports/history.js').HistoryPort} history
 * @property {import('./ports/datasets.js').DatasetsPort} datasets
 * @property {import('./ports/sources.js').SourcesPort} sources
 * @property {import('./ports/buildings.js').BuildingsPort} buildings
 * @property {(projectId: string) => any} toleranceProfile
 */

const decoder = new TextDecoder('utf-8', { fatal: true });

/** Kernel import refusal (`ImportError`, not exported by the package; import/errors.js). @param {any} e */
const isImportError = (e) => e?.name === 'ImportError' && ['INVALID_PAYLOAD', 'NOT_FOUND', 'INVALID_GEOMETRY'].includes(e.code);

/**
 * Basis of the first save (D-430, D-3D133-2): the read of the `progress.save` dataset at import - one read when it is
 * the input dataset itself.
 * @param {import('./ports/datasets.js').DatasetsPort} datasets @param {string} saveRef @param {string} inputRef
 * @param {import('./ports/datasets.js').DatasetRead} input
 * @returns {Promise<import('./results.js').SaveBasis>}
 */
async function basisOf(datasets, saveRef, inputRef, input) {
  const read = saveRef === inputRef ? input : await datasets.read(saveRef);
  if (!read) return { kind: 'absent' };
  return typeof read.entityTag === 'string' && read.entityTag.length > 0 ? { kind: 'tagged', entityTag: read.entityTag } : { kind: 'untagged' };
}

/** @param {ImportDeps} deps */
export function createImport(deps) {
  const { history, datasets, sources, buildings } = deps;

  /**
   * The source this import uses: the one a failed earlier attempt left, else the input dataset read now.
   * @param {string} p @param {string} b @param {import('./ports/buildings.js').BuildingLocation} loc
   * @returns {Promise<{ cityjson: any, fresh?: import('./ports/sources.js').BuildingSource }
   *   | { reply: import('./commit.js').Reply }>} `fresh`: read now, to be kept
   */
  async function sourceFor(p, b, loc) {
    const kept = await sources.source(p, b);
    if (kept) return { cityjson: kept.cityjson };
    const input = await datasets.read(loc.inputRef);
    if (!input) return { reply: errorReply('NOT_FOUND', [b], 'the input dataset of the building does not exist') };
    let cityjson;
    try {
      cityjson = JSON.parse(decoder.decode(input.bytes));
    } catch {
      return { reply: errorReply('INVALID_PAYLOAD', [b], 'the input dataset is not a JSON document') };
    }
    const basis = await basisOf(datasets, loc.saveRef, loc.inputRef, input);
    return { cityjson, fresh: { cityjson, saveRef: loc.saveRef, basis } };
  }

  /**
   * Import building `b` of project `p` (contract `import-request` validated by the caller).
   * @param {string} p @param {string} b @returns {Promise<import('./commit.js').Reply>} `import-report` (201) or an error
   */
  async function importOne(p, b) {
    if (await history.head(p, b) !== undefined) return errorReply('VERSION_CONFLICT', [b], 'the building is already imported');
    const loc = await buildings.locate(p, b);
    if (!loc) return errorReply('NOT_FOUND', [b], 'the CP document names no such building');
    const src = await sourceFor(p, b, loc);
    if ('reply' in src) return src.reply;
    let out;
    try {
      out = importBuilding({ cityjson: src.cityjson, cityObjectId: loc.cityObjectId ?? b, buildingId: b, projectId: p,
        toleranceProfile: deps.toleranceProfile(p), originalSourceRef: loc.inputRef });
    } catch (err) {
      if (isImportError(err)) return errorReply(/** @type {any} */ (err).code, [b], /** @type {Error} */ (err).message);
      throw err;  // INVALID_CRS and failures: failureReply (errors.js)
    }
    // a concurrent import kept its source first: import again from that one, so the baseline matches the kept source
    if (src.fresh && !(await sources.put(p, b, src.fresh))) return importOne(p, b);
    if (!(await history.putBaseline(p, b, out.baseline))) return errorReply('VERSION_CONFLICT', [b], 'the building is already imported');
    return { httpStatus: 201, body: out.report };
  }

  return { importOne };
}
