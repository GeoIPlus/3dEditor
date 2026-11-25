#!/usr/bin/env node
// `npm run bench` (3D-08, 3D-ADR-0006): server PREVIEW latency of MOVE_EDGE per scene, against the v0.3 §11 target
// p95 <= 150 ms for a building up to 200 faces (network excluded). Prints the rig fingerprint and, per scene, the
// percentiles of every run and of all runs pooled. Exit 1 when the gate scene misses the target.
// Options: --runs N (default 5), --requests N per run (default 1000), --warmup N (default 300), --warm (keep the
// parsed model between requests instead of parsing the stored version), --json (machine-readable output only).
import { performance } from 'node:perf_hooks';
import { scenes } from './scenes.mjs';
import { STAGES, createPreviewService } from './service.mjs';
import { fingerprint } from './rig.mjs';

const TARGET_MS = 150;

/** @param {string} name @param {number} dflt */
function arg(name, dflt) {
  const i = process.argv.indexOf(`--${name}`);
  return i > 0 ? Number(process.argv[i + 1]) : dflt;
}
const flag = (/** @type {string} */ name) => process.argv.includes(`--${name}`);

/** Nearest-rank percentile of sorted samples. @param {number[]} sorted @param {number} p */
export const pct = (sorted, p) => sorted[Math.max(0, Math.ceil((p / 100) * sorted.length) - 1)];

/** @param {number[]} xs */
function summary(xs) {
  const s = [...xs].sort((a, b) => a - b);
  const r = (/** @type {number} */ v) => Math.round(v * 1000) / 1000;
  return { n: s.length, p50: r(pct(s, 50)), p95: r(pct(s, 95)), p99: r(pct(s, 99)), max: r(s[s.length - 1]), mean: r(s.reduce((a, b) => a + b, 0) / s.length) };
}

function main() {
  const runs = arg('runs', 5); const requests = arg('requests', 1000); const warmup = arg('warmup', 300);
  const cold = !flag('warm');
  const all = scenes();
  const svc = createPreviewService({ models: all.map((s) => s.model), cold });
  const out = { target: { p95Ms: TARGET_MS, faces: 200, source: 'v0.3 §11; spec §11 rule 14' }, rig: fingerprint(), protocol: { runs, requests, warmup, modelLoad: cold ? 'parse stored version per request' : 'kept parsed' }, scenes: /** @type {any[]} */ ([]) };
  for (const sc of all) {
    const bodies = Array.from({ length: 20 }, (_, i) => JSON.stringify(sc.command(i)));
    const first = JSON.parse(svc.handle(bodies[0]));
    if (first.status !== 'PREVIEW') throw new Error(`${sc.id}: ${first.status} ${JSON.stringify(first.error)}`);
    for (let i = 0; i < warmup; i++) svc.handle(bodies[i % bodies.length]);
    /** @type {number[]} */
    const pooled = [];
    const perRun = [];
    /** @type {Record<string, number>} */
    const stages = {};
    for (let r = 0; r < runs; r++) {
      /** @type {number[]} */
      const xs = [];
      for (let i = 0; i < requests; i++) {
        const t0 = performance.now();
        svc.handle(bodies[i % bodies.length], stages);
        xs.push(performance.now() - t0);
      }
      perRun.push(summary(xs));
      pooled.push(...xs);
    }
    const total = runs * requests;
    const stageMeanMs = Object.fromEntries(STAGES.map((k) => [k, Math.round(((stages[k] ?? 0) / total) * 1000) / 1000]));
    const pool = summary(pooled);
    const worstRunP95 = Math.max(...perRun.map((x) => x.p95));
    out.scenes.push({ id: sc.id, faces: sc.faces, vertices: Object.keys(sc.model.vertices).length, halfEdges: Object.keys(sc.model.halfEdges).length, gate: sc.gate, pooled: pool, worstRunP95, perRun, stageMeanMs, meetsTarget: pool.p95 <= TARGET_MS && worstRunP95 <= TARGET_MS });
  }
  if (flag('json')) process.stdout.write(`${JSON.stringify(out, null, 2)}\n`);
  else {
    console.log(`rig: ${JSON.stringify(out.rig)}`);
    console.log(`protocol: ${JSON.stringify(out.protocol)}  target: p95 <= ${TARGET_MS} ms, <= 200 faces`);
    for (const s of out.scenes) {
      console.log(`${s.id.padEnd(14)} faces ${String(s.faces).padStart(3)}  p50 ${s.pooled.p50} ms  p95 ${s.pooled.p95} ms  p99 ${s.pooled.p99} ms  max ${s.pooled.max} ms  worst-run p95 ${s.worstRunP95} ms${s.gate ? `  GATE ${s.meetsTarget ? 'PASS' : 'FAIL'}` : ''}`);
      console.log(`${''.padEnd(14)} stages (mean ms): ${JSON.stringify(s.stageMeanMs)}`);
    }
  }
  const gate = out.scenes.find((s) => s.gate);
  process.exitCode = gate && gate.meetsTarget ? 0 : 1;
}

main();
