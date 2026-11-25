// Public world <-> local mapping for every supported CRS (3D-81; spec §1.2, §4; D-92, D-116). GT-I1 is imported from
// EPSG:25832 (fixture), from its EPSG:4937 copy (test/crs/fixtures, 3D-32) and from an EPSG:31467 copy (north-first
// projected, axis order northing, easting); `worldToLocal` of the file's world vertices must land on the model's local
// vertices and `localToWorld` must give the file vertices back, within 0.001 m. GT-25 (east-first projected) must be
// unchanged bit for bit against the plain translation of 3D-09.
import { describe, expect, it } from 'vitest';
import { importBuilding, localToWorld, worldToLocal } from '@geoiplus/geo-model3d';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { decodeVertex } from '../../src/crs/index.js';
import { localFrame } from '../../src/brep/index.js';
import { readFixture } from '../brep/helpers.js';
import { PROFILE, goldenImport } from '../import/helpers.js';

const TOL_M = 0.001; // row 3D-81 Accept
const { cityjson: GT_I1 } = goldenImport('GT-I1');
const GEO = JSON.parse(readFileSync(join(dirname(fileURLToPath(import.meta.url)), '..', 'crs', 'fixtures', 'gt-i1-epsg4937.cityjson.json'), 'utf8'));

/**
 * GT-I1 as an EPSG:31467 file (DHDN / 3-degree Gauss-Kruger zone 3, axis order northing, easting): the UTM grid
 * coordinates moved to a zone-3 easting (+3 000 000 m) and written north-first. A projected CRS is imported by
 * translation only, so the shape is GT-I1's; what this copy tests is the axis swap, not a datum transformation.
 */
function northFirstCopy() {
  const doc = structuredClone(GT_I1);
  const t = doc.transform;
  doc.vertices = doc.vertices.map((/** @type {number[]} */ v) => [v[1], v[0], v[2]]);
  doc.transform = { scale: [t.scale[1], t.scale[0], t.scale[2]], translate: [t.translate[1], t.translate[0] + 3e6, t.translate[2]] };
  doc.metadata = { ...doc.metadata, referenceSystem: 'https://www.opengis.net/def/crs/EPSG/0/31467' };
  return doc;
}

const R = 6378137; // metres per radian on the GRS80 equator: an upper bound of the metre length of a degree difference
/** World distance in metres; geographic files are lat, lon (EPSG axis order) in degrees. */
const metres = (/** @type {boolean} */ geographic) => (/** @type {number[]} */ a, /** @type {number[]} */ b) => {
  if (!geographic) return Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);
  const k = (Math.PI / 180) * R;
  return Math.hypot((a[0] - b[0]) * k, (a[1] - b[1]) * k * Math.cos((a[0] * Math.PI) / 180), a[2] - b[2]);
};
const dist = metres(false);

const CASES = [
  ['EPSG:25832 (east-first projected)', GT_I1, 'EPSG:25832', false],
  ['EPSG:4937 (geographic, lat lon h)', GEO, 'EPSG:4937', true],
  ['EPSG:31467 (north-first projected)', northFirstCopy(), 'EPSG:31467', false],
];

describe('3D-81 worldToLocal / localToWorld agree with import for every CRS', () => {
  it.each(CASES)('%s', (_, doc, crs, geographic) => {
    const id = Object.keys(doc.CityObjects)[0];
    const { model } = importBuilding({ cityjson: doc, cityObjectId: id, toleranceProfile: PROFILE, projectId: 'p' });
    expect(model.frame.horizontalCrs).toBe(crs);
    const verts = Object.values(model.vertices);
    const world = verts.map((v) => decodeVertex(doc.vertices[Number(String(v.sourceRef).split(',')[0])], doc.transform));
    const local = worldToLocal(model.frame, world);
    const toModel = Math.max(...local.map((p, i) => dist(p, verts[i].p)));
    const back = localToWorld(model.frame, verts.map((v) => v.p));
    const toFile = Math.max(...back.map((w, i) => metres(/** @type {boolean} */ (geographic))(w, world[i])));
    const round = localToWorld(model.frame, local);
    const roundTrip = Math.max(...round.map((w, i) => metres(/** @type {boolean} */ (geographic))(w, world[i])));
    console.log(`3D-81 ${crs}: world->local ${toModel.toExponential(3)} m, local->world ${toFile.toExponential(3)} m, round trip ${roundTrip.toExponential(3)} m over ${verts.length} vertices`);
    expect(toModel).toBeLessThanOrEqual(TOL_M);
    expect(toFile).toBeLessThanOrEqual(TOL_M);
    expect(roundTrip).toBeLessThanOrEqual(TOL_M);
  });

  it('GT-25 (east-first projected): bit for bit the plain translation of 3D-09', () => {
    const model = readFixture('GT-25', 'input.model.json');
    const { points } = readFixture('GT-25', 'input.world.json');
    const plain = localFrame(model.frame);
    const local = worldToLocal(model.frame, points);
    expect(local).toEqual(points.map((/** @type {any} */ p) => plain.toLocal(p)));
    expect(localToWorld(model.frame, local)).toEqual(local.map((p) => plain.toWorld(p)));
    expect(Math.max(...localToWorld(model.frame, local).map((w, i) => dist(w, points[i])))).toBe(0);
  });
});
