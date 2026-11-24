// COPC-by-box adapter on the committed test files (3D-70; D-140): same points as the LAS copy, only meeting nodes
// decoded, GT-20 / GT-21 unchanged through the adapter. Files: test/data/gt-2x.copc.laz, built by
// tools/copc-fixture/make_copc.py from fixtures/GT-2x/input.points.json (world = LOCAL + ORIGIN, scale 0.1 mm).
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { deviationStats, fitPlane } from '@geoiplus/geo-model3d';
import { readFixture } from '../../../packages/geo-model3d/test/brep/helpers.js';
import { PROFILE, angleDeg } from '../../../packages/geo-model3d/test/cloud/helpers.js';
import { createCopcPointsAdapter, decodeChunk } from '../src/adapters/copc-points.js';
import { createLasPointsAdapter } from '../src/adapters/las-points.js';
import { isPointsPort } from '../src/ports/points.js';
import { readLocalPoints } from '../src/cloud-points.js';
import { writeLas } from './las-writer.js';

/** @typedef {[number, number, number]} V3 */
const DATA = join(dirname(fileURLToPath(import.meta.url)), 'data');
const ORIGIN = /** @type {V3} */ ([512000, 6170000, 0]);
const SCALE = [0.0001, 0.0001, 0.0001];

/** COPC adapter on a test file, counting decoded chunks by their point count. @param {string} gt */
function copcOf(gt) {
  /** @type {number[]} */
  const decoded = [];
  const port = createCopcPointsAdapter({
    path: join(DATA, `${gt.toLowerCase()}.copc.laz`),
    decode: (chunk, h, n) => { decoded.push(n); return decodeChunk(chunk, h, n); },
  });
  return { port, decoded };
}

/** LAS copy of the same points (LAS 1.4, PDRF 6, same scale and offset -> same integers). @param {string} gt */
function lasOf(gt) {
  const local = readFixture(gt, 'input.points.json').points;
  const bytes = writeLas({ points: local.map((/** @type {number[]} */ p) => p.map((v, k) => v + ORIGIN[k])), version: [1, 4], format: 6, scale: SCALE, offset: ORIGIN });
  return createLasPointsAdapter({ path: 'mem.las', read: async () => bytes });
}

/** @param {Float64Array} xyz */
const sorted = (xyz) => {
  const rows = [];
  for (let i = 0; i < xyz.length; i += 3) rows.push([xyz[i], xyz[i + 1], xyz[i + 2]]);
  return rows.sort((a, b) => a[0] - b[0] || a[1] - b[1] || a[2] - b[2]);
};
/** Local box -> world box. @param {number[]} min @param {number[]} max */
const world = (min, max) => ({ min: /** @type {V3} */ (min.map((v, k) => v + ORIGIN[k])), max: /** @type {V3} */ (max.map((v, k) => v + ORIGIN[k])) });

// Octree of the test files (make_copc.py): root cube LOCAL [-1, 11] x [-1, 11] x [0.5, 12.5]; level-1 side 6, level-2 side 3.
const BOXES = /** @type {[string, ReturnType<typeof world>][]} */ ([
  ['everything', world([-1e3, -1e3, -1e3], [1e3, 1e3, 1e3])],
  ['inside one level-2 cube (LOCAL [2,5] x [2,5] x [3.5,6.5])', world([3, 3, 4], [4.5, 4.5, 6])],
  ['across level-1 faces', world([4, 0.5, 5], [6, 3.5, 8])],
  ['box face through a point (inclusive)', world([8.4887, 2.8409, 7.1249], [9.5, 3.5, 8])],
  ['outside the root cube', world([20, 20, 20], [21, 21, 21])],
  ['inside the cube, no point', world([0, 8, 0.6], [1, 9, 1])],
]);

describe('COPC adapter = LAS copy, by box', () => {
  for (const [name, box] of BOXES) {
    it(`GT-20 points, ${name}`, async () => {
      const { port } = copcOf('GT-20');
      const a = await port.queryBox(box);
      const b = await lasOf('GT-20').queryBox(box);
      expect(sorted(a)).toEqual(sorted(b));
      if (name.startsWith('box face')) expect(a.length).toBeGreaterThan(0);
    });
  }

  it('implements the port and reads the COPC header', async () => {
    const { port } = copcOf('GT-20');
    expect(isPointsPort(port)).toBe(true);
    expect(await port.header()).toMatchObject({ pointFormat: 6, recordLength: 30, halfsize: 6, center: [512005, 6170005, 6.5] });
  });
});

describe('only nodes meeting the box are decoded', () => {
  it('every node for an all-covering box: 24 nodes, 500 points', async () => {
    const { port, decoded } = copcOf('GT-20');
    expect((await port.queryBox(BOXES[0][1])).length).toBe(1500);
    expect(decoded.length).toBe(24);
    expect(decoded.reduce((s, n) => s + n, 0)).toBe(500);
  });

  it('a box inside one level-2 cube decodes root + its level-1 parent + that cube (3 of 24 nodes)', async () => {
    // Hand count from the hierarchy (make_copc.py output): root 0-0-0-0 (50 points), 1-0-0-0 (40), 2-1-1-1 (3).
    const { port, decoded } = copcOf('GT-20');
    await port.queryBox(BOXES[1][1]);
    expect(decoded.sort((a, b) => a - b)).toEqual([3, 40, 50]);
  });

  it('a box outside the root cube decodes nothing', async () => {
    const { port, decoded } = copcOf('GT-20');
    expect((await port.queryBox(BOXES[4][1])).length).toBe(0);
    expect(decoded.length).toBe(0);
  });

  it('honours an aborted signal', async () => {
    const { port } = copcOf('GT-20');
    await expect(port.queryBox(BOXES[0][1], { signal: AbortSignal.abort() })).rejects.toThrow();
  });
});

