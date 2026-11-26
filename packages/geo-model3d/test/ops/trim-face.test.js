// TRIM_FACE (3D-105; spec §10.6 r7; D-322, D-323, D-302): GT-26 / GT-27 inputs and every refusal code of r7.
import { describe, expect, it } from 'vitest';
import { readFixture, deepFreeze } from '../brep/helpers.js';
import { exec, committed, refused, metrics, faceArea, gable } from './core-edits.helpers.js';

const over = () => deepFreeze(readFixture('GT-26', 'input.model.json'));
const trim = (/** @type {any} */ m, /** @type {any} */ p) => exec(m, 'TRIM_FACE', { faceId: 'f-roof-s', cuttingFaceId: 'f-roof-n', keepPoint: [5, 2, 6.5], ...p });

describe('TRIM_FACE', () => {
  it('GT-26: the flap beyond the ridge goes, S1 56.25 -> 50 m2, plane unchanged, ridge and rakes paired, VALID_SOLID 520 m3', () => {
    const g = over();
    expect(g.state).toBe('DRAFT_SOLID');
    expect(faceArea(g, 'f-roof-s')).toBeCloseTo(56.25, 9);
    const out = trim(g, {});
    const m = committed(out);
    expect(faceArea(m, 'f-roof-s')).toBeCloseTo(50, 9);
    expect(m.faces['f-roof-s'].supportPlane).toEqual(g.faces['f-roof-s'].supportPlane);
    const k = metrics(m);
    expect(k.volumeM3).toBeCloseTo(520, 9);
    expect(k.roofAreaM2).toBeCloseTo(100, 9);
    // flap vertices deleted; the chord ends welded into the existing ridge ends (closure vertex rule)
    expect(m.vertices['v-t0']).toBeUndefined();
    expect(m.vertices['v-t1']).toBeUndefined();
    expect(Object.keys(m.vertices).sort()).toEqual(Object.keys(gable().vertices).sort());
    expect(Object.values(m.halfEdges).every((/** @type {any} */ h) => h.twinId)).toBe(true);
    expect(Object.keys(m.faces)).toHaveLength(7);
    expect(out.result.topologyLineage.deleted).toEqual(expect.arrayContaining(['v-t0', 'v-t1']));
  });

  it('GT-27: keepPoint on the flap -> INVALID_TOPOLOGY (the removed part shares edges with the wall)', () => {
    const g = over();
    const e = refused(g, trim(g, { keepPoint: [5, 4.25, 8.1875] }), 'INVALID_TOPOLOGY');
    expect(e.entityIds?.[0]).toBe('f-roof-s');
  });

  it('PREVIEW and COMMIT give the same patch', () => {
    const g = over();
    expect(trim(g, {}).result.patch).toEqual(exec(g, 'TRIM_FACE', { faceId: 'f-roof-s', cuttingFaceId: 'f-roof-n', keepPoint: [5, 2, 6.5] }, { phase: 'PREVIEW' }).result.patch);
  });

  it('refusals: unknown ids or G == F -> INVALID_PAYLOAD; parallel planes, keepPoint off / outside / on the line -> INVALID_GEOMETRY', () => {
    const g = over();
    refused(g, trim(g, { cuttingFaceId: 'f-nope' }), 'INVALID_PAYLOAD');
    refused(g, trim(g, { cuttingFaceId: 'f-roof-s' }), 'INVALID_PAYLOAD');
    refused(g, exec(g, 'TRIM_FACE', { faceId: 'f-nope', cuttingFaceId: 'f-roof-n', keepPoint: [5, 2, 6.5] }), 'INVALID_PAYLOAD');
    refused(g, trim(g, { keepPoint: [5, 2, 7.5] }), 'INVALID_GEOMETRY'); // 1 m off the plane
    refused(g, trim(g, { keepPoint: [12, 2, 6.5] }), 'INVALID_GEOMETRY'); // outside the face
    refused(g, trim(g, { keepPoint: [5, 4, 8] }), 'INVALID_GEOMETRY'); // on the trim line
  });

  it('a cutting face parallel to F within coplanarTolDeg -> INVALID_GEOMETRY', () => {
    const g = structuredClone(over());
    g.faces['f-roof-n'].supportPlane = structuredClone(g.faces['f-roof-s'].supportPlane);
    refused(g, trim(g, {}), 'INVALID_GEOMETRY');
  });

  it('a cutting face whose line misses F -> INVALID_GEOMETRY (D-302: no part on one side)', () => {
    const g = over();
    refused(g, trim(g, { cuttingFaceId: 'f-ground' }), 'INVALID_GEOMETRY');
  });
});
