// Command API limits and refusals (3D-109): one invalid message per contract schema -> 400 (spec §11 Accept, r12),
// PREVIEW rate 20/s -> 429 (D-316), body above 1 MiB -> 413 before parsing (D-317), invalid replies -> 500 and the
// registry mapping of thrown failures (D-353); clock-dependent cases on an injected clock.
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { Readable } from 'node:stream';
import { describe, expect, it, vi } from 'vitest';
import { readFixture, apiWith, command, validReply } from './commit-helpers.js';
import { CONTRACTS_DIR, createContractValidator } from '../src/contracts.js';
import { readJsonBody, BODY_LIMIT_BYTES } from '../src/body.js';
import { failureReply } from '../src/errors.js';
import { LasFormatError } from '../src/adapters/las-format.js';

const OP = { actorId: 'usr-operator' };
const ALIGN = { edgeId: 'he-f-roof-s-2', mode: 'KEEP_EAVES', targetLine: [[0, 4, 8.5], [10, 4, 8.5]] };
const base = () => readFixture('GT-13', 'input.model.json');
const examples = (/** @type {string} */ name) => JSON.parse(readFileSync(join(CONTRACTS_DIR, 'examples', `${name}.json`), 'utf8'));
const kindOf = (/** @type {string} */ name) => name.replace('command-payload-', '').toUpperCase().replace(/-/g, '_');

describe('contract validation (spec §11 r12)', () => {
  const validator = createContractValidator();

  it('one invalid message per schema -> 400 INVALID_PAYLOAD', async () => {
    const m = base();
    const { api } = await apiWith(m, { contracts: validator });
    expect(validator.names.length).toBeGreaterThanOrEqual(50);
    for (const name of validator.names) {
      let r;
      if (name === 'common') {
        // definitions only, no message of its own: an invalid EntityId inside a command
        r = await api.command(command(m, examples('common').defs.EntityId.invalid[0].instance, 'ALIGN_RIDGE', ALIGN), OP);
      } else if (name.startsWith('command-payload-')) {
        const { valid: [good], invalid: [bad] } = examples(name);
        const over = kindOf(name) === 'REMOVE_FACE' ? { targetState: 'DRAFT_SOLID' } : {};
        expect(validator.command(command(m, 'c-ok', kindOf(name), good, over)), name).toBeNull();  // only the payload is bad
        r = await api.command(command(m, 'c-bad', kindOf(name), bad.instance, over), OP);
      } else if (name === 'command') {
        r = await api.command(examples(name).invalid[0].instance, OP);
      } else {
        r = api.request(name, examples(name).invalid[0].instance);
      }
      expect(r?.httpStatus, name).toBe(400);
      expect(validReply(/** @type {any} */ (r)).body.code, name).toBe('INVALID_PAYLOAD');
    }
  });

  it('the valid examples pass the service validator', () => {
    for (const name of validator.names.filter((n) => n !== 'common')) {
      for (const v of examples(name).valid) expect(validator.check(name, v), name).toBeNull();
    }
  });

  it('an invalid reply is never sent: 500 INTERNAL', () => {
    const r = validator.reply({ httpStatus: 200, body: { commandId: 'c1', status: 'COMMITTED' } });
    expect(r.httpStatus).toBe(500);
    expect(validReply(r).body.code).toBe('INTERNAL');
  });
});

describe('PREVIEW rate limit (D-316)', () => {
  it('20 per sliding second per (user, building); the 21st -> 429; other users are not affected', async () => {
    const m = base();
    const { api, clock } = await apiWith(m);
    const pv = (/** @type {number} */ i, actor = OP) => api.command(command(m, `c${i}`, 'ALIGN_RIDGE', ALIGN, { phase: 'PREVIEW' }), actor);
    clock.t = 10_000;
    for (let i = 0; i < 20; i++) {
      clock.t += 10;  // 20 requests in 200 ms
      expect((await pv(i)).httpStatus).toBe(200);
    }
    const r = validReply(await pv(20));
    expect(r.body).toMatchObject({ code: 'RATE_LIMITED', httpStatus: 429 });
    expect((await pv(21, { actorId: 'usr-2' })).httpStatus).toBe(200);
    clock.t = 10_010 + 999;  // the first request (t = 10 010) still in the window
    expect((await pv(22)).httpStatus).toBe(429);
    clock.t = 10_010 + 1000;  // it left the window: one slot free
    expect((await pv(23)).httpStatus).toBe(200);
    expect((await pv(24)).httpStatus).toBe(429);
    // COMMIT is not rate-limited
    expect((await api.command(command(m, 'c-commit', 'ALIGN_RIDGE', ALIGN), OP)).httpStatus).toBe(200);
  });
});

