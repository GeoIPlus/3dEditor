// Emulated kernel service path for the PREVIEW latency bench (3D-08, 3D-ADR-0006). Measured span = "server PREVIEW,
// network excluded" (v0.3 §11): request body string in -> reply string out. Storage I/O is excluded too: the version is
// held as its serialised JSON string and parsed per request (a stateless service with a warm byte cache) [A].
// The real service is 3D-23; this file is bench tooling, not service code.
import { performance } from 'node:perf_hooks';
import { previewMoveEdge } from '../../packages/geo-model3d/spike/move-edge/index.js';
import { createAjv } from '../../contracts/model3d/test/load.mjs';

/** Tolerance profile defaults (spec §2.3, D-13), the fields the spike uses. */
export const TOL = { planarTolM: 0.02, topologySnapTolM: 0.01, minEdgeLengthM: 0.05, minFaceAreaM2: 0.1 };

export const STAGES = /** @type {const} */ (['parse', 'validateCommand', 'loadModel', 'kernel', 'validateReply', 'serialize']);

/**
 * @param {{ models: any[], cold?: boolean }} o `cold` (default true): parse the stored version string per request
 * @returns {{ handle: (body: string, stages?: Record<string, number>) => string, previews: Map<string, any> }}
 */
export function createPreviewService({ models, cold = true }) {
  const ajv = createAjv();
  const validateCommand = /** @type {import('ajv').ValidateFunction} */ (ajv.getSchema('urn:geoiplus:schema:model3d-command:v1'));
  const validateResult = /** @type {import('ajv').ValidateFunction} */ (ajv.getSchema('urn:geoiplus:schema:model3d-command-result:v1'));
  /** @type {Map<string, { version: number, json: string, model: any }>} */
  const store = new Map(models.map((m) => [m.buildingId, { version: m.version, json: JSON.stringify(m), model: m }]));
  /** @type {Map<string, any>} */
  const previews = new Map();
  let seq = 0;
  const NOW = '2026-11-23T00:00:00Z'; // injected clock; fixed so replies are deterministic

  /** @param {string} body @param {Record<string, number>} [stages] accumulates ms per stage */
  function handle(body, stages) {
    let t = performance.now();
    const lap = (/** @type {string} */ name) => {
      const n = performance.now();
      if (stages) stages[name] = (stages[name] ?? 0) + (n - t);
      t = n;
    };
    const cmd = JSON.parse(body);
    lap('parse');
    if (!validateCommand(cmd)) return JSON.stringify(fail(cmd, 'INVALID_PAYLOAD', 400));
    lap('validateCommand');
    const stored = store.get(cmd.buildingId);
    if (!stored) return JSON.stringify(fail(cmd, 'NOT_FOUND', 404));
    if (stored.version !== cmd.expectedVersion) return JSON.stringify(fail(cmd, 'VERSION_CONFLICT', 409));
    const model = cold ? JSON.parse(stored.json) : stored.model;
    lap('loadModel');
    const previewId = `prev-${++seq}`;
    const result = previewMoveEdge(model, cmd, TOL, { now: NOW, previewId });
    lap('kernel');
    if (!validateResult(result)) throw new Error(`reply invalid: ${JSON.stringify(validateResult.errors?.slice(0, 3))}`);
    lap('validateReply');
    if (result.status === 'PREVIEW') previews.set(previewId, result); // COMMIT applies exactly this (v0.3 §3)
    if (previews.size > 1000) previews.delete(/** @type {string} */ (previews.keys().next().value));
    const out = JSON.stringify(result);
    lap('serialize');
    return out;
  }
  return { handle, previews };
}

/** @param {any} cmd @param {string} code @param {number} httpStatus */
function fail(cmd, code, httpStatus) {
  return { commandId: cmd?.commandId ?? 'unknown', status: 'REJECTED', modelVersion: cmd?.expectedVersion ?? 0, warnings: [], error: { code, httpStatus } };
}
