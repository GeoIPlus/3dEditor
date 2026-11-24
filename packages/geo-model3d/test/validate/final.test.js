// 3D-12 Accept 3 (spec §8): FINAL_VALIDATION with a stub validator port reports `externalValidatorCode` and
// `validatorVersion`. The real val3dity binding is the row after 3D-23 (D-148, D-149).
import { describe, it, expect } from 'vitest';
import { validate, golden, deepFreeze, NOW } from './helpers.js';
import { VAL3DITY_CODES } from '../../src/validate/index.js';

/** @param {any[]} findings @param {string} [version] */
const stub = (findings, version = 'val3dity 2.7.0 (stub)') => {
  /** @type {any[]} */
  const calls = [];
  return { calls, port: { validate: async (/** @type {any} */ input) => { calls.push(input); return { validatorVersion: version, findings }; } } };
};

describe('FINAL_VALIDATION with a stub port', () => {
  it('reports the external code and both validator versions', async () => {
    const model = deepFreeze(golden('GT-03'));
    const s = stub([{ externalValidatorCode: '203', entityIds: ['f-roof-s'] }, { externalValidatorCode: '999' }]);
    const r = await validate(model, { mode: 'FINAL_VALIDATION', targetState: 'VALID_SOLID', externalValidator: s.port });
    expect(s.calls).toHaveLength(1);
    expect(s.calls[0].model).toBe(model);
    expect(r.validatorVersion).toBe('geo-model3d-validate/1+val3dity 2.7.0 (stub)');
    expect(r.createdAt).toBe(NOW);
    expect(r.issues.map((/** @type {any} */ i) => [i.code, i.externalValidatorCode, i.severity])).toEqual([
      ['NON_PLANAR_FACE', '203', 'ERROR'],
      ['EXPORT_SCHEMA_ERROR', '999', 'ERROR'],
    ]);
    expect(r.isValidForTargetState).toBe(false);
  });

  it('a clean model and a clean external run confirm the target state', async () => {
    const r = await validate(golden('GT-03'), { mode: 'FINAL_VALIDATION', targetState: 'VALID_SOLID', externalValidator: stub([]).port });
    expect(r).toEqual({ modelVersion: 1, targetState: 'VALID_SOLID', isValidForTargetState: true, issues: [], validatorVersion: 'geo-model3d-validate/1+val3dity 2.7.0 (stub)', createdAt: NOW });
  });

  it('every mapped val3dity code yields a contract-valid issue in both states', async () => {
    const findings = Object.keys(VAL3DITY_CODES).map((c) => ({ externalValidatorCode: c, entityIds: ['sh-1'] }));
    for (const targetState of ['DRAFT_SOLID', 'VALID_SOLID']) {
      const r = await validate(golden('GT-03'), { mode: 'FINAL_VALIDATION', targetState, externalValidator: stub(findings).port });
      expect(r.issues).toHaveLength(findings.length);
    }
  });

  it('refuses without a port, without a version, or with a finding without a code', async () => {
    const m = golden('GT-03');
    await expect(validate(m, { mode: 'FINAL_VALIDATION', targetState: 'VALID_SOLID' })).rejects.toThrow(/port/);
    await expect(validate(m, { mode: 'FINAL_VALIDATION', targetState: 'VALID_SOLID', externalValidator: stub([], '').port })).rejects.toThrow(/version/);
    await expect(validate(m, { mode: 'FINAL_VALIDATION', targetState: 'VALID_SOLID', externalValidator: stub([{}]).port })).rejects.toThrow(/externalValidatorCode/);
  });

  it('a port failure propagates (the service answers UNAVAILABLE; model unchanged)', async () => {
    const port = { validate: async () => { throw new Error('validator down'); } };
    await expect(validate(golden('GT-03'), { mode: 'FINAL_VALIDATION', targetState: 'VALID_SOLID', externalValidator: port })).rejects.toThrow('validator down');
  });
});
