// GT-I1..GT-I4 (import / export) and GT-25 (frame) fixtures.

import { toCityJson, IMPORT_TRANSLATE } from './cityjson.mjs';
import { gable } from './geom.mjs';
import { CHECK_METRICS, GABLE, GABLE_COID, MARK, gt03Model } from './models.mjs';

/** @typedef {import('./fixture.mjs').Def} Def */

const importStep = (/** @type {string} */ coid) => ({ step: 'IMPORT', document: 'input.cityjson.json', cityObjectId: coid, toleranceProfile: 'default' });
const MARK_CJ = { what: 'CityJSON 2.0, one `Building` with one LoD 2.2 `Solid`, millimetre integer vertices, translate (512000, 6170000, 0)', mark: /** @type {const} */ ('[P]'), why: 'v0.3 §12 gives only the shape; writer conventions of common CityJSON files' };
const MARK_IMPORT = { what: '`IMPORT` step = kernel import API (spec §6: document, CityObject id, profile), not a command', mark: /** @type {const} */ ('[A]'), why: 'IMPORT_BUILDING payload is empty; the service reads the document (Q-32)' };

/** @returns {Def[]} */
export function importCases() {
  const gi1 = toCityJson(GABLE, { cityObjectId: GABLE_COID });
  const gapPoly = gable({ gap: 0.03 });
  return [
    {
      gt: 'GT-I1',
      inputs: { 'input.cityjson.json': gi1 },
      steps: [importStep(GABLE_COID)],
      assert: { state: 'VALID_SOLID', faces: 7, vertices: 10, edges: 15, roofSurfaces: 2, edgeRoles: { RIDGE: 1, EAVE: 2, RAKE: 4 }, volumeM3: 520, roofAreaM2: 100 },
      marks: [MARK_CJ, MARK_IMPORT, { what: 'Ridge at y = 4 (mid line), gables on x = 0 and x = 10', mark: '[A]', why: '"ridge 8 along 10" on a 10 x 8 footprint' }],
      check: `${CHECK_METRICS} It also counts faces, unique vertices and undirected edges of the CityJSON solid (Euler: 10 - 15 + 7 = 2).`,
    },
    {
      gt: 'GT-I2',
      inputs: { 'input.cityjson.json': toCityJson(gapPoly, { cityObjectId: 'bld-gt-i2' }) },
      steps: [importStep('bld-gt-i2')],
      assert: { state: 'DRAFT_SOLID', openBoundaryEdges: 2, issueCode: 'OPEN_BOUNDARY', fullyLoaded: true, gapM: 0.03 },
      marks: [MARK_CJ, MARK_IMPORT,
        { what: 'North slope ridge edge at y = 4.03, z = 8 (horizontal gap 0.03 m); gable walls hexagons with a 0.03 m top edge', mark: '[P]', why: 'D-3D07-3' },
        { what: 'Which edges count as `OPEN_BOUNDARY` (the two ridge edges, or all four edges of the gap loop)', mark: 'TBD', why: 'Q-3D07-1, closed by 3D-10; the §12 text is kept verbatim' }],
      check: 'The test finds exactly four edges with one face: the two ridge edges (length 10, 0.03 m apart) and the two 0.03 m wall '
        + 'edges; every other edge has two faces; all 7 surfaces are present.',
    },
    {
      gt: 'GT-I3',
      inputs: { 'input.cityjson.json': toCityJson(GABLE, { cityObjectId: 'bld-gt-i3', triangulateRoof: true }) },
      steps: [importStep('bld-gt-i3')],
      assert: { roofFacesAfterImport: 2, sourceRefKept: true },
      marks: [MARK_CJ, MARK_IMPORT, { what: 'GT-I1 gable with each slope split along its diagonal from the first eave corner', mark: '[P]', why: '§12 gives "each slope 2 triangles" only' }],
      check: 'The test checks 4 `RoofSurface` triangles, pairwise coplanar per slope (same Newell plane within 1e-12), total roof area 100 m2.',
    },
    {
      gt: 'GT-I4',
      inputs: { 'input.cityjson.json': gi1 },
      steps: [importStep(GABLE_COID), { step: 'EXPORT', note: 'kernel export API (spec §7); compare with the input, then val3dity (binding Q-10)' }],
      assert: { geometryToleranceM: 0.001, semanticsIdentical: true, objectIdsIdentical: true, val3dityWithoutErrors: true },
      marks: [MARK_CJ, MARK_IMPORT, { what: 'Input byte-identical to GT-I1', mark: '[A]', why: '"Import GT-I1"' }],
      check: 'Comparison of exported and input vertex coordinates within 0.001 m and of semantics/object ids; val3dity is the external validator (Q-10).',
    },
    {
      gt: 'GT-25',
      inputs: {
        'input.model.json': gt03Model('bld-gt25', { originWorld: GT25_ORIGIN }),
        'input.world.json': { frame: 'WORLD', crs: 'EPSG:25832', points: Object.values(GABLE.vertices).map((p) => [p[0] + GT25_ORIGIN[0], p[1] + GT25_ORIGIN[1], p[2] + GT25_ORIGIN[2]]) },
      },
      steps: [{ step: 'WORLD_LOCAL_ROUNDTRIP', points: 'input.world.json', note: 'world -> local -> world with the model frame (spec §4)' }],
      assert: { coordinateOrderM: 6000000, roundTripToleranceM: 0.001 },
      marks: [MARK.ids, MARK.crs, { what: 'GT-03 gable at `originWorld` (512345.678, 6123456.789, 12.345); world points = origin + local vertices', mark: '[P]', why: 'Non-round origin of order 6 000 000 m exercises double precision' }],
      check: 'The test checks every world point minus `originWorld` equals the local vertex within 1e-6 m (input sanity; the round trip itself is the 3D-09 test).',
    },
  ];
}

/** [P] GT-25 world origin. */
export const GT25_ORIGIN = /** @type {import('./geom.mjs').P3} */ ([512345.678, 6123456.789, 12.345]);
export { IMPORT_TRANSLATE };
