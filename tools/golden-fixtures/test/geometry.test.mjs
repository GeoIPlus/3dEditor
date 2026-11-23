// 3D-07: fixture inputs and the §12 reference shapes agree with the expected numbers, by independent math (v0.2 F.3).

import { describe, expect, it } from 'vitest';
import { flat, gable, hip, rebase, shed, translate } from '../geom.mjs';
import { area, cityJsonSurfaces, dot, fitZ, metrics, modelEdges, modelFaces, norm, planeDist, read, volume } from './math.mjs';

const near = (/** @type {number} */ a, /** @type {number} */ b, tol = 0.01) => expect(Math.abs(a - b), `${a} vs ${b}`).toBeLessThanOrEqual(tol);
const ex = (/** @type {string} */ gt) => read(`fixtures/${gt}/expected.json`).assert;
const model = (/** @type {string} */ gt, f = 'input.model.json') => read(`fixtures/${gt}/${f}`);
/** Metrics of a reference polyhedron, from its coordinates. @param {import('../geom.mjs').Poly} p */
const polyMetrics = (p) => {
  const rings = p.faces.map((f) => f.ring.map((v) => p.vertices[v]));
  const roof = p.faces.filter((f) => f.kind === 'RoofSurface').reduce((s, f) => s + area(f.ring.map((v) => p.vertices[v])), 0);
  return { roofArea: roof, volume: volume(rings), roofFaces: p.faces.filter((f) => f.kind === 'RoofSurface').length };
};
const SOUTH = { normal: [0, -0.6, 0.8], d: -4 }; // z = 5 + 0.75 y

describe('import inputs (CityJSON)', () => {
  it('GT-I1: 7 faces, 10 vertices, 15 edges, 2 roof surfaces, 520 m3, roof 100 m2', () => {
    const s = cityJsonSurfaces(read('fixtures/GT-I1/input.cityjson.json'));
    const e = ex('GT-I1');
    const edges = new Set(s.flatMap((/** @type {any} */ f) => f.idx.map((/** @type {number} */ a, /** @type {number} */ i) => {
      const b = f.idx[(i + 1) % f.idx.length]; return a < b ? `${a}|${b}` : `${b}|${a}`;
    })));
    expect(s.length).toBe(e.faces);
    expect(new Set(s.flatMap((/** @type {any} */ f) => f.idx)).size).toBe(e.vertices);
    expect(edges.size).toBe(e.edges);
    expect(s.filter((/** @type {any} */ f) => f.type === 'RoofSurface').length).toBe(e.roofSurfaces);
    near(volume(s.map((/** @type {any} */ f) => f.pts)), e.volumeM3);
    near(s.filter((/** @type {any} */ f) => f.type === 'RoofSurface').reduce((/** @type {number} */ a, /** @type {any} */ f) => a + area(f.pts), 0), e.roofAreaM2);
  });

  it('GT-I2: four single-face edges - two 10 m ridge edges 0.03 m apart, two 0.03 m wall edges', () => {
    const s = cityJsonSurfaces(read('fixtures/GT-I2/input.cityjson.json'));
    /** @type {Map<string, { n: number, a: number[], b: number[] }>} */
    const edges = new Map();
    for (const f of s) f.idx.forEach((/** @type {number} */ a, /** @type {number} */ i) => {
      const b = f.idx[(i + 1) % f.idx.length]; const k = a < b ? `${a}|${b}` : `${b}|${a}`;
      edges.set(k, { n: (edges.get(k)?.n ?? 0) + 1, a: f.pts[i], b: f.pts[(i + 1) % f.pts.length] });
    });
    const open = [...edges.values()].filter((e) => e.n === 1).map((e) => Math.round(norm([e.b[0] - e.a[0], e.b[1] - e.a[1], e.b[2] - e.a[2]]) * 1000) / 1000).sort();
    expect(open).toEqual([0.03, 0.03, 10, 10]);
    expect(s.length).toBe(7);
  });

  it('GT-I3: 4 roof triangles, coplanar in pairs, roof 100 m2', () => {
    const roofs = cityJsonSurfaces(read('fixtures/GT-I3/input.cityjson.json')).filter((/** @type {any} */ f) => f.type === 'RoofSurface');
    expect(roofs.map((/** @type {any} */ f) => f.pts.length)).toEqual([3, 3, 3, 3]);
    for (const [i, j] of [[0, 1], [2, 3]]) for (const p of roofs[j].pts) {
      const [a, b, c] = roofs[i].pts;
      const n = [(b[1] - a[1]) * (c[2] - a[2]) - (b[2] - a[2]) * (c[1] - a[1]), (b[2] - a[2]) * (c[0] - a[0]) - (b[0] - a[0]) * (c[2] - a[2]), (b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0])];
      expect(Math.abs(dot(n, [p[0] - a[0], p[1] - a[1], p[2] - a[2]]) / norm(n))).toBeLessThan(1e-9);
    }
    near(roofs.reduce((/** @type {number} */ s, /** @type {any} */ f) => s + area(f.pts), 0), 100);
  });

  it('GT-I4 input equals GT-I1', () => {
    expect(read('fixtures/GT-I4/input.cityjson.json')).toEqual(read('fixtures/GT-I1/input.cityjson.json'));
  });
});

