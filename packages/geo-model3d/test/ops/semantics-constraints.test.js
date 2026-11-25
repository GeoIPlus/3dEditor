// SET_SEMANTICS, SET_CONSTRAINT, REMOVE_CONSTRAINT (3D-21; spec §10.12, §5 r6; D-226..D-229) on the GT-03 gable.
import { describe, expect, it } from 'vitest';
import { run, command, gableModel, replaceRoof } from './helpers.js';

/** @param {any} model @param {string} op @param {any} payload @param {Record<string, any>} [over] */
const exec = (model, op, payload, over) => run(model, command(model, op, payload, over));
/** @param {any} model @param {any} constraint @param {Record<string, any>} [over] */
const setC = (model, constraint, over) => exec(model, 'SET_CONSTRAINT', { constraint }, over);
/** @param {any} out */
const refusal = (out) => ({ status: out.result.status, code: out.result.error?.code, ids: out.result.error?.entityIds ?? [] });
const GEOMETRY = new Set(['Vtx', 'HalfEdge', 'Shell', 'Solid', 'Footprint']);

describe('SET_SEMANTICS (spec §10.12 r1, Accept 1)', () => {
  it('a roof face set to WallSurface: only its surfaceKind changes; geometry patch empty; it leaves its roof component (D-227)', () => {
    const before = gableModel();
    const out = exec(before, 'SET_SEMANTICS', { faceIds: ['f-roof-s'], surfaceKind: 'WallSurface' });
    expect(out.result.status).toBe('COMMITTED');
    const { added, updated, deleted } = out.result.patch;
    expect(added).toEqual([]); expect(deleted).toEqual([]);
    expect(updated.filter((/** @type {any} */ u) => GEOMETRY.has(u.type))).toEqual([]);
    expect(updated.map((/** @type {any} */ u) => `${u.type}:${u.entity.id}`)).toEqual(['Face:f-roof-s', 'RoofComponent:rc-1']);
    expect({ ...out.model.faces['f-roof-s'], surfaceKind: 'RoofSurface' }).toEqual(before.faces['f-roof-s']);
    expect(out.model.roofComponents['rc-1'].faceIds).toEqual(['f-roof-n']);
    expect(out.model.vertices).toEqual(before.vertices);
  });
  it('a wall set to Unclassified: one Face update, nothing else; a face set to RoofSurface joins no component', () => {
    const a = exec(gableModel(), 'SET_SEMANTICS', { faceIds: ['f-wall-e'], surfaceKind: 'Unclassified' });
    expect(a.result.patch.updated.map((/** @type {any} */ u) => u.entity.id)).toEqual(['f-wall-e']);
    const b = exec(gableModel(), 'SET_SEMANTICS', { faceIds: ['f-wall-e'], surfaceKind: 'RoofSurface' });
    expect(b.result.patch.updated.map((/** @type {any} */ u) => u.entity.id)).toEqual(['f-wall-e']);
    expect(b.model.roofComponents['rc-1'].faceIds).toEqual(['f-roof-s', 'f-roof-n']);
  });
  it('both roof faces leave: the emptied roof component is deleted', () => {
    const out = exec(gableModel(), 'SET_SEMANTICS', { faceIds: ['f-roof-s', 'f-roof-n'], surfaceKind: 'ClosureSurface' });
    expect(out.result.patch.deleted).toEqual([{ type: 'RoofComponent', id: 'rc-1' }]);
  });
  it('PREVIEW gives the COMMIT patch and keeps the version', () => {
    const m = gableModel();
    const p = { faceIds: ['f-roof-n'], surfaceKind: 'Unclassified' };
    const pre = exec(m, 'SET_SEMANTICS', p, { phase: 'PREVIEW' });
    const com = exec(m, 'SET_SEMANTICS', p);
    expect(pre.result.status).toBe('PREVIEW'); expect(pre.result.modelVersion).toBe(m.version);
    expect(pre.result.patch).toEqual(com.result.patch);
    expect(com.result.modelVersion).toBe(m.version + 1);
  });
  it('unknown face (D-228), nothing to change (D-229), bad kind -> INVALID_PAYLOAD, model unchanged', () => {
    const m = gableModel();
    for (const [p, ids] of /** @type {[any, string[]][]} */ ([
      [{ faceIds: ['f-x', 'f-roof-s'], surfaceKind: 'WallSurface' }, ['f-x']],
      [{ faceIds: ['f-roof-s', 'f-roof-n'], surfaceKind: 'RoofSurface' }, ['f-roof-n', 'f-roof-s']],
      [{ faceIds: ['f-roof-s'], surfaceKind: 'Roof' }, []],
    ])) {
      const out = exec(m, 'SET_SEMANTICS', p);
      expect(refusal(out)).toEqual({ status: 'REJECTED', code: 'INVALID_PAYLOAD', ids });
      expect(out.model).toBe(m);
    }
  });
});

