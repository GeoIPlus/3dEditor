// export (3D-11; spec §7 rule 2, Accept 2): untouched vertices are byte-equal integers (D-70); changed ones are rounded
// (`exportRoundDecimals`; geographic: +5 decimals of a degree, D-123) before quantisation to the file grid; a coarser
// grid yields PRECISION_LOSS; a changed vertex whose index is used elsewhere in the output is appended (D-191);
// only used vertices are written, re-indexed (D-192).
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { exportBuilding } from '@geoiplus/geo-model3d';
import { goldenImport } from '../import/helpers.js';
import { PROFILE, roundTrip, moved, vertexOfFile, world, indices } from './helpers.js';

const { cityjson: GT, step } = goldenImport('GT-I1');
const ID = step.cityObjectId;
const GEO = JSON.parse(readFileSync(new URL('../crs/fixtures/gt-i1-epsg4937.cityjson.json', import.meta.url), 'utf8'));

describe('projected CRS (EPSG:25832, millimetre grid)', () => {
  const { model } = roundTrip(GT, ID);
  const ridge = [vertexOfFile(model, 8), vertexOfFile(model, 9)];
  const d = [0.12345, -0.0004, 0.4321];
  const out = exportBuilding({ model: moved(model, ridge, d), cityjson: GT, toleranceProfile: PROFILE });
  it('changed vertices are rounded to 3 decimals, then put on the 0.001 grid; error <= half a step per axis', () => {
    for (const i of [8, 9]) {
      const want = world(GT, i).map((c, k) => c + d[k]);
      const got = world(out.cityjson, i);
      for (let k = 0; k < 3; k++) expect(Math.abs(got[k] - want[k])).toBeLessThanOrEqual(0.0005 + 1e-9);
      expect(out.cityjson.vertices[i]).toEqual(want.map((c, k) => Math.round((Math.round(c * 1000) / 1000 - GT.transform.translate[k]) / 0.001)));
    }
  });
  it('untouched vertices keep their integers (DERIVED but unmoved ones re-quantise to the same integers)', () => {
    for (let i = 0; i < 8; i++) expect(out.cityjson.vertices[i]).toEqual(GT.vertices[i]);
    expect(out.findings).toEqual([]);
  });
  it('a grid coarser than the rounding step reports PRECISION_LOSS with the changed vertex ids', () => {
    const coarse = structuredClone(GT);
    coarse.transform.scale = [0.01, 0.01, 0.01];
    coarse.vertices = coarse.vertices.map((/** @type {number[]} */ v) => v.map((c) => c / 10));
    const r = roundTrip(coarse, ID);
    expect(r.findings).toEqual([]); // nothing changed, nothing lost
    const e = exportBuilding({ model: moved(r.model, [vertexOfFile(r.model, 8)], d), cityjson: coarse, toleranceProfile: PROFILE });
    expect(e.findings.length).toBe(1);
    expect(e.findings[0].code).toBe('PRECISION_LOSS');
    expect(e.findings[0].entityIds).toContain(vertexOfFile(r.model, 8));
  });
});

describe('geographic CRS (EPSG:4937, D-123)', () => {
  const id = Object.keys(GEO.CityObjects)[0];
  it('unedited: identical document', () => {
    expect(JSON.stringify(roundTrip(GEO, id).cityjson)).toBe(JSON.stringify(GEO));
  });
  it('edited: angles get 8 decimals of a degree, heights 3; untouched integers kept, no -0', () => {
    const { model } = roundTrip(GEO, id);
    const v = vertexOfFile(model, 8);
    const out = exportBuilding({ model: moved(model, [v], [0.3, 0.2, 0.1]), cityjson: GEO, toleranceProfile: PROFILE });
    const w = world(out.cityjson, 8);
    expect(Math.abs(w[0] * 1e8 - Math.round(w[0] * 1e8))).toBeLessThan(1e-4);
    expect(Math.abs(w[2] * 1e3 - Math.round(w[2] * 1e3))).toBeLessThan(1e-6);
    expect(out.cityjson.vertices[8]).not.toEqual(GEO.vertices[8]);
    for (const i of [0, 1, 2, 3, 4, 5, 6, 7]) expect(out.cityjson.vertices[i]).toEqual(GEO.vertices[i]);
    expect(out.cityjson.vertices.flat().some((/** @type {number} */ c) => Object.is(c, -0))).toBe(false);
    expect(out.findings).toEqual([]);
  });
});

describe('vertex list (D-191, D-192)', () => {
  it('another building is left out; only used vertices are written, ascending; geometry re-indexed', () => {
    const doc = structuredClone(GT);
    const n = doc.vertices.length;
    doc.vertices = [[1, 1, 1], ...doc.vertices, [2, 2, 2]];
    doc.CityObjects[ID].geometry[0].boundaries = JSON.parse(JSON.stringify(doc.CityObjects[ID].geometry[0].boundaries), (_k, x) => (typeof x === 'number' ? x + 1 : x));
    doc.CityObjects.other = { type: 'Building', geometry: [{ type: 'MultiSurface', lod: '1', boundaries: [[[0, n + 1, 1]]] }] };
    const out = roundTrip(doc, ID).cityjson;
    expect(Object.keys(out.CityObjects)).toEqual([ID]);
    expect(out.vertices).toEqual(GT.vertices);
    expect(out.CityObjects[ID]).toEqual(GT.CityObjects[ID]);
  });
  it('a changed vertex used by another geometry of the output is appended; that geometry keeps the old point', () => {
    const doc = structuredClone(GT);
    doc.CityObjects[ID].geometry.unshift({ type: 'MultiPoint', lod: '1', boundaries: [8] });
    const { model } = roundTrip(doc, ID);
    const out = exportBuilding({ model: moved(model, [vertexOfFile(model, 8)], [0, 0, 1]), cityjson: doc, toleranceProfile: PROFILE }).cityjson;
    expect(out.vertices.length).toBe(GT.vertices.length + 1);
    expect(out.CityObjects[ID].geometry[0].boundaries).toEqual([8]);
    expect(out.vertices[8]).toEqual(GT.vertices[8]);
    const roof = indices(out.CityObjects[ID].geometry[1].boundaries);
    expect(roof).toContain(GT.vertices.length);
    expect(roof).not.toContain(8);
    expect(out.vertices[GT.vertices.length]).toEqual([GT.vertices[8][0], GT.vertices[8][1], GT.vertices[8][2] + 1000]);
  });
  it('a changed vertex used nowhere else is written in place', () => {
    const { model } = roundTrip(GT, ID);
    const out = exportBuilding({ model: moved(model, [vertexOfFile(model, 8)], [0, 0, 1]), cityjson: GT, toleranceProfile: PROFILE }).cityjson;
    expect(out.vertices.length).toBe(GT.vertices.length);
    expect(out.vertices[8]).toEqual([GT.vertices[8][0], GT.vertices[8][1], GT.vertices[8][2] + 1000]);
  });
});
