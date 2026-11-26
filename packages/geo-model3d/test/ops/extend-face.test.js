// EXTEND_FACE (3D-105; spec §10.6 r8; D-324): GT-28 / GT-29 inputs and every refusal code of r8.
import { describe, expect, it } from 'vitest';
import { readFixture, deepFreeze } from '../brep/helpers.js';
import { exec, committed, refused, metrics, faceArea, gable, at } from './core-edits.helpers.js';

const under = () => deepFreeze(readFixture('GT-28', 'input.model.json'));
const TOP = readFixture('GT-28', 'steps.json')[0].command.payload.edgeId;
const extend = (/** @type {any} */ m, /** @type {any} */ p) => exec(m, 'EXTEND_FACE', { faceId: 'f-roof-s', edgeId: TOP, targetFaceId: 'f-roof-n', ...p });

describe('EXTEND_FACE', () => {
  it('GT-28: top edge of S1 moved to the ridge; ends (0;4;8), (10;4;8); S1 43.75 -> 50 m2; VALID_SOLID 520 m3', () => {
    const g = under();
    expect(faceArea(g, 'f-roof-s')).toBeCloseTo(43.75, 9);
    const out = extend(g, {});
    const m = committed(out);
    // ids of F and e kept (r8.5); the moved ends are welded into the ridge ends that did not move (owner, D-3D105-3)
    expect(m.halfEdges[TOP].faceId).toBe('f-roof-s');
    at(m, 'v-r0', [0, 4, 8]);
    at(m, 'v-r1', [10, 4, 8]);
    expect(m.vertices['v-t0']).toBeUndefined();
    expect(out.result.topologyLineage.mapped).toEqual({ 'v-t0': ['v-r0'], 'v-t1': ['v-r1'] });
    expect(faceArea(m, 'f-roof-s')).toBeCloseTo(50, 9);
    expect(m.faces['f-roof-s'].supportPlane).toEqual(g.faces['f-roof-s'].supportPlane);
    const k = metrics(m);
    expect(k.volumeM3).toBeCloseTo(520, 9);
    expect(k.roofAreaM2).toBeCloseTo(100, 9);
    expect(Object.keys(m.vertices)).toHaveLength(Object.keys(gable().vertices).length);
    expect(Object.values(m.halfEdges).every((/** @type {any} */ h) => h.twinId)).toBe(true);
  });

  it('GT-29: the eave edge is shared with the south wall -> INVALID_TOPOLOGY', () => {
    const g = gable();
    refused(g, exec(g, 'EXTEND_FACE', { faceId: 'f-roof-s', edgeId: 'he-f-roof-s-0', targetFaceId: 'f-roof-n' }), 'INVALID_TOPOLOGY');
  });

  it('refusals: unknown ids, G == F, edge not in the outer ring of F -> INVALID_PAYLOAD', () => {
    const g = under();
    refused(g, extend(g, { targetFaceId: 'f-nope' }), 'INVALID_PAYLOAD');
    refused(g, extend(g, { targetFaceId: 'f-roof-s' }), 'INVALID_PAYLOAD');
    refused(g, extend(g, { edgeId: 'he-f-roof-n-0' }), 'INVALID_PAYLOAD');
    refused(g, extend(g, { faceId: 'f-nope' }), 'INVALID_PAYLOAD');
  });

  it('a target plane parallel to F -> INVALID_GEOMETRY', () => {
    const g = structuredClone(under());
    g.faces['f-roof-n'].supportPlane = structuredClone(g.faces['f-roof-s'].supportPlane);
    refused(g, extend(g, {}), 'INVALID_GEOMETRY');
  });

  it('a target line that crosses the face (a trim) or lies behind it -> INVALID_GEOMETRY', () => {
    const g = structuredClone(under());
    // north slope plane moved so that its line with S1 is at y = 2 (inside S1): z = 5 + 0.75 * 2 = 6.5 at y = 2
    const n = g.faces['f-roof-n'].supportPlane.normal;
    g.faces['f-roof-n'].supportPlane.d = -(n[1] * 2 + n[2] * 6.5);
    refused(g, extend(g, {}), 'INVALID_GEOMETRY');
    // ground plane z = 0 meets S1 at y = -6.67, behind the eave
    refused(g, extend(g, { targetFaceId: 'f-ground' }), 'INVALID_GEOMETRY');
  });

  it('a neighbour edge line parallel to the target line -> INVALID_GEOMETRY', () => {
    // the S1 rakes (along y) are parallel to the line of S1 with the west gable (x = 0)
    const g = under();
    refused(g, extend(g, { targetFaceId: 'f-wall-w' }), 'INVALID_GEOMETRY');
  });
});
