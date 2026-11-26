// 3D-114 RESIZE_ROOF with moveWallFootprint true (D-339; RR-01..RR-06, D-3D114-2): footprint := outline, roof planes
// kept, walls and ground rebuilt. Expected numbers are analytic (prism + roof formulas), computed here.
import { describe, expect, it } from 'vitest';
import { exec, gable, hip, sound } from './envelope.helpers.js';
import { metrics, replaceRoof, withFootprint, slopeDeg } from './helpers.js';

const near = (/** @type {number} */ a, /** @type {number} */ b, eps = 0.01) => expect(Math.abs(a - b)).toBeLessThanOrEqual(eps);
/** @param {number} x0 @param {number} y0 @param {number} x1 @param {number} y1 */
const box = (x0, y0, x1, y1) => [[x0, y0], [x1, y0], [x1, y1], [x0, y1]];
/** @param {any} m @param {number[][]} outline */
const resize = (m, outline) => {
  const out = exec(m, 'RESIZE_ROOF', { roofOutline: outline, moveWallFootprint: true });
  expect(out.result.status, JSON.stringify(out.result.error)).toBe('COMMITTED');
  expect(out.model.state).toBe('VALID_SOLID');
  sound(out.model);
  return out.model;
};
/** Roof support planes by face id. @param {any} m */
const roofPlanes = (m) => Object.fromEntries(Object.values(m.faces).filter((f) => f.surfaceKind === 'RoofSurface').map((f) => [f.id, f.supportPlane]));
/** @param {any} m */
const built = (/** @type {any} */ m) => /** @type {any} */ (m).model;
/** Plan ring of the footprint. @param {any} m */
const fpRing = (m) => m.footprints['fp-1'].outerRing;

describe('RESIZE_ROOF moveWallFootprint true (D-339)', () => {
  it('RR-01 FLAT 10 x 8 at 5 -> 12 x 10: footprint = outline, plane kept, 600 m3', () => {
    const m = built(replaceRoof(gable(), { template: 'FLAT', roofZ: 5 }));
    const r = resize(m, box(-1, -1, 11, 9));
    expect(fpRing(r)).toEqual(box(-1, -1, 11, 9));
    expect(roofPlanes(r)).toEqual(roofPlanes(m));
    const x = metrics(r);
    near(x.volumeM3, 600); near(x.roofAreaM2, 120); near(x.groundAreaM2, 120);
  });

  it('RR-02 SHED z = 5 + 0.3 x -> x from -1 to 12: 691.6 m3, plane kept', () => {
    const m = built(replaceRoof(gable(), { template: 'SHED', slopeAxis: 'LOCAL_X', zLow: 5, zHigh: 8 }));
    const r = resize(m, box(-1, 0, 12, 8));
    expect(roofPlanes(r)).toEqual(roofPlanes(m));
    const x = metrics(r);
    near(x.volumeM3, 8 * (5 * 13 + 0.15 * (144 - 1))); near(x.roofAreaM2, 104 * Math.hypot(1, 0.3));
  });

  it('RR-03 GABLE longer along the ridge (-2..12): planes and roof ids kept, ridge 14 m, 728 m3', () => {
    const g = gable();
    const r = resize(g, box(-2, 0, 12, 8));
    expect(roofPlanes(r)).toEqual(roofPlanes(g));
    const ridge = Object.values(r.vertices).filter((v) => Math.abs(v.p[2] - 8) < 1e-9).map((v) => v.p[0]).sort((a, b) => a - b);
    expect(ridge).toEqual([-2, 12]);
    const x = metrics(r);
    near(x.volumeM3, 112 * 5 + 0.5 * 8 * 3 * 14); near(x.roofAreaM2, 2 * 14 * 5);
  });

  it('RR-04 GABLE narrower across the ridge (y 1..7): eaves at 5.75, ridge kept at 8, 412.5 m3', () => {
    const r = resize(gable(), box(0, 1, 10, 7));
    const zs = [...new Set(Object.values(r.vertices).map((v) => Math.round(v.p[2] * 1e9) / 1e9))].sort((a, b) => a - b);
    expect(zs).toEqual([0, 5.75, 8]);
    const x = metrics(r);
    near(x.volumeM3, 60 * 5.75 + 0.5 * 6 * 2.25 * 10); near(x.roofAreaM2, 2 * 10 * 3.75);
  });

  it('RR-05 HIP (GT-04 planes) -> 12 x 10: eave 4.25, 672.5 m3, roof 150 m2', () => {
    const h = hip();
    const r = resize(h, box(-1, -1, 11, 9));
    expect(roofPlanes(r)).toEqual(roofPlanes(h));
    const x = metrics(r);
    // prism 120 * 4.25 + hip s W^2 (3L - W) / 12 with s = 0.75, L = 12, W = 10; roof = plan / cos
    near(x.volumeM3, 120 * 4.25 + (0.75 * 100 * (36 - 10)) / 12); near(x.roofAreaM2, 120 / 0.8); expect(x.roofFaces).toBe(4);
  });

  it('RR-06 PYRAMID 8 x 8 -> 10 x 10: four faces meet in one apex, 550 m3', () => {
    const s = slopeDeg(3, 4);
    const m = built(replaceRoof(withFootprint(box(0, 0, 8, 8)), { template: 'HIP', ridgeAxis: 'LOCAL_X', eaveZ: 5, slopesDeg: [s, s, s, s] }));
    expect(m.state).toBe('VALID_SOLID');
    const r = resize(m, box(-1, -1, 9, 9));
    const x = metrics(r);
    near(x.volumeM3, 100 * 4.25 + (0.75 * 1000) / 6); near(x.roofAreaM2, 125); expect(x.roofFaces).toBe(4);
    expect(Object.values(r.vertices).filter((v) => Math.abs(v.p[2] - 8) < 1e-9)).toHaveLength(1);
  });
});
