// GT-14..GT-19: overhang, height, translation, installations, junction (3D-17, 3D-19, 3D-20).

import { halfEdgeId, toModel } from './brep.mjs';
import { IMPORT_TRANSLATE } from './cityjson.mjs';
import { command } from './fixture.mjs';
import { pyramid } from './geom.mjs';
import { CHECK_METRICS, GABLE, MARK, gt03Model } from './models.mjs';

/** @typedef {import('./fixture.mjs').Def} Def */

const BASE_MARKS = [MARK.gt03, MARK.ids, MARK.version, MARK.crs, MARK.commit, MARK.actor];
/** [P] GT-19 lift of the east slope at the apex (D-3D07-1). */
export const GT19_LIFT_M = 0.05;
export const GT19_POLY = pyramid({ eastLiftM: GT19_LIFT_M });

/** @returns {Def[]} */
export function envelopeCases() {
  /** @param {string} gt @param {object} [extra] */
  const m = (gt, extra = {}) => gt03Model(`bld-${gt.toLowerCase()}`, extra);
  /** @param {string} gt @param {string} operation @param {object} payload */
  const c = (gt, operation, payload, n = 1) => command({ gt, n, buildingId: `bld-${gt.toLowerCase()}`, operation, payload, expectedVersion: 1 });
  const pyrModel = (/** @type {any[]} */ constraints) => toModel(GT19_POLY, {
    buildingId: 'bld-gt-19', imported: true, cityObjectId: 'bld-gt-19', originWorld: IMPORT_TRANSLATE, constraints, state: 'DRAFT_SOLID',
  });
  const fixedFaces = ['f-roof-e', 'f-roof-n', 'f-roof-w'];
  const fixedModel = pyrModel([]);
  const fixed = fixedFaces.map((f) => ({ id: `c-on-plane-${f}`, kind: 'ON_PLANE', entityIds: [f], hard: true, target: fixedModel.faces[f].supportPlane }));
  const junction = { vertexId: 'v-a', faceIds: ['f-roof-s', 'f-roof-e', 'f-roof-n', 'f-roof-w'], mode: 'KEEP_PRIMARY_PLANE', primaryFaceId: 'f-roof-s' };
  return [
    {
      gt: 'GT-14', inputs: { 'input.model.json': m('GT-14') },
      steps: [c('GT-14', 'SET_OVERHANG', { eaveEdgeIds: [halfEdgeId(GABLE, 'f-roof-s', 'e0', 'e1'), halfEdgeId(GABLE, 'f-roof-n', 'e2', 'e3')], overhangM: 0.5 })],
      assert: { footprintAreaM2: 80, roofAreaM2: 112.5, overhangEdgeZ: 4.625, wallsUnchanged: true },
      marks: [...BASE_MARKS, { what: '`eaveEdgeIds` = the roof-side half-edges of both eaves; 0.5 m in horizontal projection', mark: '[A]', why: '"both eaves"; payload definition (D-75 P9)' }],
      check: `${CHECK_METRICS} Reference (v0.3 §12): slope length 5 + 0.5 * 5 / 4 = 5.625; roof 2 * 10 * 5.625 = 112.5 m2; edge Z = 5 - 0.5 * 3 / 4 = 4.625.`,
    },
    {
      gt: 'GT-15', inputs: { 'input.model.json': m('GT-15') },
      steps: [c('GT-15', 'SET_HEIGHT', { kind: 'BASE', z: -1 })],
      assert: { volumeM3: 600, roofAreaM2: 100 },
      marks: BASE_MARKS,
      check: `${CHECK_METRICS} Reference: 520 + 80 * 1 = 600 m3; roof unchanged 100 m2.`,
    },
    {
      gt: 'GT-16', inputs: { 'input.model.json': m('GT-16') },
      steps: [c('GT-16', 'TRANSLATE_BUILDING', { vector: [100, 50, 2] })],
      assert: { vector: [100, 50, 2], volumeUnchanged: true, areasUnchanged: true },
      marks: BASE_MARKS,
      check: `${CHECK_METRICS} Reference: the translated reference model has volume 520 m3 and roof 100 m2.`,
    },
    {
      gt: 'GT-17', inputs: { 'input.model.json': m('GT-17') },
      steps: [c('GT-17', 'ADD_CHIMNEY', { roofFaceId: 'f-roof-s', center: [5, 2, 6.5], widthM: 1, depthM: 1, heightAboveRoofM: 1 })],
      assert: { installation: 'BuildingInstallation', separateClosedBody: true, baseInSlopePlane: true, state: 'VALID_SOLID', volumeM3: 520, sizeM: [1, 1], heightAboveSlopeM: 1 },
      marks: [...BASE_MARKS, { what: 'South slope; base centre (5, 2, 6.5) = middle of the slope in plan; box axes = building axes', mark: '[P]', why: '"mid-slope"; box axes [A] in the payload (Q-38)' }],
      check: 'The test checks the centre lies on the south plane (z = 5 + 0.75 y) and inside the slope.',
    },
    {
      gt: 'GT-18', inputs: { 'input.model.json': m('GT-18') },
      steps: [c('GT-18', 'ADD_DORMER', { roofFaceId: 'f-roof-s', dormerType: 'FLAT', outline: [[4, 1, 5.75], [6, 1, 5.75], [6, 2.5, 6.875], [4, 2.5, 6.875]], heightM: 1 })],
      assert: { installation: 'BuildingInstallation', installationValid: true, noIntersectionBeyond: 'planarTolM', state: 'VALID_SOLID', outlineM: [2, 1.5] },
      marks: [...BASE_MARKS,
        { what: 'Outline 2 x 1.5 m in plan (x 4..6, y 1..2.5) on the south slope, corners on its plane', mark: '[P]', why: '§12 gives the size only' },
        { what: '`heightM` 1', mark: '[P]', why: 'Required by the schema; what it measures for FLAT is TBD (Q-38, 3D-20)' }],
      check: 'The test checks the four outline corners lie on the south plane and inside the slope.',
    },
    {
      gt: 'GT-19',
      inputs: { 'input.model.json': pyrModel([]), 'input.model.fixed.json': pyrModel(fixed) },
      steps: [
        { ...command({ gt: 'GT-19', n: 1, buildingId: 'bld-gt-19', operation: 'ALIGN_JUNCTION', payload: junction, expectedVersion: 1 }), model: 'input.model.json' },
        { ...command({ gt: 'GT-19', n: 2, buildingId: 'bld-gt-19', operation: 'ALIGN_JUNCTION', payload: junction, expectedVersion: 1 }), model: 'input.model.fixed.json' },
      ],
      assert: { nodeWithin: 'topologySnapTolM', primaryPlaneUnchanged: true, fixedVariant: 'refusal listing the conflicting faces', divergenceM: 0.05, planes: 4 },
      marks: [MARK.ids, MARK.version, MARK.crs, MARK.commit, MARK.actor,
        { what: 'Pyramid roof on an 8 x 8 footprint, eave 5, four slopes rise 3 / run 4, apex (4, 4, 8) as an imported explicit vertex', mark: '[P]', why: 'D-3D07-1: a node of exactly 4 roof planes' },
        { what: 'East slope rotated about its eave line so that its Z at the apex is 8.05 (vertical divergence 0.05 m)', mark: '[P]', why: '"diverging at a node by 0.05 m" read vertically; normal distance 0.0398 m' },
        { what: 'State DRAFT_SOLID', mark: '[A]', why: 'Closed shell with `INCONSISTENT_JUNCTION` (ERROR in VALID_SOLID, spec §8) is DRAFT_SOLID after import (spec §6 r10)' },
        { what: 'Primary plane = south slope; "Fixed" variant = hard `ON_PLANE` on east, north and west slopes (`input.model.fixed.json`, step 2)', mark: '[P]', why: 'No `FIXED_PLANE` kind exists; with fewer fixed planes the node stays solvable' }],
      check: 'The test checks south, north and west planes meet at (4, 4, 8) and the east plane passes 0.05 m above it (vertical), so the residual exceeds `topologySnapTolM`.',
    },
  ];
}
