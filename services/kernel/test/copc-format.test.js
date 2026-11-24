// COPC header, hierarchy and node selection on synthetic bytes (3D-70): no LAZ needed for these parts.
import { describe, expect, it } from 'vitest';
import { LasFormatError } from '../src/adapters/las-format.js';
import { COPC_HEADER_BYTES, boxesMeet, nodeCube, readCopcHeader, readPage, selectNodes } from '../src/adapters/copc-format.js';

/** @typedef {[number, number, number, number]} Key */

/**
 * First 589 bytes of a COPC file (LAS 1.4 header, VLR header "copc"/1, info VLR) per the spec's reader notes.
 * @param {{ format?: number, version?: number[], user?: string, recordId?: number, halfsize?: number, hierOffset?: number, hierSize?: number }} [o]
 */
function header({ format = 6, version = [1, 4], user = 'copc', recordId = 1, halfsize = 8, hierOffset = 1000, hierSize = 64 } = {}) {
  const b = new Uint8Array(COPC_HEADER_BYTES);
  const dv = new DataView(b.buffer);
  b.set([76, 65, 83, 70], 0);
  b.set(version, 24);
  b[104] = 0xc0 | format;
  dv.setUint16(105, 30, true);
  for (let k = 0; k < 3; k++) dv.setFloat64(131 + 8 * k, 0.01, true);
  [...user].forEach((c, i) => { b[377 + i] = c.charCodeAt(0); });
  dv.setUint16(393, recordId, true);
  [100, 200, 8].forEach((v, k) => dv.setFloat64(429 + 8 * k, v, true)); // centre
  dv.setFloat64(429 + 24, halfsize, true);
  dv.setBigUint64(429 + 40, BigInt(hierOffset), true);
  dv.setBigUint64(429 + 48, BigInt(hierSize), true);
  return b;
}

/** @param {[Key, number, number, number][]} entries key, offset, byteSize, pointCount */
function page(entries) {
  const b = new Uint8Array(32 * entries.length);
  const dv = new DataView(b.buffer);
  entries.forEach(([key, offset, size, count], i) => {
    key.forEach((v, k) => dv.setInt32(32 * i + 4 * k, v, true));
    dv.setBigUint64(32 * i + 16, BigInt(offset), true);
    dv.setInt32(32 * i + 24, size, true);
    dv.setInt32(32 * i + 28, count, true);
  });
  return b;
}

describe('COPC header', () => {
  it('reads format (compression bits masked), record length, scale, centre, halfsize, root page', () => {
    expect(readCopcHeader(header())).toMatchObject({ pointFormat: 6, recordLength: 30, scale: [0.01, 0.01, 0.01], center: [100, 200, 8], halfsize: 8, rootHierOffset: 1000, rootHierSize: 64 });
  });
  const bad = /** @type {[string, Uint8Array][]} */ ([
    ['short file', new Uint8Array(500)],
    ['no LASF', (() => { const b = header(); b[0] = 0; return b; })()],
    ['LAS 1.2', header({ version: [1, 2] })],
    ['first VLR not copc', header({ user: 'LASF_Projection' })],
    ['record id 1000 instead of the info VLR', header({ recordId: 1000 })],
    ['PDRF 3', header({ format: 3 })],
    ['halfsize 0', header({ halfsize: 0 })],
    ['root page size 33', header({ hierSize: 33 })],
  ]);
  for (const [name, bytes] of bad) it(`refuses: ${name}`, () => expect(() => readCopcHeader(bytes)).toThrow(LasFormatError));
});

describe('octree cubes', () => {
  const h = readCopcHeader(header());
  it('root = centre +/- halfsize; level 2 key (2, 3, 0, 1) has side 4 at min + (12, 0, 4)', () => {
    expect(nodeCube(h, [0, 0, 0, 0])).toEqual({ min: [92, 192, 0], max: [108, 208, 16] });
    expect(nodeCube(h, [2, 3, 0, 1])).toEqual({ min: [104, 192, 4], max: [108, 196, 8] });
  });
  it('closed boxes: touching faces meet, a gap does not', () => {
    const a = { min: /** @type {[number, number, number]} */ ([0, 0, 0]), max: /** @type {[number, number, number]} */ ([1, 1, 1]) };
    expect(boxesMeet(a, { min: [1, 0, 0], max: [2, 1, 1] })).toBe(true);
    expect(boxesMeet(a, { min: [1.000001, 0, 0], max: [2, 1, 1] })).toBe(false);
  });
});

describe('hierarchy pages and node selection', () => {
  const h = readCopcHeader(header({ hierOffset: 0, hierSize: 4 * 32 }));
  // Root page: root (data), 1-0-0-0 (data), 1-1-1-1 (data + child page, as copclib writes it), 1-0-1-0 (empty).
  // Child page of 1-1-1-1: 2-2-2-2 (data), 2-3-3-3 (data).
  const root = page([[[0, 0, 0, 0], 5000, 10, 7], [[1, 0, 0, 0], 5010, 10, 5], [[1, 1, 1, 1], 5020, 10, 4], [[1, 1, 1, 1], 128, 64, -1]]);
  const child = page([[[2, 2, 2, 2], 5030, 10, 3], [[2, 3, 3, 3], 5040, 10, 2]]);
  const file = new Uint8Array(192);
  file.set(root, 0);
  file.set(child, 128);
  /** @type {number[]} */
  let reads = [];
  /** @param {number} offset @param {number} length */
  const readRange = async (offset, length) => { reads.push(offset); return file.subarray(offset, offset + length); };
  /** @param {number[]} min @param {number[]} max */
  const box = (min, max) => ({ min: /** @type {[number, number, number]} */ (min), max: /** @type {[number, number, number]} */ (max) });
  const counts = async (/** @type {ReturnType<typeof box>} */ b) => {
    reads = [];
    const r = await selectNodes(readRange, h, b);
    return { counts: r.nodes.map((n) => n.pointCount).sort((x, y) => x - y), pagesRead: r.pagesRead };
  };

  it('reads 32-byte entries', () => {
    expect(readPage(child)).toEqual([{ key: [2, 2, 2, 2], offset: 5030, byteSize: 10, pointCount: 3 }, { key: [2, 3, 3, 3], offset: 5040, byteSize: 10, pointCount: 2 }]);
    expect(() => readPage(new Uint8Array(33))).toThrow(LasFormatError);
    expect(() => readPage(page([[[-1, 0, 0, 0], 0, 0, 0]]))).toThrow(LasFormatError);
  });

  it('a box in the low octant: root + 1-0-0-0 only, child page not read', async () => {
    expect(await counts(box([93, 193, 1], [95, 195, 3]))).toEqual({ counts: [5, 7], pagesRead: 1 });
    expect(reads).toEqual([0]);
  });

  it('a box in 2-3-3-3: root + 1-1-1-1 (data entry; its -1 entry is the page) + 2-3-3-3; child page read', async () => {
    expect(await counts(box([105, 205, 13], [107, 207, 15]))).toEqual({ counts: [2, 4, 7], pagesRead: 2 });
    expect(reads).toEqual([0, 128]);
  });

  it('a point box at the shared corner (100, 200, 8) meets every cube that has it as a corner (not 2-3-3-3, which starts at 104)', async () => {
    expect(await counts(box([100, 200, 8], [100, 200, 8]))).toEqual({ counts: [3, 4, 5, 7], pagesRead: 2 });
  });

  it('a box outside the root cube selects nothing', async () => {
    expect(await counts(box([0, 0, 0], [1, 1, 1]))).toEqual({ counts: [], pagesRead: 1 });
  });
});
