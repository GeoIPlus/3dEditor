// File-system append-only object store (3D-23; 3D-ADR-0003 O1, D-35): the interim `history` store for development,
// tests and the GV test host. A key is a path under `root`; create-if-absent is an exclusive create (`open` flag
// `wx`), so of concurrent creates of one key exactly one succeeds (3D-ADR-0003 "Context"). No method deletes,
// renames or overwrites (D-84, D-85; `check:arch` rule, 3D-23).
// The value is written after the exclusive create, so a reader can meet a file another writer is still filling: `get`
// re-reads an empty or truncated file for up to `settleMs` (default 2000 ms), then throws. [A] A process killed inside
// that one write leaves a truncated file for good: `get` throws (store damage), it never guesses. S3 puts are atomic
// (row 3D-23.3).
import { mkdir, open, readFile, readdir } from 'node:fs/promises';
import { setTimeout as sleep } from 'node:timers/promises';
import { join, resolve, sep } from 'node:path';

/**
 * @param {{ root: string, settleMs?: number }} options `root`: directory that holds the keys (created on the first
 *   write); `settleMs`: how long `get` waits for a file another writer is still filling
 * @returns {import('../ports/history.js').ObjectStore}
 */
export function createFileStore({ root, settleMs = 2000 }) {
  const base = resolve(root);
  /** @param {string} key */
  const pathOf = (key) => {
    const parts = key.split('/');
    if (parts.some((s) => s === '' || s === '.' || s === '..' || s.includes('\\') || s.includes('\0'))) throw new TypeError(`file-store: invalid key ${key}`);
    const p = join(base, ...parts);
    if (!p.startsWith(base + sep)) throw new TypeError(`file-store: key outside the root ${key}`);
    return p;
  };
  /** @param {unknown} e */
  const code = (e) => /** @type {NodeJS.ErrnoException} */ (e).code;

  return {
    async create(key, value) {
      const p = pathOf(key);
      const text = JSON.stringify(value);
      await mkdir(join(p, '..'), { recursive: true });
      let fh;
      try {
        fh = await open(p, 'wx');
      } catch (e) {
        if (code(e) === 'EEXIST') return false;
        throw e;
      }
      try {
        await fh.writeFile(text, 'utf8');
        await fh.sync();
      } finally {
        await fh.close();
      }
      return true;
    },
    async get(key) {
      const p = pathOf(key);
      for (let waited = 0; ; waited += 5) {
        let text;
        try {
          text = await readFile(p, 'utf8');
        } catch (e) {
          if (code(e) === 'ENOENT') return undefined;
          throw e;
        }
        try {
          return JSON.parse(text);
        } catch (e) {
          if (waited >= settleMs) throw new Error(`file-store: ${key} is not complete JSON after ${settleMs} ms`, { cause: e });
          await sleep(5);
        }
      }
    },
    async list(prefix) {
      try {
        return (await readdir(pathOf(prefix.replace(/\/+$/, '')))).sort();
      } catch (e) {
        if (code(e) === 'ENOENT' || code(e) === 'ENOTDIR') return [];
        throw e;
      }
    },
  };
}
