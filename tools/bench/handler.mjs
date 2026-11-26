#!/usr/bin/env node
// `npm run bench:handler` (3D-110, D-111, D-3D110-4): the 3D-ADR-0006 PREVIEW scenes through the real service path,
// `createKernelHandler` (route, bearer token, role, body limit, contract validation, lease, rate limit, history read,
// kernel, PREVIEW store, reply validation, JSON). Measured span = request object with a JSON string body in -> reply
// string out: network and TLS excluded (v0.3 §11), storage = the memory store. The millisecond clock advances 100 ms per
// request so the 20/s PREVIEW limit (D-316) never refuses a bench request. Same protocol and verdict as `npm run bench`.
// Options: --runs N (5), --requests N (1000), --warmup N (300), --json.
import { performance } from 'node:perf_hooks';
import { scenes } from './scenes.mjs';
import { fingerprint } from './rig.mjs';
import { createKernelHandler } from '../../services/kernel/src/handler.js';
import { createHistory } from '../../services/kernel/src/history.js';
import { createMemoryStore } from '../../services/kernel/src/adapters/memory-store.js';
import { createStaticAuth, createMemoryLeases } from '../../services/kernel/src/adapters/static-auth.js';
import { createContractValidator } from '../../services/kernel/src/contracts.js';
import { ROLES } from '../../services/kernel/src/ports/auth.js';
import { PROFILE } from './service.mjs';

const TARGET_MS = 150;
/** @param {string} name @param {number} dflt */
const arg = (name, dflt) => { const i = process.argv.indexOf(`--${name}`); return i > 0 ? Number(process.argv[i + 1]) : dflt; };
/** Nearest-rank percentile of sorted samples. @param {number[]} s @param {number} p */
const pct = (s, p) => s[Math.max(0, Math.ceil((p / 100) * s.length) - 1)];
/** @param {number[]} xs */
function summary(xs) {
  const s = [...xs].sort((a, b) => a - b);
  const r = (/** @type {number} */ v) => Math.round(v * 1000) / 1000;
  return { n: s.length, p50: r(pct(s, 50)), p95: r(pct(s, 95)), p99: r(pct(s, 99)), max: r(s[s.length - 1]), mean: r(s.reduce((a, b) => a + b, 0) / s.length) };
}

const HEADERS = { authorization: 'Bearer tok-bench', 'content-type': 'application/json', 'x-3dqm-lease': 'lease-bench;1' };
const contracts = createContractValidator();

/** A handler whose history holds only `model`. @param {any} model */
async function handlerFor(model) {
  const history = createHistory(createMemoryStore());
  await history.putBaseline(model.projectId, model.buildingId, model);
  const leases = createMemoryLeases();
  leases.set(model.projectId, model.buildingId, { leaseRef: 'lease-bench', leaseEpoch: 1, holderId: 'usr-operator' });
  let t = 0;
  return createKernelHandler({ history, leases, contracts, auth: createStaticAuth({ 'tok-bench': { actorId: 'usr-operator', roles: [ROLES.OPERATOR] } }),
    toleranceProfile: () => PROFILE, clock: () => '2026-11-26T00:00:00Z', now: () => (t += 100) });
}

async function main() {
  const runs = arg('runs', 5); const requests = arg('requests', 1000); const warmup = arg('warmup', 300);
  const out = { target: { p95Ms: TARGET_MS, faces: 200, source: 'v0.3 §11; spec §11 rule 14' }, path: 'createKernelHandler (3D-110)', rig: fingerprint(), protocol: { runs, requests, warmup }, scenes: /** @type {any[]} */ ([]) };
  for (const sc of scenes()) {
    const handle = await handlerFor(sc.model);
    const url = `/api/projects/${encodeURIComponent(sc.model.projectId)}/commands`;
    const reqs = Array.from({ length: 20 }, (_, i) => ({ method: 'POST', url, headers: HEADERS, body: JSON.stringify(sc.command(i)) }));
    const first = JSON.parse((await handle(reqs[0])).body);
    if (first.status !== 'PREVIEW') throw new Error(`${sc.id}: ${first.status ?? first.code} ${JSON.stringify(first.error ?? first.message)}`);
    for (let i = 0; i < warmup; i++) await handle(reqs[i % reqs.length]);
    /** @type {number[]} */
    const pooled = [];
    const perRun = [];
    for (let r = 0; r < runs; r++) {
      /** @type {number[]} */
      const xs = [];
      for (let i = 0; i < requests; i++) {
        const t0 = performance.now();
        const reply = await handle(reqs[i % reqs.length]);
        xs.push(performance.now() - t0);
        if (reply.status !== 200) throw new Error(`${sc.id}: request ${i} -> ${reply.status} ${reply.body.slice(0, 200)}`);
      }
      perRun.push(summary(xs));
      pooled.push(...xs);
    }
    const pool = summary(pooled);
    const worstRunP95 = Math.max(...perRun.map((x) => x.p95));
    out.scenes.push({ id: sc.id, operation: sc.command(0).operation, faces: sc.faces, gate: sc.gate, pooled: pool, worstRunP95, perRun, meetsTarget: pool.p95 <= TARGET_MS && worstRunP95 <= TARGET_MS });
  }
  if (process.argv.includes('--json')) process.stdout.write(`${JSON.stringify(out, null, 2)}\n`);
  else {
    console.log(`path: ${out.path}\nrig: ${JSON.stringify(out.rig)}`);
    console.log(`protocol: ${JSON.stringify(out.protocol)}  target: p95 <= ${TARGET_MS} ms, <= 200 faces`);
    for (const s of out.scenes) {
      console.log(`${s.id.padEnd(16)} ${s.operation.padEnd(12)} faces ${String(s.faces).padStart(3)}  p50 ${s.pooled.p50} ms  p95 ${s.pooled.p95} ms  p99 ${s.pooled.p99} ms  max ${s.pooled.max} ms  worst-run p95 ${s.worstRunP95} ms${s.gate ? `  GATE ${s.meetsTarget ? 'PASS' : 'FAIL'}` : ''}`);
    }
  }
  const gate = out.scenes.find((s) => s.gate);
  process.exitCode = gate && gate.meetsTarget ? 0 : 1;
}

await main();
