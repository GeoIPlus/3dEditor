// 3D-07: expected values are copied from v0.3 §12, never edited to fit code (AGENTS.md §2.11); the reference checks
// of the §12 last paragraph are reproduced here.

import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { ROOT } from '../source.mjs';
import { read } from './math.mjs';

const RAW = readFileSync(join(ROOT, 'docs', 'source', 'fullSpecsV0.3.md'), 'utf8');
const dirs = readdirSync(join(ROOT, 'fixtures')).filter((d) => d.startsWith('GT-')).sort();
/** Number words of the §12 texts. */
const WORDS = /** @type {Record<string, number>} */ ({ 'Один': 1, 'двух': 2, 'Двое': 2 });

/** Numbers in a §12 text: "6 000 000" -> 6000000, "0,03" -> 0.03, plus number words. @param {string} t */
function numbers(t) {
  const flat = t.replace(/(\d) (?=\d{3}\b)/g, '$1').replace(/(\d),(\d)/g, '$1.$2');
  const out = (flat.match(/\d+(?:\.\d+)?/g) ?? []).map(Number);
  for (const [w, n] of Object.entries(WORDS)) if (t.includes(w)) out.push(n);
  return out;
}

/** Leaves of an assert object. @param {unknown} v @returns {unknown[]} */
const leaves = (v) => (Array.isArray(v) ? v.flatMap(leaves) : v && typeof v === 'object' ? Object.values(v).flatMap(leaves) : [v]);

describe('expected.json copies v0.3 §12 verbatim', () => {
  for (const d of dirs) {
    it(d, () => {
      const e = read(`fixtures/${d}/expected.json`);
      const s = e.source;
      expect(e.gt).toBe(d);
      expect(s.document).toBe('docs/source/fullSpecsV0.3.md');
      // The exact table row of the read-only source, not a parsed copy.
      expect(RAW).toContain(`| ${d} | ${s.gate} | ${s.input} | ${s.expected} |`);
      expect(e.tolerance).toMatchObject({ areaM2: 0.01, volumeM3: 0.01 });
      expect(RAW).toContain('площадь ± 0,01 м², объём ± 0,01 м³');
      const text = `${s.input} ${s.expected}`;
      const nums = numbers(text);
      for (const leaf of leaves(e.assert)) {
        if (typeof leaf === 'number') expect(nums, `${d}: ${leaf} not in §12 text`).toContain(leaf);
        if (typeof leaf === 'string' && /^[A-Z][A-Z_]+$/.test(leaf)) expect(text, `${d}: ${leaf}`).toContain(leaf);
      }
      for (const dec of e.decided) expect(dec.source).toMatch(/^D-\d+$/);
    });
  }
});

describe('reference checks of the v0.3 §12 last paragraph', () => {
  const para = /** @type {string} */ (RAW.split('\n').find((l) => l.startsWith('Проверка эталонов')));
  const ex = (/** @type {string} */ gt) => read(`fixtures/${gt}/expected.json`).assert;

  it('the paragraph states the four reference values', () => {
    expect(para).toContain('GT-04 — объём крыши 3·8·(2·10 + 2)/6 = 88');
    expect(para).toContain('GT-07 — уклон rise 3,5 / run 4, объём 400 + 10·8·3,5/2 = 540');
    expect(para).toContain('GT-14 — длина ската 5 + 0,5·5/4 = 5,625');
    expect(para).toContain('GT-21 — 0,10·cos(arctan 0,75) = 0,080');
  });

  it('GT-04: hip roof volume 88, building 400 + 88 = 488', () => {
    const roof = (3 * 8 * (2 * 10 + 2)) / 6;
    expect(roof).toBe(88);
    expect(10 * 8 * 5 + roof).toBe(ex('GT-04').volumeM3);
  });

  it('GT-07: rise 3.5 / run 4, volume 540, roof 106.301', () => {
    const rise = 8.5 - 5;
    expect(rise).toBe(3.5);
    expect(400 + (10 * 8 * rise) / 2).toBe(ex('GT-07').volumeM3);
    expect(Math.abs(2 * 10 * Math.sqrt(16 + rise * rise) - ex('GT-07').roofAreaM2)).toBeLessThan(0.0005);
  });

  it('GT-14: slope length 5.625, roof 112.5, edge Z 4.625', () => {
    const len = 5 + (0.5 * 5) / 4;
    expect(len).toBe(5.625);
    expect(2 * 10 * len).toBe(ex('GT-14').roofAreaM2);
    expect(5 - (0.5 * 3) / 4).toBe(ex('GT-14').overhangEdgeZ);
  });

  it('GT-21: 0.10 * cos(atan 0.75) = 0.080', () => {
    const v = 0.1 * Math.cos(Math.atan(0.75));
    expect(Math.abs(v - ex('GT-21').meanSlopeDeviationM)).toBeLessThan(1e-12);
  });

  it('GT-04 payload slope equals atan(3/4) in degrees', () => {
    const steps = read('fixtures/GT-04/steps.json');
    for (const deg of steps[0].command.payload.slopesDeg) expect(Math.abs(Math.tan((deg * Math.PI) / 180) - 0.75)).toBeLessThan(1e-12);
  });
});
