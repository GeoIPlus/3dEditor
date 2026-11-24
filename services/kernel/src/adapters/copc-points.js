// Points adapter "COPC by box" (3D-70; D-35, D-133; 3D-ADR-0009): reads one local COPC 1.0 file, selects the octree
// nodes whose cube meets the query box and decodes only those LAZ chunks with `laz-perf` (Apache-2.0, WASM, server
// side only). The exact inclusive box filter follows. Same CRS rules as the LAS adapter: the dataset is in the
// building's horizontal CRS and shares its vertical CRS (D-93); another CRS is 3D-69 (D-126). HTTP range reads of a
// remote COPC are 3D-61.
import { open } from 'node:fs/promises';
import { createLazPerf } from 'laz-perf';
import { inBox } from '../ports/points.js';
import { COPC_HEADER_BYTES, readCopcHeader, selectNodes } from './copc-format.js';
import { LasFormatError } from './las-format.js';

/** @typedef {import('../ports/points.js').PointsPort} PointsPort */
/** @typedef {import('../ports/points.js').WorldBox} WorldBox */
/** @typedef {import('./copc-format.js').CopcHeader} CopcHeader */
/** @typedef {import('./copc-format.js').CopcEntry} CopcEntry */

/**
 * Decodes one node chunk to raw point records (`pointCount * recordLength` bytes).
 * @typedef {(chunk: Uint8Array, h: CopcHeader, pointCount: number) => Promise<Uint8Array>} ChunkDecode
 */

/** @type {Promise<any> | null} */
let lazPerf = null;

/** @type {ChunkDecode} */
export async function decodeChunk(chunk, h, pointCount) {
  lazPerf ??= createLazPerf();
  const lp = await lazPerf;
  const inPtr = lp._malloc(chunk.byteLength);
  const outPtr = lp._malloc(h.recordLength);
  const decoder = new lp.ChunkDecoder();
  try {
    lp.HEAPU8.set(chunk, inPtr);
    decoder.open(h.pointFormat, h.recordLength, inPtr);
    const out = new Uint8Array(pointCount * h.recordLength);
    for (let i = 0; i < pointCount; i++) {
      decoder.getPoint(outPtr);
      out.set(lp.HEAPU8.subarray(outPtr, outPtr + h.recordLength), i * h.recordLength);
    }
    return out;
  } finally {
    decoder.delete();
    lp._free(inPtr);
    lp._free(outPtr);
  }
}

/**
 * Default range reader: positional reads from a local file, one file handle per query.
 * @type {OpenSource}
 */
async function openFile(path) {
  const fh = await open(path, 'r');
  return {
    /** @param {number} offset @param {number} length */
    async readRange(offset, length) {
      const buf = new Uint8Array(length);
      const { bytesRead } = await fh.read(buf, 0, length, offset);
      if (bytesRead !== length) throw new LasFormatError(`COPC read of ${length} bytes at ${offset} hit the end of the file`);
      return buf;
    },
    close: () => fh.close(),
  };
}

/**
 * @typedef {(path: string) => Promise<{ readRange: import('./copc-format.js').ReadRange, close: () => Promise<void> }>} OpenSource
 */

/**
 * Reads the header once (a failed read is retried on the next query); every query reads the hierarchy pages and the
 * chunks of the nodes that meet the box, nothing else.
 * @param {{ path: string, openSource?: OpenSource, decode?: ChunkDecode }} options `openSource` and `decode` are
 *   injectable for tests (e.g. to count decoded nodes)
 * @returns {PointsPort & { header: () => Promise<CopcHeader> }}
 */
export function createCopcPointsAdapter({ path, openSource = openFile, decode = decodeChunk }) {
  /** @type {Promise<CopcHeader> | null} */
  let header = null;
  /** @param {import('./copc-format.js').ReadRange} readRange */
  const loadHeader = (readRange) => {
    header ??= readRange(0, COPC_HEADER_BYTES).then(readCopcHeader);
    header.catch(() => { header = null; });
    return header;
  };
  return {
    async header() {
      const src = await openSource(path);
      try {
        return await loadHeader(src.readRange);
      } finally {
        await src.close();
      }
    },
    /** @param {WorldBox} box @param {{ signal?: AbortSignal }} [options] */
    async queryBox(box, options = {}) {
      options.signal?.throwIfAborted();
      const src = await openSource(path);
      try {
        const h = await loadHeader(src.readRange);
        /** @type {number[]} */
        const keep = [];
        for (const node of (await selectNodes(src.readRange, h, box)).nodes) {
          options.signal?.throwIfAborted();
          const records = await decode(await src.readRange(node.offset, node.byteSize), h, node.pointCount);
          const dv = new DataView(records.buffer, records.byteOffset, records.byteLength);
          for (let at = 0; at < records.byteLength; at += h.recordLength) {
            // LAS 1.4 R15 §2.6: X Y Z are signed 32-bit integers at bytes 0, 4, 8; world = integer * scale + offset.
            const x = dv.getInt32(at, true) * h.scale[0] + h.offset[0];
            const y = dv.getInt32(at + 4, true) * h.scale[1] + h.offset[1];
            const z = dv.getInt32(at + 8, true) * h.scale[2] + h.offset[2];
            if (inBox(box, x, y, z)) keep.push(x, y, z);
          }
        }
        return Float64Array.from(keep);
      } finally {
        await src.close();
      }
    },
  };
}
