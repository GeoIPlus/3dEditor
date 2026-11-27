// File-system append-only byte store (3D-128; 3D-ADR-0003 O1, §4; D-35): the interim store under the `datasets` port
// (`createByteDatasets`, ../datasets.js) for development, tests and the GV test host. A key is a path under `root`;
// create-if-absent is an exclusive create (`open` flag `wx`), so of concurrent creates of one key exactly one succeeds.
// No method deletes, renames or overwrites (D-84, D-85; `check:arch` append-only rule, 3D-23).
// Framing: a file holds the bytes followed by their 32-byte SHA-256. The bytes are written after the exclusive create,
// so a reader can meet a file another writer is still filling; `get` re-reads until the trailer matches, for up to
// `settleMs` (default 2000 ms), then throws (store damage, never a guess) - the same rule as adapters/file-store.js.
import { createHash } from 'node:crypto';
import { mkdir, open, readFile } from 'node:fs/promises';
import { setTimeout as sleep } from 'node:timers/promises';
import { join, resolve, sep } from 'node:path';

const TRAILER = 32;

/** @param {Uint8Array} bytes */
const digestOf = (bytes) => createHash('sha256').update(bytes).digest();

/**
 * @param {{ root: string, settleMs?: number }} options `root`: directory that holds the keys (created on the first
 *   write); `settleMs`: how long `get` waits for a file another writer is still filling
 * @returns {import('../ports/datasets.js').ByteStore}
 */
export function createFileByteStore({ root, settleMs = 2000 }) {
  const base = resolve(root);
  /** @param {string} key */
  const pathOf = (key) => {
    const parts = key.split('/');
    if (parts.some((s) => s === '' || s === '.' || s === '..' || s.includes('\\') || s.includes('\0'))) throw new TypeError(`file-datasets-store: invalid key ${key}`);
    const p = join(base, ...parts);
    if (!p.startsWith(base + sep)) throw new TypeError(`file-datasets-store: key outside the root ${key}`);
    return p;
  };
  /** @param {unknown} e */
  const code = (e) => /** @type {NodeJS.ErrnoException} */ (e).code;

  return {
    async create(key, bytes) {
      const p = pathOf(key);
      const body = Buffer.concat([Buffer.from(bytes), digestOf(bytes)]);
      await mkdir(join(p, '..'), { recursive: true });
      let fh;
      try {
        fh = await open(p, 'wx');
      } catch (e) {
        if (code(e) === 'EEXIST') return false;
        throw e;
      }
      try {
        await fh.writeFile(body);
        await fh.sync();
      } finally {
        await fh.close();
      }
      return true;
    },
    async get(key) {
      const p = pathOf(key);
      for (let waited = 0; ; waited += 5) {
        let body;
        try {
          body = await readFile(p);
        } catch (e) {
          if (code(e) === 'ENOENT') return undefined;
          throw e;
        }
        if (body.length >= TRAILER) {
          const bytes = body.subarray(0, body.length - TRAILER);
          if (digestOf(bytes).equals(body.subarray(body.length - TRAILER))) return new Uint8Array(bytes);
        }
        if (waited >= settleMs) throw new Error(`file-datasets-store: ${key} is not complete after ${settleMs} ms`);
        await sleep(5);
      }
    },
  };
}
