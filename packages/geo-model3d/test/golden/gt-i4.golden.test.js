// GT-I4 (v0.3 §12; spec §7, §13; row 3D-11): import GT-I1 -> export without edits: geometry within 0.001 m, semantics
// and object ids identical, val3dity without errors. Expected values are read from the fixture; coordinates are
// decoded by the test's own code (v0.2 F.3). "val3dity without errors" is proven by 3D-74 against the pinned image
// (D-189, services/kernel/test/gt-i4-val3dity.golden.test.js); here the export is re-imported and checked by `validateModel` (FINAL_VALIDATION, stub port, full solid).
import { describe, expect, it } from 'vitest';
import { importBuilding, exportBuilding, validateModel } from '@geoiplus/geo-model3d';
import { PROFILE, goldenImport } from '../import/helpers.js';
import { readFixture } from '../brep/helpers.js';

const { cityjson, step } = goldenImport('GT-I4');
const expected = readFixture('GT-I4', 'expected.json');
const a = expected.assert;
const exportStep = readFixture('GT-I4', 'steps.json').find((/** @type {any} */ s) => s.step === 'EXPORT');
const { model } = importBuilding({ cityjson, cityObjectId: step.cityObjectId, toleranceProfile: PROFILE, projectId: 'prj-golden' });
const { cityjson: out, findings } = exportBuilding({ model, cityjson, toleranceProfile: PROFILE });

/** World coordinates of vertex `i` of `doc`. @param {any} doc @param {number} i @returns {number[]} */
const decode = (doc, i) => doc.vertices[i].map((/** @type {number} */ c, /** @type {number} */ k) => c * doc.transform.scale[k] + doc.transform.translate[k]);
/** Positions of every boundary slot of a geometry, in file nesting. @param {any} doc @param {any} b @returns {any} */
const positions = (doc, b) => (typeof b === 'number' ? decode(doc, b) : b.map((/** @type {any} */ x) => positions(doc, x)));

describe('GT-I4 import -> export without edits', () => {
  it('the fixture is the one row 3D-11 owns; steps IMPORT then EXPORT; input is GT-I1', () => {
    expect(expected.owner.row).toBe('3D-11');
    expect(step.toleranceProfile).toBe(PROFILE.id);
    expect(exportStep).toBeTruthy();
    expect(cityjson).toEqual(readFixture('GT-I1', 'input.cityjson.json'));
  });
  it(`geometry within ${a.geometryToleranceM} m, slot by slot`, () => {
    let worst = 0;
    for (const [id, o] of Object.entries(cityjson.CityObjects)) {
      /** @type {any[]} */ const g0 = /** @type {any} */ (o).geometry;
      const g1 = out.CityObjects[id].geometry;
      expect(g1.map((/** @type {any} */ g) => [g.type, g.lod])).toEqual(g0.map((g) => [g.type, g.lod]));
      g0.forEach((g, k) => {
        const p0 = positions(cityjson, g.boundaries).flat(Infinity), p1 = positions(out, g1[k].boundaries).flat(Infinity);
        expect(p1.length).toBe(p0.length);
        p0.forEach((/** @type {number} */ c, /** @type {number} */ j) => { worst = Math.max(worst, Math.abs(c - p1[j])); });
      });
    }
    console.log(`GT-I4 largest coordinate difference ${worst} m`);
    expect(worst).toBeLessThanOrEqual(a.geometryToleranceM);
  });
  it('semantics identical', () => {
    expect(a.semanticsIdentical).toBe(true);
    for (const [id, o] of Object.entries(cityjson.CityObjects)) {
      expect(out.CityObjects[id].geometry.map((/** @type {any} */ g) => g.semantics)).toEqual(/** @type {any} */ (o).geometry.map((/** @type {any} */ g) => g.semantics));
    }
  });
  it('object ids identical (CityObjects, and the model ids of a re-import)', () => {
    expect(a.objectIdsIdentical).toBe(true);
    expect(Object.keys(out.CityObjects)).toEqual(Object.keys(cityjson.CityObjects));
    const again = importBuilding({ cityjson: out, cityObjectId: step.cityObjectId, toleranceProfile: PROFILE, projectId: 'prj-golden' });
    expect(Object.keys(again.model.faces)).toEqual(Object.keys(model.faces));
    expect(Object.values(again.model.faces).map((f) => f.sourceRef)).toEqual(Object.values(model.faces).map((f) => f.sourceRef));
    expect(again.model.buildingId).toBe(model.buildingId);
  });
  it('no export findings; re-import validates without errors (FINAL_VALIDATION, stub port, full solid; D-189)', async () => {
    expect(findings).toEqual([]);
    const again = importBuilding({ cityjson: out, cityObjectId: step.cityObjectId, toleranceProfile: PROFILE, projectId: 'prj-golden' });
    const port = { validate: async () => ({ validatorVersion: 'stub (val3dity binding: 3D-74)', findings: [] }) };
    const r = await validateModel(again.model, {
      mode: 'FINAL_VALIDATION', targetState: 'VALID_SOLID', tolerances: PROFILE, clock: () => '2026-11-24T00:00:00Z', fullSolid: true,
      externalValidator: port,
    });
    expect(r.issues.filter((i) => i.severity === 'ERROR')).toEqual([]);
    expect(r.isValidForTargetState).toBe(true);
  });
  // "val3dity without errors" against the pinned image: services/kernel/test/gt-i4-val3dity.golden.test.js (3D-74, D-189).
});
