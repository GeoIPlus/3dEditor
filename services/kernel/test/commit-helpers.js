// Helpers of the COMMIT path tests (3D-23): golden input models (fixtures/, 3D-07), the D-13 profile, a fixed clock,
// contract validation with Ajv (contracts/model3d), and a service over a fresh store holding one baseline.
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { expect } from 'vitest';
import { createAjv } from '../../../contracts/model3d/test/load.mjs';
import { createHistory } from '../src/history.js';
import { createCommitService } from '../src/commit.js';
import { createMemoryStore } from '../src/adapters/memory-store.js';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..', '..');
/** @param {string} gt @param {string} file */
export const readFixture = (gt, file) => JSON.parse(readFileSync(join(ROOT, 'fixtures', gt, file), 'utf8'));

/** Tolerance profile defaults, 14 fields (spec §2.3, D-13). */
export const PROFILE = {
  numericEpsilon: 1e-9, topologySnapTolM: 0.01, planarTolM: 0.02, zAlignTolM: 0.01, minEdgeLengthM: 0.05,
  minFaceAreaM2: 0.1, coplanarTolDeg: 1, footprintAngleTolDeg: 5, flatRoofTolDeg: 1, screenSnapPx: 10,
  heatmapBufferM: 1, planeFitMinPoints: 30, planeFitMinInlierRatio: 0.6, exportRoundDecimals: 3,
};

const ajv = createAjv();
/** @param {string} name @param {any} value */
export function contractValid(name, value) {
  const v = /** @type {import('ajv').ValidateFunction} */ (ajv.getSchema(`urn:geoiplus:schema:model3d-${name}:v1`));
  expect(v(value), `${name}: ${JSON.stringify(v.errors?.slice(0, 3))}`).toBe(true);
  return value;
}

/** Checks a service reply against its contract: `command-result`, `command-status` or `error`. @param {{ httpStatus: number, body: any }} r */
export function validReply(r) {
  contractValid(r.body.state ? 'command-status' : r.body.status ? 'command-result' : 'error', r.body);
  return r;
}

/**
 * A service over a fresh store (memory unless given) whose only building is `model` (its baseline).
 * @param {any} model @param {import('../src/ports/history.js').ObjectStore} [store]
 */
export async function serviceWith(model, store = createMemoryStore()) {
  const history = createHistory(store);
  await history.putBaseline(model.projectId, model.buildingId, model);
  let n = 0;
  const service = createCommitService({ history, toleranceProfile: () => PROFILE, clock: () => '2026-11-26T00:00:00Z', newOperationId: () => `op-${++n}` });
  return { history, store, service };
}

/** A COMMIT command on `model` (LOCAL, VALID_SOLID target). @param {any} model @param {string} commandId @param {string} operation @param {any} payload @param {Record<string, any>} [over] */
export const command = (model, commandId, operation, payload, over = {}) => ({
  schemaVersion: '1', commandId, projectId: model.projectId, buildingId: model.buildingId, actorId: 'usr-operator',
  operation, phase: 'COMMIT', expectedVersion: model.version, payload, coordinateFrame: 'LOCAL', targetState: 'VALID_SOLID', ...over,
});

/**
 * A command API (3D-109) over a fresh store holding `model`, with an injected millisecond clock (`clock.t`).
 * @param {any} model @param {Partial<import('../src/command-api.js').CommandApiDeps>} [over]
 */
export async function apiWith(model, over = {}) {
  const { createCommandApi } = await import('../src/command-api.js');
  const history = createHistory(createMemoryStore());
  await history.putBaseline(model.projectId, model.buildingId, model);
  const clock = { t: 0 };
  let n = 0;
  let pv = 0;
  const api = createCommandApi({ history, toleranceProfile: () => PROFILE, clock: () => '2026-11-26T00:00:00Z',
    newOperationId: () => `op-${++n}`, now: () => clock.t, newPreviewId: () => `pv-${++pv}`, ...over });
  return { api, history, clock };
}