describe('request body limit (D-317)', () => {
  it('above 1 MiB -> 413 before JSON parsing; at the limit it is parsed', async () => {
    const parse = vi.fn(JSON.parse);
    const big = `"${'x'.repeat(BODY_LIMIT_BYTES - 1)}"`;  // 1 MiB + 1 byte
    const chunks = Readable.from([big.slice(0, 1000), big.slice(1000)]);
    const r = await readJsonBody(chunks, { parse });
    expect(r.ok).toBe(false);
    expect(/** @type {any} */ (r).reply).toMatchObject({ httpStatus: 413, body: { code: 'PAYLOAD_TOO_LARGE' } });
    expect(parse).not.toHaveBeenCalled();
    const declared = await readJsonBody('{}', { parse, declaredLength: BODY_LIMIT_BYTES + 1 });
    expect(declared.ok).toBe(false);
    expect(parse).not.toHaveBeenCalled();
    const exact = await readJsonBody(`"${'x'.repeat(BODY_LIMIT_BYTES - 2)}"`, { parse });
    expect(exact.ok).toBe(true);
    expect(parse).toHaveBeenCalledTimes(1);
    expect((await readJsonBody('{not json')).ok).toBe(false);
  });

  it('the API answers a large body with 413 and a non-JSON body with 400', async () => {
    const m = base();
    const { api } = await apiWith(m);
    const body = JSON.stringify(command(m, 'c1', 'ALIGN_RIDGE', { ...ALIGN, pad: 'x'.repeat(BODY_LIMIT_BYTES) }));
    expect(validReply(await api.commandBody(Buffer.from(body), OP)).httpStatus).toBe(413);
    expect(validReply(await api.commandBody('{', OP)).httpStatus).toBe(400);
    const ok = await api.commandBody(JSON.stringify(command(m, 'c2', 'ALIGN_RIDGE', ALIGN)), OP);
    expect(ok.body.status).toBe('COMMITTED');
  });
});

describe('failure mapping (D-353)', () => {
  it('LasFormatError -> 500, read failures -> 503, anything else -> 500; replies are contract errors', () => {
    const io = Object.assign(new Error('gone'), { code: 'ENOENT', syscall: 'open', errno: -2 });
    expect(validReply(failureReply(new LasFormatError('no LASF signature'))).body.code).toBe('INTERNAL');
    expect(validReply(failureReply(io)).body).toMatchObject({ code: 'UNAVAILABLE', httpStatus: 503 });
    expect(failureReply(Object.assign(new Error('t'), { name: 'TimeoutError' })).httpStatus).toBe(503);
    expect(failureReply(new TypeError('bug')).httpStatus).toBe(500);
    expect(failureReply('x').httpStatus).toBe(500);
  });

  it('a throwing adapter during a command leaves the model unchanged', async () => {
    const m = base();
    const { api, history } = await apiWith(m);
    const read = history.readVersion;
    history.readVersion = async () => { throw Object.assign(new Error('EIO'), { code: 'EIO', syscall: 'read' }); };
    const r = validReply(await api.command(command(m, 'c1', 'ALIGN_RIDGE', ALIGN), OP));
    expect(r.httpStatus).toBe(503);
    history.readVersion = read;
    expect(await history.head(m.projectId, m.buildingId)).toBe(1);
    expect((await api.command(command(m, 'c1', 'ALIGN_RIDGE', ALIGN), OP)).httpStatus).toBe(200);  // not stored
  });
});
