// Interim points adapter "LAS whole" (D-35, D-133): reads one uncompressed LAS file completely on first use, keeps
// its XYZ in memory and answers box queries by filtering. The dataset must be in the building's horizontal CRS and
// share its vertical CRS (D-93); the adapter does not read the CRS records of the file (another CRS: 3D-69).
import { readFile } from 'node:fs/promises';
import { inBox } from '../ports/points.js';
import { readLasHeader, readLasXyz } from './las-format.js';

/** @typedef {import('../ports/points.js').PointsPort} PointsPort */
/** @typedef {import('../ports/points.js').WorldBox} WorldBox */

/**
 * @param {{ path: string, read?: (path: string) => Promise<Uint8Array> }} options `read` is injectable for tests
 * @returns {PointsPort & { header: () => Promise<import('./las-format.js').LasHeader> }}
 */
export function createLasPointsAdapter({ path, read = readFile }) {
  /** @type {Promise<{ header: import('./las-format.js').LasHeader, xyz: Float64Array }> | null} */
  let loaded = null;
  const load = () => {
    loaded ??= read(path).then((buf) => {
      const bytes = new Uint8Array(buf.buffer, buf.byteOffset, buf.byteLength);
      const header = readLasHeader(bytes);
      return { header, xyz: readLasXyz(bytes, header) };
    });
    loaded.catch(() => { loaded = null; });
    return loaded;
  };
  return {
    async header() {
      return (await load()).header;
    },
    /** @param {WorldBox} box @param {{ signal?: AbortSignal }} [options] */
    async queryBox(box, options = {}) {
      options.signal?.throwIfAborted();
      const { xyz } = await load();
      options.signal?.throwIfAborted();
      const keep = [];
      for (let i = 0; i < xyz.length; i += 3) {
        if (inBox(box, xyz[i], xyz[i + 1], xyz[i + 2])) keep.push(xyz[i], xyz[i + 1], xyz[i + 2]);
      }
      return Float64Array.from(keep);
    },
  };
}
