// server.js (3D-110; D-33; 3D-ADR-0002 A.4): the handler behind Node's HTTPS server, over a real TLS socket. The test
// certificate is made at test time with openssl in a temporary directory (no key material in the repository).
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { request as httpsRequest } from 'node:https';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createKernelServer } from '../src/server.js';
import { readFixture, command } from './commit-helpers.js';
import { handlerWith, headers } from './handler-helpers.js';

const ALIGN = { edgeId: 'he-f-roof-s-2', mode: 'KEEP_EAVES', targetLine: [[0, 4, 8.5], [10, 4, 8.5]] };
const m = readFixture('GT-13', 'input.model.json');
/** @type {string} */ let dir;
/** @type {{ key: Buffer, cert: Buffer }} */ let tls;
/** @type {import('node:https').Server} */ let server;
/** @type {number} */ let port;

beforeAll(async () => {
  dir = mkdtempSync(join(tmpdir(), 'kernel-tls-'));
  execFileSync('openssl', ['req', '-x509', '-newkey', 'rsa:2048', '-nodes', '-days', '1', '-subj', '/CN=localhost',
    '-keyout', join(dir, 'key.pem'), '-out', join(dir, 'cert.pem')], { stdio: 'ignore' });
  tls = { key: readFileSync(join(dir, 'key.pem')), cert: readFileSync(join(dir, 'cert.pem')) };
  const { handle } = await handlerWith(m);
  server = createKernelServer({ handler: handle, tls });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', () => resolve(undefined)));
  port = /** @type {import('node:net').AddressInfo} */ (server.address()).port;
});
afterAll(async () => {
  await new Promise((resolve) => server.close(() => resolve(undefined)));
  rmSync(dir, { recursive: true, force: true });
});

/** @param {string} method @param {string} path @param {Record<string, string>} h @param {string} [body] */
function call(method, path, h, body) {
  return new Promise((resolve, reject) => {
    const req = httpsRequest({ host: '127.0.0.1', port, method, path, headers: h, ca: tls.cert, servername: 'localhost' }, (res) => {
      let text = '';
      res.setEncoding('utf8');
      res.on('data', (c) => { text += c; });
      res.on('end', () => resolve({ status: res.statusCode, headers: res.headers, body: JSON.parse(text) }));
    });
    req.on('error', reject);
    req.end(body);
  });
}

describe('HTTPS + JSON wire binding', () => {
  it('COMMIT, then GET /api/projects/{p}/commands/{commandId} over TLS', async () => {
    const c = command(m, 'c-tls', 'ALIGN_RIDGE', ALIGN);
    const r = /** @type {any} */ (await call('POST', `/api/projects/${m.projectId}/commands`, headers('tok-op'), JSON.stringify(c)));
    expect(r.status).toBe(200);
    expect(r.headers['content-type']).toBe('application/json; charset=utf-8');
    expect(r.body).toMatchObject({ status: 'COMMITTED', commandId: 'c-tls' });
    const s = /** @type {any} */ (await call('GET', `/api/projects/${m.projectId}/commands/c-tls`, headers('tok-op')));
    expect(s.status).toBe(200);
    expect(s.body).toMatchObject({ commandId: 'c-tls', state: 'DONE', result: { status: 'COMMITTED' } });
  });

  it('401 before reading a large body; 413 for a body above 1 MiB', async () => {
    const big = JSON.stringify({ pad: 'x'.repeat(1024 * 1024) });
    const u = /** @type {any} */ (await call('POST', `/api/projects/${m.projectId}/commands`, { 'content-type': 'application/json' }, big));
    expect(u.status).toBe(401);
    const t = /** @type {any} */ (await call('POST', `/api/projects/${m.projectId}/commands`, headers('tok-op'), big));
    expect(t.status).toBe(413);
    expect(t.body.code).toBe('PAYLOAD_TOO_LARGE');
  });

  it('refuses to start without TLS material', () => {
    expect(() => createKernelServer({ handler: async () => ({ status: 200, headers: {}, body: '' }), tls: /** @type {any} */ ({}) })).toThrow(/tls/);
  });
});
