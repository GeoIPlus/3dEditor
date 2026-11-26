// Overhang volume, boundary topology and tolerance (3D-116; D-3D116-3): OVM-07..OVM-15, OVM-25..OVM-27,
// OVM-31..OVM-35. The internal failure reason of `overhangVolume` (not a contract member) names the check that failed.
import { describe, expect, it } from 'vitest';
import { reverseFace } from '../validate/helpers.js';
import { mainBody } from '../../src/metrics/body.js';
import { overhangVolume, components, loopSelfIntersects } from '../../src/metrics/overhang.js';
import { lModel, withCopy } from './builders.js';
import { metricsOf, withOverhang, gableModel, EAVE, wedge, PROFILE } from './helpers.js';

const eps = PROFILE.numericEpsilon;
const gt14 = () => withOverhang(gableModel(), [EAVE.s, EAVE.n], 0.5);
const ov = (/** @type {any} */ m) => overhangVolume(mainBody(m), eps);
/** GT-14 with exactly these faces tagged OVERHANG. @param {string[]} faces */
function tagged(faces) {
  const m = gt14();
  for (const f of Object.values(m.faces)) f.tags = faces.includes(f.id) ? ['OVERHANG'] : [];
  return m;
}
/** Vertex of the model at a position. @param {any} m @param {number[]} p */
const vertexAt = (m, p) => /** @type {any} */ (Object.values(m.vertices).find((/** @type {any} */ v) => v.p.every((/** @type {number} */ x, /** @type {number} */ k) => Math.abs(x - p[k]) < 1e-9)));
/** GT-14 with the loop vertex (x, y0, 4.625) moved by dy off the eave wall plane. @param {number} y0 @param {number} dy */
function moved(y0, dy) {
  const m = gt14();
  vertexAt(m, [0, y0, 4.625]).p[1] += dy;
  return m;
}
/** Split absent, total kept (D-3D116-2 partial availability). @param {any} r */
const splitNull = (r) => expect([r.mainVolumeM3, r.overhangVolumeM3]).toEqual([null, null]);

describe('boundary topology (OVM-07..OVM-15)', () => {
  it('OVM-07: a concave planar L-shaped loop -> exact signed volume 5 (prism), main 64 (box)', () => {
    const m = lModel(), r = metricsOf(m);
    expect(ov(m).groups.length).toBe(1);
    expect(r.overhangVolumeM3).toBeCloseTo(5, 12); expect(r.mainVolumeM3).toBeCloseTo(64, 12); expect(r.geometricSolidVolumeM3).toBeCloseTo(69, 12);
  });

  it('OVM-08, OVM-14: a missing end cap leaves the group open -> no split, no partial volume; the shell is open -> N/A', () => {
    const m = gt14(), cap = /** @type {string} */ (Object.keys(m.faces).find((f) => m.faces[f].surfaceKind === 'WallSurface' && m.faces[f].tags.includes('OVERHANG')));
    for (const h of Object.values(m.halfEdges)) if (h.faceId === cap) { if (h.twinId) m.halfEdges[h.twinId].twinId = null; delete m.halfEdges[h.id]; }
    delete m.faces[cap];
    for (const sh of Object.values(m.shells)) sh.faceIds = sh.faceIds.filter((f) => f !== cap);
    for (const v of Object.values(m.vertices)) v.definingFaceIds = v.definingFaceIds.filter((f) => f !== cap);
    expect(ov(m)).toMatchObject({ volume: null, reason: 'OPEN' });
    const r = metricsOf(m);
    expect([r.volumeStatus, r.mainVolumeM3, r.overhangVolumeM3, r.geometricSolidVolumeM3]).toEqual(['NOT_AVAILABLE', null, null, null]);
  });

  it('OVM-09: a branched boundary (a vertex starts two boundary edges) -> unavailable', () => {
    expect(ov(tagged(['f-5', 'f-6', 'f-roof-n', 'f-wall-e']))).toMatchObject({ volume: null, reason: 'BRANCH' });
  });

  it('OVM-10: a self-intersecting loop is detected (bow tie); a simple concave loop is not', () => {
    expect(loopSelfIntersects([[0, 0], [2, 2], [2, 0], [0, 2]], eps)).toBe(true);
    expect(loopSelfIntersects([[0, 0], [3, 0], [3, 1], [1, 1], [1, 3], [0, 3]], eps)).toBe(false);
  });

  it('OVM-11: one connected group with two boundary loops (a band of faces) -> unsupported in V1', () => {
    expect(ov(tagged(['f-5', 'f-6', 'f-roof-n', 'f-wall-e', 'f-wall-n']))).toMatchObject({ volume: null, reason: 'MULTIPLE_LOOPS' });
  });

  it('OVM-12: a boundary that is not in any bordering wall plane -> unavailable', () => {
    expect(ov(tagged(['f-1']))).toMatchObject({ volume: null, reason: 'NOT_IN_WALL_PLANE' });
  });

  it('OVM-13: reversed orientation is detected, never fixed by an absolute value', () => {
    const m = gt14();
    Object.keys(m.faces).forEach((f) => reverseFace(m, f));
    expect(ov(m)).toMatchObject({ volume: null, reason: 'PROTRUDES' });
    const r = metricsOf(m);
    expect([r.volumeStatus, r.geometricSolidVolumeM3]).toEqual(['NOT_AVAILABLE', null]);
    const flipped = gt14(); // ring orientation reversed but the wall normal kept: the closed group has a negative volume
    for (const f of Object.keys(flipped.faces)) if (flipped.faces[f].tags.includes('OVERHANG')) reverseFace(flipped, f);
    expect(ov(flipped).volume).toBeNull();
  });

  it('OVM-15: faces that share only a vertex are separate components (south strip and west gable at (0, 0, 5))', () => {
    const m = gt14();
    expect(components(mainBody(m), new Set(['f-1', 'f-wall-w'])).length).toBe(2);
  });
});

