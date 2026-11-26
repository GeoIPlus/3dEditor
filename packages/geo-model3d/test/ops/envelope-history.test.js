// 3D-19 with 3D-18 history (D-342): the envelope operations undo and redo through the real UNDO / REDO commands,
// not only through the inverse patch. The test plays the service as history.test.js does (journal, baseline, actor).
import { describe, expect, it } from 'vitest';
import { COLLECTIONS } from '../../src/brep/index.js';
import { run, command } from './helpers.js';
import { gable, sound } from './envelope.helpers.js';

const ACTOR = 'usr-t';

function session() {
  const baseline = gable();
  /** @type {any[]} */
  const journal = [];
  const s = {
    model: /** @type {any} */ (baseline),
    /** @param {string} op @param {any} [payload] */
    send(op, payload = {}) {
      const out = run(s.model, command(s.model, op, payload, { commandId: `cmd-${journal.length + 1}` }), { history: { journal: [...journal], baseline, actorId: ACTOR } });
      expect(out.result.status, JSON.stringify(out.result.error)).toBe('COMMITTED');
      journal.push({ ...out.journal, operationId: `op-${journal.length + 1}`, actorId: ACTOR });
      s.model = out.model;
      return out;
    },
  };
  return s;
}

const sameEntities = (/** @type {any} */ a, /** @type {any} */ b) => { for (const [, k] of COLLECTIONS) expect(a[k]).toEqual(b[k]); };

describe('envelope operations with UNDO / REDO (D-342)', () => {
  it('SET_OVERHANG -> SET_HEIGHT EAVE -> TRANSLATE -> ROTATE, then four UNDO and four REDO step through the same models', () => {
    const s = session();
    const steps = [
      ['SET_OVERHANG', { eaveEdgeIds: ['he-f-roof-s-0', 'he-f-roof-n-0'], overhangM: 0.6 }],
      ['SET_HEIGHT', { kind: 'EAVE', z: 5.5, eaveEdgeId: 'he-f-roof-s-0' }],
      ['TRANSLATE_BUILDING', { vector: [10, -5, 1] }],
      ['ROTATE_BUILDING', { angleDeg: 30 }],
    ];
    const models = [s.model];
    for (const [op, p] of steps) models.push(s.send(/** @type {string} */ (op), p).model);
    for (let i = steps.length - 1; i >= 0; i--) {
      const u = s.send('UNDO');
      sameEntities(u.model, models[i]);
      expect(u.model.state).toBe('VALID_SOLID');
    }
    for (let i = 1; i <= steps.length; i++) {
      const r = s.send('REDO');
      sameEntities(r.model, models[i]);
      sound(r.model);
    }
  });

  it('UNDO of SET_OVERHANG 0 brings the overhang back with its ids; REDO removes it again', () => {
    const s = session();
    const withOh = s.send('SET_OVERHANG', { eaveEdgeIds: ['he-f-roof-s-0'], overhangM: 0.6 }).model;
    const without = s.send('SET_OVERHANG', { eaveEdgeIds: ['he-f-roof-s-0'], overhangM: 0 }).model;
    sameEntities(s.send('UNDO').model, withOh);
    sameEntities(s.send('REDO').model, without);
  });
});