describe('SET_CONSTRAINT (spec §10.12 r2, r3)', () => {
  it('a hard FIXED_POINT on the ridge vertex is added with a server id; nothing else changes', () => {
    const out = setC(gableModel(), { kind: 'FIXED_POINT', entityIds: ['v-r0'], hard: true });
    expect(out.result.status).toBe('COMMITTED');
    expect(out.result.patch.added).toEqual([{ type: 'Constraint', entity: { id: 'constraint-1', kind: 'FIXED_POINT', entityIds: ['v-r0'], hard: true } }]);
    expect(out.result.patch.updated).toEqual([]); expect(out.result.patch.deleted).toEqual([]);
  });
  it('kinds the current model satisfies are accepted (FIXED_RIDGE, HORIZONTAL ground, PERPENDICULAR walls, ROOF_SLOPE, soft SYMMETRY)', () => {
    for (const c of [
      { kind: 'FIXED_RIDGE', entityIds: ['he-f-roof-s-2'], hard: true },
      { kind: 'HORIZONTAL', entityIds: ['f-ground'], hard: true },
      { kind: 'PERPENDICULAR', entityIds: ['f-wall-s', 'f-wall-e'], hard: true },
      { kind: 'ROOF_SLOPE', entityIds: ['f-roof-s'], hard: true, target: (Math.atan2(3, 4) * 180) / Math.PI },
      { kind: 'SYMMETRY', entityIds: ['f-roof-s', 'f-roof-n'], hard: false, weight: 1 },
    ]) expect(setC(gableModel(), c).result.status, c.kind).toBe('COMMITTED');
  });
  it('a hard constraint the model violates -> CONSTRAINT_CONFLICT naming it, model unchanged (r3)', () => {
    const m = gableModel();
    for (const c of [
      { kind: 'FIXED_POINT', entityIds: ['v-r0'], hard: true, target: [0, 4, 9] },
      { kind: 'HORIZONTAL', entityIds: ['f-roof-s'], hard: true },
      { kind: 'PARALLEL', entityIds: ['f-roof-s', 'f-roof-n'], hard: true },
      { kind: 'ROOF_SLOPE', entityIds: ['f-roof-s'], hard: true, target: 45 },
    ]) {
      const out = setC(m, c);
      expect(refusal(out).code, c.kind).toBe('CONSTRAINT_CONFLICT');
      expect(refusal(out).ids).toContain('constraint-1');
      expect(out.model).toBe(m);
    }
  });
  it('a new hard constraint against a stored one -> CONSTRAINT_CONFLICT with both ids', () => {
    const m = setC(gableModel(), { kind: 'ROOF_SLOPE', entityIds: ['f-roof-s'], hard: true, target: (Math.atan2(3, 4) * 180) / Math.PI }).model;
    const out = setC(m, { kind: 'HORIZONTAL', entityIds: ['f-roof-s'], hard: true });
    expect(refusal(out).code).toBe('CONSTRAINT_CONFLICT');
    expect(refusal(out).ids).toContain('constraint-2');
  });
  it('a constraint the compiler cannot read -> INVALID_PAYLOAD with the reason (D-226), unknown entity named (D-228)', () => {
    const cases = /** @type {[any, string, string[]][]} */ ([
      [{ kind: 'FIXED_EAVE', entityIds: ['he-f-roof-s-2'], hard: true }, 'ENTITIES_DO_NOT_MATCH_KIND', []],
      [{ kind: 'FIXED_POINT', entityIds: ['v-x'], hard: true }, 'ENTITIES_DO_NOT_MATCH_KIND', ['v-x']],
      [{ kind: 'BOUNDARY_ON_FOOTPRINT', entityIds: ['f-ground'], hard: true }, 'TBD', []],
      [{ kind: 'CLOSE_TO_MEASUREMENT', entityIds: ['f-roof-s'], hard: false, weight: 1 }, 'TBD', []],
      [{ kind: 'PREFERRED_AXIS', entityIds: ['he-f-roof-s-2'], hard: true }, 'SOFT_KIND_MARKED_HARD', []],
      [{ kind: 'HORIZONTAL', entityIds: ['f-ground'], hard: false }, 'SOFT_WITHOUT_WEIGHT', []],
      [{ kind: 'NOT_A_KIND', entityIds: ['f-ground'], hard: true }, 'UNKNOWN_KIND', []],
    ]);
    for (const [c, reason, ids] of cases) {
      const out = setC(gableModel(), c);
      expect(refusal(out), c.kind).toEqual({ status: 'REJECTED', code: 'INVALID_PAYLOAD', ids });
      expect(out.result.error.message).toContain(reason);
    }
  });
  it('the same constraint twice, a hard one with a weight -> INVALID_PAYLOAD (D-229)', () => {
    const c = { kind: 'FIXED_POINT', entityIds: ['v-r0'], hard: true };
    const m = setC(gableModel(), c).model;
    expect(refusal(setC(m, c))).toEqual({ status: 'REJECTED', code: 'INVALID_PAYLOAD', ids: ['constraint-1'] });
    expect(refusal(setC(m, { ...c, entityIds: ['v-r1'], weight: 2 })).code).toBe('INVALID_PAYLOAD');
  });
});

