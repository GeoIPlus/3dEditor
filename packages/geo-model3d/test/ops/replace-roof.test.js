// REPLACE_ROOF templates beyond the golden tests (3D-14; spec §10.3 r1-r6; v0.2 C.1-C.4). Expected numbers are
// analytic (prism / hip formulas), computed here, never read from the kernel.
import { describe, expect, it } from 'vitest';
import { replaceRoof, withFootprint, gableModel, metrics, slopeDeg, maxPlaneDistance, PROFILE } from './helpers.js';

const RECT = [[0, 0], [10, 0], [10, 8], [0, 8]];
/** @param {any} out */
const ok = (out) => { expect(out.result.status, JSON.stringify(out.result.error)).toBe('COMMITTED'); expect(maxPlaneDistance(out.model)).toBeLessThanOrEqual(PROFILE.planarTolM); return metrics(out.model); };
/** @param {any} out @param {string} code */
const refused = (out, code) => { expect(out.result.status).toBe('REJECTED'); expect(out.result.error.code).toBe(code); return out.result.error; };
const near = (/** @type {number} */ a, /** @type {number} */ b) => expect(Math.abs(a - b)).toBeLessThanOrEqual(0.01);

describe('R-01 FLAT (v0.2 C.1)', () => {
  it('any outline: L footprint 56 m2 at 5 m -> 280 m3, 6 walls', () => {
    const m = ok(replaceRoof(withFootprint([[0, 0], [10, 0], [10, 4], [4, 4], [4, 8], [0, 8]]), { template: 'FLAT', roofZ: 5 }));
    near(m.roofAreaM2, 56); near(m.volumeM3, 280); expect(m.walls).toBe(6);
  });
  it('courtyard: 10 x 8 minus 2 x 2 -> roof and ground 76 m2, 380 m3, 8 walls, VALID_SOLID', () => {
    const out = replaceRoof(withFootprint(RECT, [[[3, 3], [5, 3], [5, 5], [3, 5]]]), { template: 'FLAT', roofZ: 5 });
    const m = ok(out);
    near(m.roofAreaM2, 76); near(m.groundAreaM2, 76); near(m.volumeM3, 380); expect(m.walls).toBe(8);
    expect(out.model.state).toBe('VALID_SOLID');
  });
  it('a roofPlane within flatRoofTolDeg is used as given', () => {
    const t = Math.tan((0.5 * Math.PI) / 180), l = Math.hypot(t, 1);
    const m = ok(replaceRoof(gableModel(), { template: 'FLAT', roofPlane: { normal: [-t / l, 0, 1 / l], d: -5 / l } }));
    near(m.volumeM3, 80 * (5 + 5 * t));
  });
  it('errors -> INVALID_GEOMETRY with the footprint id (D-76, D-3D14-4)', () => {
    const t = Math.tan((10 * Math.PI) / 180), l = Math.hypot(t, 1);
    expect(refused(replaceRoof(gableModel(), { template: 'FLAT', roofPlane: { normal: [-t / l, 0, 1 / l], d: -5 / l } }), 'INVALID_GEOMETRY').entityIds).toEqual(['fp-1']);
    refused(replaceRoof(gableModel(), { template: 'FLAT', roofPlane: { normal: [1, 0, 0], d: -5 } }), 'INVALID_GEOMETRY');
    refused(replaceRoof(gableModel(), { template: 'FLAT', roofZ: 0 }), 'INVALID_GEOMETRY');
    refused(replaceRoof(withFootprint([[0, 0], [10, 8], [10, 0], [0, 8]]), { template: 'FLAT', roofZ: 5 }), 'INVALID_GEOMETRY');
    refused(replaceRoof(withFootprint([[0, 0], [10, 0], [20, 0]]), { template: 'FLAT', roofZ: 5 }), 'INVALID_GEOMETRY');
  });
  it('WORLD heights are mapped to local z; a WORLD roofPlane is refused (D-3D14-6)', () => {
    const model = gableModel();
    model.frame.originWorld = [512000, 6170000, 100];
    near(ok(replaceRoof(model, { template: 'FLAT', roofZ: 105 }, { coordinateFrame: 'WORLD' })).volumeM3, 400);
    refused(replaceRoof(model, { template: 'FLAT', roofPlane: { normal: [0, 0, 1], d: -105 } }, { coordinateFrame: 'WORLD' }), 'INVALID_PAYLOAD');
  });
});

