// 3D-69 acceptance: a UTM cloud (EPSG:25832) over a geographic building (EPSG:4937) gives the all-UTM FIT_PLANE result
// and heatmap within planarTolM (D-164); a cloud in the building's CRS takes the 3D-22 path unchanged; another datum is
// refused (D-197). Building pair: GT-I1 (25832) and its 4937 copy (3D-32 fixture, made with proj4's UTM inverse).
// Points are generated here (seeded), no committed point files.
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { importBuilding, fitPlane, deviationStats, localToWorld, worldToLocal, cloudToLocal } from '@geoiplus/geo-model3d';
import { readLocalPoints, worldBoxOf } from '../src/cloud-points.js';
import { inBox } from '../src/ports/points.js';

const root = new URL('../../../', import.meta.url);
const read = (/** @type {string} */ p) => JSON.parse(readFileSync(fileURLToPath(new URL(p, root)), 'utf8'));
const PROFILE = Object.freeze({
  id: 'default', numericEpsilon: 1e-9, topologySnapTolM: 0.01, planarTolM: 0.02, zAlignTolM: 0.01, minEdgeLengthM: 0.05,
  minFaceAreaM2: 0.1, coplanarTolDeg: 1, footprintAngleTolDeg: 5, flatRoofTolDeg: 1, screenSnapPx: 10, heatmapBufferM: 1,
  planeFitMinPoints: 30, planeFitMinInlierRatio: 0.6, exportRoundDecimals: 3,
}); // contract tolerance-profile defaults (spec §2.3, D-13)
const ID = read('fixtures/GT-I1/steps.json').find((/** @type {any} */ s) => s.step === 'IMPORT').cityObjectId;
const load = (/** @type {any} */ doc) => importBuilding({ cityjson: doc, cityObjectId: ID, toleranceProfile: PROFILE, projectId: 'p' }).model;
const utmModel = load(read('fixtures/GT-I1/input.cityjson.json'));
const geoModel = load(read('packages/geo-model3d/test/crs/fixtures/gt-i1-epsg4937.cityjson.json'));

