// import (3D-10): half-edges and twins (spec §6 rule 6), edge roles (rule 8), welding (rule 3), BuildingPart bodies and
// installations (rules 12, 13), footprints (rule 9), on hand-made CityJSON inputs.
import { describe, expect, it } from 'vitest';
import { importBuilding } from '@geoiplus/geo-model3d';
import { checkTopology } from '../../src/brep/index.js';
import { PROFILE, boxGeometry, goldenImport, makeDoc, roleCounts, solid } from './helpers.js';

const run = (/** @type {any} */ doc, id = 'b') => importBuilding({ cityjson: doc, cityObjectId: id, toleranceProfile: PROFILE, projectId: 'p' });
const BASE = [[0, 0, 0], [10, 0, 0], [10, 8, 0], [0, 8, 0]];
const W = 'WallSurface', R = 'RoofSurface', G = 'GroundSurface';

describe('edge roles (rule 8)', () => {
  it('hip roof: 1 RIDGE, 4 HIP, 4 EAVE, no RAKE', () => {
    const pts = [...BASE, [0, 0, 5], [10, 0, 5], [10, 8, 5], [0, 8, 5], [4, 4, 8], [6, 4, 8]];
    const rings = [[3, 2, 1, 0], [0, 1, 5, 4], [1, 2, 6, 5], [2, 3, 7, 6], [3, 0, 4, 7], [4, 5, 9, 8], [5, 6, 9], [6, 7, 8, 9], [7, 4, 8]];
    const { model } = run(makeDoc(pts, { b: { type: 'Building', geometry: [solid(rings, [G, W, W, W, W, R, R, R, R])] } }));
    expect(model.state).toBe('VALID_SOLID');
    expect(roleCounts(model)).toMatchObject({ RIDGE: 1, HIP: 4, EAVE: 4 });
    expect(roleCounts(model).RAKE).toBeUndefined();
  });
  it('butterfly roof: 1 VALLEY, 2 EAVE, 4 RAKE', () => {
    const pts = [...BASE, [0, 0, 8], [10, 0, 8], [10, 8, 8], [0, 8, 8], [0, 4, 5], [10, 4, 5]];
    const rings = [[3, 2, 1, 0], [0, 1, 5, 4], [1, 2, 6, 9, 5], [2, 3, 7, 6], [3, 0, 4, 8, 7], [4, 5, 9, 8], [9, 6, 7, 8]];
    const { model } = run(makeDoc(pts, { b: { type: 'Building', geometry: [solid(rings, [G, W, W, W, W, R, R])] } }));
    expect(model.state).toBe('VALID_SOLID');
    expect(roleCounts(model)).toMatchObject({ VALLEY: 1, EAVE: 2, RAKE: 4 });
    expect(roleCounts(model).RIDGE).toBeUndefined();
  });
});

describe('twins (rule 6)', () => {
  it('an edge of three faces gets one nonManifoldGroupId, no twins, and NON_MANIFOLD_EDGE', () => {
    const pts = [[0, 0, 0], [1, 0, 0], [1, 1, 0], [0, 1, 0], [0, -1, 0.5], [1, -1, 0.5], [1, 0, 1], [0, 0, 1]];
    const surfaces = [[[0, 1, 2, 3]], [[1, 0, 4, 5]], [[0, 1, 6, 7]]];
    const { model, report } = run(makeDoc(pts, { b: { type: 'Building', geometry: [{ type: 'MultiSurface', lod: '2.2', boundaries: surfaces }] } }));
    const groups = Object.values(model.halfEdges).filter((h) => h.nonManifoldGroupId);
    expect(groups.length).toBe(3);
    expect(new Set(groups.map((h) => h.nonManifoldGroupId)).size).toBe(1);
    for (const h of groups) expect(h.twinId).toBeNull();
    const nm = report.issues.filter((i) => i.code === 'NON_MANIFOLD_EDGE');
    expect(nm.length).toBe(1);
    expect([...nm[0].entityIds].sort()).toEqual(groups.map((h) => h.id).sort());
    expect(model.state).toBe('DRAFT_SOLID');
    expect(Object.values(model.shells)[0].isClosed).toBe(false);
  });
  it('a closed solid has every half-edge paired with an opposite twin on another face', () => {
    const { model } = run(goldenImport('GT-I1').cityjson, 'bld-gt-i1');
    for (const h of Object.values(model.halfEdges)) {
      const t = model.halfEdges[/** @type {string} */ (h.twinId)];
      expect(t.twinId).toBe(h.id);
      expect(t.faceId).not.toBe(h.faceId);
    }
    expect(Object.values(model.shells)[0].isClosed).toBe(true);
    expect(checkTopology(model)).toEqual([]);
  });
});

