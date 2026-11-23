// cloud (3D-22): deviation heatmap (spec §9 rule 6; D-3D22-2, D-3D22-6) on the GT-03 gable (10 x 8, eave 5, ridge 8).
import { describe, expect, it } from 'vitest';
import { canonicalJson, deviationStats } from '@geoiplus/geo-model3d';
import { facePolygons, polygonDistance } from '../../src/cloud/polygon.js';
import { readFixture } from '../brep/helpers.js';
import { ALL, PROFILE, validator } from './helpers.js';

const model = readFixture('GT-21', 'input.model.json');
const resultOk = validator('heatmap-result');
const errorOk = validator('error');
const requestOk = validator('heatmap-request');
/** z of the south slope (y <= 4) and the north slope (y >= 4) */
const roofZ = (/** @type {number} */ y) => (y <= 4 ? 0.75 * y + 5 : 0.75 * (8 - y) + 5);
const pts = (/** @type {number[][]} */ list) => Float64Array.from(list.flat());
/** @param {any} r @param {string} id */
const face = (r, id) => r.result.faces.find((/** @type {any} */ f) => f.faceId === id);

describe('deviationStats', () => {
  it('assigns each point to its nearest face; value = signed distance along that face normal', () => {
    // 0.1 m above the south slope (normal distance 0.08), 0.1 m below the north slope (-0.08).
    const p = pts([[2, 1, roofZ(1) + 0.1], [8, 2, roofZ(2) + 0.1], [3, 6, roofZ(6) - 0.1], [6, 7, roofZ(7) - 0.1]]);
    const req = { buildingId: model.buildingId, modelVersion: model.version, selection: ALL, thresholdM: 0.05 };
    expect(requestOk(req)).toBe(true);
    const r = /** @type {any} */ (deviationStats(model, p, req, PROFILE));
    expect(resultOk(r.result), JSON.stringify(resultOk.errors)).toBe(true);
    expect(face(r, 'f-roof-s')).toMatchObject({ pointCount: 2 });
    expect(face(r, 'f-roof-s').meanM).toBeCloseTo(0.08, 12);
    expect(face(r, 'f-roof-n').meanM).toBeCloseTo(-0.08, 12);
    expect(r.result.summary).toMatchObject({ pointCount: 4, shareBeyondThreshold: 1 });
    expect(r.result.summary.rmseM).toBeCloseTo(0.08, 12);
    expect(r.result.faces.map((/** @type {any} */ f) => f.faceId)).toEqual(Object.keys(model.faces).sort());
  });

  it('excludes points farther than heatmapBufferM from every face polygon', () => {
    const p = pts([[5, 2, roofZ(2) + 0.5], [5, 2, roofZ(2) + 2], [20, 20, 5]]);
    const r = /** @type {any} */ (deviationStats(model, p, { selection: ALL, thresholdM: 0.3 }, PROFILE));
    expect(r.result.summary.pointCount).toBe(1);
    expect(r.result.summary.shareBeyondThreshold).toBe(1);
    const none = /** @type {any} */ (deviationStats(model, pts([[50, 50, 50]]), { selection: ALL, thresholdM: 0.3 }, PROFILE));
    expect(none.result.summary).toEqual({ pointCount: 0, rmseM: 0, maxAbsM: 0, shareBeyondThreshold: 0 });
  });

  it('faceIds limits the reported faces, not the assignment', () => {
    const p = pts([[2, 1, roofZ(1) + 0.02], [3, 6, roofZ(6) + 0.2]]);
    const r = /** @type {any} */ (deviationStats(model, p, { selection: ALL, thresholdM: 0.05, faceIds: ['f-roof-s'] }, PROFILE));
    expect(r.result.faces).toHaveLength(1);
    expect(r.result.summary.pointCount).toBe(1);
    expect(r.result.summary.shareBeyondThreshold).toBe(0);
  });

  it('beyond the polygon edge the distance is to the edge, not to the unbounded plane', () => {
    const south = /** @type {any} */ (facePolygons(model).find((f) => f.id === 'f-roof-s'));
    // Point on the extension of the south plane, 1 m beyond the west edge (x = -1): plane distance 0, polygon 1.
    expect(polygonDistance(south, [-1, 2, roofZ(2)])).toBeCloseTo(1, 12);
    expect(polygonDistance(south, [5, 2, roofZ(2) + 0.1])).toBeCloseTo(0.08, 12);
  });

  it('refuses unknown faces, a missing threshold and a bad selection with INVALID_PAYLOAD; deterministic', () => {
    const p = pts([[2, 1, 6]]);
    const bad = [
      { selection: ALL, thresholdM: 0.05, faceIds: ['f-nope'] },
      { selection: ALL },
      { selection: { kind: 'BOX', min: [1, 1, 1], max: [0, 0, 0] }, thresholdM: 0.05 },
    ];
    for (const req of bad) {
      const r = /** @type {any} */ (deviationStats(model, p, /** @type {any} */ (req), PROFILE));
      expect(r.error.code).toBe('INVALID_PAYLOAD');
      expect(errorOk(r.error)).toBe(true);
    }
    const req = { selection: ALL, thresholdM: 0.05 };
    expect(canonicalJson(deviationStats(model, p, req, PROFILE))).toBe(canonicalJson(deviationStats(model, p, req, PROFILE)));
  });
});