describe('partial availability and invalid configurations (OVM-25..OVM-27)', () => {
  it('OVM-25, OVM-26: one valid group and one off-plane group -> both split volumes null, total kept PROVISIONAL', () => {
    const r = metricsOf(moved(8, 1e-6));
    splitNull(r);
    expect(r.volumeStatus).toBe('PROVISIONAL');
    expect(r.geometricSolidVolumeM3).toBeGreaterThan(521);
  });

  it('OVM-27: a group reaching into the main body, and overlapping groups -> unavailable', () => {
    expect(ov(tagged(['f-1', 'f-2', 'f-4', 'f-5', 'f-6', 'f-7', 'f-ground', 'f-roof-n', 'f-roof-s', 'f-wall-e', 'f-wall-n', 'f-wall-s'])))
      .toMatchObject({ volume: null, reason: 'PROTRUDES' });
    expect(ov(withCopy(gt14()))).toMatchObject({ volume: null, reason: 'OVERLAP' });
  });
});

describe('numericEpsilon (OVM-31..OVM-35)', () => {
  it('OVM-31: loop vertices exactly on the wall plane -> split given', () => {
    expect(ov(gt14()).volume).toBeCloseTo(2 * wedge(0.5), 12);
  });
  it('OVM-32: deviation within numericEpsilon (1e-10 m) -> split given', () => {
    const r = metricsOf(moved(0, -1e-10));
    expect(r.overhangVolumeM3).toBeCloseTo(1.875, 6);
  });
  it('OVM-33: deviation above numericEpsilon but below planarTolM (1e-6 m) -> no split, no projection', () => {
    const m = moved(0, -1e-6), before = vertexAt(m, [0, -1e-6, 4.625]).p.slice();
    splitNull(metricsOf(m));
    expect(vertexAt(m, [0, -1e-6, 4.625]).p).toEqual(before);
  });
  it('OVM-34: deviation above planarTolM (0.05 m) -> no split', () => {
    const r = metricsOf(moved(0, -0.05));
    splitNull(r);
  });
  it('OVM-35: a wall plane written with scaled coefficients gives the same planarity verdict and volume', () => {
    const m = gt14(), w = m.faces['f-wall-s'].supportPlane;
    m.faces['f-wall-s'].supportPlane = { normal: /** @type {[number, number, number]} */ (w.normal.map((x) => x * 7)), d: w.d * 7 };
    expect(ov(m).volume).toBeCloseTo(ov(gt14()).volume ?? NaN, 12);
    const off = moved(0, -1e-6), wo = off.faces['f-wall-s'].supportPlane;
    off.faces['f-wall-s'].supportPlane = { normal: /** @type {[number, number, number]} */ (wo.normal.map((x) => x * 7)), d: wo.d * 7 };
    expect(ov(off).volume).toBeNull();
  });
});
