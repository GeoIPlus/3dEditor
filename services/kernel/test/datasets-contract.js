// Port contract suite of `datasets` (3D-128; 3D-ADR-0003 "Checks"): one suite, run against every adapter - memory and
// file here, the crowdsource adapter in 3D-63. `make()` returns a fresh port and `seed(ref, bytes)`, which stands a
// dataset up the way the DP would (for crowdsource: a test double or a test project).
// Operaflow rules covered: whole-body `PUT` + `If-Match` (OF `progress.md:26`), a `412` writes nothing (`:42`),
// delivered bytes never change (`acceptance.md:20`). [A] The Operaflow suite `progress/` cases were not read in 3D-128
// (repository not reachable from that session); the cases below restate the cited rules.
import { describe, expect, it } from 'vitest';
import { isDatasetsPort, sha256 } from '../src/ports/datasets.js';

const P = 'prj-d', REF = 'save/bld 1 é';  // a ref with `/`, a space and a non-ASCII letter: one key segment
const enc = (/** @type {string} */ s) => new TextEncoder().encode(s);
const dec = (/** @type {Uint8Array | undefined} */ b) => (b ? new TextDecoder().decode(b) : undefined);
const city = (/** @type {string} */ tag) => JSON.stringify({ type: 'CityJSON', version: '2.0', tag, CityObjects: {}, vertices: [] });

/**
 * @typedef {{ port: import('../src/ports/datasets.js').DatasetsPort, seed: (ref: string, bytes: Uint8Array) => Promise<unknown> }} Made
 * @param {string} name
 * @param {() => Promise<Made> | Made} make
 */
export function datasetsContract(name, make) {
  describe(`datasets port contract: ${name}`, () => {
    const fresh = async () => {
      const m = await make();
      await m.seed(REF, enc(city('input')));
      return m;
    };

    it('implements the port; an unknown dataset or digest reads as undefined', async () => {
      const { port } = await make();
      expect(isDatasetsPort(port)).toBe(true);
      expect(await port.read('nope')).toBeUndefined();
      expect(await port.readDelivered(P, sha256(enc('x')))).toBeUndefined();
      expect(await port.readDelivered(P, 'not-a-digest')).toBeUndefined();
    });

    it('read gives the bytes and a strong, quoted entity tag', async () => {
      const { port } = await fresh();
      const r = await port.read(REF);
      expect(dec(r?.bytes)).toBe(city('input'));
      expect(r?.entityTag).toMatch(/^"[^"]+"$/);
      expect((await port.read(REF))?.entityTag).toBe(r?.entityTag);
    });

    it('save with the current tag replaces the whole body and gives a new tag', async () => {
      const { port } = await fresh();
      const t0 = /** @type {string} */ ((await port.read(REF))?.entityTag);
      const out = await port.save(REF, enc(city('v1')), t0);
      expect(out.status).toBe('saved');
      const r = await port.read(REF);
      expect(dec(r?.bytes)).toBe(city('v1'));
      expect(r?.entityTag).toBe(out.status === 'saved' ? out.entityTag : '');
      expect(r?.entityTag).not.toBe(t0);
    });

    it('a stale, unknown or missing-dataset tag -> precondition-failed (412), nothing written', async () => {
      const { port } = await fresh();
      const t0 = /** @type {string} */ ((await port.read(REF))?.entityTag);
      await port.save(REF, enc(city('v1')), t0);
      const before = await port.read(REF);
      expect(await port.save(REF, enc(city('late')), t0)).toEqual({ status: 'precondition-failed' });
      expect(await port.save(REF, enc(city('bogus')), '"bogus"')).toEqual({ status: 'precondition-failed' });
      expect(await port.save(REF, enc(city('weak')), `W/${before?.entityTag}`)).toEqual({ status: 'precondition-failed' });
      expect(await port.save('absent', enc(city('x')), t0)).toEqual({ status: 'precondition-failed' });
      expect(await port.read(REF)).toEqual(before);
      expect(await port.read('absent')).toBeUndefined();
    });

    it('two concurrent saves on one tag: exactly one is saved', async () => {
      const { port } = await fresh();
      const t0 = /** @type {string} */ ((await port.read(REF))?.entityTag);
      const outs = await Promise.all([port.save(REF, enc(city('a')), t0), port.save(REF, enc(city('b')), t0)]);
      expect(outs.map((o) => o.status).sort()).toEqual(['precondition-failed', 'saved']);
      const won = outs.findIndex((o) => o.status === 'saved');
      expect(dec((await port.read(REF))?.bytes)).toBe(city(won === 0 ? 'a' : 'b'));
    });

    it('saving earlier bytes again gives a new tag; the old tag stays stale', async () => {
      const { port } = await fresh();
      const t0 = /** @type {string} */ ((await port.read(REF))?.entityTag);
      const s1 = await port.save(REF, enc(city('v1')), t0);
      const t1 = s1.status === 'saved' ? s1.entityTag : '';
      const s2 = await port.save(REF, enc(city('input')), t1);
      expect(s2.status).toBe('saved');
      const t2 = s2.status === 'saved' ? s2.entityTag : '';
      expect(t2).not.toBe(t0);
      expect((await port.save(REF, enc(city('again')), t0)).status).toBe('precondition-failed');
    });

    it('delivered bytes: digest key, write-once; a second write of the same digest is a no-op', async () => {
      const { port } = await make();
      const bytes = enc(city('export'));
      const first = await port.putDelivered(P, bytes);
      expect(first).toEqual({ digest: sha256(bytes), created: true });
      expect(await port.putDelivered(P, enc(city('export')))).toEqual({ digest: first.digest, created: false });
      expect(dec(await port.readDelivered(P, first.digest))).toBe(city('export'));
      const other = await port.putDelivered(P, enc(city('other')));
      expect(other.digest).not.toBe(first.digest);
      expect(dec(await port.readDelivered(P, first.digest))).toBe(city('export'));
      expect(await port.readDelivered('prj-other', first.digest)).toBeUndefined();
    });

    it('concurrent deliveries of the same bytes: one creates, the rest are no-ops', async () => {
      const { port } = await make();
      const outs = await Promise.all([1, 2, 3].map(() => port.putDelivered(P, enc(city('same')))));
      expect(outs.filter((o) => o.created)).toHaveLength(1);
      expect(new Set(outs.map((o) => o.digest)).size).toBe(1);
    });
  });
}
