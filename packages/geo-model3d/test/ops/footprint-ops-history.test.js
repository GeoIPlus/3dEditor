// 3D-114: RESIZE_ROOF (RR-15) and ALIGN_WALL through PREVIEW, the inverse patch and the real UNDO / REDO commands
// (pattern of envelope-history.test.js, D-342).
import { describe, expect, it } from 'vitest';
import { COLLECTIONS } from '../../src/brep/index.js';
import { run, command } from './helpers.js';
import { exec, gable, sound, inverseRestores, SMALL_FACES } from './envelope.helpers.js';

const ACTOR = 'usr-t';
const OPTS = SMALL_FACES;

function session() {
  const baseline = gable();
  /** @type {any[]} */
  const journal = [];
  const s = {
    model: /** @type {any} */ (baseline),
    /** @param {string} op @param {any} [payload] */
    send(op, payload = {}) {
      const out = run(s.model, command(s.model, op, payload, { commandId: `cmd-${journal.length + 1}` }), { ...OPTS, history: { journal: [...journal], baseline, actorId: ACTOR } });
      expect(out.result.status, JSON.stringify(out.result.error)).toBe('COMMITTED');
      journal.push({ ...out.journal, operationId: `op-${journal.length + 1}`, actorId: ACTOR });
      s.model = out.model;
      return out;
    },
  };
  return s;
}

const sameEntities = (/** @type {any} */ a, /** @type {any} */ b) => { for (const [, k] of COLLECTIONS) expect(a[k]).toEqual(b[k]); };
/** @param {number} w */
const eaves = (w) => [[0, -w], [10, -w], [10, 8 + w], [0, 8 + w]];
const RESIZES = [
  { roofOutline: [[-2, 0], [12, 0], [12, 8], [-2, 8]], moveWallFootprint: true },
  { roofOutline: eaves(0.5), moveWallFootprint: false },
];

describe('RESIZE_ROOF history (RR-15)', () => {
  it('PREVIEW gives the COMMIT patch; the inverse patch restores the input', () => {
    for (const p of RESIZES) {
      const g = gable();
      const commit = exec(g, 'RESIZE_ROOF', p, OPTS);
      expect(commit.result.status).toBe('COMMITTED');
      expect(exec(g, 'RESIZE_ROOF', p, OPTS, { phase: 'PREVIEW' }).result.patch).toEqual(commit.result.patch);
      inverseRestores(g, commit);
    }
  });

  it('outline equal to the current roof: COMMITTED, no new version, no journal entry, input returned', () => {
    for (const mv of [true, false]) {
      const g = gable();
      const out = exec(g, 'RESIZE_ROOF', { roofOutline: eaves(0), moveWallFootprint: mv });
      expect(out.result.status).toBe('COMMITTED');
      expect(out.result.modelVersion).toBe(g.version);
      expect(out.journal).toBeUndefined();
      expect(out.model).toBe(g);
    }
  });

  it('two RESIZE_ROOF, two UNDO, two REDO step through the same models', () => {
    const s = session();
    const models = [s.model];
    for (const p of [RESIZES[1], RESIZES[0]]) models.push(s.send('RESIZE_ROOF', p).model);
    for (let i = 1; i >= 0; i--) sameEntities(s.send('UNDO').model, models[i]);
    for (let i = 1; i <= 2; i++) {
      const r = s.send('REDO');
      sameEntities(r.model, models[i]);
      sound(r.model, OPTS.toleranceProfile);
    }
  });
});

describe('ALIGN_WALL history', () => {
  const P = { faceId: 'f-wall-s', referenceLine: [[0, -1], [10, -1]] };
  it('PREVIEW gives the COMMIT patch; the inverse patch restores the input (also with an overhang)', () => {
    const oh = exec(gable(), 'SET_OVERHANG', { eaveEdgeIds: ['he-f-roof-s-0'], overhangM: 0.6 }, OPTS).model;
    for (const m of [gable(), oh]) {
      const commit = exec(m, 'ALIGN_WALL', P, OPTS);
      expect(commit.result.status).toBe('COMMITTED');
      expect(exec(m, 'ALIGN_WALL', P, OPTS, { phase: 'PREVIEW' }).result.patch).toEqual(commit.result.patch);
      inverseRestores(m, commit);
    }
  });

  it('SET_OVERHANG -> ALIGN_WALL -> RESIZE_ROOF, three UNDO and three REDO step through the same models', () => {
    const s = session();
    const steps = [
      ['SET_OVERHANG', { eaveEdgeIds: ['he-f-roof-s-0'], overhangM: 0.6 }],
      ['ALIGN_WALL', { faceId: 'f-wall-w', referenceLine: [[-1, 0], [-1, 8]] }],
      ['RESIZE_ROOF', { roofOutline: [[-1, -1.6], [10, -1.6], [10, 8.4], [-1, 8.4]], moveWallFootprint: false }],
    ];
    const models = [s.model];
    for (const [op, p] of steps) models.push(s.send(/** @type {string} */ (op), p).model);
    for (let i = steps.length - 1; i >= 0; i--) sameEntities(s.send('UNDO').model, models[i]);
    for (let i = 1; i <= steps.length; i++) {
      const r = s.send('REDO');
      sameEntities(r.model, models[i]);
      sound(r.model, OPTS.toleranceProfile);
    }
  });
});
