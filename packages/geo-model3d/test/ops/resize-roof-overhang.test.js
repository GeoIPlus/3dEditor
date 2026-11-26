// 3D-114 RESIZE_ROOF and overhangs (D-339, D-336; RR-07..RR-09, D-3D114-2). GT-14-sized end caps need the
// SMALL_FACES profile until 3D-117 (D-343).
import { describe, expect, it } from 'vitest';
import { exec, gable, sound, sameGeometry, SMALL_FACES } from './envelope.helpers.js';
import { metrics } from './helpers.js';

const near = (/** @type {number} */ a, /** @type {number} */ b, eps = 0.01) => expect(Math.abs(a - b)).toBeLessThanOrEqual(eps);
const BOTH = ['he-f-roof-s-0', 'he-f-roof-n-0'];
/** @param {any} m @param {number[][]} outline @param {boolean} mv */
const resize = (m, outline, mv) => {
  const out = exec(m, 'RESIZE_ROOF', { roofOutline: outline, moveWallFootprint: mv }, SMALL_FACES);
  expect(out.result.status, JSON.stringify(out.result.error)).toBe('COMMITTED');
  sound(out.model, SMALL_FACES.toleranceProfile);
  return out.model;
};
/** @param {number} w */
const eaves = (w) => [[0, -w], [10, -w], [10, 8 + w], [0, 8 + w]];
const overhangFaces = (/** @type {any} */ m) => Object.values(m.faces).filter((f) => f.tags.includes('OVERHANG')).length;

describe('RESIZE_ROOF moveWallFootprint false closes by the D-336 overhang', () => {
  it('RR-07 outline 0.5 m beyond both eaves == SET_OVERHANG 0.5 m on both (same faces, GT-14 numbers)', () => {
    const r = resize(gable(), eaves(0.5), false);
    const o = exec(gable(), 'SET_OVERHANG', { eaveEdgeIds: BOTH, overhangM: 0.5 }, SMALL_FACES).model;
    sameGeometry(r, o);
    expect(r.footprints).toEqual(gable().footprints);
    const x = metrics(r);
    near(x.roofAreaM2, 112.5);
    const edge = Object.values(r.vertices).filter((v) => Math.abs(v.p[1] + 0.5) < 1e-9).map((v) => v.p[2]);
    for (const z of edge) near(z, 4.625, 1e-9);
  });

  it('RR-08 an existing 0.5 m overhang: outline at 0.8 m widens it (same ids), outline = footprint removes it', () => {
    const o = resize(gable(), eaves(0.5), false);
    const wide = resize(o, eaves(0.8), false);
    expect(Object.keys(wide.faces).sort()).toEqual(Object.keys(o.faces).sort());
    sameGeometry(wide, exec(gable(), 'SET_OVERHANG', { eaveEdgeIds: BOTH, overhangM: 0.8 }, SMALL_FACES).model);
    const back = resize(wide, eaves(0), false);
    expect(overhangFaces(back)).toBe(0);
    sameGeometry(back, gable());
  });

  it('RR-09 moveWallFootprint true on a roof with an overhang: overhang faces removed, footprint = outline', () => {
    const o = resize(gable(), eaves(0.5), false);
    const r = resize(o, eaves(0.5), true);
    expect(overhangFaces(r)).toBe(0);
    expect(r.footprints['fp-1'].outerRing).toEqual(eaves(0.5));
    const x = metrics(r);
    // 10 x 9 plan, eave 4.625, ridge 8: prism 90 * 4.625 + gable 0.5 * 9 * 3.375 * 10
    near(x.volumeM3, 90 * 4.625 + 0.5 * 9 * 3.375 * 10); near(x.roofAreaM2, 112.5); near(x.groundAreaM2, 90);
  });
});
