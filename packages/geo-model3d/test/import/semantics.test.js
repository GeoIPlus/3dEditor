// import (3D-10): spec §6 rule 7 - carried semantics; a face without semantics is classified by its normal
// (|n.z| < 0.1 wall, n.z < -0.9 ground, otherwise roof) and tagged SEMANTICS_INFERRED.
import { describe, expect, it } from 'vitest';
import { importBuilding } from '@geoiplus/geo-model3d';
import { classifySurface } from '../../src/import/semantics.js';
import { PROFILE, goldenImport } from './helpers.js';

const { document, step } = goldenImport('GT-I1');
/** @param {(g: any) => void} edit */
const importEdited = (edit) => {
  const doc = structuredClone(document);
  edit(doc.CityObjects[step.cityObjectId].geometry[0]);
  return importBuilding({ document: doc, cityObjectId: step.cityObjectId, toleranceProfile: PROFILE, projectId: 'p' });
};
const kinds = (/** @type {any} */ m) => Object.values(m.faces).map((/** @type {any} */ f) => f.surfaceKind).sort();

describe('semantics at import', () => {
  it('without semantics every face is classified by its normal and tagged SEMANTICS_INFERRED', () => {
    const { model, report } = importEdited((g) => { delete g.semantics; });
    expect(kinds(model)).toEqual(['GroundSurface', 'RoofSurface', 'RoofSurface', 'WallSurface', 'WallSurface', 'WallSurface', 'WallSurface']);
    for (const f of Object.values(model.faces)) expect(f.tags).toContain('SEMANTICS_INFERRED');
    expect(report.inferredSemanticsFaceIds.length).toBe(7);
    expect(model.state).toBe('VALID_SOLID');
  });
  it('a surface with a null semantics value is inferred; the others are carried untagged', () => {
    const { model, report } = importEdited((g) => { g.semantics.values[0][0] = null; });
    const inferred = Object.values(model.faces).filter((f) => f.tags.includes('SEMANTICS_INFERRED'));
    expect(inferred.map((f) => f.surfaceKind)).toEqual(['GroundSurface']);
    expect(report.inferredSemanticsFaceIds).toEqual([inferred[0].id]);
  });
  it('the thresholds of rule 7 on the boundaries', () => {
    expect(classifySurface(null, [1, 0, 0.0999])).toEqual({ surfaceKind: 'WallSurface', inferred: true });
    expect(classifySurface(null, [0.99, 0, -0.1])).toEqual({ surfaceKind: 'RoofSurface', inferred: true });
    expect(classifySurface(null, [0, 0.43, -0.9])).toEqual({ surfaceKind: 'RoofSurface', inferred: true });
    expect(classifySurface(null, [0, 0.4, -0.9001])).toEqual({ surfaceKind: 'GroundSurface', inferred: true });
    expect(classifySurface(null, [0, 0, 1])).toEqual({ surfaceKind: 'RoofSurface', inferred: true });
  });
  it('a carried type outside the contract SurfaceKind enum is Unclassified, not re-guessed [A]', () => {
    expect(classifySurface('+GreenRoof', [0, 0, 1])).toEqual({ surfaceKind: 'Unclassified', inferred: false });
    expect(classifySurface('ClosureSurface', [0, 0, 1])).toEqual({ surfaceKind: 'ClosureSurface', inferred: false });
  });
});
