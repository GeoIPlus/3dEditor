// 3D-20 refusals (D-3D20-4; spec §10.1 Accept 2): each returns its §2.4 code, REJECTED, the input version, and leaves
// the (frozen) input model untouched. GT-03 south slope z = 5 + 0.75 y, y 0..4; the box rise is 0.75 m per metre.
import { describe, expect, it } from 'vitest';
import { deepFreeze } from '../brep/helpers.js';
import { run, command, gableModel, replaceRoof } from './helpers.js';

const CH = { roofFaceId: 'f-roof-s', center: [5, 2, 6.5], widthM: 1, depthM: 1, heightAboveRoofM: 1 };
const OUTLINE = [[4, 1, 5.75], [6, 1, 5.75], [6, 2.5, 6.875], [4, 2.5, 6.875]];
const FLAT = { roofFaceId: 'f-roof-s', dormerType: 'FLAT', outline: OUTLINE, heightM: 1 };
const on = (/** @type {number} */ x, /** @type {number} */ y) => [x, y, 5 + 0.75 * y];

/** @type {any} */
const base = deepFreeze(gableModel());
/** @type {any} */
const withChimney = deepFreeze(run(base, command(base, 'ADD_CHIMNEY', CH)).model);
const chimneyRoof = /** @type {any} */ (Object.values(withChimney.faces).find((/** @type {any} */ f) => f.surfaceKind === 'RoofSurface' && !(f.id in base.faces))).id;
/** @type {any} */
const flatRoofModel = (() => {
  const out = replaceRoof(gableModel(), { template: 'FLAT', roofZ: 5 });
  return deepFreeze(out.model);
})();
const flatRoofFace = /** @type {any} */ (Object.values(flatRoofModel.faces).find((/** @type {any} */ f) => f.surfaceKind === 'RoofSurface')).id;
const constrained = (() => {
  const m = structuredClone(withChimney);
  const v = /** @type {any} */ (Object.values(m.vertices).find((/** @type {any} */ x) => !(x.id in base.vertices)));
  m.constraints['c-fix'] = { id: 'c-fix', kind: 'FIXED_POINT', entityIds: [v.id], hard: true, target: v.p };
  return deepFreeze(m);
})();

/** @type {[string, any, string, any, string][]} name, model, operation, payload, code */
const CASES = [
  ['chimney: unknown roof face', base, 'ADD_CHIMNEY', { ...CH, roofFaceId: 'f-none' }, 'INVALID_PAYLOAD'],
  ['chimney: wall face', base, 'ADD_CHIMNEY', { ...CH, roofFaceId: 'f-wall-s' }, 'INVALID_PAYLOAD'],
  ['chimney: roof of an installation', withChimney, 'ADD_CHIMNEY', { ...CH, roofFaceId: chimneyRoof, center: [5, 2, 7.125], widthM: 0.2, depthM: 0.2 }, 'INVALID_PAYLOAD'],
  ['chimney: zero width', base, 'ADD_CHIMNEY', { ...CH, widthM: 0 }, 'INVALID_PAYLOAD'],
  ['chimney: centre not a point', base, 'ADD_CHIMNEY', { ...CH, center: [5, 2] }, 'INVALID_PAYLOAD'],
  ['chimney: size from the cloud', base, 'ADD_CHIMNEY', { roofFaceId: 'f-roof-s', center: [5, 2, 6.5], measurementId: 'm-1' }, 'INVALID_MEASUREMENT'],
  ['chimney: centre off the roof plane', base, 'ADD_CHIMNEY', { ...CH, center: [5, 2, 6.6] }, 'INVALID_GEOMETRY'],
  ['chimney: over the eave', base, 'ADD_CHIMNEY', { ...CH, center: on(5, 0.25) }, 'INVALID_GEOMETRY'],
  ['chimney: across the ridge', base, 'ADD_CHIMNEY', { ...CH, center: on(5, 3.75) }, 'INVALID_GEOMETRY'],
  ['chimney: top below the uphill corner (0.5 < 0.75 rise)', base, 'ADD_CHIMNEY', { ...CH, heightAboveRoofM: 0.5 }, 'INVALID_GEOMETRY'],
  ['dormer: SHED type', base, 'ADD_DORMER', { ...FLAT, dormerType: 'SHED' }, 'INVALID_PAYLOAD'],
  ['dormer: GABLE without ridgeRiseM', base, 'ADD_DORMER', { ...FLAT, dormerType: 'GABLE' }, 'INVALID_PAYLOAD'],
  ['dormer: two points', base, 'ADD_DORMER', { ...FLAT, outline: OUTLINE.slice(0, 2) }, 'INVALID_PAYLOAD'],
  ['dormer: size from a plane fit', base, 'ADD_DORMER', { roofFaceId: 'f-roof-s', dormerType: 'FLAT', outline: OUTLINE, measurementId: 'm-1' }, 'INVALID_MEASUREMENT'],
  ['dormer: point off the roof plane', base, 'ADD_DORMER', { ...FLAT, outline: [[4, 1, 5.9], ...OUTLINE.slice(1)] }, 'INVALID_GEOMETRY'],
  ['dormer: self-crossing outline', base, 'ADD_DORMER', { ...FLAT, outline: [on(4, 1), on(6, 2.5), on(6, 1), on(4, 2.5)] }, 'INVALID_GEOMETRY'],
  ['dormer: outline outside the face', base, 'ADD_DORMER', { ...FLAT, outline: [on(9, 1), on(11, 1), on(11, 2), on(9, 2)] }, 'INVALID_GEOMETRY'],
  ['dormer: GABLE non-convex outline', base, 'ADD_DORMER', { ...FLAT, dormerType: 'GABLE', ridgeRiseM: 0.5, outline: [on(4, 1), on(6, 1), on(6, 2.5), on(5, 1.5), on(4, 2.5)] }, 'INVALID_GEOMETRY'],
  ['dormer: GABLE on a flat roof (no fall line)', flatRoofModel, 'ADD_DORMER', { roofFaceId: flatRoofFace, dormerType: 'GABLE', outline: [[4, 1, 5], [6, 1, 5], [6, 2.5, 5], [4, 2.5, 5]], heightM: 1, ridgeRiseM: 0.5 }, 'INVALID_GEOMETRY'],
  ['remove: unknown id', withChimney, 'REMOVE_INSTALLATION', { installationId: 'inst-none' }, 'INVALID_PAYLOAD'],
  ['remove: the Building node', withChimney, 'REMOVE_INSTALLATION', { installationId: 'sem-bld' }, 'INVALID_PAYLOAD'],
  ['remove: hard constraint on its vertex (D-213)', constrained, 'REMOVE_INSTALLATION', { installationId: 'installation-1' }, 'CONSTRAINT_CONFLICT'],
];

describe('3D-20 refusals (D-3D20-4)', () => {
  it.each(CASES)('%s', (_, model, op, payload, code) => {
    const out = run(model, command(model, op, payload));
    expect(out.result.status).toBe('REJECTED');
    expect(out.result.error.code).toBe(code);
    expect(out.result.modelVersion).toBe(model.version);
    expect(out.model).toBe(model);
  });

  it('FLAT dormer on a flat roof face is accepted (only GABLE needs a fall line)', () => {
    const out = run(flatRoofModel, command(flatRoofModel, 'ADD_DORMER', { roofFaceId: flatRoofFace, dormerType: 'FLAT', outline: [[4, 1, 5], [6, 1, 5], [6, 2.5, 5], [4, 2.5, 5]], heightM: 1 }));
    expect(out.result.status).toBe('COMMITTED');
    expect(out.model.state).toBe('VALID_SOLID');
  });
});
