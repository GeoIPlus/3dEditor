// Runs the `history` port contract suite on every adapter of 3D-23 (memory, file); adds file-store specifics.
import { mkdtemp, open, readdir } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { historyContract } from './history-contract.js';
import { createMemoryStore } from '../src/adapters/memory-store.js';
import { createFileStore } from '../src/adapters/file-store.js';
import { segment } from '../src/ports/history.js';

const tmp = () => mkdtemp(join(tmpdir(), 'history-'));

historyContract('memory store', () => createMemoryStore());
historyContract('file store', async () => createFileStore({ root: await tmp() }));

describe('file store', () => {
  it('keys stay under the root; ids become one encoded segment', async () => {
    const root = await tmp();
    const s = createFileStore({ root });
    await expect(s.create('a/../../x.json', 1)).rejects.toThrow(/invalid key/);
    await expect(s.get('/abs')).rejects.toThrow(/invalid key/);
    expect(segment('a/b')).toBe('a%2Fb');
    expect(segment('..')).toBe('%2E%2E');
    expect(() => segment('')).toThrow();
    await s.create(`p/${segment('x/y')}/v.json`, 1);
    expect(await readdir(join(root, 'p'))).toEqual(['x%2Fy']);
  });

  it('a file another writer is still filling is re-read; a truncated one throws after settleMs', async () => {
    const root = await tmp();
    const s = createFileStore({ root, settleMs: 50 });
    const fh = await open(join(root, 'late.json'), 'wx');
    const reading = s.get('late.json');
    await fh.writeFile('{"ok":true}');
    await fh.close();
    expect(await reading).toEqual({ ok: true });
    const t = await open(join(root, 'cut.json'), 'wx');
    await t.writeFile('{"cut":');
    await t.close();
    await expect(s.get('cut.json')).rejects.toThrow(/not complete JSON/);
  });
});
