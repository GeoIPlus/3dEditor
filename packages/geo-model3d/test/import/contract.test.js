// import (3D-10): outputs are contract shapes (building-model, import-report; Ajv), the core invariants hold, the input
// cityjson is not written, and import is deterministic (spec §6, §4; 3D-ADR-0002 C1 rule 3).
import { describe, expect, it } from 'vitest';
import { importBuilding, canonicalJson } from '@geoiplus/geo-model3d';
import { checkTopology, vertexPlaneViolations, roofGraph } from '../../src/brep/index.js';
import { createAjv } from '../../../../contracts/model3d/test/load.mjs';
import { deepFreeze, readFixture, TOL } from '../brep/helpers.js';
import { PROFILE, goldenImport } from './helpers.js';

const ajv = createAjv();
const validModel = /** @type {any} */ (ajv.getSchema('urn:geoiplus:schema:model3d-building-model:v1'));
const validReport = /** @type {any} */ (ajv.getSchema('urn:geoiplus:schema:model3d-import-report:v1'));
const run = (/** @type {any} */ cityjson, /** @type {string} */ id) =>
  importBuilding({ cityjson, cityObjectId: id, toleranceProfile: PROFILE, projectId: 'prj-golden' });

describe.each(['GT-I1', 'GT-I2', 'GT-I3'])('%s import outputs', (gt) => {
  const { cityjson, step } = goldenImport(gt);
  deepFreeze(cityjson); // proves import never writes its input (opaque members stay as they are, spec §6 rule 12)
  const { model, baseline, report } = run(cityjson, step.cityObjectId);

  it('model, baseline and report are valid contract shapes', () => {
    expect(validModel(model), JSON.stringify(validModel.errors)).toBe(true);
    expect(validModel(baseline), JSON.stringify(validModel.errors)).toBe(true);
    expect(validReport(report), JSON.stringify(validReport.errors)).toBe(true);
  });
  it('baseline equals the model at version 0 and is a separate object', () => {
    expect(model.version).toBe(0);
    expect(report.modelVersion).toBe(0);
    expect(baseline).toEqual(model);
    expect(baseline).not.toBe(model);
    expect(baseline.vertices).not.toBe(model.vertices);
  });
  it('every vertex keeps its file position: EXPLICIT with sourceRef (D-70); on its planes within planarTolM', () => {
    for (const v of Object.values(model.vertices)) {
      expect(v.positionMode).toBe('EXPLICIT');
      expect(v.sourceRef).toBeTruthy();
    }
    expect(vertexPlaneViolations(model, TOL)).toEqual([]);
  });
  it('structurally sound half-edges (brep checkTopology) and an RTG projection over roof faces', () => {
    expect(checkTopology(model)).toEqual([]);
    const rtg = roofGraph(model);
    expect(rtg.faceIds.length).toBe(2);
    expect(Object.values(rtg.components).flat().sort()).toEqual(rtg.faceIds);
  });
  it('deterministic: a second import is byte-identical in canonical JSON', () => {
    const again = run(readFixture(gt, step.document), step.cityObjectId);
    expect(canonicalJson(again.model)).toBe(canonicalJson(model));
    expect(canonicalJson(again.report)).toBe(canonicalJson(report));
  });
});

describe('injected ids and building id', () => {
  it('uses the caller id source and buildingId (Q-26, Q-32 stay open)', () => {
    const { cityjson, step } = goldenImport('GT-I1');
    let n = 0;
    const { model, report } = importBuilding({
      cityjson, cityObjectId: step.cityObjectId, toleranceProfile: PROFILE, projectId: 'p', buildingId: 'b-1',
      ids: (kind) => `${kind}:${++n}`,
    });
    expect(model.buildingId).toBe('b-1');
    expect(report.buildingId).toBe('b-1');
    expect(Object.keys(model.faces).every((id) => id.startsWith('face:'))).toBe(true);
  });
  it('without a profile id the import is refused (INVALID_PAYLOAD)', () => {
    const { cityjson, step } = goldenImport('GT-I1');
    const { id: _, ...anonymous } = PROFILE;
    expect(() => importBuilding({ cityjson, cityObjectId: step.cityObjectId, toleranceProfile: anonymous, projectId: 'p' }))
      .toThrow(expect.objectContaining({ code: 'INVALID_PAYLOAD' }));
  });
});
