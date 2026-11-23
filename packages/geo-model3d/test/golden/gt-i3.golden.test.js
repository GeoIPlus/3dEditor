// GT-I3 (v0.3 §12; spec §13; row 3D-10): CityJSON whose roof slopes are two triangles each -> after import 2 roof
// faces (coplanar triangles merged), `sourceRef` kept.
import { describe, expect, it } from 'vitest';
import { importBuilding } from '@geoiplus/geo-model3d';
import { PROFILE, faceArea, goldenImport } from '../import/helpers.js';

const { document, step, expected } = goldenImport('GT-I3');
const a = expected.assert;
const { model, report } = importBuilding({ document, cityObjectId: step.cityObjectId, toleranceProfile: PROFILE, projectId: 'prj-golden' });
const roof = Object.values(model.faces).filter((f) => f.surfaceKind === 'RoofSurface');
const base = `${step.cityObjectId}/geometry/0/boundaries/0`;

describe('GT-I3 import of a triangulated roof', () => {
  it('the fixture is the one row 3D-10 owns', () => expect(expected.owner.row).toBe('3D-10'));
  it(`${a.roofFacesAfterImport} roof faces after import`, () => {
    expect(roof.length).toBe(a.roofFacesAfterImport);
    for (const f of roof) expect(faceArea(model, f)).toBeCloseTo(50, 9);
  });
  it('sourceRef kept: each roof face names its input triangles; vertices keep file indices', () => {
    expect(a.sourceRefKept).toBe(true);
    const merged = Object.values(report.mergedFaces).map((refs) => [...refs].sort()).sort();
    expect(merged).toEqual([[`${base}/5`, `${base}/6`], [`${base}/7`, `${base}/8`]]);
    for (const f of roof) expect(report.mergedFaces[f.id]).toContain(f.sourceRef);
    for (const v of Object.values(model.vertices)) expect(v.sourceRef).toMatch(/^\d+(,\d+)*$/);
  });
  it('the merged model is a closed solid (VALID_SOLID, no issues)', () => {
    expect(model.state).toBe('VALID_SOLID');
    expect(report.issues).toEqual([]);
  });
});
