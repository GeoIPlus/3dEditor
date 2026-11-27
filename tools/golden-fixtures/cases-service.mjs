// GT-20, GT-21 (cloud, 3D-22) and GT-22..GT-24 (kernel service, 3D-24 / 3D-25).

import { toModel } from './brep.mjs';
import { IMPORT_TRANSLATE, toCityJson } from './cityjson.mjs';
import { command } from './fixture.mjs';
import { gable, hip } from './geom.mjs';
import { GT20, gt20Points, shiftZ } from './points.mjs';
import { GABLE, MARK, gt03Model } from './models.mjs';
import { alignRidge85 } from './cases-edit.mjs';

/** @typedef {import('./fixture.mjs').Def} Def */

/** Options of `toModel` for a model as imported from a CityJSON object (D-70). @param {string} cityObjectId */
const asImported = (cityObjectId) => ({ imported: true, cityObjectId, originWorld: IMPORT_TRANSLATE });

const BASE_MARKS = [MARK.gt03, MARK.ids, MARK.version, MARK.crs, MARK.commit];
const POINTS_MARK = {
  what: `Points: plan x 0..${GT20.xMax}, y 0..${GT20.yMax} (the GT-03 south slope), ${GT20.total} in total of which ${GT20.outliers} outliers, Gaussian noise along Z (Irwin-Hall), outliers ${GT20.outlierMin}..${GT20.outlierMax} m above or below the plane, rounded to 0.1 mm, seed ${GT20.seed}`,
  mark: /** @type {const} */ ('[P]'), why: 'D-99, D-102; "500 points" read as the total [A]',
};
const TRUTH = 'Outlier positions, for the fixture test only; never sent to the kernel';
const REQ = (/** @type {string} */ name, /** @type {string} */ actorId, /** @type {object} */ params, /** @type {string} */ row) => ({
  step: 'REQUEST', name, actorId, params, shape: `TBD (${row}): service request, not a command; wire shape set by the row`,
});
const CONTEXT_MARK = { what: 'Actors `usr-operator` (role `3dqm.production`) and `usr-reviewer` (`3dqm.qa`); assignment `asg-1`; `leaseRef` TBD', mark: /** @type {const} */ ('[P]'), why: 'Roles from spec §11 r2 (D-09, D-10); lease fields Q-39' };

/** @param {Record<string, string[]>} assigned actorId -> building ids */
const context = (assigned) => ({
  actors: [{ id: 'usr-operator', roles: ['3dqm.production'] }, { id: 'usr-reviewer', roles: ['3dqm.qa'] }],
  assignments: Object.entries(assigned).map(([actorId, buildingIds], i) => ({ id: `asg-${i + 1}`, actorId, buildingIds, leaseRef: 'TBD (Q-39)' })),
  exportRequiresApproval: false,
});

