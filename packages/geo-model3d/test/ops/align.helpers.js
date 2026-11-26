// Test helpers for 3D-16: the GT-03 gable result (fixture GT-07 input, eave 5, ridge 8 along X at y = 4) and runners
// for ALIGN_RIDGE / ALIGN_EAVE / MATCH_ELEVATIONS through executeCommand.
import { readFixture } from '../brep/helpers.js';
import { run, command } from './helpers.js';

/** @returns {any} */
export const gable = () => structuredClone(readFixture('GT-07', 'input.model.json'));
/** @param {any} model @param {string} op @param {any} payload @param {Record<string, any>} [over] */
export const exec = (model, op, payload, over) => run(model, command(model, op, payload, over));
/** Changed support planes, sorted. @param {any} a @param {any} b */
export const changedPlanes = (a, b) => Object.keys(a.faces).filter((f) => JSON.stringify(a.faces[f].supportPlane) !== JSON.stringify(b.faces[f].supportPlane)).sort();
/** @param {any} model @param {string} id @param {number[]} p @param {Record<string, any>} [extra] */
export function addPoint(model, id, p, extra = {}) {
  model.measurements[id] = {
    id, geometry: { kind: 'POINT', coordinates: [p] }, sourceType: 'MANUAL', sourceId: null, horizontalCrs: 'EPSG:25832',
    verticalCrs: null, frame: 'LOCAL', status: 'MEASURED', createdBy: 'usr-t', uncertainty: { sigmaZ: 0.05, unit: 'm' }, ...extra,
  };
}
