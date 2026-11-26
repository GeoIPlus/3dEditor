// Kernel service path of the PREVIEW latency bench (3D-ADR-0006; 3D-121, D-357): every request goes through the
// command API that ships (services/kernel/src/command-api.js, 3D-109) - body size limit and JSON parse, contract
// validation, rate limit, head and version read from the history port, the kernel once in phase COMMIT (D-355), the
// PREVIEW store, reply validation - over an in-memory history that holds every scene model as its baseline. Measured
// span = "server PREVIEW, network excluded" (v0.3 §11): request body bytes in -> reply string out. Storage I/O is the
// memory store's (values kept as JSON text, parsed on every read); the HTTP binding and auth are 3D-110.
import { performance } from 'node:perf_hooks';
import { createCommandApi } from '../../services/kernel/src/command-api.js';
import { createContractValidator } from '../../services/kernel/src/contracts.js';
import { createHistory } from '../../services/kernel/src/history.js';
import { createMemoryStore } from '../../services/kernel/src/adapters/memory-store.js';

/** The whole tolerance profile (spec §2.3, D-13). */
export const PROFILE = {
  numericEpsilon: 1e-9, planarTolM: 0.02, topologySnapTolM: 0.01, minEdgeLengthM: 0.05, minFaceAreaM2: 0.1,
  zAlignTolM: 0.01, coplanarTolDeg: 1, footprintAngleTolDeg: 5, flatRoofTolDeg: 1, screenSnapPx: 10,
  heatmapBufferM: 1, planeFitMinPoints: 30, planeFitMinInlierRatio: 0.6, exportRoundDecimals: 3,
};

/**
 * Stages the API lets the bench time from outside: `parse` (body -> JSON), `validateCommand` / `validateReply`
 * (contract checks), `loadModel` (history store reads: baseline, journal list, version), `serialize` (reply ->
 * string). `kernelAndApi` is the rest of the request: `executeCommand` (imported by commit.js, not injectable), rate
 * limit, PREVIEW store and the API's own logic.
 */
export const STAGES = /** @type {const} */ (['parse', 'validateCommand', 'loadModel', 'kernelAndApi', 'validateReply', 'serialize']);

/** The authenticated user of every bench request (the scenes' `actorId`). */
export const ACTOR = { actorId: 'usr-operator' };

/** Injected clock step per request: a 10 Hz drag, inside the D-316 rate limit (20/s per user and building). */
export const STEP_MS = 100;

/** @param {Record<string, number> | undefined} acc @param {string} name @param {number} ms */
const add = (acc, name, ms) => { if (acc) acc[name] = (acc[name] ?? 0) + ms; };

/**
 * @template {any[]} A @template R
 * @param {(...a: A) => R} fn @param {string} name @param {{ acc?: Record<string, number> }} cur
 * @returns {(...a: A) => R}
 */
function timed(fn, name, cur) {
  return (...a) => {
    const t = performance.now();
    try {
      return fn(...a);
    } finally {
      add(cur.acc, name, performance.now() - t);
    }
  };
}

/**
 * @param {{ models: any[] }} o the scene models; each becomes the baseline (version 1) of its building
 * @returns {Promise<{ handle: (body: string, stages?: Record<string, number>) => Promise<string>, api: ReturnType<typeof createCommandApi> }>}
 */
export async function createPreviewService({ models }) {
  /** @type {{ acc?: Record<string, number> }} where the current request's stage times go */
  const cur = {};
  const raw = createMemoryStore();
  /** @type {import('../../services/kernel/src/ports/history.js').ObjectStore} */
  const store = {
    create: raw.create,
    get: async (k) => { const t = performance.now(); try { return await raw.get(k); } finally { add(cur.acc, 'loadModel', performance.now() - t); } },
    list: async (k) => { const t = performance.now(); try { return await raw.list(k); } finally { add(cur.acc, 'loadModel', performance.now() - t); } },
  };
  const history = createHistory(store);
  for (const m of models) await history.putBaseline(m.projectId, m.buildingId, m);
  const c = createContractValidator();
  const contracts = { ...c, command: timed(c.command, 'validateCommand', cur), reply: timed(c.reply, 'validateReply', cur) };
  let clock = 0;
  let seq = 0;
  const api = createCommandApi({
    history, contracts, toleranceProfile: () => PROFILE,
    clock: () => '2026-11-23T00:00:00Z',  // fixed RFC 3339 time: replies are deterministic
    now: () => clock, newPreviewId: () => `pv-${++seq}`,  // ids injected: replies are deterministic
  });
  const parse = timed(JSON.parse, 'parse', cur);

  /** @param {string} body @param {Record<string, number>} [stages] accumulates ms per stage */
  async function handle(body, stages) {
    clock += STEP_MS;
    cur.acc = stages ? {} : undefined;
    const t0 = performance.now();
    const r = await api.commandBody(Buffer.from(body, 'utf8'), ACTOR, { parse });
    const t1 = performance.now();
    const out = JSON.stringify(r.body);
    const t2 = performance.now();
    if (stages && cur.acc) {
      const known = Object.values(cur.acc).reduce((a, b) => a + b, 0);
      for (const [k, v] of Object.entries(cur.acc)) add(stages, k, v);
      add(stages, 'kernelAndApi', t1 - t0 - known);
      add(stages, 'serialize', t2 - t1);
    }
    cur.acc = undefined;
    return out;
  }
  return { handle, api };
}
