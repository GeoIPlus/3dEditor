// 3D-12: modes (spec §8 rule 1; v0.2 §16.2), determinism, input safety, option errors, state columns.
import { describe, it, expect } from 'vitest';
import { validate, golden, deepFreeze, addTetra, TOLS, clock } from './helpers.js';
import { validateModel } from '../../src/index.js';

const codes = (/** @type {any} */ r) => r.issues.map((/** @type {any} */ i) => i.code);

/** GT-03 with the ridge end v-r1 lifted 0.1 m (NON_PLANAR_FACE on both slopes). */
function lifted() {
  const m = golden('GT-03');
  m.vertices['v-r1'].p = [10, 4, 8.1];
  return m;
}

/** GT-03 with a tetrahedron in its shell piercing the south slope. */
function pierced() {
  const m = golden('GT-03');
  addTetra(m, 'sh-1', 'ts', { s0: [5, 2, 6], s1: [5, 2.5, 10], s2: [6, 1.5, 10], s3: [4, 1.5, 10] });
  return m;
}

describe('FAST_PREVIEW', () => {
  it('never confirms a valid solid, even with no issue', async () => {
    const r = await validate(golden('GT-03'), { mode: 'FAST_PREVIEW', targetState: 'VALID_SOLID' });
    expect(r.issues).toEqual([]);
    expect(r.isValidForTargetState).toBe(false);
  });

  it('checks only the affected elements and their neighbours', async () => {
    const far = await validate(lifted(), { mode: 'FAST_PREVIEW', targetState: 'VALID_SOLID', affectedEntityIds: ['f-ground'] });
    expect(far.issues).toEqual([]);
    const near = await validate(lifted(), { mode: 'FAST_PREVIEW', targetState: 'VALID_SOLID', affectedEntityIds: ['v-r1'] });
    expect(codes(near)).toEqual(['NON_PLANAR_FACE', 'NON_PLANAR_FACE']);
  });
});

describe('COMMIT_VALIDATION', () => {
  it('checks canonical invariants of the whole model whatever was affected', async () => {
    const r = await validate(lifted(), { mode: 'COMMIT_VALIDATION', targetState: 'VALID_SOLID', affectedEntityIds: ['f-ground'] });
    expect(codes(r)).toEqual(['NON_PLANAR_FACE', 'NON_PLANAR_FACE']);
    expect(r.isValidForTargetState).toBe(false);
  });

  it('self-intersection only in the affected volume, everywhere with fullSolid', async () => {
    const local = await validate(pierced(), { mode: 'COMMIT_VALIDATION', targetState: 'DRAFT_SOLID', affectedEntityIds: ['f-ground'] });
    expect(codes(local)).not.toContain('SELF_INTERSECTION');
    const near = await validate(pierced(), { mode: 'COMMIT_VALIDATION', targetState: 'DRAFT_SOLID', affectedEntityIds: ['f-roof-s'] });
    expect(codes(near)).toContain('SELF_INTERSECTION');
    const full = await validate(pierced(), { mode: 'COMMIT_VALIDATION', targetState: 'DRAFT_SOLID', affectedEntityIds: ['f-ground'], fullSolid: true });
    expect(codes(full)).toContain('SELF_INTERSECTION');
  });

  it('a draft with only warnings is valid for DRAFT_SOLID, not for VALID_SOLID', async () => {
    const d = await validate(lifted(), { mode: 'COMMIT_VALIDATION', targetState: 'DRAFT_SOLID' });
    expect(d.isValidForTargetState).toBe(true);
    const v = await validate(lifted(), { mode: 'COMMIT_VALIDATION', targetState: 'VALID_SOLID' });
    expect(v.isValidForTargetState).toBe(false);
  });
});

describe('every mode', () => {
  it('is deterministic and never writes its input', async () => {
    const m = deepFreeze(pierced());
    for (const mode of ['FAST_PREVIEW', 'COMMIT_VALIDATION']) {
      const a = await validate(m, { mode, targetState: 'VALID_SOLID', fullSolid: true });
      const b = await validate(m, { mode, targetState: 'VALID_SOLID', fullSolid: true });
      expect(JSON.stringify(a)).toBe(JSON.stringify(b));
    }
  });

  it('DRAFT_SURFACE reads the draft column, APPROVED the valid column (D-3D12-6)', async () => {
    const s = await validateModel(lifted(), { mode: 'COMMIT_VALIDATION', targetState: 'DRAFT_SURFACE', tolerances: TOLS, clock });
    expect(s.issues.map((/** @type {any} */ i) => i.severity)).toEqual(['WARNING', 'WARNING']);
    const a = await validateModel(lifted(), { mode: 'COMMIT_VALIDATION', targetState: 'APPROVED', tolerances: TOLS, clock });
    expect(a.issues.map((/** @type {any} */ i) => i.severity)).toEqual(['ERROR', 'ERROR']);
  });

  it('refuses bad options', async () => {
    const m = golden('GT-03');
    await expect(validateModel(m, /** @type {any} */ ({ mode: 'QA_APPROVAL', targetState: 'VALID_SOLID', tolerances: TOLS, clock }))).rejects.toThrow(RangeError);
    await expect(validateModel(m, /** @type {any} */ ({ mode: 'FAST_PREVIEW', targetState: 'VALID_SOLID', tolerances: TOLS }))).rejects.toThrow(/clock/);
    await expect(validateModel(m, /** @type {any} */ ({ mode: 'FAST_PREVIEW', targetState: 'VALID_SOLID', tolerances: { ...TOLS, planarTolM: undefined }, clock }))).rejects.toThrow(/planarTolM/);
    await expect(validateModel(m, /** @type {any} */ ({ mode: 'FAST_PREVIEW', targetState: 'NOPE', tolerances: TOLS, clock }))).rejects.toThrow(RangeError);
  });

  it('messages are localisation keys (D-91)', async () => {
    const r = await validate(lifted(), { mode: 'COMMIT_VALIDATION', targetState: 'VALID_SOLID' });
    expect(r.issues[0].message).toBe('model3d.validation.nonPlanarFace');
  });
});