describe('model inputs', () => {
  it('GT-03 result (input of GT-07..GT-18): 520 m3, roof 100 m2, 1 ridge, 2 eaves, 4 rakes, 7 faces, 10 vertices, 15 edges', () => {
    const m = model('GT-07');
    const g = metrics(m);
    near(g.volume, 520); near(g.roofArea, 100);
    const roles = /** @type {Record<string, number>} */ ({});
    for (const hs of modelEdges(m).values()) roles[hs[0].edgeRole] = (roles[hs[0].edgeRole] ?? 0) + 1;
    expect(roles).toMatchObject(ex('GT-I1').edgeRoles);
    expect([Object.keys(m.faces).length, Object.keys(m.vertices).length, modelEdges(m).size]).toEqual([7, 10, 15]);
    for (const f of modelFaces(m).filter((x) => x.id === 'f-roof-s')) for (const p of f.pts) expect(Math.abs(planeDist(p, SOUTH))).toBeLessThan(1e-9);
  });

  it('GT-01..GT-04 start from the imported gable (D-3D07-2); GT-05 L block 56 m2 x 5 = 280 m3 with 6 corners', () => {
    for (const gt of ['GT-01', 'GT-02', 'GT-03', 'GT-04']) { const g = metrics(model(gt)); near(g.volume, 520); near(g.roofArea, 100); }
    const l = model('GT-05');
    expect(l.footprints['fp-1'].outerRing).toHaveLength(6);
    near(metrics(l).volume, 280);
  });

  it('GT-06: the two ridge half-edges are open, 0.03 m apart; leading plane z = 5 + 0.75 y', () => {
    const m = model('GT-06');
    const ids = read('fixtures/GT-06/steps.json')[0].command.payload.edgeIds;
    const ys = ids.map((/** @type {string} */ id) => { expect(m.halfEdges[id].twinId).toBeNull(); return m.vertices[m.halfEdges[id].startVertexId].p[1]; });
    near(Math.abs(ys[0] - ys[1]), 0.03, 1e-9);
    expect(m.faces['f-roof-s'].supportPlane).toEqual(SOUTH);
    expect(m.state).toBe('DRAFT_SOLID');
  });

  it('GT-08 split line, GT-17 chimney centre and GT-18 dormer outline lie on the south slope; GT-09 target is off the planes', () => {
    const step = (/** @type {string} */ gt) => read(`fixtures/${gt}/steps.json`)[0].command.payload;
    for (const p of [...step('GT-08').splitLine, step('GT-17').center, ...step('GT-18').outline]) expect(Math.abs(planeDist(p, SOUTH))).toBeLessThan(1e-9);
    expect(Math.abs(planeDist(step('GT-09').targetLine[0], SOUTH))).toBeGreaterThan(0.02);
  });

  it('GT-10: the fixed vertex sits at its target; GT-11: the south plane cannot close the north hole', () => {
    const m = model('GT-10');
    const c = Object.values(m.constraints)[0];
    expect(m.vertices[c.entityIds[0]].p).toEqual(c.target);
    expect(read('fixtures/GT-10/steps.json')[0].command.payload.targetPoint).not.toEqual(c.target);
    expect(5 + 0.75 * 8).toBe(11); // south plane at the north eave y = 8, vs eave z = 5
  });

  it('GT-19: S, N, W meet at the apex; E is 0.05 m above it (residual > topologySnapTolM 0.01)', () => {
    for (const f of ['input.model.json', 'input.model.fixed.json']) {
      const m = model('GT-19', f);
      const apex = m.vertices['v-a'].p;
      for (const id of ['f-roof-s', 'f-roof-n', 'f-roof-w']) expect(Math.abs(planeDist(apex, m.faces[id].supportPlane))).toBeLessThan(1e-9);
      const e = m.faces['f-roof-e'].supportPlane;
      const zOnE = -(e.d + e.normal[0] * apex[0] + e.normal[1] * apex[1]) / e.normal[2];
      near(zOnE - apex[2], ex('GT-19').divergenceM, 1e-9);
      expect(Math.abs(planeDist(apex, e))).toBeGreaterThan(0.01);
    }
    expect(Object.keys(model('GT-19', 'input.model.fixed.json').constraints)).toHaveLength(3);
  });

  it('GT-24: exactly one DRAFT_SOLID with an open shell', () => {
    const ms = ['a', 'b', 'c'].map((k) => model('GT-24', `input.model.bld-gt-24-${k}.json`));
    expect(ms.map((m) => [m.state, m.shells['sh-1'].isClosed])).toEqual([['VALID_SOLID', true], ['DRAFT_SOLID', false], ['VALID_SOLID', true]]);
    expect(ms[1].buildingId).toBe(ex('GT-24').skipped);
  });

  it('GT-22, GT-23: actors and assignments', () => {
    const c22 = read('fixtures/GT-22/input.context.json');
    expect(c22.actors.find((/** @type {any} */ a) => a.id === 'usr-operator').roles).not.toContain('3dqm.qa');
    const c23 = read('fixtures/GT-23/input.context.json');
    expect(c23.assignments.flatMap((/** @type {any} */ a) => a.buildingIds)).not.toContain('bld-gt-23');
  });

  it('GT-25: world points minus originWorld equal the local vertices within 1e-6 m', () => {
    const m = model('GT-25');
    const o = m.frame.originWorld;
    const w = read('fixtures/GT-25/input.world.json').points;
    expect(o[1]).toBeGreaterThan(5e6);
    Object.values(m.vertices).forEach((/** @type {any} */ v, i) => v.p.forEach((/** @type {number} */ c, /** @type {number} */ k) => near(w[i][k] - o[k], c, 1e-6)));
  });
});

