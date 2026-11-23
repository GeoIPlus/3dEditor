// Points port and LAS-whole adapter (3D-22; D-35, D-3D22-4), service glue selection -> world box -> local points.
import { describe, expect, it } from 'vitest';
import { fitPlane } from '@geoiplus/geo-model3d';
import { LasFormatError, readLasHeader, readLasXyz } from '../src/adapters/las-format.js';
import { createLasPointsAdapter } from '../src/adapters/las-points.js';
import { isPointsPort } from '../src/ports/points.js';
import { readLocalPoints, worldBoxOf } from '../src/cloud-points.js';
import { writeLas } from './las-writer.js';

const OFFSET = [512000, 6170000, 0];
const world = [[512001.234, 6170002.5, 5.75], [512009.999, 6170000.001, 5.001], [512020, 6170020, 9]];
/** @param {Uint8Array} bytes */
const fromBytes = (bytes) => createLasPointsAdapter({ path: 'mem.las', read: async () => bytes });

describe('LAS reader', () => {
  for (const [version, format] of /** @type {[[number, number], number][]} */ ([[[1, 0], 0], [[1, 2], 1], [[1, 2], 3], [[1, 3], 5], [[1, 4], 6], [[1, 4], 10]])) {
    it(`LAS ${version.join('.')} format ${format}: XYZ = integer * scale + offset, within the scale`, () => {
      const bytes = writeLas({ points: world, version, format, offset: OFFSET });
      const h = readLasHeader(bytes);
      expect(h).toMatchObject({ version: version.join('.'), pointFormat: format, pointCount: 3 });
      const xyz = readLasXyz(bytes, h);
      world.forEach((p, i) => p.forEach((v, k) => expect(Math.abs(xyz[3 * i + k] - v)).toBeLessThanOrEqual(0.0005)));
    });
  }

  it('reads extra bytes in a longer record (record length > minimum)', () => {
    const bytes = writeLas({ points: world, format: 1, recordLength: 40, offset: OFFSET });
    expect([...readLasXyz(bytes, readLasHeader(bytes)).slice(0, 3)].map((v) => v.toFixed(3))).toEqual(['512001.234', '6170002.500', '5.750']);
  });

  const broken = /** @type {[string, Uint8Array][]} */ ([
    ['LAZ (format byte bit 7)', writeLas({ points: world, formatByte: 0x80 | 3, format: 3 })],
    ['no signature', (() => { const b = writeLas({ points: world }); b[0] = 0; return b; })()],
    ['truncated point data', writeLas({ points: world }).slice(0, 227 + 30)],
    ['record shorter than the format', writeLas({ points: world, format: 3, recordLength: 20 })],
    ['version 2.0', writeLas({ points: world, version: [2, 0] })],
    ['short file', new Uint8Array(100)],
  ]);
  for (const [name, bytes] of broken) {
    it(`refuses: ${name}`, () => expect(() => readLasHeader(bytes)).toThrow(LasFormatError));
  }
});

describe('LAS-whole adapter', () => {
  it('implements the port; box query is inclusive and keeps source precision', async () => {
    const port = fromBytes(writeLas({ points: world, offset: OFFSET }));
    expect(isPointsPort(port)).toBe(true);
    const got = await port.queryBox({ min: [512000, 6170000, 0], max: [512010, 6170010, 10] });
    expect(got.length).toBe(6);
    expect(got[0]).toBeCloseTo(512001.234, 9);
    expect((await port.queryBox({ min: [0, 0, 0], max: [1, 1, 1] })).length).toBe(0);
  });

  it('reads the file once; a read failure is retried on the next query', async () => {
    let reads = 0;
    const bytes = writeLas({ points: world });
    const port = createLasPointsAdapter({ path: 'x', read: async () => { reads++; if (reads === 1) throw new Error('io'); return bytes; } });
    const box = { min: /** @type {[number, number, number]} */ ([-1e9, -1e9, -1e9]), max: /** @type {[number, number, number]} */ ([1e9, 1e9, 1e9]) };
    await expect(port.queryBox(box)).rejects.toThrow('io');
    await port.queryBox(box);
    await port.queryBox(box);
    expect(reads).toBe(2);
  });

  it('honours an aborted signal', async () => {
    const port = fromBytes(writeLas({ points: world }));
    await expect(port.queryBox({ min: [0, 0, 0], max: [1, 1, 1] }, { signal: AbortSignal.abort() })).rejects.toThrow();
  });
});

describe('selection -> world box -> local points', () => {
  const frame = { horizontalCrs: 'EPSG:25832', verticalCrs: null, axisOrder: 'EAST_NORTH_UP', unit: 'm', originWorld: OFFSET, buildingAxisDeg: 30 };

  it('world box of a rotated frame covers every local corner', () => {
    const box = worldBoxOf(/** @type {any} */ (frame), { kind: 'BOX', min: [0, 0, 0], max: [10, 4, 9] });
    expect(box.max[0] - box.min[0]).toBeCloseTo(10 * Math.cos(Math.PI / 6) + 4 * Math.sin(Math.PI / 6), 6);
    expect(box.min[2]).toBe(0);
  });

  it('plane fit through the port: LAS (world) -> local -> fitPlane on z = 0.75 y + 5', async () => {
    /** @type {number[][]} */
    const local = [];
    for (let i = 0; i < 11; i++) for (let j = 0; j < 5; j++) local.push([i, j, 0.75 * j + 5]);
    const { localToWorld } = await import('@geoiplus/geo-model3d');
    const port = fromBytes(writeLas({ points: localToWorld(/** @type {any} */ (frame), /** @type {any} */ (local)), offset: OFFSET }));
    // 1 cm margin: points on the box faces move by up to 0.5 mm when the LAS stores millimetres.
    const sel = /** @type {const} */ ({ kind: 'BOX', min: [-0.01, -0.01, 0], max: [10.01, 4.01, 10] });
    const pts = await readLocalPoints(port, /** @type {any} */ (frame), /** @type {any} */ (sel));
    const r = /** @type {any} */ (fitPlane(pts, /** @type {any} */ (sel), { planarTolM: 0.02, planeFitMinPoints: 30, planeFitMinInlierRatio: 0.6 }));
    expect(r.result.pointCount).toBe(55);
    const len = Math.hypot(0.75, 1);
    expect(r.result.plane.normal[1]).toBeCloseTo(-0.75 / len, 4); // mm quantisation of the LAS
    expect(r.result.plane.normal[2]).toBeCloseTo(1 / len, 4);
    expect(r.result.rmseM).toBeLessThan(0.001);
  });
});