describe('REMOVE_CONSTRAINT (spec §10.12 r2; §5 r6, v0.2 C.11)', () => {
  it('removes the constraint; the inverse patch restores it', () => {
    const m = setC(gableModel(), { kind: 'FIXED_POINT', entityIds: ['v-r0'], hard: true }).model;
    const out = exec(m, 'REMOVE_CONSTRAINT', { constraintId: 'constraint-1' });
    expect(out.result.patch.deleted).toEqual([{ type: 'Constraint', id: 'constraint-1' }]);
    expect(out.result.patch.updated).toEqual([]);
    expect(out.journal.inversePatch.added[0].entity).toEqual(m.constraints['constraint-1']);
  });
  it('FIXED_POINT blocks REPLACE_ROOF until the explicit unlock (D-213; C.11)', () => {
    const fixed = setC(gableModel(), { kind: 'FIXED_POINT', entityIds: ['v-r0'], hard: true }).model;
    const flat = { template: 'FLAT', roofZ: 5 };
    expect(refusal(replaceRoof(fixed, flat))).toEqual({ status: 'REJECTED', code: 'CONSTRAINT_CONFLICT', ids: ['constraint-1'] });
    const unlocked = exec(fixed, 'REMOVE_CONSTRAINT', { constraintId: 'constraint-1' }).model;
    expect(replaceRoof(unlocked, flat).result.status).toBe('COMMITTED');
  });
  it('unknown constraint id -> INVALID_PAYLOAD naming it (D-228)', () => {
    expect(refusal(exec(gableModel(), 'REMOVE_CONSTRAINT', { constraintId: 'c-x' }))).toEqual({ status: 'REJECTED', code: 'INVALID_PAYLOAD', ids: ['c-x'] });
  });
});
