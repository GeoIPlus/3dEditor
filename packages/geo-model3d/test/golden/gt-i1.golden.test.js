// GT-I1 (v0.3 §12; spec §13; row 3D-10): CityJSON gable 10 x 8, base 0, eave 5, ridge 8 -> VALID_SOLID; 7 faces,
// 10 vertices, 15 edges; 2 RoofSurface; 1 RIDGE, 2 EAVE, 4 RAKE; volume 520 m3; roof area 100 m2. Expected values are
// read from the fixture, never edited to match the code; area and volume are computed by the test's own code.
import { describe, expect, it } from 'vitest';
import { importBuilding } from '@geoiplus/geo-model3d';
import { PROFILE, faceArea, goldenImport, roleCounts, volume } from '../import/helpers.js';

const { document, step, expected } = goldenImport('GT-I1');
const a = expected.assert;
const { model, report } = importBuilding({ document, cityObjectId: step.cityObjectId, toleranceProfile: PROFILE, projectId: 'prj-golden' });
const faces = Object.values(model.faces);

describe('GT-I1 import of a gable', () => {
  it('the fixture is the one row 3D-10 owns', () => {
    expect(expected.owner.row).toBe('3D-10');
    expect(step.toleranceProfile).toBe(PROFILE.id);
  });
  it(`state ${a.state}, assigned by import`, () => {
    expect(model.state).toBe(a.state);
    expect(report.assignedState).toBe(a.state);
    expect(report.issues).toEqual([]);
  });
  it(`${a.faces} faces, ${a.vertices} vertices, ${a.edges} edges`, () => {
    expect(faces.length).toBe(a.faces);
    expect(Object.keys(model.vertices).length).toBe(a.vertices);
    expect(Object.keys(model.halfEdges).length / 2).toBe(a.edges);
  });
  it(`${a.roofSurfaces} RoofSurface faces and edge roles ${JSON.stringify(a.edgeRoles)}`, () => {
    expect(faces.filter((f) => f.surfaceKind === 'RoofSurface').length).toBe(a.roofSurfaces);
    const roles = roleCounts(model);
    for (const [role, n] of Object.entries(a.edgeRoles)) expect(roles[role], role).toBe(n);
  });
  it(`volume ${a.volumeM3} m3 and roof area ${a.roofAreaM2} m2 within the §12 tolerance`, () => {
    const v = volume(model);
    const roof = faces.filter((f) => f.surfaceKind === 'RoofSurface').reduce((s, f) => s + faceArea(model, f), 0);
    console.log(`GT-I1 volume ${v} m3, roof area ${roof} m2`);
    expect(Math.abs(v - a.volumeM3)).toBeLessThanOrEqual(expected.tolerance.volumeM3);
    expect(Math.abs(roof - a.roofAreaM2)).toBeLessThanOrEqual(expected.tolerance.areaM2);
  });
});
