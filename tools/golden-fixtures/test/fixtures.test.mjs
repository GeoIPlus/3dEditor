// 3D-07: fixtures are generated, byte-identical on regeneration, complete, and valid against contracts/model3d.

import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { createAjv } from '../../../contracts/model3d/test/load.mjs';
import { generate } from '../generate.mjs';
import { ROOT, readSpec13 } from '../source.mjs';
import { modelEdges, modelFaces, norm, planeDist, read } from './math.mjs';

const files = generate();
const ids = [...readSpec13().keys()];
const dirs = readdirSync(join(ROOT, 'fixtures')).filter((d) => d.startsWith('GT-')).sort();
const ajv = createAjv();
const validModel = ajv.getSchema('urn:geoiplus:schema:model3d-building-model:v1');
const validCommand = ajv.getSchema('urn:geoiplus:schema:model3d-command:v1');
const PLANAR_TOL_M = 0.02; // D-13

/** @param {string} gt */
const inputsOf = (gt) => readdirSync(join(ROOT, 'fixtures', gt)).filter((f) => /^input\.model.*\.json$/.test(f));

describe('generation', () => {
  it('covers exactly the 29 golden tests of spec §13', () => {
    expect(ids).toHaveLength(29);
    expect(dirs).toEqual([...ids].sort());
  });

  it('spec §13 rows marked "fixtures pending" have no fixture yet (3D-104: GT-3D104-1..8, built by 3D-105)', () => {
    const pending = [...readSpec13({ includePending: true }).keys()].filter((k) => !ids.includes(k));
    expect(pending).toHaveLength(8);
    for (const id of pending) expect(dirs, id).not.toContain(id);
  });

  it('committed files are byte-identical to a fresh generation, with no stale file', () => {
    const committed = dirs.flatMap((d) => readdirSync(join(ROOT, 'fixtures', d)).map((f) => `fixtures/${d}/${f}`)).sort();
    expect(committed).toEqual([...files.keys()].sort());
    for (const [rel, content] of files) expect(readFileSync(join(ROOT, rel), 'utf8'), rel).toBe(content);
  });

  it('two generations are identical', () => {
    expect([...generate()]).toEqual([...files]);
  });

  it('generator uses no randomness, clock or platform-dependent transcendental functions', () => {
    const dir = join(ROOT, 'tools', 'golden-fixtures');
    for (const f of readdirSync(dir).filter((n) => n.endsWith('.mjs'))) {
      const src = readFileSync(join(dir, f), 'utf8');
      expect(src, f).not.toMatch(/Math\.(random|sin|cos|tan|atan2?|asin|acos|log|exp|pow)\b|Date\.now|new Date/);
    }
  });

  it('every fixture has steps.json, expected.json and README.md', () => {
    for (const d of dirs) for (const f of ['steps.json', 'expected.json', 'README.md']) expect(files.has(`fixtures/${d}/${f}`), `${d}/${f}`).toBe(true);
  });
});

describe('contracts', () => {
  it('every input model validates against building-model', () => {
    let n = 0;
    for (const d of dirs) for (const f of inputsOf(d)) {
      n++;
      expect(validModel?.(read(`fixtures/${d}/${f}`)), `${d}/${f} ${JSON.stringify(validModel?.errors)}`).toBe(true);
    }
    expect(n).toBe(28); // 23 single-model fixtures + GT-19 (2) + GT-24 (3)
  });

  it('every COMMAND step validates against command and targets its model and version', () => {
    let n = 0;
    for (const d of dirs) {
      const steps = read(`fixtures/${d}/steps.json`);
      for (const s of steps.filter((/** @type {any} */ x) => x.step === 'COMMAND')) {
        n++;
        expect(validCommand?.(s.command), `${d} ${JSON.stringify(validCommand?.errors)}`).toBe(true);
        const models = inputsOf(d).map((f) => read(`fixtures/${d}/${f}`));
        if (models.length) expect(models.map((m) => m.buildingId), d).toContain(s.command.buildingId);
      }
      const first = steps.find((/** @type {any} */ x) => x.step === 'COMMAND');
      if (first && inputsOf(d).length) expect(first.command.expectedVersion, d).toBe(read(`fixtures/${d}/${first.model ?? inputsOf(d)[0]}`).version);
    }
    expect(n).toBe(29);
  });
});

describe('model integrity (kernel invariants the fixtures must already meet)', () => {
  for (const d of dirs) for (const f of inputsOf(d)) {
    it(`${d}/${f}`, () => {
      const m = read(`fixtures/${d}/${f}`);
      for (const k of ['vertices', 'halfEdges', 'faces', 'shells', 'solids', 'footprints', 'constraints']) {
        for (const [key, e] of Object.entries(m[k])) expect(/** @type {any} */ (e).id, `${k} key`).toBe(key);
      }
      for (const he of Object.values(m.halfEdges)) {
        expect(m.halfEdges[he.nextId].prevId).toBe(he.id);
        expect(m.halfEdges[he.nextId].faceId).toBe(he.faceId);
        if (he.twinId !== null) {
          const t = m.halfEdges[he.twinId];
          expect(t.twinId).toBe(he.id);
          expect(t.startVertexId).toBe(m.halfEdges[he.nextId].startVertexId);
        }
      }
      const open = Object.values(m.halfEdges).filter((/** @type {any} */ h) => h.twinId === null).length;
      expect(m.shells['sh-1'].isClosed).toBe(open === 0);
      for (const face of modelFaces(m)) {
        expect(Math.abs(norm(face.plane.normal) - 1)).toBeLessThan(1e-12);
        for (const h of face.hes) expect(m.vertices[h.startVertexId].definingFaceIds).toContain(face.id);
        const off = face.pts.map((p) => Math.abs(planeDist(p, face.plane)));
        // GT-19: the lifted east slope misses the explicit apex on purpose (spec §4 r3a: reported, not moved).
        const allowed = d === 'GT-19' && face.id === 'f-roof-e' ? 0.05 : PLANAR_TOL_M;
        expect(Math.max(...off), `${face.id}`).toBeLessThanOrEqual(allowed);
      }
      expect(modelEdges(m).size).toBeGreaterThan(0);
    });
  }
});