describe('reference shapes of the §12 expected values', () => {
  const rect = /** @type {import('../geom.mjs').P2[]} */ ([[0, 0], [10, 0], [10, 8], [0, 8]]);
  it('GT-01 flat Z = 5: roof 80, volume 400', () => { const g = polyMetrics(flat(rect, 0, 5)); near(g.roofArea, ex('GT-01').roofAreaM2); near(g.volume, ex('GT-01').volumeM3); });
  it('GT-02 shed 5 -> 8: roof 85.440, volume 520, 1 face', () => { const g = polyMetrics(shed()); near(g.roofArea, ex('GT-02').roofAreaM2); near(g.volume, ex('GT-02').volumeM3); expect(g.roofFaces).toBe(1); });
  it('GT-03 gable: roof 100, volume 520, 2 faces', () => { const g = polyMetrics(gable()); near(g.roofArea, 100); near(g.volume, 520); expect(g.roofFaces).toBe(ex('GT-03').roofFaces); });
  it('GT-04 hip: ridge Z 8 length 2, 4 slopes, roof 100, volume 488', () => {
    const h = hip();
    const g = polyMetrics(h);
    near(g.roofArea, ex('GT-04').roofAreaM2); near(g.volume, ex('GT-04').volumeM3); expect(g.roofFaces).toBe(ex('GT-04').roofFaces);
    expect(h.vertices.r0[2]).toBe(ex('GT-04').ridgeZ);
    expect(h.vertices.r1[0] - h.vertices.r0[0]).toBe(ex('GT-04').ridgeLengthM);
  });
  it('GT-07 ridge 8.5: roof 106.301, volume 540', () => { const g = polyMetrics(gable({ ridge: 8.5 })); near(g.roofArea, ex('GT-07').roofAreaM2); near(g.volume, ex('GT-07').volumeM3); });
  it('GT-14 overhang 0.5: roof 112.5, edge Z 4.625, footprint 80', () => {
    const z = ex('GT-14').overhangEdgeZ;
    const s = [[0, -0.5, z], [10, -0.5, z], [10, 4, 8], [0, 4, 8]];
    expect(Math.abs(planeDist(s[0], SOUTH))).toBeLessThan(1e-12);
    near(2 * area(s), ex('GT-14').roofAreaM2);
    near(area([[0, 0, 0], [10, 0, 0], [10, 8, 0], [0, 8, 0]]), ex('GT-14').footprintAreaM2);
  });
  it('GT-15 base -1: volume 600, roof 100', () => { const g = polyMetrics(rebase(gable(), 0, -1)); near(g.volume, ex('GT-15').volumeM3); near(g.roofArea, ex('GT-15').roofAreaM2); });
  it('GT-16 translation keeps volume and roof area', () => { const g = polyMetrics(translate(gable(), [100, 50, 2])); near(g.volume, 520); near(g.roofArea, 100); });
});

