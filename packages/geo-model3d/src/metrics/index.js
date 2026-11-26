// metrics (3D-116): F-53 geometric metrics of one model version, contract `metrics-result` (D-412..D-414). Read-only:
// no command, journal, version or state change; the model is not mutated. Geometric only (v0.2 §16.5). The nine
// metric members are also the `affectedMetrics` names (D-415); patches keep `affectedMetrics: []` until 3D-130.
import { readTolerances } from '../validate/index.js';
import { mainBody } from './body.js';
import { areaMetrics } from './area.js';
import { totalVolume } from './volume.js';
import { volumeProof } from './status.js';
import { overhangVolume } from './overhang.js';

/** Metric member names in contract order = the `affectedMetrics` names (D-415). */
export const METRIC_NAMES = Object.freeze([
  'footprintAreaM2', 'roofPlanAreaM2', 'roofSurfaceAreaM2', 'overhangRoofAreaM2', 'soffitAreaM2',
  'mainVolumeM3', 'overhangVolumeM3', 'geometricSolidVolumeM3', 'volumeStatus',
]);

/**
 * @param {import('../brep/types.js').BuildingModel} model contract `building-model`
 * @param {{ toleranceProfile: any }} options the tolerance profile (spec §2.3)
 * @returns {any} contract `metrics-result`
 */
export function computeMetrics(model, options) {
  const tol = readTolerances(options?.toleranceProfile);
  const body = mainBody(model);
  const areas = areaMetrics(body);
  for (const [k, v] of Object.entries(areas)) if (!Number.isFinite(v) || v < 0) throw new RangeError(`metric ${k} is ${v}`);
  const proof = volumeProof(body, tol);
  const total = proof.proven ? totalVolume(body) : null;
  /** @type {number | null} */
  let main = null, over = null;
  if (total !== null) {
    const o = overhangVolume(body, tol.numericEpsilon).volume;
    if (o !== null && o <= total && total - o >= 0) { over = o; main = total - o; }
  }
  return {
    schemaVersion: '1', buildingId: model.buildingId, modelVersion: model.version, state: model.state,
    basis: 'GEOMETRIC', units: { area: 'm2', volume: 'm3' },
    ...areas,
    mainVolumeM3: main, overhangVolumeM3: over, geometricSolidVolumeM3: total,
    volumeStatus: total === null ? 'NOT_AVAILABLE' : proof.final ? 'FINAL' : 'PROVISIONAL',
  };
}
