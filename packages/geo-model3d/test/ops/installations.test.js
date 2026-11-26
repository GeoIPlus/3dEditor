// 3D-20 installations (spec §10.11; D-256..D-260): GABLE geometry, chimney axes and sizes, WORLD frame, PREVIEW =
// COMMIT, lineage and patch coverage (spec §10.1 Accept 3), the plane invariant (Accept 1), REMOVE of a chain of
// installations. Expected numbers are derived by hand in the comments from GT-03 (south slope z = 5 + 0.75 y).
import { describe, expect, it } from 'vitest';
import { deepFreeze } from '../brep/helpers.js';
import { run, command, gableModel, volume, faceArea, maxPlaneDistance, PROFILE } from './helpers.js';

const OUTLINE = [[4, 1, 5.75], [6, 1, 5.75], [6, 2.5, 6.875], [4, 2.5, 6.875]];
const node = (/** @type {any} */ m) => /** @type {any} */ (Object.values(m.semantics).find((s) => /** @type {any} */ (s).kind === 'BuildingInstallation'));
const shellOf = (/** @type {any} */ m, /** @type {any} */ n) => m.shells[m.solids[n.solidIds[0]].outerShellId];
const pts = (/** @type {any} */ m, /** @type {any} */ n) => {
  const faces = new Set(shellOf(m, n).faceIds);
  return [...new Set(Object.values(m.halfEdges).filter((h) => faces.has(/** @type {any} */ (h).faceId)).map((h) => /** @type {any} */ (h).startVertexId))].map((v) => m.vertices[v].p);
};

describe('ADD_DORMER GABLE (D-258)', () => {
  const m = deepFreeze(gableModel());
  const out = run(m, command(m, 'ADD_DORMER', { roofFaceId: 'f-roof-s', dormerType: 'GABLE', outline: OUTLINE, heightM: 1, ridgeRiseM: 0.8 }));
  const n = node(out.model);

  it('commits a VALID_SOLID; ridge along the fall line (x = 5) at wall top 7.875 + 0.8', () => {
    expect(out.result.status).toBe('COMMITTED');
    expect(out.model.state).toBe('VALID_SOLID');
    expect(maxPlaneDistance(out.model)).toBeLessThanOrEqual(PROFILE.planarTolM);
    const p = pts(out.model, n);
    const top = Math.max(...p.map((q) => q[2]));
    expect(top).toBeCloseTo(8.675, 9);
    for (const q of p.filter((q) => Math.abs(q[2] - 8.675) < 1e-9)) expect(q[0]).toBeCloseTo(5, 9);
    expect(p.filter((q) => Math.abs(q[2] - 8.675) < 1e-9)).toHaveLength(2);
  });

  it('faces and volume: flat part 4.6875 + gable prism 0.5 * 2 * 0.8 * 1.5 = 5.8875 m3; two slopes of 1.5 * sqrt(1.64)', () => {
    const sh = shellOf(out.model, n);
    expect(Math.abs(volume(out.model, sh.faceIds) - 5.8875)).toBeLessThanOrEqual(0.01);
    const roofs = sh.faceIds.filter((/** @type {string} */ f) => out.model.faces[f].surfaceKind === 'RoofSurface');
    expect(roofs).toHaveLength(2);
    for (const f of roofs) expect(faceArea(out.model, f)).toBeCloseTo(1.5 * Math.sqrt(1.64), 9);
    const kinds = sh.faceIds.map((/** @type {string} */ f) => out.model.faces[f].surfaceKind).sort();
    expect(kinds).toEqual(['ClosureSurface', 'RoofSurface', 'RoofSurface', 'WallSurface', 'WallSurface', 'WallSurface', 'WallSurface']);
    const ridge = Object.values(out.model.halfEdges).filter((h) => sh.faceIds.includes(/** @type {any} */ (h).faceId) && /** @type {any} */ (h).edgeRole === 'RIDGE');
    expect(ridge).toHaveLength(2);
  });
});

