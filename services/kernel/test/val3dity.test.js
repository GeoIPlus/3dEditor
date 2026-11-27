// val3dity adapter (3D-74; 3D-ADR-0008, D-446..D-448) against a local stand-in of the image that replays the image's
// recorded replies (test/data/val3dity-*.response.json): request shape and parameters, findings mapped by `validate`,
// validatorVersion, and every image failure -> PortUnavailableError -> 503 UNAVAILABLE with the model unchanged.
import { createServer } from 'node:http';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { validateModel } from '@geoiplus/geo-model3d';
import { createVal3dityValidator, parametersOf, VAL3DITY_PIN } from '../src/adapters/val3dity.js';
import { PortUnavailableError, failureReply } from '../src/errors.js';
import { PROFILE, golden, recorded } from './val3dity-helpers.js';

/** @type {{ status: number, body: any }} */
let next = { status: 200, body: {} };
/** @type {any[]} */
const seen = [];
const server = createServer((req, res) => {
  let data = '';
  req.on('data', (c) => { data += c; });
  req.on('end', () => {
    seen.push({ method: req.method, url: req.url, body: data ? JSON.parse(data) : undefined });
    res.writeHead(next.status, { 'content-type': 'application/json' });
    res.end(typeof next.body === 'string' ? next.body : JSON.stringify(next.body));
  });
});
let url = '';
beforeAll(async () => {
  await new Promise((ok) => server.listen(0, '127.0.0.1', () => ok(undefined)));
  url = `http://127.0.0.1:${/** @type {any} */ (server.address()).port}`;
});
afterAll(() => new Promise((ok) => server.close(() => ok(undefined))));

const i2 = golden('GT-I2');
const i4 = golden('GT-I4');
/** @param {{ cityjson: any }} g @param {Partial<import('../src/adapters/val3dity.js').Val3dityOptions>} [o] */
const adapter = (g, o = {}) => createVal3dityValidator({ url, documentOf: () => g.cityjson, ...o });
/** @param {any} model @param {any} port */
const finalValidation = (model, port) => validateModel(model, {
  mode: 'FINAL_VALIDATION', targetState: 'VALID_SOLID', tolerances: PROFILE, clock: () => '2026-11-26T00:00:00Z', externalValidator: port,
});

describe('val3dity adapter (3D-74)', () => {
  it('sends the export of the model with the profile parameters (D-447) to POST /validate', async () => {
    next = { status: 200, body: recorded('gt-i4') };
    seen.length = 0;
    await adapter(i4).validate({ model: i4.model, tolerances: PROFILE });
    expect(seen).toHaveLength(1);
    expect(seen[0].method).toBe('POST');
    expect(seen[0].url).toBe('/validate');
    expect(seen[0].body.parameters).toEqual({ snapTolM: 0.01, planarityD2pTolM: 0.02, planarityNormalsTolDeg: 20 });
    expect(parametersOf(PROFILE)).toEqual(seen[0].body.parameters);
    expect(seen[0].body.document.type).toBe('CityJSON');
    expect(Object.keys(seen[0].body.document.CityObjects)).toEqual(Object.keys(i4.cityjson.CityObjects));
  });

  it('GT-I4 export: no findings; validatorVersion carries the pin', async () => {
    next = { status: 200, body: recorded('gt-i4') };
    const ext = await adapter(i4).validate({ model: i4.model, tolerances: PROFILE });
    expect(ext).toEqual({ validatorVersion: `val3dity ${VAL3DITY_PIN.version}`, findings: [] });
    const r = await finalValidation(i4.model, adapter(i4));
    expect(r.validatorVersion.endsWith('+val3dity 2.7.0')).toBe(true);
    expect(r.issues.filter((i) => i.externalValidatorCode)).toEqual([]);
  });

  it('GT-I2 export: val3dity 302 on shell 0 -> finding on that shell, mapped by validate to SHELL_NOT_CLOSED', async () => {
    next = { status: 200, body: recorded('gt-i2') };
    const ext = await adapter(i2).validate({ model: i2.model, tolerances: PROFILE });
    const sem = Object.values(i2.model.semantics).find((/** @type {any} */ s) => s.kind === 'Building');
    const shellId = i2.model.solids[/** @type {any} */ (sem).solidIds[0]].outerShellId;
    expect(ext.findings).toEqual([{ externalValidatorCode: '302', entityIds: [shellId] }]);
    const r = await finalValidation(i2.model, adapter(i2));
    const issue = r.issues.find((i) => i.externalValidatorCode === '302');
    expect(issue).toMatchObject({ code: 'SHELL_NOT_CLOSED', severity: 'ERROR', entityIds: [shellId] });
    expect(r.isValidForTargetState).toBe(false);
  });

  it('dataset errors (9xx) become findings without entity ids', async () => {
    const body = recorded('gt-i4');
    next = { status: 200, body: { ...body, report: { ...body.report, validity: false, dataset_errors: [{ code: 904, description: 'FORMAT_NOT_SUPPORTED', info: 'x' }] } } };
    const ext = await adapter(i4).validate({ model: i4.model, tolerances: PROFILE });
    expect(ext.findings).toEqual([{ externalValidatorCode: '904', entityIds: [] }]);
  });

  it('GET /version: the validator identity, checked against the pin', async () => {
    next = { status: 200, body: recorded('gt-i4').validator };
    expect(await adapter(i4).version()).toMatchObject({ name: 'val3dity', ...VAL3DITY_PIN });
  });
});

