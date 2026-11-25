// 3D-12: false-positive guard - the golden inputs (3D-07) validated in their own state with the full solid check.
// VALID_SOLID inputs must have no issue at all; the draft inputs show exactly the defects their READMEs describe.
import { describe, it, expect } from 'vitest';
import { readdirSync } from 'node:fs';
import { join } from 'node:path';
import { validate, readFixture, TOLS } from './helpers.js';
import { FIXTURES } from '../brep/helpers.js';

const inputs = readdirSync(FIXTURES).filter((d) => d.startsWith('GT-')).sort()
  .flatMap((gt) => readdirSync(join(FIXTURES, gt)).filter((f) => /^input\.model.*\.json$/.test(f)).sort().map((file) => ({ gt, file })));

/** Draft inputs and the codes they carry on purpose (fixture READMEs, 3D-07). */
const DRAFTS = {
  // GT-I2 shape: ridge duplicated with a 0.03 m gap -> open ridge and gable tops, 0.03 m gable edges (< minEdgeLengthM)
  'GT-06/input.model.json': ['OPEN_BOUNDARY', 'SHELL_NOT_CLOSED', 'DEGENERATE_EDGE'],
  'GT-24/input.model.bld-gt-24-b.json': ['OPEN_BOUNDARY', 'SHELL_NOT_CLOSED', 'DEGENERATE_EDGE'],
  // 4-plane apex, east slope 0.05 m off: spread 0.066 m > topologySnapTolM (D-152); normal distance 0.0398 m > planarTolM
  'GT-19/input.model.json': ['INCONSISTENT_JUNCTION', 'NON_PLANAR_FACE'],
  'GT-19/input.model.fixed.json': ['INCONSISTENT_JUNCTION', 'NON_PLANAR_FACE'],
};

describe('golden inputs', () => {
  it('finds every input model', () => expect(inputs.length).toBe(28));

  for (const { gt, file } of inputs) {
    it(`${gt}/${file}`, async () => {
      const m = readFixture(gt, file);
      const r = await validate(m, { mode: 'COMMIT_VALIDATION', targetState: m.state, fullSolid: true });
      const got = [...new Set(r.issues.map((/** @type {any} */ i) => i.code))];
      const want = /** @type {any} */ (DRAFTS)[`${gt}/${file}`];
      if (m.state === 'VALID_SOLID') {
        expect(want).toBeUndefined();
        expect(r.issues).toEqual([]);
        expect(r.isValidForTargetState).toBe(true);
      } else {
        expect(got).toEqual(want);
      }
    });
  }
});

// D-156 (Q-41; 3D-75): on the GT-I2 shape OPEN_BOUNDARY lies on the two ridge half-edges only; the 0.03 m one-face
// gable edges (< minEdgeLengthM) are DEGENERATE_EDGE, not OPEN_BOUNDARY.
describe('GT-I2 shape: open ridge, degenerate gable edges (D-156)', () => {
  for (const [gt, file] of [['GT-06', 'input.model.json'], ['GT-24', 'input.model.bld-gt-24-b.json']]) {
    it(`${gt}/${file}`, async () => {
      const m = readFixture(gt, file);
      const r = await validate(m, { mode: 'COMMIT_VALIDATION', targetState: m.state, fullSolid: true });
      /** @param {string} h */
      const len = (h) => {
        const he = m.halfEdges[h];
        const p = m.vertices[he.startVertexId].p, q = m.vertices[m.halfEdges[he.nextId].startVertexId].p;
        return Math.hypot(p[0] - q[0], p[1] - q[1], p[2] - q[2]);
      };
      const open = r.issues.filter((/** @type {any} */ i) => i.code === 'OPEN_BOUNDARY').map((/** @type {any} */ i) => i.entityIds[0]);
      expect(open.length).toBe(2);
      for (const h of open) {
        expect(m.halfEdges[h].twinId).toBeNull();
        expect(m.faces[m.halfEdges[h].faceId].surfaceKind).toBe('RoofSurface');
        expect(len(h)).toBeGreaterThanOrEqual(TOLS.minEdgeLengthM);
      }
      const deg = r.issues.filter((/** @type {any} */ i) => i.code === 'DEGENERATE_EDGE').map((/** @type {any} */ i) => i.entityIds[0]);
      expect(deg.length).toBe(2);
      for (const h of deg) {
        expect(m.halfEdges[h].twinId).toBeNull();
        expect(len(h)).toBeCloseTo(0.03, 9);
      }
    });
  }
});
