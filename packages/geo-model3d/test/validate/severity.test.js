// 3D-12 Accept 1 (spec §8): for each code of the severity table, a fixture in DRAFT_SOLID and one in VALID_SOLID
// produce the table's severity. Detected codes come from defective copies of golden inputs; codes of other modules come
// in as findings (D-144). The expected table is typed here from spec §8 rule 4 / D-77, not imported from src.
import { describe, it, expect } from 'vitest';
import { validate, golden, addPolyhedron, addBoxSolid, addTetra, reverseFace } from './helpers.js';

/** Spec §8 rule 4 (v0.3 §8.3; D-77): code -> [DRAFT_SOLID, VALID_SOLID]. */
const TABLE = {
  OPEN_BOUNDARY: ['WARNING', 'ERROR'], SHELL_NOT_CLOSED: ['WARNING', 'ERROR'], NON_MANIFOLD_EDGE: ['WARNING', 'ERROR'],
  NON_MANIFOLD_VERTEX: ['WARNING', 'ERROR'], SELF_INTERSECTION: ['WARNING', 'ERROR'], SHELL_ORIENTATION: ['WARNING', 'ERROR'],
  INCONSISTENT_RING_ORIENTATION: ['WARNING', 'ERROR'], INCONSISTENT_JUNCTION: ['WARNING', 'ERROR'],
  NON_PLANAR_FACE: ['WARNING', 'ERROR'], DEGENERATE_EDGE: ['ERROR', 'ERROR'], DEGENERATE_FACE: ['ERROR', 'ERROR'],
  CONSTRAINT_CONFLICT: ['ERROR', 'ERROR'], INVALID_CRS: ['ERROR', 'ERROR'], SEMANTIC_MAPPING_ERROR: ['WARNING', 'ERROR'],
  SOLID_OVERLAP: ['WARNING', 'ERROR'], UNDERCONSTRAINED_GEOMETRY: ['ERROR', 'ERROR'], INVALID_MEASUREMENT: ['WARNING', 'WARNING'],
  EXPORT_SCHEMA_ERROR: ['WARNING', 'ERROR'], PRECISION_LOSS: ['WARNING', 'WARNING'],
};

/** Defect builders: code -> () => { model, findings?, entity } where `entity` must be among the issue's entity ids. */
const DETECTED = {
  OPEN_BOUNDARY: () => {
    const m = golden('GT-03');
    m.halfEdges['he-f-roof-s-2'].twinId = null;
    m.halfEdges['he-f-roof-n-2'].twinId = null;
    return { model: m, entity: 'he-f-roof-s-2' };
  },
  SHELL_NOT_CLOSED: () => {
    const m = golden('GT-03');
    m.halfEdges['he-f-roof-s-2'].twinId = null;
    m.halfEdges['he-f-roof-n-2'].twinId = null;
    return { model: m, entity: 'sh-1' };
  },
  NON_MANIFOLD_EDGE: () => {
    const m = golden('GT-03'); // a fin on the ridge: a third face on edge v-r0 - v-r1
    addPolyhedron(m, 'sh-1', 'fin', { 'v-fin': [5, 4, 10] }, [['v-r1', 'v-r0', 'v-fin']]);
    return { model: m, entity: 'fin-f0-he0' };
  },
  NON_MANIFOLD_VERTEX: () => {
    const m = golden('GT-03'); // a closed tetrahedron touching the building only at v-r1, in the same shell
    addTetra(m, 'sh-1', 'tv', { 'v-r1': [10, 4, 8], 't1': [12, 4, 8], 't2': [11, 5, 8], 't3': [11, 4.5, 9] });
    return { model: m, entity: 'v-r1' };
  },
  SELF_INTERSECTION: () => {
    const m = golden('GT-03'); // a tetrahedron in the shell piercing the south slope (z = 6.5 at y = 2)
    addTetra(m, 'sh-1', 'ts', { 's0': [5, 2, 6], 's1': [5, 2.5, 10], 's2': [6, 1.5, 10], 's3': [4, 1.5, 10] });
    return { model: m, entity: 'f-roof-s' };
  },
  SHELL_ORIENTATION: () => {
    const m = golden('GT-03'); // every face reversed: consistent rings, inward shell
    Object.keys(m.faces).forEach((f) => reverseFace(m, f));
    return { model: m, entity: 'sh-1' };
  },
  INCONSISTENT_RING_ORIENTATION: () => {
    const m = golden('GT-03'); // plane of one wall flipped: its ring turns against the normal
    const f = m.faces['f-wall-e'];
    f.supportPlane = { normal: [-1, 0, 0], d: 10 };
    return { model: m, entity: 'f-wall-e' };
  },
  INCONSISTENT_JUNCTION: () => {
    const m = golden('GT-19'); // the 4-plane apex, east slope lifted 0.3 m: no common point under any reading
    m.faces['f-roof-e'].supportPlane.d -= 0.3;
    return { model: m, entity: 'v-a' };
  },
  NON_PLANAR_FACE: () => {
    const m = golden('GT-03'); // imported ridge end kept 0.1 m above its planes
    m.vertices['v-r1'].p = [10, 4, 8.1];
    return { model: m, entity: 'f-roof-s' };
  },
  DEGENERATE_EDGE: () => ({ model: golden('GT-06'), entity: 'he-f-wall-e-3' }), // GT-I2 gap 0.03 m < minEdgeLengthM
  DEGENERATE_FACE: () => {
    const m = golden('GT-03'); // a separate small body: faces ~0.02 m2 < minFaceAreaM2, edges 0.2 m
    m.shells['tiny-sh'] = { id: 'tiny-sh', faceIds: [], intendedRole: 'OUTER', isClosed: true };
    m.solids['tiny-so'] = { id: 'tiny-so', outerShellId: 'tiny-sh', voidShellIds: [] };
    addTetra(m, 'tiny-sh', 'tiny', { 'y0': [20, 0, 0], 'y1': [20.2, 0, 0], 'y2': [20, 0.2, 0], 'y3': [20, 0, 0.2] });
    return { model: m, entity: 'tiny-f0' };
  },
  SOLID_OVERLAP: () => {
    const m = golden('GT-03'); // a second body (BuildingPart-like) reaching 2 m into the building
    addBoxSolid(m, 'part', [8, 2, 0], [12, 6, 4]);
    return { model: m, entity: 'part-so' };
  },
};