describe('GT-20 / GT-21 unchanged when the points come from the COPC adapter', () => {
  /** The fixture frame, moved to a UTM origin (the golden fixtures use origin 0, a LAS file never does). @param {string} gt */
  const frameOf = (gt) => ({ ...readFixture(gt, 'input.model.json').frame, originWorld: ORIGIN });

  /**
   * The fixture points in the order the adapter returned them (matched by their 0.1 mm integers). `fitPlane` (RANSAC)
   * depends on the input order: the JSON order gives 444 inliers, the COPC node order 439 (both inside the GT-20
   * bounds) - recorded in the 3D-70 checkpoint.
   * @param {string} gt @param {Float64Array} pts
   */
  const jsonInOrderOf = (gt, pts) => {
    const json = readFixture(gt, 'input.points.json').points;
    const key = (/** @type {number[]} */ p) => p.map((v) => Math.round(v * 1e4)).join(',');
    const at = new Map(json.map((/** @type {number[]} */ p, /** @type {number} */ i) => [key(p), i]));
    const out = new Float64Array(pts.length);
    for (let i = 0; i < pts.length; i += 3) out.set(json[/** @type {number} */ (at.get(key([pts[i], pts[i + 1], pts[i + 2]])))], i);
    return out;
  };

  it('GT-20 FIT_PLANE: the expected.json bounds hold and the result equals the run on the JSON points in the same order', async () => {
    const expected = readFixture('GT-20', 'expected.json');
    const sel = readFixture('GT-20', 'steps.json')[0].command.payload.selection;
    const pts = await readLocalPoints({ port: copcOf('GT-20').port, horizontalCrs: frameOf('GT-20').horizontalCrs }, /** @type {any} */ (frameOf('GT-20')), sel);
    const json = jsonInOrderOf('GT-20', pts);
    pts.forEach((v, i) => expect(Math.abs(v - json[i])).toBeLessThan(1e-9));
    const viaCopc = /** @type {any} */ (fitPlane(pts, sel, PROFILE)).result;
    const viaJson = /** @type {any} */ (fitPlane(json, sel, PROFILE)).result;
    expect(viaCopc.pointCount).toBe(expected.assert.points);
    expect(viaCopc.rmseM).toBeLessThanOrEqual(expected.assert.rmseMMax);
    expect(viaCopc.inlierRatio).toBeGreaterThanOrEqual(expected.assert.inlierRatioMin);
    const len = Math.hypot(0.75, 1); // GT-20 truth z = 0.75 y + 5, as gt-20.golden.test.js
    expect(angleDeg(viaCopc.plane.normal, [0, -0.75 / len, 1 / len])).toBeLessThanOrEqual(expected.assert.normalDeviationDegMax);
    expect(viaCopc.inlierCount).toBe(viaJson.inlierCount);
    viaJson.plane.normal.forEach((/** @type {number} */ v, /** @type {number} */ k) => expect(viaCopc.plane.normal[k]).toBeCloseTo(v, 9));
    expect(viaCopc.rmseM).toBeCloseTo(viaJson.rmseM, 9);
  });

  it('GT-21 heatmap: mean slope deviation within the expected.json tolerance and equal to the run on the JSON points', async () => {
    const model = readFixture('GT-21', 'input.model.json');
    const expected = readFixture('GT-21', 'expected.json');
    const params = readFixture('GT-21', 'steps.json')[0].params;
    const request = { buildingId: model.buildingId, modelVersion: model.version, selection: params.selection, faceIds: params.faceIds, thresholdM: 0.05 };
    const pts = await readLocalPoints({ port: copcOf('GT-21').port, horizontalCrs: frameOf('GT-21').horizontalCrs }, /** @type {any} */ (frameOf('GT-21')), params.selection);
    const viaCopc = /** @type {any} */ (deviationStats(model, pts, request, PROFILE)).result.faces[0];
    const viaJson = /** @type {any} */ (deviationStats(model, Float64Array.from(readFixture('GT-21', 'input.points.json').points.flat()), request, PROFILE)).result.faces[0];
    expect(Math.abs(viaCopc.meanM - expected.assert.meanSlopeDeviationM)).toBeLessThanOrEqual(expected.assert.toleranceM);
    expect(viaCopc.maxAbsM).toBeLessThanOrEqual(PROFILE.heatmapBufferM);
    expect(viaCopc.pointCount).toBe(viaJson.pointCount);
    expect(viaCopc.meanM).toBeCloseTo(viaJson.meanM, 9);
  });
});

describe('laz-perf stays in services/kernel (D-109, 3D-ADR-0009)', () => {
  it('geo-model3d declares no laz-perf and its source does not name it', async () => {
    const root = join(DATA, '..', '..', '..', '..');
    const pkg = JSON.parse(readFileSync(join(root, 'packages/geo-model3d/package.json'), 'utf8'));
    expect(Object.keys({ ...pkg.dependencies, ...pkg.optionalDependencies, ...pkg.peerDependencies })).not.toContain('laz-perf');
    const { readdirSync } = await import('node:fs');
    const files = readdirSync(join(root, 'packages/geo-model3d/src'), { recursive: true, encoding: 'utf8' }).filter((f) => /\.(m?js)$/.test(f));
    expect(files.length).toBeGreaterThan(10);
    for (const f of files) expect(readFileSync(join(root, 'packages/geo-model3d/src', f), 'utf8')).not.toMatch(/laz-perf/);
  });
});
