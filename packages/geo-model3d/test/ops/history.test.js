// History commands (3D-18; spec §10.9 r1-r5, Accept 2; D-3D18-1..4): the test plays the service, keeps the journal
// (adding `operationId` and the authenticated `actorId`) and passes journal, baseline and actor to the kernel.
import { describe, expect, it } from 'vitest';
import { canonicalJson } from '@geoiplus/geo-model3d';
import { diffModels, COLLECTIONS } from '../../src/brep/index.js';
import { historyStacks } from '../../src/ops/index.js';
import { readFixture, deepFreeze } from '../brep/helpers.js';
import { run, command, metrics } from './helpers.js';

const ACTOR = 'usr-t';
const ALIGN = { edgeId: 'he-f-roof-s-2', mode: 'KEEP_EAVES', targetLine: [[0, 4, 8.5], [10, 4, 8.5]] };

/** A service stand-in: current model, journal, baseline. */
function session() {
  const baseline = deepFreeze(readFixture('GT-12', 'input.model.json'));
  /** @type {any[]} */
  const journal = [];
  const s = {
    baseline, journal, model: /** @type {any} */ (baseline),
    /** @param {string} op @param {any} [payload] @param {Record<string, any>} [over] @param {string} [actor] */
    send(op, payload = {}, over = {}, actor = ACTOR) {
      const out = run(s.model, command(s.model, op, payload, { commandId: `cmd-${journal.length + 1}`, ...over }), { history: { journal: [...journal], baseline, actorId: actor } });
      if (out.journal) {
        journal.push({ ...out.journal, operationId: `op-${journal.length + 1}`, actorId: actor });
        s.model = out.model;
      }
      return out;
    },
  };
  return s;
}

const sameEntities = (/** @type {any} */ a, /** @type {any} */ b) => { for (const [, k] of COLLECTIONS) expect(a[k]).toEqual(b[k]); };

describe('RESTORE_BASELINE (spec §10.9 r4, Accept 2)', () => {
  it('after GT-07: geometry equal to the baseline, version = previous + 1', () => {
    const s = session();
    s.send('ALIGN_RIDGE', ALIGN);
    const before = s.model.version;
    const out = s.send('RESTORE_BASELINE');
    expect(out.result.status).toBe('COMMITTED');
    expect(out.model.version).toBe(before + 1);
    sameEntities(out.model, s.baseline);
    expect(out.model.frame).toEqual(s.baseline.frame);
    expect(out.model.state).toBe('VALID_SOLID');
    expect(metrics(out.model).volumeM3).toBeCloseTo(520, 6);
  });

  it('is a normal stack entry: UNDO goes back to the GT-07 result, REDO is cleared by it (D-3D18-4)', () => {
    const s = session();
    const aligned = s.send('ALIGN_RIDGE', ALIGN).model;
    s.send('UNDO');
    s.send('REDO');
    s.send('RESTORE_BASELINE');
    expect(s.send('REDO').result.error.code).toBe('INVALID_PAYLOAD');
    const undo = s.send('UNDO');
    expect(undo.result.status).toBe('COMMITTED');
    sameEntities(undo.model, aligned);
  });

  it('refused INVALID_PAYLOAD when the model already equals the baseline (D-3D18-3), no new version', () => {
    const s = session();
    const out = s.send('RESTORE_BASELINE');
    expect(out.result).toMatchObject({ status: 'REJECTED', error: { code: 'INVALID_PAYLOAD', httpStatus: 400 } });
    expect(out.model).toBe(s.baseline);
  });
});