const FOREIGN = ['CONSTRAINT_CONFLICT', 'INVALID_CRS', 'SEMANTIC_MAPPING_ERROR', 'UNDERCONSTRAINED_GEOMETRY', 'INVALID_MEASUREMENT', 'EXPORT_SCHEMA_ERROR', 'PRECISION_LOSS'];

describe('severity by state (spec §8 rule 4)', () => {
  it('covers every code of the contract exactly once', () => {
    expect([...Object.keys(DETECTED), ...FOREIGN].sort()).toEqual(Object.keys(TABLE).sort());
  });

  for (const [code, [draft, valid]] of Object.entries(TABLE)) {
    for (const [state, sev] of [['DRAFT_SOLID', draft], ['VALID_SOLID', valid]]) {
      it(`${code} in ${state} is ${sev}`, async () => {
        const build = /** @type {any} */ (DETECTED)[code];
        const fx = build ? build() : { model: golden('GT-03'), entity: 'f-roof-s', findings: [{ code, entityIds: ['f-roof-s'] }] };
        fx.model.state = state;
        const r = await validate(fx.model, { mode: 'COMMIT_VALIDATION', targetState: state, fullSolid: true, findings: fx.findings });
        const hits = r.issues.filter((/** @type {any} */ i) => i.code === code);
        expect(hits.length, JSON.stringify(r.issues.map((/** @type {any} */ i) => i.code))).toBeGreaterThan(0);
        expect(hits.some((/** @type {any} */ i) => i.entityIds.includes(fx.entity))).toBe(true);
        for (const h of hits) expect(h.severity).toBe(sev);
        expect(r.isValidForTargetState).toBe(!r.issues.some((/** @type {any} */ i) => i.severity === 'ERROR'));
      });
    }
  }
});

describe('negative controls', () => {
  it('a body touching the building face to face is not an overlap', async () => {
    const m = golden('GT-03');
    addBoxSolid(m, 'annex', [10, 2, 0], [12, 6, 4]);
    const r = await validate(m, { mode: 'COMMIT_VALIDATION', targetState: 'VALID_SOLID', fullSolid: true });
    expect(r.issues).toEqual([]);
  });

  it('a body fully inside the building is an overlap', async () => {
    const m = golden('GT-03');
    addBoxSolid(m, 'inner', [2, 2, 1], [4, 4, 3]);
    const r = await validate(m, { mode: 'COMMIT_VALIDATION', targetState: 'VALID_SOLID', fullSolid: true });
    expect(r.issues.map((/** @type {any} */ i) => i.code)).toEqual(['SOLID_OVERLAP']);
  });

  it('an unknown finding code is refused', async () => {
    await expect(validate(golden('GT-03'), { mode: 'COMMIT_VALIDATION', targetState: 'VALID_SOLID', findings: [{ code: 'NOPE', entityIds: [] }] })).rejects.toThrow(RangeError);
  });
});
