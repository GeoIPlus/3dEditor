// GT-01..GT-05: REPLACE_ROOF R-01..R-04 (3D-14). Start model: the GT-I1 gable as imported (D-3D07-2).

import { toModel } from './brep.mjs';
import { command } from './fixture.mjs';
import { flat } from './geom.mjs';
import { CHECK_METRICS, MARK, importedGable } from './models.mjs';

/** @typedef {import('./fixture.mjs').Def} Def */

/**
 * HIP slope in degrees for rise 3 / run 4 = atan(0.75) * 180 / pi, written as a literal so that the bytes do not
 * depend on the platform's arc tangent; the test checks it against rise/run.
 */
export const HIP_SLOPE_DEG = 36.86989764584402;

/** [P] L-shaped footprint for GT-05 (D-3D07-1): 10 x 8 with the north-east 6 x 4 corner removed. */
export const L_RING = /** @type {import('./geom.mjs').P2[]} */ ([[0, 0], [10, 0], [10, 4], [4, 4], [4, 8], [0, 8]]);

const START = { what: 'Start model = the GT-I1 gable as imported (explicit vertices, `sourceRef`, world origin of GT-I1)', mark: /** @type {const} */ ('[P]'), why: 'D-3D07-2: §12 gives only "footprint 10 x 8, base 0"; commands need a DRAFT_SOLID / VALID_SOLID model (D-75 P4)' };

/**
 * @param {string} gt @param {object} payload @param {Record<string, unknown>} assert @param {string} check
 * @param {import('./fixture.mjs').Mark[]} [marks]
 * @returns {Def}
 */
function replace(gt, payload, assert, check, marks = []) {
  const bid = `bld-${gt.toLowerCase()}`;
  return {
    gt,
    inputs: { 'input.model.json': importedGable(bid) },
    steps: [command({ gt, n: 1, buildingId: bid, operation: 'REPLACE_ROOF', payload: { footprintId: 'fp-1', ...payload }, expectedVersion: 1 })],
    assert, marks: [START, MARK.ids, MARK.version, MARK.crs, MARK.commit, MARK.actor, ...marks], check,
  };
}

/** @returns {Def[]} */
export function roofCases() {
  const lid = 'bld-gt-05';
  return [
    replace('GT-01', { template: 'FLAT', roofZ: 5 }, { roofAreaM2: 80, volumeM3: 400 },
      `${CHECK_METRICS} Reference: box 10 x 8 x 5 -> roof 80 m2, volume 400 m3.`),
    replace('GT-02', { template: 'SHED', slopeAxis: 'LOCAL_Y', zLow: 5, zHigh: 8 }, { roofAreaM2: 85.44, volumeM3: 520, roofFaces: 1 },
      `${CHECK_METRICS} Reference: 10 * sqrt(8^2 + 3^2) = 85.440 m2; 80 * (5 + 8) / 2 = 520 m3.`,
      [{ what: 'Shed rises along +Y (`slopeAxis` LOCAL_Y, `zLow` 5 at y = 0, `zHigh` 8 at y = 8)', mark: '[A]', why: '"5 -> 8 across the width 8"' }]),
    replace('GT-03', { template: 'GABLE', ridgeAxis: 'LOCAL_X', eaveZ: 5, ridgeZ: 8, symmetric: true }, { roofAreaM2: 100, volumeM3: 520, roofFaces: 2 },
      `${CHECK_METRICS} Reference: 2 * 10 * sqrt(4^2 + 3^2) = 100 m2; 400 + 10 * 8 * 3 / 2 = 520 m3. The result equals the start model's geometry.`,
      [{ what: 'Symmetric gable (`symmetric` true)', mark: '[A]', why: 'GT-I1 / GT-03 ridge on the mid line' }]),
    replace('GT-04', { template: 'HIP', ridgeAxis: 'LOCAL_X', eaveZ: 5, slopesDeg: [HIP_SLOPE_DEG, HIP_SLOPE_DEG, HIP_SLOPE_DEG, HIP_SLOPE_DEG] },
      { ridgeZ: 8, ridgeLengthM: 2, roofFaces: 4, roofAreaM2: 100, volumeM3: 488 },
      `${CHECK_METRICS} Reference (v0.3 §12): roof volume 3 * 8 * (2 * 10 + 2) / 6 = 88, total 400 + 88 = 488 m3; ridge Z = 5 + 4 * 3 / 4 = 8, length 10 - 2 * 4 = 2; roof area 80 / cos = 80 * 5 / 4 = 100 m2.`,
      [{ what: '`slopesDeg` = atan(3/4) in degrees (36.86989764584402) for all four faces', mark: '[A]', why: 'The payload carries degrees (D-75 P9); "rise 3 / run 4"' }]),
    {
      gt: 'GT-05',
      inputs: { 'input.model.json': toModel(flat(L_RING, 0, 5), { buildingId: lid }) },
      steps: [command({ gt: 'GT-05', n: 1, buildingId: lid, operation: 'REPLACE_ROOF', payload: { footprintId: 'fp-1', template: 'GABLE', ridgeAxis: 'LOCAL_X', eaveZ: 5, ridgeZ: 8, symmetric: true }, expectedVersion: 1 })],
      assert: { refusal: 'UNSUPPORTED_FOOTPRINT', modelUnchanged: true },
      marks: [{ what: 'L-shaped flat block: footprint (0,0) (10,0) (10,4) (4,4) (4,8) (0,8), base 0, flat roof Z = 5', mark: '[P]', why: 'D-3D07-1, D-3D07-2; any non-rectangular footprint is refused (v0.3 §6)' },
        { what: 'GABLE payload of GT-03 (eave 5, ridge 8 along X)', mark: '[A]', why: '"R-03 on an L-shaped footprint"' },
        MARK.ids, MARK.version, MARK.crs, MARK.commit, MARK.actor],
      check: 'The test checks the footprint has 6 vertices (not 4, so R-03 does not apply, v0.3 §6) and the block volume (56 m2 * 5 = 280 m3).',
    },
  ];
}
