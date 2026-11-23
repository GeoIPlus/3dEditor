// GT-06..GT-13: roof edits, repair, history, idempotency (3D-15..3D-18, 3D-23).

import { halfEdgeId, toModel } from './brep.mjs';
import { IMPORT_TRANSLATE } from './cityjson.mjs';
import { command } from './fixture.mjs';
import { gable } from './geom.mjs';
import { CHECK_METRICS, GABLE, MARK, gt03Model } from './models.mjs';

/** @typedef {import('./fixture.mjs').Def} Def */

const G = GABLE;
export const RIDGE_S = halfEdgeId(G, 'f-roof-s', 'r1', 'r0');
const BASE_MARKS = [MARK.gt03, MARK.ids, MARK.version, MARK.crs, MARK.commit, MARK.actor];
/** GT-07 ALIGN_RIDGE KEEP_EAVES to Z = 8.5 (reused by GT-12, GT-13, GT-22). */
export const alignRidge85 = { edgeId: RIDGE_S, mode: 'KEEP_EAVES', targetLine: [[0, 4, 8.5], [10, 4, 8.5]] };
const RIDGE_MARK = { what: '`edgeId` = the south-slope half-edge of the ridge; target line (0,4,8.5)-(10,4,8.5)', mark: /** @type {const} */ ('[A]'), why: '"new Z = 8.5", ridge stays on the mid line' };