describe('ADD_CHIMNEY axes, sizes and frame (D-256)', () => {
  const m = deepFreeze(gableModel());

  it('widthM along local x, depthM along local y; top = downhill corner z + h', () => {
    const out = run(m, command(m, 'ADD_CHIMNEY', { roofFaceId: 'f-roof-s', center: [3, 2, 6.5], widthM: 2, depthM: 0.5, heightAboveRoofM: 1.5 }));
    expect(out.result.status).toBe('COMMITTED');
    const p = pts(out.model, node(out.model));
    const xs = p.map((q) => q[0]), ys = p.map((q) => q[1]);
    expect([Math.min(...xs), Math.max(...xs), Math.min(...ys), Math.max(...ys)]).toEqual([2, 4, 1.75, 2.25]);
    expect(Math.max(...p.map((q) => q[2]))).toBeCloseTo(5 + 0.75 * 1.75 + 1.5, 9);
  });

  it('WORLD centre is mapped to local through the building frame (same result as LOCAL)', () => {
    const p = { roofFaceId: 'f-roof-s', center: [5, 2, 6.5], widthM: 1, depthM: 1, heightAboveRoofM: 1 };
    const o = m.frame.originWorld;
    const local = run(m, command(m, 'ADD_CHIMNEY', p));
    const world = run(m, command(m, 'ADD_CHIMNEY', { ...p, center: [5 + o[0], 2 + o[1], 6.5 + o[2]] }, { coordinateFrame: 'WORLD' }));
    expect(world.result.status).toBe('COMMITTED');
    expect(world.result.patch).toEqual(local.result.patch);
  });
});

describe('patch, lineage and REMOVE_INSTALLATION (spec §10.1 Accept 3; D-260)', () => {
  const m = deepFreeze(gableModel());
  const p = { roofFaceId: 'f-roof-s', center: [5, 2, 6.5], widthM: 1, depthM: 1, heightAboveRoofM: 1 };
  const preview = run(m, command(m, 'ADD_CHIMNEY', p, { phase: 'PREVIEW' }));
  const add = run(m, command(m, 'ADD_CHIMNEY', p, { previewId: preview.result.previewId }));

  it('PREVIEW gives the COMMIT patch; the roof face and every building entity stay untouched', () => {
    expect(preview.result.status).toBe('PREVIEW');
    expect(add.result.patch).toEqual(preview.result.patch);
    expect(add.result.patch.updated).toEqual([]);
    expect(add.result.patch.deleted).toEqual([]);
    expect(add.result.topologyLineage).toEqual({ mapped: {}, deleted: [], preserved: [] });
    const added = add.result.patch.added.map((/** @type {any} */ c) => c.type);
    expect(added.filter((/** @type {string} */ t) => t === 'Face')).toHaveLength(6);
    expect(added).toEqual(expect.arrayContaining(['Shell', 'Solid', 'SemanticNode']));
  });

  it('REMOVE deletes exactly the added entities and lists every face, edge and vertex in the lineage', () => {
    const id = node(add.model).id;
    const rm = run(add.model, command(add.model, 'REMOVE_INSTALLATION', { installationId: id }, { commandId: 'c2' }));
    expect(rm.result.status).toBe('COMMITTED');
    const addedIds = add.result.patch.added.map((/** @type {any} */ c) => c.entity.id).sort();
    expect(rm.result.patch.deleted.map((/** @type {any} */ d) => d.id).sort()).toEqual(addedIds);
    const topo = add.result.patch.added.filter((/** @type {any} */ c) => ['Face', 'HalfEdge', 'Vtx'].includes(c.type)).map((/** @type {any} */ c) => c.entity.id).sort();
    expect([...rm.result.topologyLineage.deleted].sort()).toEqual(topo);
    for (const k of ['vertices', 'halfEdges', 'faces', 'shells', 'solids', 'semantics']) expect(/** @type {any} */ (rm.model)[k]).toEqual(/** @type {any} */ (m)[k]);
  });

  it('two installations: removing one keeps the other', () => {
    const second = run(add.model, command(add.model, 'ADD_DORMER', { roofFaceId: 'f-roof-n', dormerType: 'FLAT', outline: [[1, 6, 6.5], [1, 5, 7.25], [3, 5, 7.25], [3, 6, 6.5]], heightM: 0.5 }, { commandId: 'c3' }));
    expect(second.result.status).toBe('COMMITTED');
    const first = node(add.model).id;
    const rm = run(second.model, command(second.model, 'REMOVE_INSTALLATION', { installationId: first }, { commandId: 'c4' }));
    expect(rm.result.status).toBe('COMMITTED');
    expect(rm.model.state).toBe('VALID_SOLID');
    const left = Object.values(rm.model.semantics).filter((s) => /** @type {any} */ (s).kind === 'BuildingInstallation');
    expect(left).toHaveLength(1);
    expect(/** @type {any} */ (left[0]).id).not.toBe(first);
  });
});
