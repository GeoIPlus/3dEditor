// GT-26..GT-29: TRIM_FACE and EXTEND_FACE (3D-105; spec §10.6 r7, r8; source: the spec §13 rows, D-332).

import { halfEdgeId, toModel } from './brep.mjs';
import { command } from './fixture.mjs';
import { gable } from './geom.mjs';
import { MARK, gt03Model } from './models.mjs';

/** @typedef {import('./fixture.mjs').Def} Def */

const BASE = [MARK.ids, MARK.version, MARK.crs, MARK.commit, MARK.actor];
const S1 = 'z = 5 + 0.75 y';

/**
 * GT-03 with the top of the south slope S1 moved to `y` on its own plane: S1 ring e0, e1, t1, t0 with t at
 * (0|10, y, 5 + 0.75 y); the S1 top edge, the north-slope ridge edge and the S1-side gable rakes are open.
 * @param {number} y
 */
export function gableSouthTo(y) {
  const g = gable();
  const z = 5 + 0.75 * y;
  g.vertices.t0 = [0, y, z];
  g.vertices.t1 = [10, y, z];
  const s = /** @type {import('./geom.mjs').PolyFace} */ (g.faces.find((f) => f.id === 'f-roof-s'));
  s.ring = ['e0', 'e1', 't1', 't0'];
  return g;
}

/** @returns {Def[]} */
export function trimExtendCases() {
  const over = gableSouthTo(4.5), under = gableSouthTo(3.5);
  /** @param {string} gt @param {any} poly */
  const m = (gt, poly) => toModel(poly, { buildingId: `bld-${gt.toLowerCase()}` });
  /** @param {string} gt @param {string} operation @param {object} payload */
  const c = (gt, operation, payload) => command({ gt, n: 1, buildingId: `bld-${gt.toLowerCase()}`, operation, payload, expectedVersion: 1 });
  const overMark = { what: `S1 (${S1}) ends at y = 4.5, z = 8.375 (vertices \`v-t0\`, \`v-t1\`); its flap edges, the north ridge edge and the S1-side gable rakes are open; state DRAFT_SOLID`, mark: /** @type {const} */ ('[A]'), why: 'Spec §13 row; ids and ring order chosen here' };
  return [
    {
      gt: 'GT-26', inputs: { 'input.model.json': m('GT-26', over) },
      steps: [c('GT-26', 'TRIM_FACE', { faceId: 'f-roof-s', cuttingFaceId: 'f-roof-n', keepPoint: [5, 2, 6.5] })],
      assert: { faceAreaM2: { before: 56.25, after: 50 }, roofAreaM2: 100, state: 'VALID_SOLID', volumeM3: 520 },
      marks: [overMark, ...BASE],
      check: `The test computes the S1 area (Newell) before and after, roof area and volume from the fixture coordinates with its own code. S1 before: 10 x 4.5 / 0.8 = 56.25 m2; after 10 x 4 / 0.8 = 50 m2.`,
    },
    {
      gt: 'GT-27', inputs: { 'input.model.json': m('GT-27', over) },
      steps: [c('GT-27', 'TRIM_FACE', { faceId: 'f-roof-s', cuttingFaceId: 'f-roof-n', keepPoint: [5, 4.25, 8.1875] })],
      assert: { refusal: 'INVALID_TOPOLOGY', versionUnchanged: true },
      marks: [overMark, ...BASE],
      check: `The test checks the keep point lies on S1 (${S1}) beyond the ridge line y = 4.`,
    },
    {
      gt: 'GT-28', inputs: { 'input.model.json': m('GT-28', under) },
      steps: [c('GT-28', 'EXTEND_FACE', { faceId: 'f-roof-s', edgeId: halfEdgeId(under, 'f-roof-s', 't1', 't0'), targetFaceId: 'f-roof-n' })],
      assert: { ends: [[0, 4, 8], [10, 4, 8]], faceAreaM2: { before: 43.75, after: 50 }, roofAreaM2: 100, state: 'VALID_SOLID', volumeM3: 520 },
      marks: [{ what: `S1 (${S1}) ends at y = 3.5, z = 7.625 (vertices \`v-t0\`, \`v-t1\`); its top edge, the north ridge edge and the S1-side gable rakes are open; state DRAFT_SOLID`, mark: '[A]', why: 'Spec §13 row; ids and ring order chosen here' },
        { what: '`edgeId` = the S1 top half-edge t1 -> t0', mark: '[A]', why: '"top edge"' }, ...BASE],
      check: 'The test computes the S1 area before (10 x 3.5 / 0.8 = 43.75 m2) and after (50 m2), roof area and volume with its own code.',
    },
    {
      gt: 'GT-29', inputs: { 'input.model.json': gt03Model('bld-gt-29') },
      steps: [c('GT-29', 'EXTEND_FACE', { faceId: 'f-roof-s', edgeId: halfEdgeId(gable(), 'f-roof-s', 'e0', 'e1'), targetFaceId: 'f-roof-n' })],
      assert: { refusal: 'INVALID_TOPOLOGY', versionUnchanged: true },
      marks: [MARK.gt03, { what: '`edgeId` = the S1 eave half-edge e0 -> e1 (shared with the south wall)', mark: '[A]', why: '"eave edge"' }, ...BASE],
      check: 'The test checks the eave half-edge has a twin on the south wall.',
    },
  ];
}
