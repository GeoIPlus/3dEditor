// import (3D-10): spec §6 rule 16 / Accept 5 (D-70) - on a noisy input (vertices up to 0.015 m off their fitted planes)
// import keeps every vertex at its file position, so import -> export without edits reproduces the input within
// 0.001 m. Export is 3D-11's; here the write-back of 3D-32 (`writeBackVertices`, no changed vertex) stands for it.
import { describe, expect, it } from 'vitest';
import { importBuilding, localToWorld } from '@geoiplus/geo-model3d';
import { createMetricFrame, decodeVertex, writeBackVertices } from '../../src/crs/index.js';
import { PROFILE, goldenImport } from './helpers.js';

const { cityjson, step } = goldenImport('GT-I1');
// deterministic noise of +-15 mm in Z on the eave and ridge vertices (integers in mm)
const NOISE = [0, 0, 0, 0, 15, -15, 15, -15, 15, -15];
const noisy = structuredClone(cityjson);
noisy.vertices = noisy.vertices.map((/** @type {number[]} */ v, /** @type {number} */ i) => [v[0], v[1], v[2] + NOISE[i]]);
const { model, report } = importBuilding({ cityjson: noisy, cityObjectId: step.cityObjectId, toleranceProfile: PROFILE, projectId: 'p' });

describe('noisy input keeps file positions (D-70)', () => {
  it('vertices are off their fitted planes by more than the noise floor, but within planarTolM: no NON_PLANAR_FACE', () => {
    let max = 0;
    for (const v of Object.values(model.vertices)) {
      for (const f of v.definingFaceIds) {
        const pl = model.faces[f].supportPlane;
        max = Math.max(max, Math.abs(pl.normal[0] * v.p[0] + pl.normal[1] * v.p[1] + pl.normal[2] * v.p[2] + pl.d));
      }
    }
    expect(max).toBeGreaterThan(0.005);
    expect(max).toBeLessThanOrEqual(PROFILE.planarTolM);
    expect(report.nonPlanarFaceIds).toEqual([]);
  });
  it('every vertex maps back to its file coordinates within 0.001 m (not moved onto a plane)', () => {
    let max = 0;
    for (const v of Object.values(model.vertices)) {
      const [w] = localToWorld(model.frame, [v.p]);
      for (const ix of String(v.sourceRef).split(',').map(Number)) {
        const f = decodeVertex(noisy.vertices[ix], noisy.transform);
        max = Math.max(max, Math.hypot(w[0] - f[0], w[1] - f[1], w[2] - f[2]));
      }
    }
    expect(max).toBeLessThanOrEqual(0.001);
  });
  it('the unedited write-back gives the input integers unchanged', () => {
    const frame = createMetricFrame(noisy.metadata.referenceSystem, model.frame.originWorld);
    const out = writeBackVertices({
      frame, transform: noisy.transform, fileVertices: noisy.vertices, changed: new Map(), exportRoundDecimals: PROFILE.exportRoundDecimals,
    });
    expect(out.vertices).toEqual(noisy.vertices);
  });
  it('a face beyond planarTolM is tagged NON_PLANAR_FACE, kept, and its vertices stay (spec §6 rules 4, 16)', () => {
    const bent = structuredClone(cityjson);
    bent.vertices[8] = [bent.vertices[8][0], bent.vertices[8][1], bent.vertices[8][2] + 200]; // ridge end +0.2 m
    const r = importBuilding({ cityjson: bent, cityObjectId: step.cityObjectId, toleranceProfile: PROFILE, projectId: 'p' });
    expect(r.report.nonPlanarFaceIds.length).toBeGreaterThan(0);
    expect(r.report.issues.filter((i) => i.code === 'NON_PLANAR_FACE').map((i) => i.entityIds[0]).sort()).toEqual([...r.report.nonPlanarFaceIds].sort());
    expect(r.model.state).toBe('DRAFT_SOLID');
    expect(Object.keys(r.model.faces).length).toBe(7);
    const v8 = Object.values(r.model.vertices).find((v) => v.sourceRef === '8');
    expect(v8 && v8.positionMode).toBe('EXPLICIT');
  });
});
