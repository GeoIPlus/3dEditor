// 3D-08: correctness of the MOVE_EDGE latency spike (packages/geo-model3d/spike/move-edge) and of the bench scenes.
// The latency number is only meaningful if the measured path does the work of spec §10.4 in plane terms (D-08).
import { describe, expect, it } from 'vitest';
import { derive, previewMoveEdge, solvePlane } from '../../packages/geo-model3d/spike/move-edge/index.js';
import { createAjv } from '../../contracts/model3d/test/load.mjs';
import { gt03, sawtooth } from './scenes.mjs';
import { TOL, createPreviewService } from './service.mjs';

const ajv = createAjv();
const validResult = /** @type {import('ajv').ValidateFunction} */ (ajv.getSchema('urn:geoiplus:schema:model3d-command-result:v1'));
const validModel = /** @type {import('ajv').ValidateFunction} */ (ajv.getSchema('urn:geoiplus:schema:model3d-building-model:v1'));
const ctx = { now: '2026-11-23T00:00:00Z', previewId: 'prev-1' };
/** @param {number[]} a @param {number[]} b */
const gap = (a, b) => Math.hypot(...a.map((x, i) => x - b[i]));
/** @param {any} pl @param {number[]} p */
const off = (pl, p) => Math.abs(pl.normal[0] * p[0] + pl.normal[1] * p[1] + pl.normal[2] * p[2] + pl.d);

/** @param {any} model @param {any} payload */
const cmd = (model, payload) => ({ ...gt03().command(0), buildingId: model.buildingId, payload });

describe('MOVE_EDGE spike on GT-03 (spec §10.4)', () => {
  const sc = gt03();
  const line = [[0, 0, 5.2], [10, 0, 5.2]];

  it('raises the south eave: roof plane holds the line, ridge kept, reply valid against command-result', () => {
    const r = previewMoveEdge(sc.model, cmd(sc.model, { edgeId: 'he-f-roof-s-0', targetLine: line, movableFaceIds: ['f-roof-s'] }), TOL, ctx);
    expect(r.status).toBe('PREVIEW');
    expect(validResult(r), JSON.stringify(validResult.errors)).toBe(true);
    const roof = r.patch.updated.find((/** @type {any} */ u) => u.type === 'Face').entity.supportPlane;
    for (const p of line) expect(off(roof, p)).toBeLessThan(1e-9);
    const v = Object.fromEntries(r.patch.updated.filter((/** @type {any} */ u) => u.type === 'Vtx').map((/** @type {any} */ u) => [u.entity.id, u.entity.p]));
    expect(gap(v['v-e0'], [0, 0, 5.2])).toBeLessThan(1e-9);
    expect(gap(v['v-r0'], [0, 4, 8])).toBeLessThan(1e-9);
    expect(Object.keys(v).sort()).toEqual(['v-e0', 'v-e1', 'v-r0', 'v-r1']);
  });

  it('writes no vertex: every updated vertex is the intersection of its (new) defining planes', () => {
    const r = previewMoveEdge(sc.model, cmd(sc.model, { edgeId: 'he-f-roof-s-0', targetLine: line, movableFaceIds: ['f-roof-s'] }), TOL, ctx);
    const planes = { ...Object.fromEntries(Object.values(sc.model.faces).map((f) => [f.id, f.supportPlane])) };
    for (const u of r.patch.updated) if (u.type === 'Face') planes[u.entity.id] = u.entity.supportPlane;
    for (const u of r.patch.updated.filter((/** @type {any} */ x) => x.type === 'Vtx')) {
      const d = derive(u.entity.definingFaceIds.map((/** @type {string} */ id) => planes[id]));
      expect(d && gap(d.p, u.entity.p)).toBeLessThan(1e-12);
      expect(u.entity.positionMode).toBe('DERIVED'); // D-70: an edited imported vertex becomes derived
    }
  });

  it('refuses with CONSTRAINT_CONFLICT when no plane is movable and the line is off the roof (rule 4)', () => {
    const r = previewMoveEdge(sc.model, cmd(sc.model, { edgeId: 'he-f-roof-s-0', targetLine: line, movableFaceIds: [] }), TOL, ctx);
    expect(r.status).toBe('REJECTED');
    expect(r.error).toMatchObject({ code: 'CONSTRAINT_CONFLICT', entityIds: ['f-roof-s'] });
  });

  it('refuses when the line leaves a fixed incident wall (rule 2)', () => {
    const r = previewMoveEdge(sc.model, cmd(sc.model, { edgeId: 'he-f-roof-s-0', targetLine: [[0, -0.5, 5], [10, -0.5, 5]], movableFaceIds: ['f-roof-s'] }), TOL, ctx);
    expect(r.error).toMatchObject({ code: 'CONSTRAINT_CONFLICT', entityIds: ['f-wall-s'] });
  });

  it('FIXED_POINT ridge vertices are hard points: a skewed eave line conflicts with them (rule 3)', () => {
    const model = structuredClone(sc.model);
    model.constraints = { 'c-1': { id: 'c-1', kind: 'FIXED_POINT', entityIds: ['v-r0', 'v-r1'], hard: true } };
    const ok = previewMoveEdge(model, cmd(model, { edgeId: 'he-f-roof-s-0', targetLine: line, movableFaceIds: ['f-roof-s'] }), TOL, ctx);
    expect(ok.status).toBe('PREVIEW');
    const skew = [[0, 0, 5.1], [10, 0, 5.4]];
    const r = previewMoveEdge(model, cmd(model, { edgeId: 'he-f-roof-s-0', targetLine: skew, movableFaceIds: ['f-roof-s'] }), TOL, ctx);
    expect(r.error.code).toBe('CONSTRAINT_CONFLICT');
    expect([...r.error.entityIds].sort()).toEqual(['f-roof-s', 'v-r0', 'v-r1']);
  });
});