/** @returns {Def[]} */
export function serviceCases() {
  const { points, outlierIndices } = gt20Points();
  // FIT_PLANE / heatmap selection (D-132): a LOCAL box around every point, bounds rounded outward to whole metres.
  const lo = [0, 1, 2].map((k) => Math.floor(Math.min(...points.map((p) => p[k]))));
  const hi = [0, 1, 2].map((k) => Math.ceil(Math.max(...points.map((p) => p[k]))));
  const sel = { kind: 'BOX', min: lo, max: hi };
  const SEL_MARK = { what: `Selection = LOCAL BOX [${lo}]..[${hi}] around all points (whole metres, outward)`, mark: /** @type {const} */ ('[P]'), why: 'D-132 (Q-18); v0.3 §12 fits all 500 points' };
  return [
    {
      gt: 'GT-20',
      inputs: { 'input.model.json': gt03Model('bld-gt-20'), 'input.points.json': { frame: 'LOCAL', points }, 'truth.points.json': { note: TRUTH, outlierIndices } },
      steps: [command({ gt: 'GT-20', n: 1, buildingId: 'bld-gt-20', operation: 'FIT_PLANE', payload: { selection: sel, apply: 'MEASUREMENT' }, expectedVersion: 1 })],
      assert: { plane: 'z = 0.75 y + 5', normalDeviationDegMax: 0.2, rmseMMax: 0.015, inlierRatioMin: 0.85, points: 500, sigmaM: 0.01, outlierPercent: 10 },
      marks: [...BASE_MARKS, POINTS_MARK, SEL_MARK, { what: 'FIT_PLANE on the GT-03 model, `apply` MEASUREMENT', mark: '[A]', why: 'A command needs a building; the fit is compared, not applied to a face' }],
      check: 'The test fits a least-squares plane to the inliers with its own code: normal deviation <= 0.2 deg, RMSE <= 0.015 m, inlier ratio 450 / 500 = 0.9 >= 0.85.',
    },
    {
      gt: 'GT-21',
      inputs: { 'input.model.json': gt03Model('bld-gt-21'), 'input.points.json': { frame: 'LOCAL', points: shiftZ(points) }, 'truth.points.json': { note: TRUTH, outlierIndices } },
      steps: [{ ...REQ('HEATMAP', 'usr-operator', { faceIds: ['f-roof-s'], points: 'input.points.json', selection: { kind: 'BOX', min: lo, max: [hi[0], hi[1], hi[2] + 1] } }, '3D-22'), shape: 'contracts/model3d heatmap-request (D-136); thresholdM is required but not asserted by GT-21: the runner sets it' }],
      assert: { meanSlopeDeviationM: 0.08, toleranceM: 0.005, distance: 'normal', shiftZM: 0.1 },
      marks: [...BASE_MARKS, POINTS_MARK, { ...SEL_MARK, what: 'Selection = GT-20 box, top raised 1 m for the +0.10 m shift' }, { what: 'GT-20 points + 0.10 m in Z; heatmap of the south slope; outliers left in (excluded by `heatmapBufferM` 1.0)', mark: '[P]', why: 'D-102' }],
      check: 'The test computes the mean normal distance of the in-buffer points to the south plane: 0.10 * cos(atan 0.75) = 0.080 +/- 0.005 m (v0.3 §12).',
    },
    {
      gt: 'GT-22',
      inputs: { 'input.model.json': gt03Model('bld-gt-22'), 'input.context.json': context({ 'usr-operator': ['bld-gt-22'], 'usr-reviewer': ['bld-gt-22'] }) },
      steps: [
        command({ gt: 'GT-22', n: 1, buildingId: 'bld-gt-22', operation: 'ALIGN_RIDGE', payload: alignRidge85, expectedVersion: 1 }),
        REQ('SET_STATUS', 'usr-operator', { status: 'APPROVED' }, '3D-24'),
        REQ('FINAL_VALIDATION', 'usr-reviewer', {}, '3D-24'),
        REQ('SET_STATUS', 'usr-reviewer', { status: 'APPROVED' }, '3D-24'),
        { ...command({ gt: 'GT-22', n: 2, buildingId: 'bld-gt-22', operation: 'TRANSLATE_BUILDING', payload: { vector: [1, 0, 0] }, expectedVersion: 2 }), note: 'expectedVersion 2 assumes approval creates no model version: TBD (3D-24)' },
      ],
      assert: { operatorApprove: { httpStatus: 403, code: 'FORBIDDEN' }, reviewerNonAuthorApproves: true, laterEditResetsStatus: true },
      marks: [...BASE_MARKS, CONTEXT_MARK, { what: 'Operator edit = GT-07; later edit = TRANSLATE_BUILDING (1,0,0); FINAL_VALIDATION before approval', mark: '[P]', why: 'Spec §11 r8: approve after FINAL_VALIDATION' }],
      check: 'The test checks the reviewer authored no version and the operator lacks the `3dqm.qa` role (spec §11 r2, r8).',
    },
    {
      gt: 'GT-23',
      inputs: { 'input.model.json': gt03Model('bld-gt-23'), 'input.context.json': context({ 'usr-operator': ['bld-gt-23-other'] }) },
      steps: [REQ('READ_MODEL', 'usr-operator', { buildingId: 'bld-gt-23' }, '3D-23'),
        command({ gt: 'GT-23', n: 1, buildingId: 'bld-gt-23', operation: 'TRANSLATE_BUILDING', payload: { vector: [1, 0, 0] }, expectedVersion: 1 })],
      assert: { read: { httpStatus: 403, code: 'FORBIDDEN' }, write: { httpStatus: 403, code: 'FORBIDDEN' } },
      marks: [...BASE_MARKS, CONTEXT_MARK, { what: 'Operator assignment holds only `bld-gt-23-other`; write = TRANSLATE_BUILDING (1,0,0)', mark: '[P]', why: '"outside the signed assignment" (D-10)' }],
      check: 'The test checks `bld-gt-23` is in no assignment of the acting operator.',
    },
    {
      gt: 'GT-24',
      inputs: {
        'input.model.bld-gt-24-a.json': toModel(GABLE, { buildingId: 'bld-gt-24-a', ...asImported('bld-gt-24-a') }),
        'input.model.bld-gt-24-b.json': toModel(gable({ gap: 0.03 }), { buildingId: 'bld-gt-24-b', ...asImported('bld-gt-i2') }),
        'input.model.bld-gt-24-c.json': toModel(hip(), { buildingId: 'bld-gt-24-c', ...asImported('bld-gt-24-c') }),
        'input.cityjson.bld-gt-24-a.json': toCityJson(GABLE, { cityObjectId: 'bld-gt-24-a' }),
        'input.cityjson.bld-gt-24-b.json': toCityJson(gable({ gap: 0.03 }), { cityObjectId: 'bld-gt-i2' }),
        'input.cityjson.bld-gt-24-c.json': toCityJson(hip(), { cityObjectId: 'bld-gt-24-c' }),
        'input.context.json': context({ 'usr-reviewer': ['bld-gt-24-a', 'bld-gt-24-b', 'bld-gt-24-c'] }),
      },
      steps: [REQ('FINAL_VALIDATION', 'usr-reviewer', { buildingIds: ['bld-gt-24-a', 'bld-gt-24-c'] }, '3D-24'),
        REQ('EXPORT_BATCH', 'usr-reviewer', { assignmentId: 'asg-1' }, '3D-24')],
      assert: { skipped: 'bld-gt-24-b', skippedState: 'DRAFT_SOLID', namedInExportReport: true, exported: ['bld-gt-24-a', 'bld-gt-24-c'] },
      marks: [MARK.ids, MARK.version, MARK.crs, CONTEXT_MARK,
        { what: 'Three buildings: GT-03 gable (VALID_SOLID), GT-I2 gap gable (DRAFT_SOLID), GT-04 hip (VALID_SOLID); FINAL_VALIDATION first', mark: '[P]', why: '"one DRAFT_SOLID"; export gate spec §11 r9' },
        { what: 'Each model as imported from its `input.cityjson.<buildingId>.json` (explicit vertices, `sourceRef`, IMPORT_TRANSLATE origin): export writes CityJSON from the source document', mark: '[P]', why: 'D-3D24-4: kernel `exportBuilding` needs the import source' }],
      check: 'The test checks exactly one input model is DRAFT_SOLID (open shell) and the others are closed.',
    },
  ];
}
