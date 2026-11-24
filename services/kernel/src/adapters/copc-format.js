// COPC 1.0 reader parts that need no decoder (3D-70; D-133): header checks, `info` VLR, hierarchy pages, octree node
// cubes. Source: COPC 1.0 specification, github.com/copcio/copcio.github.io README.md @a6336f7 ("Implementation",
// "info VLR", "hierarchy VLR", "Reader Implementation Notes"); LAS header fields from ASPRS LAS 1.4 R15 Table 3.
// New code, no third-party code. Point data (LAZ chunks) is decoded in `copc-points.js`.
import { LasFormatError } from './las-format.js';

/** @typedef {[number, number, number]} V3 */
/** @typedef {import('../ports/points.js').WorldBox} WorldBox */

/**
 * @typedef {object} CopcHeader
 * @property {number} pointFormat 6, 7 or 8 (compression bits masked off)
 * @property {number} recordLength
 * @property {V3} scale
 * @property {V3} offset
 * @property {V3} center octree centre, world coordinates (info VLR `center_x/y/z`)
 * @property {number} halfsize root cube: centre +/- halfsize on every axis
 * @property {number} rootHierOffset absolute offset of the root hierarchy page
 * @property {number} rootHierSize its size in bytes
 */

/**
 * @typedef {object} CopcEntry one hierarchy entry (32 bytes)
 * @property {[number, number, number, number]} key level, x, y, z
 * @property {number} offset absolute offset of the data chunk (pointCount > 0) or child page (pointCount -1)
 * @property {number} byteSize compressed chunk size or child page size
 * @property {number} pointCount > 0 points; -1 child page; 0 empty node
 */

/** Byte offsets fixed by the spec ("Reader Implementation Notes"): header 375 + VLR header 54 + info 160 = 589. */
const INFO_AT = 375 + 54;
export const ENTRY_SIZE = 32;
export const COPC_HEADER_BYTES = INFO_AT + 160;

/** @param {Uint8Array} bytes */
const view = (bytes) => new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);

/** @param {DataView} dv @param {number} at */
function u64(dv, at) {
  const v = dv.getBigUint64(at, true);
  if (v > BigInt(Number.MAX_SAFE_INTEGER)) throw new LasFormatError('COPC offset too large');
  return Number(v);
}

/**
 * Reads and checks the first 589 bytes (the spec's reader checks plus LAS 1.4 and PDRF 6/7/8).
 * @param {Uint8Array} bytes the first 589 bytes of the file (more is ignored)
 * @returns {CopcHeader}
 */
export function readCopcHeader(bytes) {
  if (bytes.byteLength < COPC_HEADER_BYTES) throw new LasFormatError('file shorter than a COPC header (589 bytes)');
  const dv = view(bytes);
  const ascii = (/** @type {number} */ at, /** @type {number} */ n) => String.fromCharCode(...bytes.subarray(at, at + n));
  if (ascii(0, 4) !== 'LASF') throw new LasFormatError('no LASF signature');
  if (bytes[24] !== 1 || bytes[25] !== 4) throw new LasFormatError(`COPC needs LAS 1.4, file is ${bytes[24]}.${bytes[25]}`);
  if (ascii(377, 4) !== 'copc' || bytes[381] !== 0) throw new LasFormatError('first VLR is not the COPC info VLR (user id "copc")');
  if (bytes[393] !== 1 || bytes[394] !== 0) throw new LasFormatError(`COPC info VLR record id / version ${bytes[393]}.${bytes[394]}, expected 1, 0`);
  const pointFormat = bytes[104] & 0x3f;
  if (pointFormat < 6 || pointFormat > 8) throw new LasFormatError(`COPC point data record format must be 6, 7 or 8, file has ${pointFormat}`);
  const f64 = (/** @type {number} */ at) => dv.getFloat64(at, true);
  const header = {
    pointFormat,
    recordLength: dv.getUint16(105, true),
    scale: /** @type {V3} */ ([f64(131), f64(139), f64(147)]),
    offset: /** @type {V3} */ ([f64(155), f64(163), f64(171)]),
    center: /** @type {V3} */ ([f64(INFO_AT), f64(INFO_AT + 8), f64(INFO_AT + 16)]),
    halfsize: f64(INFO_AT + 24),
    rootHierOffset: u64(dv, INFO_AT + 40),
    rootHierSize: u64(dv, INFO_AT + 48),
  };
  if (header.scale.some((s) => !(s > 0))) throw new LasFormatError('scale factor must be > 0');
  if (!(header.halfsize > 0)) throw new LasFormatError('COPC halfsize must be > 0');
  if (header.rootHierSize === 0 || header.rootHierSize % ENTRY_SIZE !== 0) throw new LasFormatError('COPC root hierarchy page size is not a multiple of 32');
  return header;
}