describe('plane solve (ADR-S proposal, Q-17)', () => {
  const oldPlane = { normal: /** @type {[number, number, number]} */ ([0, 0, 1]), d: 0 };
  it('is underconstrained when the kept vertices lie on the target line', () => {
    const r = solvePlane({ hard: [[0, 0, 0], [1, 0, 0]], old: [[2, 0, 0], [3, 0, 0]], oldPlane });
    expect(r.status).toBe('UNDERCONSTRAINED');
  });
  it('keeps the plane when nothing constrains it', () => {
    expect(solvePlane({ hard: [], old: [[0, 0, 0]], oldPlane })).toMatchObject({ status: 'OK', plane: oldPlane });
  });
});

describe('bench scenes and service path (3D-ADR-0006)', () => {
  it('sawtooth-199 has 199 faces, is a valid closed model, and its valley move keeps the ridges', () => {
    const sc = sawtooth(97, true);
    expect(sc.faces).toBe(199);
    expect(validModel(sc.model), JSON.stringify(validModel.errors?.slice(0, 2))).toBe(true);
    expect(sc.model.shells['sh-1'].isClosed).toBe(true);
    const svc = createPreviewService({ models: [sc.model] });
    const r = JSON.parse(svc.handle(JSON.stringify(sc.command(0))));
    expect(r.status).toBe('PREVIEW');
    expect(r.validation.issues).toEqual([]);
    const v = Object.fromEntries(r.patch.updated.filter((/** @type {any} */ u) => u.type === 'Vtx').map((/** @type {any} */ u) => [u.entity.id, u.entity.p]));
    expect(gap(v['v-s96'], [192, 0, 4.9])).toBeLessThan(1e-9);
    expect(gap(v['v-s95'], sc.model.vertices['v-s95'].p)).toBeLessThan(1e-9);
  });

  it('refuses a valley pushed below the ground: SELF_INTERSECTION found by FAST_PREVIEW', () => {
    const sc = sawtooth(97, true);
    const c = sc.command(0);
    c.payload.targetLine = [[192, 0, -1], [192, 8, -1]];
    const r = previewMoveEdge(sc.model, c, TOL, ctx);
    expect(r.status).toBe('REJECTED');
    expect(validResult(r), JSON.stringify(validResult.errors)).toBe(true);
    expect(r.validation.issues.some((/** @type {any} */ i) => i.code === 'SELF_INTERSECTION')).toBe(true);
  });

  it('is deterministic: the same request gives the same reply bytes', () => {
    const sc = gt03();
    const a = createPreviewService({ models: [sc.model] }).handle(JSON.stringify(sc.command(3)));
    const b = createPreviewService({ models: [sc.model] }).handle(JSON.stringify(sc.command(3)));
    expect(a).toBe(b);
  });
});