describe('R-02 SHED (v0.2 C.2)', () => {
  it('along X 5 -> 8 over 10: 520 m3, roof 8 * sqrt(109); falling (zHigh < zLow) keeps the given direction', () => {
    const m = ok(replaceRoof(gableModel(), { template: 'SHED', slopeAxis: 'LOCAL_X', zLow: 5, zHigh: 8 }));
    near(m.volumeM3, 520); near(m.roofAreaM2, 8 * Math.sqrt(109));
    near(ok(replaceRoof(gableModel(), { template: 'SHED', slopeAxis: 'LOCAL_X', zLow: 8, zHigh: 5 })).volumeM3, 520);
  });
  /** @param {any} model @param {string} id @param {number[]} p @param {'LOCAL' | 'WORLD'} frame */
  const point = (model, id, p, frame = 'LOCAL') => {
    model.measurements[id] = { id, geometry: { kind: 'POINT', coordinates: [p] }, sourceType: 'MANUAL', sourceId: null, horizontalCrs: 'EPSG:25832', verticalCrs: null, frame, status: 'MEASURED', createdBy: 'usr-t' };
  };
  it('three POINT measurements (D-3D14-4), one in WORLD: the GT-02 plane -> 520 m3, roof 85.44 m2', () => {
    const model = gableModel();
    point(model, 'm-1', [1, 0, 5]); point(model, 'm-2', [9, 8, 8]); point(model, 'm-3', [512001, 6170008, 8], 'WORLD');
    const m = ok(replaceRoof(model, { template: 'SHED', measurementIds: ['m-1', 'm-2', 'm-3'] }));
    near(m.volumeM3, 520); near(m.roofAreaM2, 85.44);
  });
  it('collinear points -> UNDERCONSTRAINED_GEOMETRY; a LINE measurement -> INVALID_MEASUREMENT; unknown id -> INVALID_PAYLOAD', () => {
    const model = gableModel();
    point(model, 'm-1', [0, 0, 5]); point(model, 'm-2', [5, 4, 6]); point(model, 'm-3', [10, 8, 7]);
    refused(replaceRoof(model, { template: 'SHED', measurementIds: ['m-1', 'm-2', 'm-3'] }), 'UNDERCONSTRAINED_GEOMETRY');
    model.measurements['m-3'].geometry.kind = 'LINE';
    refused(replaceRoof(model, { template: 'SHED', measurementIds: ['m-1', 'm-2', 'm-3'] }), 'INVALID_MEASUREMENT');
    refused(replaceRoof(model, { template: 'SHED', measurementIds: ['m-1', 'm-2', 'm-9'] }), 'INVALID_PAYLOAD');
  });
});

