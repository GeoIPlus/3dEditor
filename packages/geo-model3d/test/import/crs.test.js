// import (3D-10) with crs (3D-32): spec §6 rules 2 and 14 - unknown or unsupported CRS -> INVALID_CRS; a geographic CRS
// is imported into a local ENU frame (D-92); a projected CRS by translation only.
import { describe, expect, it } from 'vitest';
import { importBuilding, localToWorld } from '@geoiplus/geo-model3d';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { decodeVertex } from '../../src/crs/index.js';
import { PROFILE, faceArea, goldenImport, volume } from './helpers.js';

const { document, step } = goldenImport('GT-I1');
const GEO = JSON.parse(readFileSync(join(dirname(fileURLToPath(import.meta.url)), '..', 'crs', 'fixtures', 'gt-i1-epsg4937.cityjson.json'), 'utf8'));
const run = (/** @type {any} */ doc, id = step.cityObjectId) =>
  importBuilding({ document: doc, cityObjectId: id, toleranceProfile: PROFILE, projectId: 'p' });

describe('CRS at import', () => {
  it.each([
    ['unknown EPSG code', 'https://www.opengis.net/def/crs/EPSG/0/999999'],
    ['non-metre projected CRS (D-125)', 'https://www.opengis.net/def/crs/EPSG/0/2263'],
    ['malformed reference', 'not a crs'],
    ['missing reference', undefined],
  ])('%s -> INVALID_CRS', (_, ref) => {
    const doc = structuredClone(document);
    if (ref === undefined) delete doc.metadata.referenceSystem; else doc.metadata.referenceSystem = ref;
    expect(() => run(doc)).toThrow(expect.objectContaining({ code: 'INVALID_CRS' }));
  });

  it('projected: frame = translation by the box centre; local -> world gives the file coordinates', () => {
    const { model } = run(document);
    expect(model.frame).toMatchObject({ horizontalCrs: 'EPSG:25832', axisOrder: 'EAST_NORTH_UP', unit: 'm', buildingAxisDeg: 0 });
    expect(model.frame.originWorld).toEqual([512005, 6170004, 4]);
    let max = 0;
    for (const v of Object.values(model.vertices)) {
      const [w] = localToWorld(model.frame, [v.p]);
      const f = decodeVertex(document.vertices[Number(String(v.sourceRef).split(',')[0])], document.transform);
      max = Math.max(max, Math.hypot(w[0] - f[0], w[1] - f[1], w[2] - f[2]));
    }
    expect(max).toBeLessThanOrEqual(1e-9);
  });

  it('geographic (EPSG:4937): imported into a local ENU frame with the GT-I1 shape', () => {
    const id = Object.keys(GEO.CityObjects)[0];
    const { model, report } = run(GEO, id);
    expect(model.frame.horizontalCrs).toBe('EPSG:4937');
    expect(report.assignedState).toBe('VALID_SOLID');
    expect(Object.keys(model.faces).length).toBe(7);
    // The fixture is GT-I1's UTM grid coordinates made geographic, so true (ENU) plan lengths differ from the grid by
    // the UTM point scale k (0.9996..1.001 in a zone): the plan is GT-I1 scaled by 1/k, heights unchanged (D-93).
    const faces = Object.values(model.faces);
    const ground = faces.filter((f) => f.surfaceKind === 'GroundSurface').reduce((s, f) => s + faceArea(model, f), 0);
    const s2 = ground / 80;
    expect(Math.abs(Math.sqrt(s2) - 1)).toBeLessThan(1e-3);
    expect(Math.abs(volume(model) - 520 * s2)).toBeLessThanOrEqual(0.01);
    const zs = Object.values(model.vertices).map((v) => v.p[2]);
    expect(Math.max(...zs) - Math.min(...zs)).toBeCloseTo(8, 3);
  });
});
