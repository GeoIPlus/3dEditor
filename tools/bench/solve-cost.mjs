#!/usr/bin/env node
// 3D-13: cost of the solve module (spec §5) on the MOVE_EDGE targets of the 3D-ADR-0006 scenes, stage 1 and a stage-2
// variant (soft SYMMETRY added). Not the PREVIEW gate (that is `npm run bench`). Run: node tools/bench/solve-cost.mjs
import { sawtooth } from './scenes.mjs';
import { builders, compileConstraints, solveConstraints } from '../../packages/geo-model3d/src/solve/index.js';

const TOL = { numericEpsilon: 1e-9, planarTolM: 0.02, zAlignTolM: 0.01, topologySnapTolM: 0.01 };

for (const k of [97, 247]) {
  const sc = sawtooth(k, k === 97);
  const model = /** @type {any} */ (sc.model);
  const b = builders(model);
  /** @param {number} i @param {boolean} stage2 */
  const run = (i, stage2) => {
    const p = /** @type {any} */ (sc.command(i)).payload;
    const he = model.halfEdges[p.edgeId];
    const ends = [he.startVertexId, model.halfEdges[he.nextId].startVertexId];
    const conds = p.movableFaceIds.flatMap((/** @type {string} */ f) =>
      p.targetLine.map((/** @type {any} */ q) => b.pointOnPlane({ id: 'target', kind: 'MOVE_EDGE' }, f, q, TOL.planarTolM)));
    if (stage2) {
      const sym = [{ id: 'sym', kind: 'SYMMETRY', entityIds: p.movableFaceIds, hard: false, weight: 1 }];
      conds.push(...compileConstraints(model, sym, TOL).conditions);
    }
    return solveConstraints({ model, movableFaceIds: p.movableFaceIds, conditions: conds, targetVertexIds: ends }, TOL);
  };
  for (const stage2 of [false, true]) {
    for (let i = 0; i < 300; i++) run(i, stage2);
    /** @type {number[]} */
    const t = [];
    /** @type {Record<string, number>} */
    const statuses = {};
    for (let i = 0; i < 2000; i++) {
      const t0 = process.hrtime.bigint();
      const r = run(i, stage2);
      t.push(Number(process.hrtime.bigint() - t0) / 1e6);
      statuses[r.status] = (statuses[r.status] ?? 0) + 1;
    }
    t.sort((x, y) => x - y);
    const ms = (/** @type {number} */ x) => `${x.toFixed(3)} ms`;
    console.log(`sawtooth-${2 * k + 5} stage ${stage2 ? 2 : 1}: p50 ${ms(t[999])} p95 ${ms(t[1899])} max ${ms(t[1999])}`, JSON.stringify(statuses));
  }
}
