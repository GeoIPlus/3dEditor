// brep (3D-09): half-edge rules, vertex-plane invariant, junctions, re-derivation, serialisation, RTG on the golden
// inputs of fixtures/ (3D-07) and on deliberately broken copies.
import { describe, expect, it } from 'vitest';
import {
  buildIndex, checkTopology, faceRings, inconsistentJunctions, isolatedCopy, loadModel, rederive, roofGraph, saveModel,
  vertexPlaneViolations,
} from '../../src/brep/index.js';
import { TOL, goldenModels, readFixture } from './helpers.js';

const GOLDEN = goldenModels();
const gt03 = () => isolatedCopy(readFixture('GT-03', 'input.model.json'));
const gt07 = () => isolatedCopy(readFixture('GT-07', 'input.model.json')); // the GT-03 gable with derived vertices

describe('half-edge structure (spec §4 rule 7)', () => {
  it.each(GOLDEN.map((g) => [g.gt, g.model]))('%s is structurally sound', (_, model) => {
    expect(checkTopology(model)).toEqual([]);
  });

  it('rings follow nextId; a ring of the GT-03 ground has 4 vertices', () => {
    const m = gt03();
    expect(faceRings(m, buildIndex(m), 'f-ground')).toEqual([['v-b3', 'v-b2', 'v-b1', 'v-b0']]);
  });

  it('reports a broken prev link, an asymmetric twin, a same-direction twin and a missing twin', () => {
    const a = gt03();
    a.halfEdges['he-f-ground-1'].prevId = 'he-f-ground-3';
    expect(checkTopology(a).map((p) => p.kind)).toContain('LINK');

    const b = gt03();
    const he = b.halfEdges['he-f-ground-0'];
    b.halfEdges[/** @type {string} */ (he.twinId)].twinId = 'he-f-ground-2';
    expect(checkTopology(b).map((p) => p.kind)).toContain('TWIN_ASYMMETRIC');

    const c = gt03();
    const h0 = c.halfEdges['he-f-ground-0'];
    const h2 = c.halfEdges['he-f-ground-2'];
    const t0 = /** @type {string} */ (h0.twinId);
    const t2 = /** @type {string} */ (h2.twinId);
    c.halfEdges[t0].twinId = h2.id; c.halfEdges[t2].twinId = h0.id; h0.twinId = t2; h2.twinId = t0;
    expect(checkTopology(c).map((p) => p.kind)).toContain('TWIN_NOT_OPPOSITE');

    const d = gt03();
    const twin = /** @type {string} */ (d.halfEdges['he-f-ground-0'].twinId);
    d.halfEdges['he-f-ground-0'].twinId = null;
    d.halfEdges[twin].twinId = null;
    expect(checkTopology(d).filter((p) => p.kind === 'TWIN_MISSING')).toHaveLength(2);
    d.state = 'DRAFT_SOLID'; // twinId = null is allowed in drafts
    expect(checkTopology(d)).toEqual([]);
  });

  it('reports a ring that does not close and a defining face that does not use the vertex', () => {
    const m = gt03();
    m.vertices['v-b0'].definingFaceIds = ['f-ground', 'f-wall-s', 'f-roof-n'];
    expect(checkTopology(m).map((p) => p.kind)).toEqual(['VERTEX_FACE']);
    const n = gt03();
    n.halfEdges['he-f-ground-3'].nextId = 'he-f-ground-1';
    expect(checkTopology(n).some((p) => p.kind === 'LINK')).toBe(true);
  });
});

describe('vertex-plane invariant (spec §4 rule 4, Accept 2)', () => {
  it.each(GOLDEN.map((g) => [g.gt, g.model]))('%s: every vertex within planarTolM of its defining planes', (gt, model) => {
    const v = vertexPlaneViolations(model, TOL);
    // GT-06 (open boundary draft) and GT-19 (inconsistent node) are imported drafts: off-plane vertices there are
    // imported ones kept at file position (rule 3a), reported by validation, not by the core invariant.
    expect(v.filter((x) => !x.importedKept), gt).toEqual([]);
  });

  it('finds a derived vertex moved off its plane by more than planarTolM, not one within it', () => {
    const m = gt07();
    // v-r0 (0, 4, 8) lies on f-wall-w (x = 0) and both roof planes (normals without x): an x shift moves it off the
    // wall plane only, by exactly the shift.
    m.vertices['v-r0'].p = [0.019, 4, 8];
    expect(vertexPlaneViolations(m, TOL)).toEqual([]);
    m.vertices['v-r0'].p = [0.021, 4, 8];
    const v = vertexPlaneViolations(m, TOL);
    expect(v.length).toBeGreaterThan(0);
    expect(v.every((x) => x.vertexId === 'v-r0' && x.positionMode === 'DERIVED' && !x.importedKept)).toBe(true);
  });
});