/** @returns {Def[]} */
export function editCases() {
  const gap = gable({ gap: 0.03 });
  /** @param {string} gt @param {object} extra */
  const m = (gt, extra = {}) => gt03Model(`bld-${gt.toLowerCase()}`, extra);
  /** @param {string} gt @param {number} n @param {string} operation @param {object} payload @param {number} v @param {object} [o] */
  const c = (gt, n, operation, payload, v, o = {}) => command({ gt, n, buildingId: `bld-${gt.toLowerCase()}`, operation, payload, expectedVersion: v, ...o });
  return [
    {
      gt: 'GT-06',
      inputs: { 'input.model.json': toModel(gap, { buildingId: 'bld-gt-06', imported: true, cityObjectId: 'bld-gt-i2', originWorld: IMPORT_TRANSLATE, originalSourceRef: 'fixtures/GT-I2/input.cityjson.json' }) },
      steps: [c('GT-06', 1, 'FIT_TO_SHARED_EDGE', {
        edgeIds: [RIDGE_S, halfEdgeId(gap, 'f-roof-n', 'r2', 'r3')], leadingFaceId: 'f-roof-s', maxDisplacementM: 0.05, movableFaceIds: ['f-roof-n'],
      }, 1)],
      assert: { sharedRidge: true, state: 'VALID_SOLID', leadingPlaneUnchanged: true },
      marks: [{ what: 'Input = the GT-I2 CityJSON as the import of 3D-10 should produce it (explicit vertices, D-70; 4 open half-edges)', mark: '[A]', why: '"GT-I2 ->"; ids must be known to write the command' },
        { what: 'Leading = south slope (`f-roof-s`, first roof surface in the file)', mark: '[A]', why: '"leading = first slope"' },
        { what: '`maxDisplacementM` 0.05, `movableFaceIds` [north slope]', mark: '[P]', why: 'Required by the schema (D-76); 0.05 >= the 0.03 gap, = `minEdgeLengthM`' },
        MARK.ids, MARK.version, MARK.crs, MARK.commit, MARK.actor],
      check: 'The test checks the two ridge half-edges have no twin and lie 0.03 m apart, and the leading plane is z = 5 + 0.75 y.',
    },
    {
      gt: 'GT-07', inputs: { 'input.model.json': m('GT-07') },
      steps: [c('GT-07', 1, 'ALIGN_RIDGE', alignRidge85, 1)],
      assert: { eaveZ: 5, roofAreaM2: 106.301, volumeM3: 540 },
      marks: [...BASE_MARKS, RIDGE_MARK],
      check: `${CHECK_METRICS} Reference (v0.3 §12): slope rise 3.5 / run 4; volume 400 + 10 * 8 * 3.5 / 2 = 540 m3; roof 2 * 10 * sqrt(16 + 12.25) = 106.301 m2.`,
    },
    {
      gt: 'GT-08', inputs: { 'input.model.json': m('GT-08') },
      steps: [c('GT-08', 1, 'SPLIT_FACE', { faceId: 'f-roof-s', splitLine: [[5, 0, 5], [5, 4, 8]] }, 1)],
      assert: { coplanarFaces: 2, volumeM3: 520, lineage: { from: 1, to: 2 } },
      marks: [...BASE_MARKS, { what: 'South slope split by the line x = 5, (5,0,5)-(5,4,8), on its plane', mark: '[P]', why: '§12 gives no line' }],
      check: `${CHECK_METRICS} The split line lies on the south plane (distance 0) and divides the slope into two 5 x 5 m2 halves.`,
    },
    {
      gt: 'GT-09', inputs: { 'input.model.json': m('GT-09') },
      steps: [c('GT-09', 1, 'ALIGN_RIDGE', { edgeId: RIDGE_S, mode: 'KEEP_PLANES', targetLine: [[0, 4.5, 8.3], [10, 4.5, 8.3]] }, 1)],
      assert: { refusal: 'CONSTRAINT_CONFLICT', versionUnchanged: true },
      marks: [...BASE_MARKS, { what: 'Arbitrary target (0,4.5,8.3)-(10,4.5,8.3)', mark: '[P]', why: 'Off the intersection line of the two fixed slope planes' }],
      check: 'The test checks the target line is not on the intersection of the two slope planes (distance > `planarTolM`).',
    },
    {
      gt: 'GT-10',
      inputs: { 'input.model.json': m('GT-10', { constraints: [{ id: 'c-fix-r0', kind: 'FIXED_POINT', entityIds: ['v-r0'], hard: true, target: [0, 4, 8] }] }) },
      steps: [c('GT-10', 1, 'MOVE_VERTEX', { vertexId: 'v-r0', targetPoint: [0, 4, 8.5], movableFaceIds: ['f-roof-s', 'f-roof-n', 'f-wall-w'] }, 1)],
      assert: { refusal: 'CONSTRAINT_CONFLICT', versionUnchanged: true },
      marks: [...BASE_MARKS, { what: 'GT-03 model with a hard `FIXED_POINT` on the west ridge end `v-r0` (0,4,8); target (0,4,8.5); all its faces movable', mark: '[P]', why: '§12 names no model or vertex' }],
      check: 'The test checks the fixed vertex lies at its constraint target and the target point differs by more than `planarTolM`.',
    },
    {
      gt: 'GT-11', inputs: { 'input.model.json': m('GT-11') },
      steps: [
        c('GT-11', 1, 'REMOVE_FACE', { faceId: 'f-roof-n' }, 1, { targetState: 'DRAFT_SOLID' }),
        { step: 'EXPORT', note: 'export of the DRAFT_SOLID model: refused' },
        c('GT-11', 2, 'HEAL_HOLE', {
          boundaryEdgeIds: G.faces.find((f) => f.id === 'f-roof-n')?.ring.map((a, i, r) => twinOf(r, i)) ?? [],
          mode: 'COPY_NEIGHBOR_PLANE', neighborFaceId: 'f-roof-s',
        }, 2, { targetState: 'DRAFT_SOLID' }),
      ],
      assert: { state: 'DRAFT_SOLID', exportRefused: true, healRefused: true, listsAdmissibleModes: true },
      decided: [{ source: 'D-76', assert: { healRefusalCode: 'INVALID_GEOMETRY', details: 'admissibleModes' } }],
      marks: [...BASE_MARKS, { what: 'Removed face = north slope; `boundaryEdgeIds` = the twins of its loop; neighbour = south slope', mark: '[P]', why: '"one slope"' },
        { what: 'HEAL_HOLE `targetState` DRAFT_SOLID', mark: '[A]', why: 'The heal is refused; state stays draft' }],
      check: 'The test checks the south plane at the hole boundary: at y = 8 it gives z = 11, not the eave z = 5, so copying it cannot close the hole.',
    },
    {
      gt: 'GT-12', inputs: { 'input.model.json': m('GT-12') },
      steps: [c('GT-12', 1, 'ALIGN_RIDGE', alignRidge85, 1), c('GT-12', 2, 'UNDO', {}, 2), c('GT-12', 3, 'REDO', {}, 3)],
      assert: { afterUndo: { volumeM3: 520, originalIds: true }, afterRedo: { volumeM3: 540 }, newVersionPerOperation: true },
      marks: [...BASE_MARKS, RIDGE_MARK, { what: 'Versions 1 -> 2 (GT-07) -> 3 (Undo) -> 4 (Redo)', mark: '[A]', why: 'Every operation a new version' }],
      check: `${CHECK_METRICS} Reference volumes 520 (GT-03) and 540 (GT-07).`,
    },
    {
      gt: 'GT-13', inputs: { 'input.model.json': m('GT-13') },
      steps: [c('GT-13', 1, 'ALIGN_RIDGE', alignRidge85, 1), c('GT-13', 1, 'ALIGN_RIDGE', alignRidge85, 1),
        c('GT-13', 2, 'TRANSLATE_BUILDING', { vector: [1, 0, 0] }, 1)],
      assert: { commits: 1, sameReply: true, httpStatus: 409, code: 'VERSION_CONFLICT' },
      marks: [...BASE_MARKS, RIDGE_MARK, { what: 'Repeated command = GT-07; stale command = TRANSLATE_BUILDING (1,0,0) with `expectedVersion` 1 after the commit', mark: '[P]', why: '§12 names no operation' }],
      check: 'The test checks steps 1 and 2 are byte-equal and step 3 carries the version of before step 1.',
    },
  ];
}

/** Id of the twin of half-edge i of the north slope ring (the neighbour's half-edge b -> a). @param {string[]} r @param {number} i */
function twinOf(r, i) {
  const a = r[i]; const b = r[(i + 1) % r.length];
  const f = GABLE.faces.find((x) => x.id !== 'f-roof-n' && x.ring.some((v, k) => v === b && x.ring[(k + 1) % x.ring.length] === a));
  if (!f) throw new Error(`no twin for ${a}>${b}`);
  return halfEdgeId(GABLE, f.id, b, a);
}