describe('point sets', () => {
  const pts = read('fixtures/GT-20/input.points.json').points;
  const out = new Set(read('fixtures/GT-20/truth.points.json').outlierIndices);
  const inl = pts.filter((/** @type {any} */ _, /** @type {number} */ i) => !out.has(i));

  it('GT-20: 500 points, inlier ratio >= 0.85, LSQ normal within 0.2 deg, RMSE <= 0.015 m', () => {
    const e = ex('GT-20');
    expect(pts).toHaveLength(e.points);
    expect(inl.length / pts.length).toBeGreaterThanOrEqual(e.inlierRatioMin);
    const { a, b, c } = fitZ(inl);
    const n = [-a, -b, 1]; const n0 = [0, -0.75, 1];
    const deg = (Math.acos(Math.min(1, dot(n, n0) / (norm(n) * norm(n0)))) * 180) / Math.PI;
    expect(deg).toBeLessThanOrEqual(e.normalDeviationDegMax);
    const rmse = Math.sqrt(inl.reduce((/** @type {number} */ s, /** @type {number[]} */ p) => s + ((p[2] - a * p[0] - b * p[1] - c) / norm(n)) ** 2, 0) / inl.length);
    expect(rmse).toBeLessThanOrEqual(e.rmseMMax);
    for (const i of out) expect(Math.abs(planeDist(pts[i], SOUTH))).toBeGreaterThan(1.0); // beyond heatmapBufferM (D-3D07-4)
  });

  it('GT-21: in-buffer points have mean normal distance 0.080 +/- 0.005 m to the south slope', () => {
    const shifted = read('fixtures/GT-21/input.points.json').points;
    const inBuffer = shifted.filter((/** @type {number[]} */ p) => Math.abs(planeDist(p, SOUTH)) <= 1.0);
    expect(inBuffer).toHaveLength(inl.length);
    const mean = inBuffer.reduce((/** @type {number} */ s, /** @type {number[]} */ p) => s + planeDist(p, SOUTH), 0) / inBuffer.length;
    near(mean, ex('GT-21').meanSlopeDeviationM, ex('GT-21').toleranceM);
  });
});
