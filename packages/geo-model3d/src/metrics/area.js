// metrics (3D-116): face areas in 3D and plan areas as the union of XY projections (D-3D116-1). The 3D area of a face
// is the Newell area of its rings in its support plane (validate/polygon.js, holes subtracted). The plan area is the
// exact area of the union of the projected polygons (union2d.js), so overlapping projections count once (MET-05).
import { faceArea } from '../validate/polygon.js';
import { unionArea } from './union2d.js';
import { hasTag } from './body.js';

/** @typedef {import('./body.js').Body} Body */

/** @param {Body} body @param {string} f @returns {number} m2 */
export const area3d = (body, f) => faceArea(body.rings(f), body.model.faces[f].supportPlane.normal);

/** @param {Body} body @param {string[]} faces */
const sum = (body, faces) => faces.reduce((s, f) => s + area3d(body, f), 0);

/** @param {Body} body @param {string[]} faces @returns {number} m2 */
const planUnion = (body, faces) => unionArea(faces.map((f) => body.rings(f).map((r) => r.map((p) => /** @type {[number, number]} */ ([p[0], p[1]])))));

/**
 * The five area metrics of the main body.
 * @param {Body} body
 */
export function areaMetrics(body) {
  const m = body.model;
  const of = (/** @type {string} */ kind) => body.faceIds.filter((f) => m.faces[f].surfaceKind === kind);
  const roof = of('RoofSurface');
  return {
    footprintAreaM2: planUnion(body, of('GroundSurface')),
    roofPlanAreaM2: planUnion(body, roof),
    roofSurfaceAreaM2: sum(body, roof),
    overhangRoofAreaM2: sum(body, roof.filter((f) => hasTag(m, f, 'OVERHANG'))),
    soffitAreaM2: sum(body, of('OuterCeilingSurface').filter((f) => hasTag(m, f, 'OVERHANG'))),
  };
}
