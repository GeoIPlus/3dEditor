// QC rules of the kernel service (3D-24; spec §11 r2, r8; D-3D24-1, -2, -5, -7): FINAL_VALIDATION request stored per
// version; approval by a non-author reviewer holding the lease, on a VALID_SOLID head with a passed FINAL_VALIDATION.
import { describe, expect, it } from 'vitest';
import { readFixture } from './commit-helpers.js';
import { get, headers, json, post } from './handler-helpers.js';
import { approve, bUrl, finalValidation, lease, qcHandler } from './qc-helpers.js';

const valid = readFixture('GT-22', 'input.model.json');
const draft = readFixture('GT-24', 'input.model.bld-gt-24-b.json');
const p = valid.projectId;
const stateOf = async (/** @type {any} */ handle, /** @type {any} */ m) => json(await handle(get(bUrl(p, m.buildingId, 'model'), headers('tok-qa', null)))).body.state;

describe('FINAL_VALIDATION request (D-3D24-2)', () => {
  it('runs on the head for VALID_SOLID, is stored, and a repeat returns the stored report', async () => {
    const { handle, history, validator } = await qcHandler([valid]);
    const first = await finalValidation(handle, valid, 'tok-op'); // operator may run it: it changes no model
    expect(first.status).toBe(200);
    expect(first.body).toMatchObject({ modelVersion: 1, targetState: 'VALID_SOLID', isValidForTargetState: true, validatorVersion: 'geo-model3d-validate/2+stub-1' });
    expect(await history.readFinalValidation(p, valid.buildingId, 1)).toEqual(first.body);
    expect(await finalValidation(handle, valid, 'tok-qa')).toEqual(first);
    expect(validator.calls.n).toBe(1);
  });

  it('a DRAFT_SOLID head does not pass; unknown building -> 404', async () => {
    const { handle } = await qcHandler([draft]);
    expect((await finalValidation(handle, draft, 'tok-qa')).body.isValidForTargetState).toBe(false);
    expect((await finalValidation(handle, { ...draft, buildingId: 'nope' }, 'tok-qa')).status).toBe(404);
  });

  it('a validator failure stores nothing; no validator configured -> 503', async () => {
    const failing = { validate: async () => { throw Object.assign(new Error('down'), { code: 'ECONNREFUSED', errno: -111, syscall: 'connect' }); } };
    const { handle, history } = await qcHandler([valid], { over: { externalValidator: failing } });
    expect((await finalValidation(handle, valid, 'tok-qa')).status).toBe(503);
    expect(await history.readFinalValidation(p, valid.buildingId, 1)).toBeUndefined();
    const none = await qcHandler([valid], { over: { externalValidator: undefined } });
    expect((await finalValidation(none.handle, valid, 'tok-qa')).body.code).toBe('UNAVAILABLE');
  });
});

describe('approval (spec §11 r8; D-3D24-1, D-3D24-5, D-3D24-7)', () => {
  it('needs the reviewer role before the body is read, a valid body, and the current lease', async () => {
    const { handle, leases } = await qcHandler([valid]);
    await finalValidation(handle, valid, 'tok-qa');
    const opRefused = await handle({ method: 'POST', url: bUrl(p, valid.buildingId, 'approval'), headers: headers('tok-op', null), body: 'not json' });
    expect(json(opRefused)).toMatchObject({ status: 403, body: { code: 'FORBIDDEN' } });
    expect((await approve(handle, valid, 'tok-qa', 1, null)).body.code).toBe('FORBIDDEN'); // no lease header
    lease(leases, valid, 'usr-operator', 1);
    expect((await approve(handle, valid, 'tok-qa', 1, 'lease-usr-operator;1')).status).toBe(403); // another holder
    const h = lease(leases, valid, 'usr-reviewer', 2);
    expect((await approve(handle, valid, 'tok-qa', 1, 'lease-usr-reviewer;1')).status).toBe(403); // stale epoch
    const bad = json(await handle(post(bUrl(p, valid.buildingId, 'approval'), { expectedVersion: 1, status: 'APPROVED' }, headers('tok-qa', h))));
    expect(bad.body.code).toBe('INVALID_PAYLOAD');
    expect(await stateOf(handle, valid)).toBe('VALID_SOLID');
  });

  it('409 on another head; 404 for an unknown building', async () => {
    const { handle, leases } = await qcHandler([valid]);
    const h = lease(leases, valid, 'usr-reviewer', 1);
    expect((await approve(handle, valid, 'tok-qa', 0, h)).body.code).toBe('VERSION_CONFLICT');
    const other = { ...valid, buildingId: 'nope' };
    expect((await approve(handle, other, 'tok-qa', 1, lease(leases, other, 'usr-reviewer', 1))).status).toBe(404);
  });

  it('422 NOT_APPROVABLE: not VALID_SOLID, or no passed FINAL_VALIDATION of the head', async () => {
    const { handle, leases } = await qcHandler([valid, draft]);
    const d = await approve(handle, draft, 'tok-qa', draft.version, lease(leases, draft, 'usr-reviewer', 1));
    expect(d).toMatchObject({ status: 422, body: { code: 'NOT_APPROVABLE', details: { approvalReason: 'NOT_VALID_SOLID' } } });
    const v = await approve(handle, valid, 'tok-qa', 1, lease(leases, valid, 'usr-reviewer', 1));
    expect(v).toMatchObject({ status: 422, body: { code: 'NOT_APPROVABLE', details: { approvalReason: 'NO_FINAL_VALIDATION' } } });
  });

  it('a reviewer who authored a version after the baseline -> 403; another reviewer approves', async () => {
    const { handle, leases, history } = await qcHandler([valid]);
    const steps = readFixture('GT-22', 'steps.json');
    const hb = lease(leases, valid, 'usr-both', 1);
    const c = json(await handle(post(`/api/projects/${p}/commands`, steps[0].command, headers('tok-both', hb))));
    expect(c.body.status).toBe('COMMITTED');
    await finalValidation(handle, valid, 'tok-qa');
    const own = await approve(handle, valid, 'tok-both', 2, hb);
    expect(own).toMatchObject({ status: 403, body: { code: 'FORBIDDEN' } });
    const ok = await approve(handle, valid, 'tok-qa', 2, lease(leases, valid, 'usr-reviewer', 2));
    expect(ok.status).toBe(200);
    // a second approval of the same version returns the first mark (written once)
    const again = await approve(handle, valid, 'tok-qa2', 2, lease(leases, valid, 'usr-reviewer-2', 3));
    expect(again).toEqual(ok);
    expect(await history.readJournal(p, valid.buildingId)).toHaveLength(1);
    expect(await stateOf(handle, valid)).toBe('APPROVED');
  });
});
