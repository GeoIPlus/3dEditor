// Contract tests of contracts/model3d (3D-06): every acceptance line of the 3D-06 row and of spec §2 that a
// machine can check. Spec tables are parsed, not copied, so a spec edit breaks this test until the schemas follow.
import { describe, expect, it } from 'vitest';
import { ID_PATTERN, createAjv, kebab, loadExamples, loadSchemas, specSection, tableRows } from './load.mjs';

const schemas = loadSchemas();
const ajv = createAjv();
// The §2.2 paragraph lists the kinds up to REDO, then repeats three deletion names.
const kindsInSpec = [...specSection('### 2.2 ').matchAll(/`([A-Z_]+)`/g)].map((m) => m[1]).filter((k) => k !== 'OperationKind');
const kinds = kindsInSpec.slice(0, kindsInSpec.indexOf('REDO') + 1);

describe('schema files', () => {
  it('declare JSON Schema 2020-12 and an $id urn:geoiplus:schema:model3d-<name>:v<n> equal to the file name', () => {
    for (const [name, s] of schemas) {
      expect(s.$schema, name).toBe('https://json-schema.org/draft/2020-12/schema');
      const m = ID_PATTERN.exec(s.$id);
      expect(m, `${name}: ${s.$id}`).not.toBeNull();
      expect(m?.[1], name).toBe(name);
    }
  });

  it('all compile with Ajv 2020 in strict mode', () => {
    for (const [name, s] of schemas) expect(() => ajv.getSchema(s.$id), name).not.toThrow();
    for (const [name, s] of schemas) expect(typeof ajv.getSchema(s.$id), name).toBe('function');
  });

  it('cover every row of the spec §2 schema list (row 5 as one file per OperationKind)', () => {
    const names = tableRows(specSection('## 2. ')).map((r) => /`([a-z0-9-]+)/.exec(r[1])?.[1]);
    expect(names.length).toBe(18);
    for (const n of names) {
      if (n === 'command-payload-') continue;
      expect(schemas.has(/** @type {string} */ (n)), String(n)).toBe(true);
    }
    expect(names).toContain('command-payload-');
  });
});

describe('OperationKind (spec §2.2)', () => {
  it('lists the 37 kinds of the spec in common, and each has a payload schema', () => {
    expect(kinds.length).toBe(37);
    expect(schemas.get('common').$defs.OperationKind.enum).toEqual(kinds);
    for (const k of kinds) expect(schemas.has(`command-payload-${kebab(k)}`), k).toBe(true);
    const payloadFiles = [...schemas.keys()].filter((n) => n.startsWith('command-payload-'));
    expect(payloadFiles.length).toBe(37);
  });

  it('UNDO and REDO payloads are empty', () => {
    for (const k of ['UNDO', 'REDO']) {
      const v = /** @type {import('ajv').ValidateFunction} */ (ajv.getSchema(`urn:geoiplus:schema:model3d-command-payload-${kebab(k)}:v1`));
      expect(v({}), k).toBe(true);
      expect(v({ anything: 1 }), k).toBe(false);
    }
  });

  it('the command envelope dispatches every kind to its payload schema', () => {
    const v = /** @type {import('ajv').ValidateFunction} */ (ajv.getSchema('urn:geoiplus:schema:model3d-command:v1'));
    const refs = schemas.get('command').allOf.map((/** @type {any} */ x) => x.then?.properties?.payload?.$ref).filter(Boolean);
    expect(refs).toEqual(kinds.map((k) => `urn:geoiplus:schema:model3d-command-payload-${kebab(k)}:v1`));
    const base = { schemaVersion: '1', commandId: 'c', projectId: 'p', buildingId: 'b', actorId: 'u', phase: 'PREVIEW',
      expectedVersion: 1, coordinateFrame: 'LOCAL', targetState: 'VALID_SOLID' };
    expect(v({ ...base, operation: 'UNDO', payload: {} })).toBe(true);
    expect(v({ ...base, operation: 'UNDO', payload: { faceId: 'f' } })).toBe(false);
    expect(v({ ...base, operation: 'SET_SEMANTICS', payload: {} })).toBe(false);
  });
});

describe('tolerance-profile (spec §2.3)', () => {
  it('has exactly the 14 fields of the spec table with the D-13 values as defaults, no lockTtlMin', () => {
    const rows = tableRows(specSection('### 2.3 ')).map((r) => [r[0].replace(/`/g, ''), Number(r[1])]);
    expect(rows.length).toBe(14);
    const s = schemas.get('tolerance-profile');
    expect([...s.required].sort()).toEqual(rows.map((r) => r[0]).sort());
    for (const [f, d] of rows) expect(s.properties[f].default, String(f)).toBe(d);
    expect(Object.keys(s.properties).filter((k) => k !== 'id').length).toBe(14);
    expect(s.properties.lockTtlMin).toBeUndefined();
  });
});

describe('error registry (spec §2.4)', () => {
  /** @type {Map<string, number>} */
  const expected = new Map();
  for (const [http, codes] of tableRows(specSection('### 2.4 '))) {
    const cs = [...codes.matchAll(/`([A-Z_]+)`/g)].map((m) => m[1]);
    const statuses = http.split('/').map((x) => Number(x.trim()));
    cs.forEach((c, i) => expected.set(c, statuses.length === cs.length ? statuses[i] : statuses[0]));
  }

  it('enumerates exactly the codes of the spec', () => {
    expect(expected.size).toBe(16);
    expect([...schemas.get('error').$defs.ErrorCode.enum].sort()).toEqual([...expected.keys()].sort());
  });

  it('binds every code to its HTTP status', () => {
    const v = /** @type {import('ajv').ValidateFunction} */ (ajv.getSchema('urn:geoiplus:schema:model3d-error:v1'));
    const all = [...new Set(expected.values())];
    for (const [code, status] of expected) {
      expect(v({ code, httpStatus: status, messageKey: 'k' }), `${code} ${status}`).toBe(true);
      for (const other of all.filter((s) => s !== status)) expect(v({ code, httpStatus: other, messageKey: 'k' }), `${code} ${other}`).toBe(false);
    }
  });
});

describe('topology-lineage (v0.3 §9.1)', () => {
  it('has exactly {mapped, deleted, preserved}', () => {
    const s = schemas.get('topology-lineage');
    expect(Object.keys(s.properties)).toEqual(['mapped', 'deleted', 'preserved']);
    expect(s.required).toEqual(['mapped', 'deleted', 'preserved']);
  });
});

describe('examples', () => {
  for (const [name, s] of schemas) {
    it(`${name}: at least one valid and one invalid example, each judged as labelled`, () => {
      const ex = loadExamples(name);
      /** @type {Array<[string, any]>} */
      const groups = name === 'common' ? Object.entries(ex.defs).map(([d, g]) => [`${s.$id}#/$defs/${d}`, g]) : [[s.$id, ex]];
      for (const [ref, g] of groups) {
        const v = /** @type {import('ajv').ValidateFunction} */ (ajv.getSchema(ref));
        expect(g.valid.length, `${ref} valid`).toBeGreaterThan(0);
        expect(g.invalid.length, `${ref} invalid`).toBeGreaterThan(0);
        g.valid.forEach((/** @type {any} */ x, /** @type {number} */ i) => expect(v(x), `${ref} valid[${i}] ${JSON.stringify(v.errors)}`).toBe(true));
        g.invalid.forEach((/** @type {any} */ x, /** @type {number} */ i) => expect(v(x.instance), `${ref} invalid[${i}]: ${x.why}`).toBe(false));
      }
    });
  }
});
