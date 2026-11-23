// brep (3D-09): transactions and versions (spec §4 rule 9; §3 rules 2, 6). Patches and lineage validate against the
// model3d contracts (D-75).
import { describe, expect, it } from 'vitest';
import { applyPatch, canonicalJson, isolatedCopy, rederive, sameValue, saveModel, transact, transactPatch } from '../../src/brep/index.js';
import { createAjv } from '../../../../contracts/model3d/test/load.mjs';
import { TOL, deepFreeze, readFixture } from './helpers.js';

const ajv = createAjv();
const validate = {
  model: ajv.getSchema('urn:geoiplus:schema:model3d-building-model:v1'),
  patch: ajv.getSchema('urn:geoiplus:schema:model3d-model-patch:v1'),
  lineage: ajv.getSchema('urn:geoiplus:schema:model3d-topology-lineage:v1'),
};
/** @param {any} fn @param {unknown} value */
const valid = (fn, value) => { const ok = fn(value); return ok ? [] : fn.errors; };

/** The GT-07 gable (derived vertices), frozen: any write to it throws. */
const frozenGable = () => deepFreeze(readFixture('GT-07', 'input.model.json'));

/** Mutator: shift the south roof plane by `dz` along its normal and re-derive (an edit in plane terms, D-08). */
const shiftRoof = (/** @type {number} */ dz) => (/** @type {any} */ draft) => {
  const pl = draft.faces['f-roof-s'].supportPlane;
  draft.faces['f-roof-s'].supportPlane = { normal: pl.normal, d: pl.d - dz };
  rederive(draft, ['f-roof-s'], TOL);
  return /** @type {const} */ ({ ok: true });
};

