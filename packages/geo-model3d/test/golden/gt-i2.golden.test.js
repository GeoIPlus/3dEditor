// GT-I2 (v0.3 §12; spec §13; row 3D-10): the GT-I1 gable with the ridge edge duplicated 0.03 m apart -> DRAFT_SOLID;
// OPEN_BOUNDARY on two edges; model loaded completely. Which edges: the two ridge edges; the two 0.03 m one-face wall
// edges are DEGENERATE_EDGE (< minEdgeLengthM) (D-156, Q-41 closed).
import { describe, expect, it } from 'vitest';
import { importBuilding } from '@geoiplus/geo-model3d';
import { PROFILE, goldenImport } from '../import/helpers.js';

const { cityjson, step, expected } = goldenImport('GT-I2');
const a = expected.assert;
const { model, report } = importBuilding({ cityjson, cityObjectId: step.cityObjectId, toleranceProfile: PROFILE, projectId: 'prj-golden' });
const length = (/** @type {string} */ heId) => {
  const he = model.halfEdges[heId];
  const p = model.vertices[he.startVertexId].p, q = model.vertices[model.halfEdges[he.nextId].startVertexId].p;
  return Math.hypot(p[0] - q[0], p[1] - q[1], p[2] - q[2]);
};

describe('GT-I2 import with a duplicated ridge', () => {
  it('the fixture is the one row 3D-10 owns', () => expect(expected.owner.row).toBe('3D-10'));
  it(`state ${a.state}`, () => {
    expect(model.state).toBe(a.state);
    expect(report.assignedState).toBe(a.state);
  });
  it(`${a.issueCode} on ${a.openBoundaryEdges} edges: the two ridge edges, ${a.gapM} m apart`, () => {
    const open = report.issues.filter((i) => i.code === a.issueCode);
    expect(open.length).toBe(a.openBoundaryEdges);
    const he = open.map((i) => model.halfEdges[i.entityIds[0]]);
    for (const h of he) {
      expect(h.twinId).toBeNull();
      expect(length(h.id)).toBeCloseTo(10, 9);
      expect(model.faces[h.faceId].surfaceKind).toBe('RoofSurface');
    }
    const ys = he.map((h) => model.vertices[h.startVertexId].p[1]).sort((x, y) => x - y);
    expect(ys[1] - ys[0]).toBeCloseTo(a.gapM, 9);
  });
  it('the two 0.03 m one-face wall edges are DEGENERATE_EDGE, not OPEN_BOUNDARY (D-156)', () => {
    const deg = report.issues.filter((i) => i.code === 'DEGENERATE_EDGE');
    expect(deg.length).toBe(2);
    for (const i of deg) {
      expect(model.halfEdges[i.entityIds[0]].twinId).toBeNull();
      expect(length(i.entityIds[0])).toBeLessThan(PROFILE.minEdgeLengthM);
    }
    // + one SHELL_NOT_CLOSED on the open shell: import takes its issues from validate (3D-75, D-184)
    const shell = report.issues.filter((i) => i.code === 'SHELL_NOT_CLOSED');
    expect(shell.map((i) => i.entityIds)).toEqual(Object.keys(model.shells).map((id) => [id]));
    expect(report.issues.length).toBe(5);
  });
  it('the model is loaded completely: every input surface is a face, nothing dropped', () => {
    const surfaces = cityjson.CityObjects[step.cityObjectId].geometry[0].boundaries[0].length;
    expect(a.fullyLoaded).toBe(true);
    expect(Object.keys(model.faces).length).toBe(surfaces);
    expect(report.warnings).toEqual([]);
  });
});