describe('UNDO / REDO stack (spec §10.9 r1-r3)', () => {
  it('several edits undo in stack order and redo in reverse; ids restored each time', () => {
    const s = session();
    const v = [s.model];
    v.push(s.send('ALIGN_RIDGE', ALIGN).model);
    v.push(s.send('ALIGN_RIDGE', { ...ALIGN, targetLine: [[0, 4, 9], [10, 4, 9]] }).model);
    sameEntities(s.send('UNDO').model, v[1]);
    sameEntities(s.send('UNDO').model, v[0]);
    expect(s.send('UNDO').result.error.code).toBe('INVALID_PAYLOAD');
    sameEntities(s.send('REDO').model, v[1]);
    sameEntities(s.send('REDO').model, v[2]);
    expect(s.send('REDO').result.error.code).toBe('INVALID_PAYLOAD');
    expect(s.journal.map((e) => e.afterVersion)).toEqual([2, 3, 4, 5, 6, 7]); // issued versions never reused
  });

  it('a new edit clears the redo stack', () => {
    const s = session();
    s.send('ALIGN_RIDGE', ALIGN);
    s.send('UNDO');
    s.send('ALIGN_RIDGE', { ...ALIGN, targetLine: [[0, 4, 9], [10, 4, 9]] });
    expect(s.send('REDO').result.error).toMatchObject({ code: 'INVALID_PAYLOAD', message: expect.stringContaining('nothing to redo') });
    expect(historyStacks(s.journal)).toMatchObject({ redo: [] });
  });

  it('the stack top of another actor is refused FORBIDDEN; nothing is skipped (spec §10.9 r5, D-3D18-2)', () => {
    const s = session();
    s.send('ALIGN_RIDGE', ALIGN, {}, 'usr-a');
    const out = s.send('UNDO', {}, {}, 'usr-b');
    expect(out.result).toMatchObject({ status: 'REJECTED', error: { code: 'FORBIDDEN', httpStatus: 403, entityIds: ['cmd-1'] } });
    expect(s.send('UNDO', {}, {}, 'usr-a').result.status).toBe('COMMITTED');
    expect(s.send('REDO', {}, {}, 'usr-b').result.error.code).toBe('FORBIDDEN');
  });

  it('PREVIEW gives the COMMIT patch and persists nothing; outputs are deterministic for the same input', () => {
    const s = session();
    s.send('ALIGN_RIDGE', ALIGN);
    const opts = { history: { journal: s.journal, actorId: ACTOR } };
    const cur = deepFreeze(s.model);
    const preview = run(cur, command(cur, 'UNDO', {}, { phase: 'PREVIEW' }), opts);
    expect(preview.result.status).toBe('PREVIEW');
    expect(preview.model).toBe(cur);
    const c1 = run(cur, command(cur, 'UNDO', {}), opts);
    const c2 = run(cur, command(cur, 'UNDO', {}), opts);
    expect(c1.result.patch).toEqual(preview.result.patch);
    expect(canonicalJson(c1.result)).toBe(canonicalJson(c2.result));
    expect(canonicalJson(c1.model)).toBe(canonicalJson(c2.model));
  });
});

describe('no commit gate, state by validation (D-3D18-1)', () => {
  it('UNDO to a version with errors commits under targetState VALID_SOLID and lands in DRAFT_SOLID', () => {
    const good = /** @type {any} */ (structuredClone(readFixture('GT-12', 'input.model.json')));
    good.version = 2;
    const broken = structuredClone(good);
    broken.version = 1;
    broken.state = 'DRAFT_SOLID';
    broken.faces['f-roof-s'].supportPlane = { normal: [0, -0.6, 0.8], d: -5 }; // vertices off the plane
    const { forward, inverse } = diffModels(broken, good);
    const entry = {
      operationId: 'op-1', commandId: 'cmd-fix', beforeVersion: 1, afterVersion: 2, actorId: ACTOR, timestamp: '2026-11-24T00:00:00Z',
      input: command(broken, 'ALIGN_RIDGE', ALIGN), affectedEntityIds: ['f-roof-s'], forwardPatch: forward, inversePatch: inverse,
      validationSummary: {}, topologyLineage: { mapped: {}, deleted: [], preserved: [] },
    };
    const out = run(good, command(good, 'UNDO', {}), { history: { journal: [entry], actorId: ACTOR } });
    expect(out.result.status).toBe('COMMITTED');
    expect(out.model.state).toBe('DRAFT_SOLID');
    expect(out.model.faces['f-roof-s'].supportPlane.d).toBe(-5);
    expect(out.result.validation.issues.some((/** @type {any} */ i) => i.severity === 'ERROR')).toBe(true);
  });
});

describe('refusals of the envelope and of the service input', () => {
  const s = session();
  s.send('ALIGN_RIDGE', ALIGN);
  const opts = { history: { journal: s.journal, actorId: ACTOR } };
  it.each([
    ['a non-empty payload', command(s.model, 'UNDO', { x: 1 }), opts, 'INVALID_PAYLOAD'],
    ['a stale expectedVersion', command(s.model, 'UNDO', {}, { expectedVersion: 1 }), opts, 'VERSION_CONFLICT'],
    ['another building', command(s.model, 'UNDO', {}, { buildingId: 'bld-x' }), opts, 'NOT_FOUND'],
    ['a journal that does not end at the version', command(s.model, 'UNDO', {}), { history: { journal: [{ ...s.journal[0], afterVersion: 9 }], actorId: ACTOR } }, 'INTERNAL'],
    ['RESTORE_BASELINE without a baseline', command(s.model, 'RESTORE_BASELINE', {}), opts, 'INTERNAL'],
  ])('%s', (_, cmd, o, code) => {
    const out = run(s.model, cmd, o);
    expect(out.result.error.code).toBe(code);
    expect(out.model).toBe(s.model);
    expect(out.journal).toBeUndefined();
  });

  it('historyStacks throws on a journal that does not replay', () => {
    expect(() => historyStacks([{ ...s.journal[0], input: { operation: 'UNDO' } }])).toThrow(/empty stack/);
    expect(() => historyStacks([s.journal[0], { ...s.journal[0] }])).toThrow(/gap/);
  });
});