describe('transact', () => {
  it('produces exactly one new version with forward and inverse patch and lineage, all contract-valid', () => {
    const before = frozenGable();
    const r = transact(before, shiftRoof(0.5));
    if (!r.ok) throw new Error('unexpected refusal');
    expect(r.model.version).toBe(before.version + 1);
    expect(valid(validate.model, r.model)).toEqual([]);
    expect(valid(validate.patch, r.forwardPatch)).toEqual([]);
    expect(valid(validate.patch, r.inversePatch)).toEqual([]);
    expect(valid(validate.lineage, r.topologyLineage)).toEqual([]);
    expect(r.forwardPatch.added).toEqual([]);
    expect(r.forwardPatch.updated.map((c) => c.type)).toContain('Face');
    expect(r.topologyLineage.preserved).toContain('f-roof-s');
    expect(r.topologyLineage.deleted).toEqual([]);
    expect(r.affectedEntityIds).toEqual([...r.affectedEntityIds].sort());
    expect(r.modelLevel).toEqual([]);
  });

  it('applying the inverse patch restores the before entities; forward re-applies the after entities', () => {
    const before = frozenGable();
    const r = transact(before, shiftRoof(0.5));
    if (!r.ok) throw new Error('unexpected refusal');
    const undone = applyPatch(r.model, r.inversePatch);
    expect(saveModel({ ...undone, version: before.version })).toBe(saveModel(before));
    expect(saveModel(applyPatch(before, r.forwardPatch))).toBe(saveModel({ ...r.model, version: before.version }));
  });

  it('Undo is a new version too (transactPatch with the inverse patch)', () => {
    const v1 = frozenGable();
    const edit = transact(v1, shiftRoof(0.5));
    if (!edit.ok) throw new Error('unexpected refusal');
    const undo = transactPatch(edit.model, edit.inversePatch);
    expect(undo.model.version).toBe(v1.version + 2);
    expect(saveModel({ ...undo.model, version: v1.version })).toBe(saveModel(v1));
    expect(undo.forwardPatch).toEqual(edit.inversePatch);
  });

  it('a refusal returns the input object unchanged (no partial side effects)', () => {
    const before = frozenGable();
    const snapshot = saveModel(before);
    const r = transact(before, (draft) => {
      draft.faces['f-roof-s'].supportPlane = { normal: [0, 0, 1], d: -100 }; // the draft is writable and changed...
      return { ok: false, refusal: { code: 'CONSTRAINT_CONFLICT', entityIds: ['f-roof-s'] } };
    });
    expect(r.ok).toBe(false);
    expect(r.model).toBe(before); // ...the input is not
    expect(saveModel(r.model)).toBe(snapshot);
  });

  it('a mutator that throws leaves the input unchanged', () => {
    const before = frozenGable();
    const snapshot = saveModel(before);
    expect(() => transact(before, (draft) => { delete draft.faces['f-roof-s']; throw new Error('boom'); })).toThrow('boom');
    expect(saveModel(before)).toBe(snapshot);
  });

  it('a split recorded in `mapped` is the lineage; deleted and added ids come from the patch', () => {
    const before = frozenGable();
    const r = transact(before, (draft) => {
      const f = draft.faces['f-roof-n'];
      delete draft.faces['f-roof-n'];
      draft.faces['f-roof-n-a'] = { ...isolatedCopy(f), id: 'f-roof-n-a' };
      draft.faces['f-roof-n-b'] = { ...isolatedCopy(f), id: 'f-roof-n-b' };
      return { ok: true, mapped: { 'f-roof-n': ['f-roof-n-a', 'f-roof-n-b'] } };
    });
    if (!r.ok) throw new Error('unexpected refusal');
    expect(r.topologyLineage).toEqual({ mapped: { 'f-roof-n': ['f-roof-n-a', 'f-roof-n-b'] }, deleted: [], preserved: [] });
    expect(r.forwardPatch.added.map((c) => c.entity.id)).toEqual(['f-roof-n-a', 'f-roof-n-b']);
    expect(r.forwardPatch.deleted).toEqual([{ type: 'Face', id: 'f-roof-n' }]);
    expect(valid(validate.lineage, r.topologyLineage)).toEqual([]);
  });

  it('refuses a lineage that names ids outside the two versions', () => {
    const before = frozenGable();
    expect(() => transact(before, () => ({ ok: true, mapped: { 'f-none': ['f-roof-n'] } }))).toThrow(/not in version/);
    expect(() => transact(before, () => ({ ok: true, mapped: { 'f-roof-n': ['f-none'] } }))).toThrow(/not in the new version/);
  });

  it('reports model-level changes beside the patch (Q-31), and the version is always before + 1', () => {
    const before = frozenGable();
    const r = transact(before, (draft) => { draft.state = 'DRAFT_SOLID'; draft.version = 99; return { ok: true }; });
    if (!r.ok) throw new Error('unexpected refusal');
    expect(r.modelLevel).toEqual(['state']);
    expect(r.model.version).toBe(before.version + 1);
    expect(r.forwardPatch).toEqual({ added: [], updated: [], deleted: [], affectedMetrics: [] });
  });

  it('is deterministic: equal inputs give byte-identical results', () => {
    const a = transact(frozenGable(), shiftRoof(0.25));
    const b = transact(frozenGable(), shiftRoof(0.25));
    expect(canonicalJson(a)).toBe(canonicalJson(b));
  });

  it('applyPatch refuses a patch that does not fit', () => {
    const m = frozenGable();
    expect(() => applyPatch(m, { added: [], updated: [], deleted: [{ type: 'Face', id: 'f-none' }], affectedMetrics: [] })).toThrow(/missing/);
    expect(() => applyPatch(m, { added: [{ type: 'Face', entity: { ...m.faces['f-roof-n'] } }], updated: [], deleted: [], affectedMetrics: [] })).toThrow(/existing/);
    expect(() => applyPatch(m, { added: [], updated: [], deleted: [{ type: 'Nope', id: 'x' }], affectedMetrics: [] })).toThrow(/unknown entity type/);
  });
});

describe('sameValue (patch comparison)', () => {
  it('equals canonical-JSON equality: key order ignored, -0 equals 0, undefined members ignored', () => {
    expect(sameValue({ a: [1, { b: -0 }], c: 'x' }, { c: 'x', a: [1, { b: 0 }] })).toBe(true);
    expect(sameValue({ a: 1, u: undefined }, { a: 1 })).toBe(true);
    expect(sameValue({ a: [1, 2] }, { a: [2, 1] })).toBe(false);
    expect(sameValue({ a: null }, { a: {} })).toBe(false);
    expect(sameValue([], {})).toBe(false);
    expect(sameValue({ a: 1 }, { a: 1, b: 2 })).toBe(false);
  });
});