describe('INCONSISTENT_JUNCTION (spec §4 rule 5, Accept 3)', () => {
  // A hip apex (0, 0, 5) of four 45-degree planes; plane 4 shifted along its normal by s.
  const s2 = Math.SQRT1_2;
  /** @param {number} shift */
  const hip = (shift) => {
    const m = gt07();
    const planes = [[s2, 0, s2, -5 * s2], [-s2, 0, s2, -5 * s2], [0, s2, s2, -5 * s2], [0, -s2, s2, -5 * s2 - shift]];
    const ids = ['f-ground', 'f-wall-s', 'f-wall-e', 'f-wall-n'];
    ids.forEach((f, i) => { m.faces[f].supportPlane = { normal: [planes[i][0], planes[i][1], planes[i][2]], d: planes[i][3] }; });
    m.vertices['v-b0'].definingFaceIds = ids;
    return m;
  };
  // Measure D-145 (3D-12): spread of the 3-plane points; for this symmetric node it is sqrt(2) x the shift.
  it('spread > topologySnapTolM is reported, <= is not', () => {
    const within = inconsistentJunctions(hip(0.007), TOL, ['v-b0']); // spread 0.0099
    const beyond = inconsistentJunctions(hip(0.008), TOL, ['v-b0']); // spread 0.0113
    expect(within).toEqual([]);
    expect(beyond).toHaveLength(1);
    expect(beyond[0].code).toBe('INCONSISTENT_JUNCTION');
    expect(beyond[0].entityIds[0]).toBe('v-b0');
    expect(beyond[0].residual).toBeGreaterThan(TOL.topologySnapTolM);
  });

  it('three-plane vertices are never junctions; GT-19 shows its 4-plane node', () => {
    expect(inconsistentJunctions(gt07(), TOL)).toEqual([]);
    const gt19 = readFixture('GT-19', 'input.model.json');
    const four = Object.values(gt19.vertices).filter((/** @type {any} */ v) => v.definingFaceIds.length >= 4);
    expect(four.length).toBeGreaterThan(0);
    // D-145: the 0.05 m divergence of GT-19 is an inconsistent junction (spread 0.066 m)
    const j = inconsistentJunctions(gt19, TOL);
    expect(j.map((x) => x.entityIds[0])).toEqual(['v-a']);
    expect(j[0].residual).toBeCloseTo(0.0661, 3);
  });
});

describe('rederive (spec §4 rules 2, 3, 3a; D-70)', () => {
  it('a changed roof plane re-derives its vertices exactly on all their planes', () => {
    const m = gt07();
    const roof = m.faces['f-roof-s'].supportPlane;
    m.faces['f-roof-s'].supportPlane = { normal: roof.normal, d: roof.d - 0.5 }; // shift the south slope by 0.5 m
    const r = rederive(m, ['f-roof-s'], TOL);
    expect(r.offPlane).toEqual([]);
    expect(r.junctions).toEqual([]);
    expect(r.changed.length).toBeGreaterThan(0);
    for (const id of r.changed) expect(m.vertices[id].definingFaceIds).toContain('f-roof-s');
    expect(vertexPlaneViolations(m, { ...TOL, planarTolM: 1e-9 })).toEqual([]);
  });

  it('an imported EXPLICIT vertex becomes DERIVED when one of its faces changes; others keep file positions', () => {
    const m = gt03();
    const untouched = Object.values(m.vertices).filter((v) => !v.definingFaceIds.includes('f-wall-e')).map((v) => [v.id, [...v.p]]);
    const r = rederive(m, ['f-wall-e'], TOL);
    for (const id of r.changed) expect(m.vertices[id].positionMode).toBe('DERIVED');
    for (const [id, p] of untouched) {
      expect(m.vertices[/** @type {string} */ (id)].positionMode).toBe('EXPLICIT');
      expect(m.vertices[/** @type {string} */ (id)].p).toEqual(p);
    }
  });

  it('a vertex with fewer than three independent planes keeps its explicit position and is checked on them', () => {
    const m = gt07();
    m.vertices['v-b0'].definingFaceIds = ['f-ground', 'f-wall-s'];
    expect(rederive(m, ['f-ground'], TOL).offPlane).toEqual([]);
    expect(m.vertices['v-b0'].positionMode).toBe('EXPLICIT');
    m.vertices['v-b0'].p = [0, 0, 0.5];
    const r = rederive(m, ['f-ground'], TOL);
    expect(r.offPlane.map((x) => [x.vertexId, x.faceId])).toEqual([['v-b0', 'f-ground']]);
  });
});

describe('save -> load -> save (spec §4 rule 10, Accept 4)', () => {
  it.each(GOLDEN.map((g) => [g.gt, g.model]))('%s: byte-identical and geometry unchanged', (_, model) => {
    const s1 = saveModel(model);
    const loaded = loadModel(s1);
    expect(saveModel(loaded)).toBe(s1);
    for (const v of Object.values(model.vertices)) expect(loaded.vertices[v.id].p).toEqual(v.p);
    for (const f of Object.values(model.faces)) expect(loaded.faces[f.id].supportPlane).toEqual(f.supportPlane);
  });

  it('is independent of key order, writes -0 as 0 and refuses non-finite numbers', () => {
    expect(saveModel(/** @type {any} */ ({ b: 1, a: [-0, 2] }))).toBe('{"a":[0,2],"b":1}');
    expect(() => saveModel(/** @type {any} */ ({ a: Number.NaN }))).toThrow(/non-finite/);
  });
});

describe('roof topology graph (spec §4 rule 8)', () => {
  it('GT-03 gable: two roof faces adjacent over the ridge; edges reference canonical ids', () => {
    const m = gt03();
    const g = roofGraph(m);
    expect(g.faceIds).toEqual(['f-roof-n', 'f-roof-s']);
    expect(g.adjacency).toEqual({ 'f-roof-n': ['f-roof-s'], 'f-roof-s': ['f-roof-n'] });
    const ridge = g.edges.filter((e) => e.roofRoof);
    expect(ridge).toHaveLength(1);
    expect(ridge[0].edgeRole).toBe(m.halfEdges[ridge[0].halfEdgeId].edgeRole);
    for (const e of g.edges) {
      expect(m.halfEdges[e.halfEdgeId]).toBeDefined();
      for (const v of e.vertexIds) expect(m.vertices[v]).toBeDefined();
    }
    expect(g.components).toEqual({ 'rc-1': ['f-roof-s', 'f-roof-n'] });
  });

  it('is a projection: computing it does not change the model', () => {
    const m = gt03();
    const before = saveModel(m);
    roofGraph(m);
    expect(saveModel(m)).toBe(before);
  });
});
