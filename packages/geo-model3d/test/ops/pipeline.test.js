// executeCommand pipeline (3D-14; spec §3 r1-r6, Accept 1-2; §10.1 Accept 1-3): PREVIEW = COMMIT patch, refusals
// leave the model untouched, lineage of D-212, envelope checks of the kernel, the commit gate, journal data.
import { describe, expect, it } from 'vitest';
import { canonicalJson } from '@geoiplus/geo-model3d';
import { applyPatch } from '../../src/brep/index.js';
import { deepFreeze } from '../brep/helpers.js';
import { run, command, gableModel, replaceRoof, withFootprint, maxPlaneDistance, PROFILE } from './helpers.js';

const GABLE = { template: 'GABLE', ridgeAxis: 'LOCAL_X', eaveZ: 5, ridgeZ: 8, symmetric: true };
/** @type {[string, any][]} */
const PAYLOADS = [
  ['REPLACE_ROOF', { footprintId: 'fp-1', template: 'FLAT', roofZ: 6 }],
  ['REPLACE_ROOF', { footprintId: 'fp-1', template: 'SHED', slopeAxis: 'LOCAL_X', zLow: 5, zHigh: 7 }],
  ['REPLACE_ROOF', { footprintId: 'fp-1', ...GABLE }],
  ['REPLACE_ROOF', { footprintId: 'fp-1', template: 'HIP', ridgeAxis: 'LOCAL_X', eaveZ: 5, slopesDeg: [30, 40, 30, 40] }],
  ['REBUILD_ENVELOPE', { baseZ: -1 }],
];

describe('PREVIEW and COMMIT (spec §3 r3, Accept 2)', () => {
  it.each(PAYLOADS)('%s: COMMIT after PREVIEW on the same version gives the PREVIEW patch and lineage', (op, payload) => {
    const model = deepFreeze(gableModel());
    const preview = run(model, command(model, op, payload, { phase: 'PREVIEW' }));
    expect(preview.result.status).toBe('PREVIEW');
    expect(preview.model).toBe(model);
    expect(preview.journal).toBeUndefined();
    expect(preview.result.validation.isValidForTargetState).toBe(false); // a PREVIEW never confirms (spec §8 r1)
    const commit = run(model, command(model, op, payload, { previewId: preview.result.previewId }));
    expect(commit.result.status).toBe('COMMITTED');
    expect(commit.result.patch).toEqual(preview.result.patch);
    expect(commit.result.topologyLineage).toEqual(preview.result.topologyLineage);
    expect(commit.model.version).toBe(model.version + 1);
    expect(commit.result.modelVersion).toBe(model.version + 1);
    expect(maxPlaneDistance(commit.model)).toBeLessThanOrEqual(PROFILE.planarTolM); // spec §10.1 Accept 1
  });
});

describe('lineage (D-212; spec §10.1 Accept 3)', () => {
  const model = gableModel();
  const out = replaceRoof(model, { template: 'HIP', ridgeAxis: 'LOCAL_X', eaveZ: 5, slopesDeg: [30, 40, 30, 40] });
  const { patch, topologyLineage: lin } = out.result;
  const TYPES = new Set(['Face', 'HalfEdge', 'Vtx']);

  it('footprint-bound ids survive: ground, base vertices, ground half-edges, one wall per footprint edge', () => {
    for (const id of ['f-ground', 'f-wall-s', 'f-wall-e', 'f-wall-n', 'f-wall-w', 'v-b0', 'v-b1', 'v-b2', 'v-b3']) {
      // kept: present after the operation, neither deleted nor mapped (an unchanged one is not in the patch at all)
      expect(id in out.model.faces || id in out.model.vertices).toBe(true);
      expect(lin.deleted).not.toContain(id);
      expect(lin.mapped[id]).toBeUndefined();
    }
    // base vertices become DERIVED (D-70) and wall bottoms get new neighbours: updated in place
    expect(lin.preserved).toEqual(expect.arrayContaining(['v-b0', 'he-f-wall-e-0', 'he-f-wall-w-0']));
    for (const h of Object.values(model.halfEdges)) {
      if (h.faceId === 'f-ground') expect(out.model.halfEdges[h.id]?.faceId).toBe('f-ground');
    }
  });

  it('old roof faces map to all new roof faces; every other changed id is deleted or preserved', () => {
    const newRoofs = Object.values(out.model.faces).filter((f) => f.surfaceKind === 'RoofSurface').map((f) => f.id).sort();
    expect(Object.keys(lin.mapped).sort()).toEqual(['f-roof-n', 'f-roof-s']);
    for (const t of Object.values(lin.mapped)) expect([...t].sort()).toEqual(newRoofs);
    const covered = new Set([...Object.keys(lin.mapped), ...Object.values(lin.mapped).flat(), ...lin.deleted, ...lin.preserved]);
    for (const c of patch.updated) if (TYPES.has(c.type)) expect(covered.has(c.entity.id)).toBe(true);
    for (const d of patch.deleted) if (TYPES.has(d.type)) expect(covered.has(d.id)).toBe(true);
    for (const c of patch.added) if (c.type === 'Face') expect(covered.has(c.entity.id)).toBe(true);
  });
});