/**
 * Entries of one hierarchy page ("The entries of a hierarchy page are consecutive", size / 32 entries).
 * @param {Uint8Array} page the page bytes
 * @returns {CopcEntry[]}
 */
export function readPage(page) {
  if (page.byteLength % ENTRY_SIZE !== 0) throw new LasFormatError('COPC hierarchy page size is not a multiple of 32');
  const dv = view(page);
  /** @type {CopcEntry[]} */
  const out = [];
  for (let at = 0; at < page.byteLength; at += ENTRY_SIZE) {
    const key = /** @type {[number, number, number, number]} */ ([0, 4, 8, 12].map((k) => dv.getInt32(at + k, true)));
    const entry = { key, offset: u64(dv, at + 16), byteSize: dv.getInt32(at + 24, true), pointCount: dv.getInt32(at + 28, true) };
    if (key[0] < 0 || entry.pointCount < -1 || entry.byteSize < 0) throw new LasFormatError(`invalid COPC hierarchy entry ${key.join('-')}`);
    out.push(entry);
  }
  return out;
}

/**
 * Cube of an octree node. [V] Root = centre +/- halfsize (info VLR: "center of octree", "distance from the center to
 * any side of the root node"). [A] Below the root the key follows EPT key naming, which the spec cites: side at level
 * L is 2 halfsize / 2^L; min = root min + (x, y, z) * side. (copclib 2.6.3 `Box(key, header)` derives cubes from the
 * LAS header bounds instead; this reader follows the spec text.)
 * @param {CopcHeader} h @param {[number, number, number, number]} key
 * @returns {WorldBox}
 */
export function nodeCube(h, [level, x, y, z]) {
  const side = (2 * h.halfsize) / 2 ** level;
  const min = /** @type {V3} */ ([x, y, z].map((c, k) => h.center[k] - h.halfsize + c * side));
  return { min, max: /** @type {V3} */ (min.map((v) => v + side)) };
}

/**
 * Closed boxes meet (a point on a shared face belongs to both, so an inclusive query keeps it).
 * @param {WorldBox} a @param {WorldBox} b
 */
export const boxesMeet = (a, b) => [0, 1, 2].every((k) => a.min[k] <= b.max[k] && a.max[k] >= b.min[k]);

/** @typedef {(offset: number, length: number) => Promise<Uint8Array>} ReadRange */

/**
 * Data entries whose node cube meets the box. Child pages are read only when their key meets the box (a page holds
 * its key's subtree). A key can appear twice (seen: copclib keeps a node's data entry on the parent page and adds a
 * pointCount -1 entry with the same key for its child page); only data entries are nodes.
 * @param {ReadRange} readRange @param {CopcHeader} h @param {WorldBox} box
 * @returns {Promise<{ nodes: CopcEntry[], pagesRead: number }>}
 */
export async function selectNodes(readRange, h, box) {
  /** @type {CopcEntry[]} */
  const nodes = [];
  const pages = [[h.rootHierOffset, h.rootHierSize]];
  const seenPages = new Set();
  let pagesRead = 0;
  while (pages.length > 0) {
    const [offset, size] = /** @type {number[]} */ (pages.pop());
    if (seenPages.has(offset)) continue;
    seenPages.add(offset);
    pagesRead++;
    for (const e of readPage(await readRange(offset, size))) {
      if (e.pointCount === 0 || !boxesMeet(nodeCube(h, e.key), box)) continue;
      if (e.pointCount === -1) pages.push([e.offset, e.byteSize]);
      else nodes.push(e);
    }
  }
  return { nodes, pagesRead };
}