describe('image unavailable -> UNAVAILABLE, model unchanged (3D-74, D-448)', () => {
  const body = recorded('gt-i4');
  const failures = {
    'error reply 500': { status: 500, body: { code: 'VALIDATOR_FAILED', httpStatus: 500, message: 'val3dity exited 1' } },
    'timeout reply 504': { status: 504, body: { code: 'VALIDATOR_TIMEOUT', httpStatus: 504, message: 'slow' } },
    'non-JSON body': { status: 200, body: 'not json' },
    'reply outside the contract': { status: 200, body: { validator: body.validator } },
    'another val3dity version': { status: 200, body: { ...body, validator: { ...body.validator, version: '2.6.0' } } },
    'another commit': { status: 200, body: { ...body, validator: { ...body.validator, commit: 'a'.repeat(40) } } },
  };
  for (const [name, reply] of Object.entries(failures)) {
    it(name, async () => {
      next = reply;
      const before = structuredClone(i4.model);
      const err = await finalValidation(i4.model, adapter(i4)).catch((e) => e);
      expect(err).toBeInstanceOf(PortUnavailableError);
      expect(failureReply(err)).toMatchObject({ httpStatus: 503, body: { code: 'UNAVAILABLE' } });
      expect(i4.model).toEqual(before);
    });
  }

  it('refused connection (no image listening)', async () => {
    const closed = createServer();
    await new Promise((ok) => closed.listen(0, '127.0.0.1', () => ok(undefined)));
    const port = /** @type {any} */ (closed.address()).port;
    await new Promise((ok) => closed.close(() => ok(undefined)));
    const before = structuredClone(i4.model);
    const err = await finalValidation(i4.model, adapter(i4, { url: `http://127.0.0.1:${port}` })).catch((e) => e);
    expect(err).toBeInstanceOf(PortUnavailableError);
    expect(err.message).toMatch(/unreachable: ECONNREFUSED/);
    expect(failureReply(err)).toMatchObject({ httpStatus: 503, body: { code: 'UNAVAILABLE' } });
    expect(i4.model).toEqual(before);
  });

  it('request timeout', async () => {
    const slow = createServer(() => { /* never answers */ });
    await new Promise((ok) => slow.listen(0, '127.0.0.1', () => ok(undefined)));
    const port = /** @type {any} */ (slow.address()).port;
    const err = await adapter(i4, { url: `http://127.0.0.1:${port}`, timeoutMs: 50 }).validate({ model: i4.model, tolerances: PROFILE }).catch((e) => e);
    slow.closeAllConnections();
    await new Promise((ok) => slow.close(() => ok(undefined)));
    expect(err).toBeInstanceOf(PortUnavailableError);
    expect(failureReply(err).httpStatus).toBe(503);
  });
});