describe('welding (rule 3)', () => {
  it('a duplicate vertex 5 mm away is merged; the vertex keeps the first file position and lists both indices', () => {
    const { cityjson } = goldenImport('GT-I1');
    const doc = structuredClone(cityjson);
    const v4 = doc.vertices[4];
    doc.vertices.push([v4[0] + 3, v4[1] + 4, v4[2]]); // index 10, 5 mm from vertex 4
    const walls = doc.CityObjects['bld-gt-i1'].geometry[0].boundaries[0];
    const s = walls.findIndex((/** @type {number[][]} */ f) => f[0].includes(4));
    walls[s][0] = walls[s][0].map((/** @type {number} */ i) => (i === 4 ? 10 : i));
    const { model, report } = run(doc, 'bld-gt-i1');
    expect(Object.keys(model.vertices).length).toBe(10);
    const v = Object.values(model.vertices).find((x) => x.sourceRef === '4,10');
    expect(v).toBeDefined();
    expect(report.assignedState).toBe('VALID_SOLID');
  });
});

describe('BuildingPart bodies and installations (rules 9, 12, 13)', () => {
  const p1 = boxGeometry([0, 0, 0, 4, 4, 3]);
  const p2 = boxGeometry([4, 0, 0, 8, 4, 5], 8);
  const inst = boxGeometry([1, 1, 3, 2, 2, 4], 16);
  const doc = makeDoc([...p1.points, ...p2.points, ...inst.points], {
    b: { type: 'Building', attributes: { name: 'x' }, children: ['p1', 'p2'], geometry: [] },
    p1: { type: 'BuildingPart', parents: ['b'], children: ['i1'], geometry: [solid(p1.rings, p1.types)] },
    p2: { type: 'BuildingPart', parents: ['b'], geometry: [solid(p2.rings, p2.types)] },
    i1: { type: 'BuildingInstallation', parents: ['p1'], geometry: [solid(inst.rings, inst.types)] },
  });
  const { model, report } = run(doc);
  const sem = Object.values(model.semantics);
  const byRef = Object.fromEntries(sem.map((s) => [s.sourceRef, s]));

  it('one SemanticNode per CityObject, with parents, attributes and its own solid', () => {
    expect(sem.map((s) => [s.sourceRef, s.kind])).toEqual([['b', 'Building'], ['p1', 'BuildingPart'], ['i1', 'BuildingInstallation'], ['p2', 'BuildingPart']]);
    expect(byRef.b.attributes).toEqual({ name: 'x' });
    expect(byRef.b.solidIds).toEqual([]);
    expect(byRef.p1.parentId).toBe(byRef.b.id);
    expect(byRef.i1.parentId).toBe(byRef.p1.id);
    for (const r of ['p1', 'p2', 'i1']) expect(byRef[r].solidIds.length).toBe(1);
    expect(model.state).toBe('VALID_SOLID');
    expect(report.issues).toEqual([]);
  });
  it('bodies do not share vertices, even where their file positions touch (x = 4)', () => {
    expect(Object.keys(model.vertices).length).toBe(24);
    for (const v of Object.values(model.vertices)) {
      const shells = new Set(v.definingFaceIds.map((f) => Object.values(model.shells).find((s) => s.faceIds.includes(f))?.id));
      expect(shells.size).toBe(1);
    }
  });
  it('roof components are owned by the Building / BuildingPart; footprints name their part', () => {
    const owners = Object.values(model.roofComponents).map((c) => [c.ownerId, c.faceIds.length]);
    expect(owners).toEqual([[byRef.p1.id, 2], [byRef.p2.id, 1]]);
    const fps = Object.values(model.footprints);
    expect(fps.filter((f) => f.buildingPartId === byRef.p1.id).length).toBeGreaterThanOrEqual(1);
    const fp2 = fps.find((f) => f.buildingPartId === byRef.p2.id);
    expect(fp2).toMatchObject({ sourceKind: 'DERIVED_FROM_GROUND', innerRings: [], sourceMeasurementIds: [] });
    expect(fp2?.baseElevationM).toBe(0 - model.frame.originWorld[2]); // local frame, like every model coordinate
    const ring = /** @type {number[][]} */ (fp2?.outerRing);
    const area2 = ring.reduce((s, p, i) => s + p[0] * ring[(i + 1) % ring.length][1] - ring[(i + 1) % ring.length][0] * p[1], 0);
    expect(area2 / 2).toBeCloseTo(16, 9); // counter-clockwise seen from above
  });
});