describe('R-03 GABLE (v0.2 C.3)', () => {
  const G = { template: 'GABLE', eaveZ: 5, symmetric: true };
  it('ridge along Y: 520 m3, roof 2 * 8 * sqrt(34); slope instead of ridgeZ gives the GT-03 roof', () => {
    const m = ok(replaceRoof(gableModel(), { ...G, ridgeAxis: 'LOCAL_Y', ridgeZ: 8 }));
    near(m.volumeM3, 520); near(m.roofAreaM2, 16 * Math.sqrt(34));
    const s = ok(replaceRoof(gableModel(), { ...G, ridgeAxis: 'LOCAL_X', slopeDeg: slopeDeg(3, 4) }));
    near(s.volumeM3, 520); near(s.roofAreaM2, 100);
  });
  it('off-centre ridge (ridgeOffsetM 1): prism volume unchanged, 520 m3', () => {
    near(ok(replaceRoof(gableModel(), { ...G, ridgeAxis: 'LOCAL_X', ridgeZ: 8, symmetric: false, ridgeOffsetM: 1 })).volumeM3, 520);
  });
  it('a rectangle 30 deg off the local axes: 520 m3', () => {
    const c = Math.cos(Math.PI / 6), s = Math.sin(Math.PI / 6);
    const ring = RECT.map(([x, y]) => [x * c - y * s, x * s + y * c]);
    near(ok(replaceRoof(withFootprint(ring), { ...G, ridgeAxis: 'LOCAL_X', ridgeZ: 8 })).volumeM3, 520);
  });
  it('impossible givens -> INVALID_GEOMETRY (D-3D14-3, D-3D14-5); a 45 deg square -> UNDERCONSTRAINED_GEOMETRY', () => {
    refused(replaceRoof(gableModel(), { ...G, ridgeAxis: 'LOCAL_X', ridgeZ: 4.9 }), 'INVALID_GEOMETRY');
    refused(replaceRoof(gableModel(), { ...G, ridgeAxis: 'LOCAL_X', eaveZ: 0, ridgeZ: 3 }), 'INVALID_GEOMETRY');
    refused(replaceRoof(gableModel(), { ...G, ridgeAxis: 'LOCAL_X', ridgeZ: 8, symmetric: false, ridgeOffsetM: 4.5 }), 'INVALID_GEOMETRY');
    refused(replaceRoof(gableModel(), { ...G, ridgeAxis: 'LOCAL_X', slopeDeg: 30, symmetric: false, ridgeOffsetM: 1 }), 'INVALID_GEOMETRY');
    refused(replaceRoof(withFootprint([[5, 0], [10, 5], [5, 10], [0, 5]]), { ...G, ridgeAxis: 'LOCAL_X', ridgeZ: 8 }), 'UNDERCONSTRAINED_GEOMETRY');
  });
});

describe('R-04 HIP (v0.2 C.4)', () => {
  const s = slopeDeg(3, 4), s45 = 45;
  // hip roof over L x W with height h and end run e: W * h * (2L + (L - 2e)) / 6 (the v0.3 §12 GT-04 reference form)
  const hipVolume = (/** @type {number} */ L, /** @type {number} */ W, /** @type {number} */ h, /** @type {number} */ e) => L * W * 5 + (W * h * (2 * L + (L - 2 * e))) / 6;
  it('steeper ends (45 deg): ridge 4 m, 496 m3', () => {
    near(ok(replaceRoof(gableModel(), { template: 'HIP', ridgeAxis: 'LOCAL_X', eaveZ: 5, slopesDeg: [s, s45, s, s45] })).volumeM3, hipVolume(10, 8, 3, 3));
  });
  it('slopes follow the stored ring order, also for a clockwise ring', () => {
    const cw = withFootprint([[0, 0], [0, 8], [10, 8], [10, 0]]); // edges: west, north, east, south
    near(ok(replaceRoof(cw, { template: 'HIP', ridgeAxis: 'LOCAL_X', eaveZ: 5, slopesDeg: [s45, s, s45, s] })).volumeM3, hipVolume(10, 8, 3, 3));
  });
  it('degenerate ridge (8 x 8, equal slopes) gives four triangles meeting at Z 8 (spec §10.3 r3): 384 m3', () => {
    const out = replaceRoof(withFootprint([[0, 0], [8, 0], [8, 8], [0, 8]]), { template: 'HIP', ridgeAxis: 'LOCAL_X', eaveZ: 5, slopesDeg: [s, s, s, s] });
    const m = ok(out);
    expect(m.roofFaces).toBe(4);
    near(m.volumeM3, 64 * 5 + (64 * 3) / 3);
    const apex = Object.values(out.model.vertices).filter((v) => v.definingFaceIds.every((f) => out.model.faces[f].surfaceKind === 'RoofSurface'));
    expect(apex.length).toBe(1);
    expect(/** @type {any} */ (apex[0]).definingFaceIds.length).toBe(4);
    near(/** @type {any} */ (apex[0]).p[2], 8);
  });
  it('end hips that cross (ridge length < 0) -> INVALID_GEOMETRY (D-3D14-3)', () => {
    refused(replaceRoof(gableModel(), { template: 'HIP', ridgeAxis: 'LOCAL_X', eaveZ: 5, slopesDeg: [s, 10, s, 10] }), 'INVALID_GEOMETRY');
  });
});
