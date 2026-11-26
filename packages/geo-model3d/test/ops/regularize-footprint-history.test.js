// 3D-126 REGULARIZE_FOOTPRINT (RF-15): PREVIEW == COMMIT, the inverse patch, a refusal leaves the model unchanged,
// UNDO / REDO through the real commands (pattern of footprint-ops-history.test.js), D-372 (roof planes with an
// overhang are never changed, so the pipeline guard does not fire).
import { describe, expect, it } from 'vitest';
import { COLLECTIONS } from '../../src/brep/index.js';
import { run, command } from './helpers.js';
import { exec, gable, sound, inverseRestores, SMALL_FACES } from './envelope.helpers.js';
import { built } from './regularize-footprint.helpers.js';

const ACTOR = 'usr-t';
const P = { footprintId: 'fp-1', allowCourtyardRemoval: false, orthogonalize: false };
const ORTHO = { ...P, orthogonalize: true };
const KINKED = [[0, 0], [7, 0], [10, 0.157], [10.28, 8], [0, 8]];
const SQUARE = [[0, 0], [20, 0], [20, 20], [0, 20]];
const TINY = [[10, 10], [10, 10.3], [10.3, 10.3], [10.3, 10]];

/** @param {any} baseline @param {any} [opts] */
function session(baseline, opts = {}) {
  /** @type {any[]} */
  const journal = [];
  const s = {
    model: /** @type {any} */ (baseline),
    /** @param {string} op @param {any} [payload] */
    send(op, payload = {}) {
      const out = run(s.model, command(s.model, op, payload, { commandId: `cmd-${journal.length + 1}` }), { ...opts, history: { journal: [...journal], baseline, actorId: ACTOR } });
      expect(out.result.status, JSON.stringify(out.result.error)).toBe('COMMITTED');
      journal.push({ ...out.journal, operationId: `op-${journal.length + 1}`, actorId: ACTOR });
      s.model = out.model;
      return out;
    },
  };
  return s;
}
const sameEntities = (/** @type {any} */ a, /** @type {any} */ b) => { for (const [, k] of COLLECTIONS) expect(a[k]).toEqual(b[k]); };
const overhangTilt = () => {
  const oh = exec(gable(), 'SET_OVERHANG', { eaveEdgeIds: ['he-f-roof-s-0', 'he-f-roof-n-0'], overhangM: 0.5 }, SMALL_FACES).model;
  return exec(oh, 'ALIGN_WALL', { faceId: 'f-wall-e', referenceLine: [[10, 0], [10.28, 8]] }, SMALL_FACES).model;
};

describe('REGULARIZE_FOOTPRINT history (RF-15)', () => {
  it('PREVIEW gives the COMMIT patch; the inverse patch restores the input (merge, rotation, courtyard, overhang)', () => {
    const cases = [
      [built(KINKED), P, {}],
      [built(KINKED), ORTHO, {}],
      [built(SQUARE, undefined, [TINY], SMALL_FACES), { ...P, allowCourtyardRemoval: true }, {}],
      [overhangTilt(), ORTHO, SMALL_FACES],
    ];
    for (const [m, p, opts] of /** @type {[any, any, any][]} */ (cases)) {
      const commit = exec(m, 'REGULARIZE_FOOTPRINT', p, opts);
      expect(commit.result.status, JSON.stringify(commit.result.error)).toBe('COMMITTED');
      expect(commit.result.modelVersion).toBe(m.version + 1);
      expect(exec(m, 'REGULARIZE_FOOTPRINT', p, opts, { phase: 'PREVIEW' }).result.patch).toEqual(commit.result.patch);
      inverseRestores(m, commit);
    }
  });

  it('D-372: with an overhang the roof planes are kept, so the commit is not refused', () => {
    const m = overhangTilt();
    const r = exec(m, 'REGULARIZE_FOOTPRINT', ORTHO, SMALL_FACES).model;
    for (const f of Object.values(m.faces).filter((x) => x.surfaceKind === 'RoofSurface')) expect(r.faces[f.id].supportPlane).toEqual(f.supportPlane);
  });

  it('a refusal returns the input object and writes no journal entry', () => {
    const m = built(SQUARE, undefined, [TINY], SMALL_FACES);
    const out = exec(m, 'REGULARIZE_FOOTPRINT', P);
    expect(out.result.status).toBe('REJECTED');
    expect(out.model).toBe(m);
    expect(out.journal).toBeUndefined();
  });

  it('straighten, then orthogonalize: two UNDO and two REDO step through the same models', () => {
    const s = session(built(KINKED));
    const models = [s.model];
    for (const p of [P, ORTHO]) models.push(s.send('REGULARIZE_FOOTPRINT', p).model);
    expect(Object.keys(models[1].faces).length).toBeLessThan(Object.keys(models[0].faces).length);
    for (let i = 1; i >= 0; i--) sameEntities(s.send('UNDO').model, models[i]);
    for (let i = 1; i <= 2; i++) {
      const r = s.send('REDO');
      sameEntities(r.model, models[i]);
      sound(r.model);
    }
  });
});