describe('refusals leave the model untouched (spec §3 r2, Accept 1; §10.1 Accept 2)', () => {
  const m = () => deepFreeze(gableModel());
  /** @type {[string, () => any, (model: any) => any, string, string][]} */
  const cases = [
    ['stale version', m, (x) => command(x, 'REPLACE_ROOF', { footprintId: 'fp-1', ...GABLE }, { expectedVersion: 7 }), 'VERSION_CONFLICT', 'CONFLICT'],
    ['other building', m, (x) => command(x, 'REPLACE_ROOF', { footprintId: 'fp-1', ...GABLE }, { buildingId: 'b-x' }), 'NOT_FOUND', 'REJECTED'],
    ['unknown operation', m, (x) => command(x, 'NO_SUCH_OP', {}), 'INVALID_PAYLOAD', 'REJECTED'],
    ['not yet implemented kind', m, (x) => command(x, 'MOVE_EDGE', {}), 'INTERNAL', 'REJECTED'],
    ['unknown footprint', m, (x) => command(x, 'REPLACE_ROOF', { footprintId: 'fp-x', ...GABLE }), 'INVALID_PAYLOAD', 'REJECTED'],
    ['L footprint gable', () => deepFreeze(withFootprint([[0, 0], [10, 0], [10, 4], [4, 4], [4, 8], [0, 8]])), (x) => command(x, 'REPLACE_ROOF', { footprintId: 'fp-1', ...GABLE }), 'UNSUPPORTED_FOOTPRINT', 'REJECTED'],
    ['ridge below eave', m, (x) => command(x, 'REPLACE_ROOF', { footprintId: 'fp-1', ...GABLE, ridgeZ: 5 }), 'INVALID_GEOMETRY', 'REJECTED'],
  ];
  it.each(cases)('%s', (_, make, cmd, code, status) => {
    const model = make();
    const before = canonicalJson(model);
    for (const phase of ['PREVIEW', 'COMMIT']) {
      const out = run(model, { ...cmd(model), phase });
      expect(out.result.status).toBe(status);
      expect(out.result.error.code).toBe(code);
      expect(out.result.modelVersion).toBe(model.version);
      expect(out.model).toBe(model);
      expect(out.journal).toBeUndefined();
    }
    expect(canonicalJson(model)).toBe(before);
  });
});

describe('commit gate: no new errors for the target state (spec §3 r4, §8 r7)', () => {
  // a 0.03 m footprint edge gives DEGENERATE_EDGE (ERROR in both columns) that the input version did not have
  const ring = [[0, 0], [10, 0], [10, 8], [0.03, 8], [0, 8]];
  it('VALID_SOLID target -> INVALID_GEOMETRY with the new errors in the report', () => {
    const out = replaceRoof(withFootprint(ring), { template: 'FLAT', roofZ: 5 });
    expect(out.result.error.code).toBe('INVALID_GEOMETRY');
    expect(out.result.validation.issues.some((/** @type {any} */ i) => i.code === 'DEGENERATE_EDGE' && i.severity === 'ERROR')).toBe(true);
  });
  it('DRAFT_SOLID target -> committed as DRAFT_SOLID with the issues reported', () => {
    const out = replaceRoof(withFootprint(ring), { template: 'FLAT', roofZ: 5 }, { targetState: 'DRAFT_SOLID' });
    expect(out.result.status).toBe('COMMITTED');
    expect(out.model.state).toBe('DRAFT_SOLID');
    expect(out.modelLevel).toContain('state');
    expect(out.result.validation.isValidForTargetState).toBe(false);
  });
});

describe('journal-entry data', () => {
  it('the inverse patch restores the entities of the input version', () => {
    const model = gableModel();
    const out = replaceRoof(model, { template: 'FLAT', roofZ: 6 });
    const back = applyPatch(out.model, out.journal.inversePatch);
    for (const k of ['vertices', 'halfEdges', 'faces', 'shells', 'roofComponents', 'constraints']) {
      expect(canonicalJson(/** @type {any} */ (back)[k])).toBe(canonicalJson(/** @type {any} */ (model)[k]));
    }
    expect(out.journal).toMatchObject({ commandId: 'cmd-t', beforeVersion: 1, afterVersion: 2, timestamp: '2026-11-24T00:00:00Z' });
  });
});