/** mulberry32, fixed seed: deterministic noise @param {number} seed */
function rng(seed) {
  let a = seed >>> 0;
  return () => { a = (a + 0x6d2b79f5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}
// GT-I1 in the UTM model's LOCAL frame: x -5..5, y -4..4; south roof z = 0.75 y + 4 (y <= 0), north z = -0.75 y + 4.
const roofZ = (/** @type {number} */ y) => (y <= 0 ? 0.75 * y + 4 : -0.75 * y + 4);
const rand = rng(69);
/** @type {[number, number, number][]} */
const clean = [];
/** @type {[number, number, number][]} */
const noisy = [];
for (let x = -4.5; x <= 4.5001; x += 0.5) {
  for (const y of [-3.7, -3.3, -2.9, -2.5, -2.1, -1.7, -1.3, -0.9, -0.5, 0.5, 0.9, 1.3, 1.7, 2.1, 2.5, 2.9, 3.3, 3.7]) {
    const p = /** @type {[number, number, number]} */ ([x, y, roofZ(y)]);
    clean.push(p);
    const outlier = noisy.length % 10 === 0 ? 0.15 : 0; // 10 % outliers above the roof
    noisy.push([x, y, p[2] + (rand() - 0.5) * 0.01 + outlier]);
  }
}
const CLOUD_CRS = 'EPSG:25832';
const cloudWorld = localToWorld(/** @type {any} */ (utmModel.frame), noisy); // UTM building: projected, EN, no rotation
/** In-memory points port over the generated UTM cloud; records the boxes it was asked for. */
const boxes = /** @type {any[]} */ ([]);
const port = {
  queryBox: async (/** @type {any} */ box) => {
    boxes.push(box);
    return Float64Array.from(cloudWorld.filter((p) => inBox(box, p[0], p[1], p[2])).flat());
  },
};
const dataset = { port, horizontalCrs: CLOUD_CRS };

/** UTM-local -> geo-local of the same physical point. @param {[number, number, number][]} pts */
const utmToGeo = (pts) => cloudToLocal(/** @type {any} */ (geoModel.frame), CLOUD_CRS, localToWorld(/** @type {any} */ (utmModel.frame), pts));
/** South-roof plan rectangle, 0.15 m clear of the nearest points; as a polygon in the given frame. */
const SOUTH = /** @type {[number, number, number][]} */ ([[-4.8, -3.85, 0], [4.8, -3.85, 0], [4.8, -0.15, 0], [-4.8, -0.15, 0]]);
const selectionIn = (/** @type {'utm'|'geo'} */ which) => ({
  kind: /** @type {const} */ ('POLYGON'),
  ringXY: (which === 'utm' ? SOUTH : utmToGeo(SOUTH)).map((p) => /** @type {[number, number]} */ ([p[0], p[1]])),
  zMin: -20, zMax: 20,
});

describe('3D-69: UTM cloud over a geographic building', () => {
  it('fixture pair: the 4937 building is in a local ENU frame, the 25832 one in a translated UTM frame', () => {
    expect(utmModel.frame.horizontalCrs).toBe('EPSG:25832');
    expect(geoModel.frame.horizontalCrs).toBe('EPSG:4937');
    expect(Object.keys(geoModel.faces).sort()).toEqual(Object.keys(utmModel.faces).sort());
  });

  it('FIT_PLANE: same counts; the two planes agree within planarTolM at every roof point', async () => {
    const run = async (/** @type {any} */ model, /** @type {'utm'|'geo'} */ which) => {
      const sel = selectionIn(which);
      const pts = await readLocalPoints(dataset, model.frame, sel);
      return /** @type {any} */ (fitPlane(pts, sel, PROFILE)).result;
    };
    const u = await run(utmModel, 'utm');
    const g = await run(geoModel, 'geo');
    expect(u.pointCount).toBe(19 * 9);
    expect(g.pointCount).toBe(u.pointCount);
    expect(g.inlierCount).toBe(u.inlierCount);
    const south = clean.filter((p) => p[1] < 0);
    const southGeo = utmToGeo(south);
    const dist = (/** @type {any} */ pl, /** @type {number[]} */ p) => pl.normal[0] * p[0] + pl.normal[1] * p[1] + pl.normal[2] * p[2] + pl.d;
    let worst = 0;
    for (let i = 0; i < south.length; i++) worst = Math.max(worst, Math.abs(dist(u.plane, south[i]) - dist(g.plane, southGeo[i])));
    console.log(`3D-69 FIT_PLANE: worst plane disagreement ${worst.toExponential(3)} m, rmse ${u.rmseM.toExponential(4)} / ${g.rmseM.toExponential(4)} m`);
    expect(worst).toBeLessThanOrEqual(PROFILE.planarTolM);
    expect(Math.abs(u.rmseM - g.rmseM)).toBeLessThanOrEqual(PROFILE.planarTolM);
  });

  it('heatmap: per-face values and summary agree within planarTolM', async () => {
    const all = { kind: /** @type {const} */ ('BOX'), min: /** @type {[number, number, number]} */ ([-50, -50, -50]), max: /** @type {[number, number, number]} */ ([50, 50, 50]) };
    const run = async (/** @type {any} */ model) => {
      const pts = await readLocalPoints(dataset, model.frame, all);
      const req = { buildingId: model.buildingId, modelVersion: model.version, selection: all, thresholdM: 0.05 };
      return /** @type {any} */ (deviationStats(model, pts, req, PROFILE)).result;
    };
    const u = await run(utmModel);
    const g = await run(geoModel);
    expect(g.summary.pointCount).toBe(u.summary.pointCount);
    expect(u.summary.pointCount).toBe(noisy.length);
    expect(g.summary.shareBeyondThreshold).toBe(u.summary.shareBeyondThreshold);
    let worst = Math.max(Math.abs(u.summary.rmseM - g.summary.rmseM), Math.abs(u.summary.maxAbsM - g.summary.maxAbsM));
    for (const fu of u.faces) {
      const fg = g.faces.find((/** @type {any} */ f) => f.faceId === fu.faceId);
      expect(fg.pointCount).toBe(fu.pointCount);
      for (const k of ['meanM', 'rmseM', 'maxAbsM']) if (fu[k] !== undefined) worst = Math.max(worst, Math.abs(fu[k] - fg[k]));
    }
    console.log(`3D-69 heatmap: worst value difference ${worst.toExponential(3)} m over ${u.faces.length} faces`);
    expect(worst).toBeLessThanOrEqual(PROFILE.planarTolM);
  });
});

describe('3D-69: cloud in the building CRS takes the 3D-22 path unchanged', () => {
  it('box = bounds of the mapped corners, points = worldToLocal, bit for bit', async () => {
    const sel = selectionIn('utm');
    const xs = sel.ringXY.map((p) => p[0]), ys = sel.ringXY.map((p) => p[1]);
    const corners = [];
    for (const x of [Math.min(...xs), Math.max(...xs)]) for (const y of [Math.min(...ys), Math.max(...ys)]) for (const z of [sel.zMin, sel.zMax]) corners.push([x, y, z]);
    const w = localToWorld(/** @type {any} */ (utmModel.frame), /** @type {any} */ (corners));
    const want = { min: [0, 1, 2].map((k) => Math.min(...w.map((p) => p[k]))), max: [0, 1, 2].map((k) => Math.max(...w.map((p) => p[k]))) };
    expect(worldBoxOf(/** @type {any} */ (utmModel.frame), CLOUD_CRS, sel)).toEqual(want);
    const pts = await readLocalPoints(dataset, /** @type {any} */ (utmModel.frame), sel);
    const raw = cloudWorld.filter((p) => inBox(/** @type {any} */ (want), p[0], p[1], p[2]));
    expect(Array.from(pts)).toEqual(worldToLocal(/** @type {any} */ (utmModel.frame), /** @type {any} */ (raw)).flat());
  });
});

describe('3D-69: refusals', () => {
  it('cloud on another datum (WGS 84 / UTM 32N) over an ETRS89 building -> INVALID_CRS DATUM_MISMATCH', async () => {
    const bad = { port, horizontalCrs: 'EPSG:32632' };
    await expect(readLocalPoints(bad, /** @type {any} */ (geoModel.frame), selectionIn('geo'))).rejects.toMatchObject({
      code: 'INVALID_CRS', details: { reason: 'DATUM_MISMATCH' },
    });
  });
});
