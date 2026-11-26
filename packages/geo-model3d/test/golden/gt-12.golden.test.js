// GT-12 (v0.3 §12; spec §10.9, §13; row 3D-18): Undo / Redo after GT-07. The fixture's three COMMIT steps run in order;
// the test plays the service: it keeps the journal (adding `actorId`) and passes it to the next history command.
// Volumes are computed by the test (divergence theorem) from vertex coordinates, not by the kernel.
import { describe, expect, it } from 'vitest';
import { readFixture, deepFreeze } from '../brep/helpers.js';
import { run, metrics } from '../ops/helpers.js';
import { COLLECTIONS } from '../../src/brep/index.js';

const ACTOR = 'usr-operator';

describe('GT-12 Undo / Redo after GT-07', () => {
  const model = deepFreeze(readFixture('GT-12', 'input.model.json'));
  const steps = readFixture('GT-12', 'steps.json');
  const expected = readFixture('GT-12', 'expected.json');
  const a = expected.assert, tol = expected.tolerance;
  /** @type {any[]} */
  const journal = [];
  /** @type {any[]} */
  const models = [model];
  /** @type {any[]} */
  const outs = [];
  for (const s of steps) {
    const out = run(models[models.length - 1], s.command, { history: { journal: [...journal], actorId: ACTOR } });
    outs.push(out);
    if (out.result.status !== 'COMMITTED') break;
    journal.push({ ...out.journal, operationId: `op-${journal.length + 1}`, actorId: ACTOR });
    models.push(out.model);
  }

  it('the fixture is ALIGN_RIDGE, UNDO, REDO, every one COMMITTED', () => {
    expect(expected.owner.row).toBe('3D-18');
    expect(steps.map((/** @type {any} */ s) => s.command.operation)).toEqual(['ALIGN_RIDGE', 'UNDO', 'REDO']);
    expect(outs.map((o) => o.result.status)).toEqual(['COMMITTED', 'COMMITTED', 'COMMITTED']);
  });

  it('each operation is a new version: 1 -> 2 -> 3 -> 4', () => {
    expect(a.newVersionPerOperation).toBe(true);
    expect(models.map((m) => m.version)).toEqual([1, 2, 3, 4]);
    expect(journal.map((e) => [e.beforeVersion, e.afterVersion])).toEqual([[1, 2], [2, 3], [3, 4]]);
  });

  it('Undo: 520 m3 and the original ids (every entity equal to the input version)', () => {
    const undone = models[2];
    const m = metrics(undone);
    console.log('GT-12 undo', JSON.stringify(m));
    expect(Math.abs(m.volumeM3 - a.afterUndo.volumeM3)).toBeLessThanOrEqual(tol.volumeM3);
    expect(a.afterUndo.originalIds).toBe(true);
    for (const [, key] of COLLECTIONS) {
      expect(Object.keys(undone[key]).sort()).toEqual(Object.keys(model[key]).sort());
      expect(undone[key]).toEqual(model[key]);
    }
    expect(undone.state).toBe(model.state);
  });

  it('Redo: 540 m3 and the GT-07 result again', () => {
    const redone = models[3];
    const m = metrics(redone);
    console.log('GT-12 redo', JSON.stringify(m));
    expect(Math.abs(m.volumeM3 - a.afterRedo.volumeM3)).toBeLessThanOrEqual(tol.volumeM3);
    for (const [, key] of COLLECTIONS) expect(redone[key]).toEqual(models[1][key]);
  });
});
