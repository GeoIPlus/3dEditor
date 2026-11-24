// Box of the cloud world for a LOCAL box (3D-69): the curvature pad of `crs/box.js` must contain every point of the
// local box, not only its corners. Dense sampling of a 1 km box over a geographic building (EPSG:4937) with a UTM
// cloud (EPSG:25832), and a projected building with a cloud in the neighbour zone; negative control without the pad.
import { describe, it, expect } from 'vitest';
import { createCrsMapping, createMetricFrame, mappedBoxBounds } from '../../src/crs/index.js';
import { localFrame } from '../../src/brep/index.js';
import { localBoxToCloud, cloudToLocal } from '@geoiplus/geo-model3d';

/** The composition of the package entry (`cloudFrame` in src/index.js), rebuilt here from the two modules. */
function createCloudFrame(/** @type {any} */ frame, /** @type {string} */ cloudCrs) {
  const map = createCrsMapping(cloudCrs, frame.horizontalCrs);
  const metric = createMetricFrame(frame.horizontalCrs, frame.originWorld);
  const lf = localFrame(frame, metric);
  return {
    identity: map.identity,
    rigid: map.identity && metric.crs.kind === 'PROJECTED',
    toCloud: (/** @type {V3} */ l) => map.inverse(lf.toWorld(l)),
  };
}

/** @typedef {[number, number, number]} V3 */
const geoFrame = { horizontalCrs: 'EPSG:4937', verticalCrs: null, axisOrder: 'EAST_NORTH_UP', unit: 'm', originWorld: /** @type {V3} */ ([55.6800, 9.1950, 40]), buildingAxisDeg: 25 };
const utmFrame = { horizontalCrs: 'EPSG:25832', verticalCrs: null, axisOrder: 'EAST_NORTH_UP', unit: 'm', originWorld: /** @type {V3} */ ([812345, 5802345, 40]), buildingAxisDeg: 0 };
const BOX = { min: /** @type {V3} */ ([-500, -500, -20]), max: /** @type {V3} */ ([500, 500, 60]) };

/** Points of the local box on an 11 x 11 x 3 grid, mapped to the cloud world. */
function samples(/** @type {ReturnType<typeof createCloudFrame>} */ cf) {
  const out = [];
  for (let i = 0; i <= 10; i++) for (let j = 0; j <= 10; j++) for (let k = 0; k <= 2; k++) {
    const l = /** @type {V3} */ ([0, 1, 2].map((a) => BOX.min[a] + ((BOX.max[a] - BOX.min[a]) * [i, j, k * 5][a]) / 10));
    out.push(cf.toCloud(l));
  }
  return out;
}
const inside = (/** @type {{min: V3, max: V3}} */ b, /** @type {V3} */ p) => [0, 1, 2].every((k) => p[k] >= b.min[k] && p[k] <= b.max[k]);

describe('cloudBoxOf (3D-69)', () => {
  for (const [name, frame, crs] of /** @type {const} */ ([['geographic building, UTM cloud', geoFrame, 'EPSG:25832'], ['UTM 32 building, UTM 33 cloud', utmFrame, 'EPSG:25833']])) {
    it(`${name}: every sampled point of a 1 km box lies in the padded box; the bare corners miss some`, () => {
      const cf = createCloudFrame(/** @type {any} */ (frame), crs);
      expect(cf.rigid).toBe(false);
      const pts = samples(cf);
      const box = localBoxToCloud(/** @type {any} */ (frame), crs, BOX);
      expect(box).toEqual(mappedBoxBounds(cf.toCloud, cf.rigid, BOX)); // the entry composes the same frame
      expect(pts.filter((p) => !inside(box, p))).toEqual([]);
      const bare = mappedBoxBounds(cf.toCloud, true, BOX); // negative control: corners only
      if (name.startsWith('geographic')) expect(pts.some((p) => !inside(bare, p))).toBe(true);
    });
  }

  it('cloudToLocal inverts toCloud within 1 mm over the box', () => {
    const cf = createCloudFrame(/** @type {any} */ (geoFrame), 'EPSG:25832');
    const local = /** @type {V3[]} */ ([[0, 0, 0], [480, -310, 25], [-500, 500, -20]]);
    const back = cloudToLocal(/** @type {any} */ (geoFrame), 'EPSG:25832', local.map((l) => cf.toCloud(l)));
    for (let i = 0; i < local.length; i++) expect(Math.hypot(...[0, 1, 2].map((k) => back[i][k] - local[i][k]))).toBeLessThan(0.001);
  });

  it('same CRS and a projected building is rigid (the 3D-22 path); a geographic building is not', () => {
    expect(createCloudFrame(/** @type {any} */ (utmFrame), 'EPSG:25832').rigid).toBe(true);
    const g = createCloudFrame(/** @type {any} */ (geoFrame), 'EPSG:4937');
    expect(g.identity).toBe(true);
    expect(g.rigid).toBe(false);
  });
});
