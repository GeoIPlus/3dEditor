// import (3D-10): refusals (codes from the spec §2.4 registry, readings [A] in the module card), LoD / geometry
// selection (spec §6 rule 1) and the 500-face warning (spec §6 rule 15, D-94).
import { describe, expect, it } from 'vitest';
import { importBuilding } from '@geoiplus/geo-model3d';
import { selectGeometry } from '../../src/import/cityjson.js';
import { PROFILE, goldenImport, makeDoc } from './helpers.js';

const { cityjson, step } = goldenImport('GT-I1');
const run = (/** @type {any} */ doc, id = step.cityObjectId) => importBuilding({ cityjson: doc, cityObjectId: id, toleranceProfile: PROFILE, projectId: 'p' });
const code = (/** @type {string} */ c) => expect.objectContaining({ code: c });

describe('refusals', () => {
  it('not a CityJSON cityjson -> INVALID_PAYLOAD', () => {
    expect(() => run({ type: 'FeatureCollection' })).toThrow(code('INVALID_PAYLOAD'));
    expect(() => run({ ...structuredClone(cityjson), vertices: null })).toThrow(code('INVALID_PAYLOAD'));
  });
  it('an index outside the vertex list -> INVALID_PAYLOAD', () => {
    const doc = structuredClone(cityjson);
    doc.CityObjects[step.cityObjectId].geometry[0].boundaries[0][0][0][0] = 999;
    expect(() => run(doc)).toThrow(code('INVALID_PAYLOAD'));
  });
  it('missing CityObject, or one that is not a Building -> NOT_FOUND', () => {
    expect(() => run(cityjson, 'nope')).toThrow(code('NOT_FOUND'));
    const doc = structuredClone(cityjson);
    doc.CityObjects[step.cityObjectId].type = 'Bridge';
    expect(() => run(doc)).toThrow(code('NOT_FOUND'));
  });
  it('no LoD 2.x geometry -> INVALID_GEOMETRY', () => {
    const doc = structuredClone(cityjson);
    doc.CityObjects[step.cityObjectId].geometry[0].lod = '1.2';
    expect(() => run(doc)).toThrow(code('INVALID_GEOMETRY'));
  });
});

describe('geometry selection (rule 1)', () => {
  const g = (/** @type {string} */ type, /** @type {any} */ lod) => ({ type, lod });
  it('highest LoD in the 2.x range; a Solid before a MultiSurface of the same LoD; first of equals', () => {
    expect(selectGeometry([g('MultiSurface', '2.2'), g('Solid', '2.2')])).toBe(1);
    expect(selectGeometry([g('Solid', '2.0'), g('MultiSurface', '2.2')])).toBe(1);
    expect(selectGeometry([g('Solid', '3'), g('Solid', '1.3'), g('Solid', 2)])).toBe(2);
    expect(selectGeometry([g('Solid', '2.2'), g('Solid', '2.2')])).toBe(0);
    expect(selectGeometry([g('GeometryInstance', '2.2'), g('MultiPoint', '2.2')])).toBe(-1);
  });
});

describe('more than 500 faces (D-94)', () => {
  /** @param {number} n separate unit squares in a MultiSurface */
  const squares = (n) => {
    const pts = [], surfaces = [];
    for (let i = 0; i < n; i++) {
      const x = (i % 30) * 2, y = Math.floor(i / 30) * 2;
      pts.push([x, y, 1], [x + 1, y, 1], [x + 1, y + 1, 1], [x, y + 1, 1]);
      surfaces.push([[4 * i, 4 * i + 1, 4 * i + 2, 4 * i + 3]]);
    }
    return makeDoc(pts, { b: { type: 'Building', geometry: [{ type: 'MultiSurface', lod: '2.2', boundaries: surfaces }] } });
  };
  it('501 faces: imported with a warning; 500 faces: no warning', () => {
    const over = run(squares(501), 'b');
    expect(over.report.faceCount).toBe(501);
    expect(over.report.warnings).toEqual(['model3d.import.faceLimitExceeded:501>500']);
    expect(over.model.state).toBe('DRAFT_SOLID');
    expect(run(squares(500), 'b').report.warnings).toEqual([]);
  });
});
