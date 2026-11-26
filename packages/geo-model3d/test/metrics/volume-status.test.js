// volumeStatus FINAL / PROVISIONAL / NOT_AVAILABLE (3D-116; D-3D116-2): VOL-01..VOL-20 of the owner's list. Defective
// models come from the validate test builders (test/validate/helpers.js); a fresh check decides, never `state` alone.
import { describe, expect, it } from 'vitest';
import { canonicalJson } from '@geoiplus/geo-model3d';
import { deepFreeze } from '../brep/helpers.js';
import { golden, addPolyhedron, addTetra, reverseFace } from '../validate/helpers.js';
import { envelopeRun } from '../golden/envelope.golden.helpers.js';
import { metricsOf, withOverhang, gableModel, EAVE, expectSameMetrics } from './helpers.js';

const gt14 = () => withOverhang(gableModel(), [EAVE.s, EAVE.n], 0.5);
const status = (/** @type {any} */ m) => metricsOf(m).volumeStatus;
/** @param {any} r */
const allNull = (r) => expect([r.mainVolumeM3, r.overhangVolumeM3, r.geometricSolidVolumeM3]).toEqual([null, null, null]);
/** GT-03 with an extra closed tetra solid (a separate body of the building, not an installation). @param {Record<string, number[]>} pts */
function withBody(pts) {
  const m = golden('GT-03');
  m.shells['x-sh'] = { id: 'x-sh', faceIds: [], intendedRole: 'OUTER', isClosed: true };
  m.solids['x-so'] = { id: 'x-so', outerShellId: 'x-sh', voidShellIds: [] };
  addTetra(m, 'x-sh', 'x', pts);
  return m;
}
/** @param {any} m @param {string} s */
const withState = (m, s) => ({ ...m, state: s });

describe('FINAL and PROVISIONAL (VOL-01..VOL-05, VOL-12, VOL-14, VOL-20)', () => {
  it('VOL-01: VALID_SOLID without issues -> FINAL', () => expect(status(gableModel())).toBe('FINAL'));
  it('VOL-02: APPROVED without issues -> FINAL', () => expect(status(withState(gableModel(), 'APPROVED'))).toBe('FINAL'));
  it('VOL-03: DRAFT_SOLID with a proven closed shell -> PROVISIONAL', () => expect(status(withState(gableModel(), 'DRAFT_SOLID'))).toBe('PROVISIONAL'));

  it('VOL-04: GT-14 before 3D-117 -> DRAFT_SOLID, PROVISIONAL, 521.875 m3', () => {
    const r = metricsOf(envelopeRun('GT-14', { targetState: 'DRAFT_SOLID' }).commit.model);
    expect([r.state, r.volumeStatus]).toEqual(['DRAFT_SOLID', 'PROVISIONAL']);
    expect(r.geometricSolidVolumeM3).toBeCloseTo(521.875, 9);
  });

  // BLOCKED_BY_VALIDATOR_DEPENDENCY 3D-117 (D-343), like CAP-01: turns red - to be switched to `it` - once 3D-117 is merged.
  it.fails('VOL-05: GT-14 after 3D-117 -> VALID_SOLID, FINAL, 521.875 m3', () => {
    const r = metricsOf(envelopeRun('GT-14').commit.model);
    expect([r.state, r.volumeStatus]).toEqual(['VALID_SOLID', 'FINAL']);
    expect(r.geometricSolidVolumeM3).toBeCloseTo(521.875, 9);
  });

  it('VOL-12: small valid faces below minFaceAreaM2 (DEGENERATE_FACE by policy) keep a PROVISIONAL volume', () => {
    const m = withBody({ y0: [20, 0, 0], y1: [20.2, 0, 0], y2: [20, 0.2, 0], y3: [20, 0, 0.2] });
    const r = metricsOf(withState(m, 'DRAFT_SOLID'));
    expect(r.volumeStatus).toBe('PROVISIONAL');
    expect(r.geometricSolidVolumeM3).toBeCloseTo(520 + 0.008 / 6, 9);
    expect(status(m)).toBe('PROVISIONAL'); // stored VALID_SOLID, but the fresh check finds errors: never FINAL
  });

  it('VOL-14: a violated hard constraint on a DRAFT_SOLID with a proven shell -> PROVISIONAL', () => {
    const m = withState(gableModel(), 'DRAFT_SOLID');
    m.constraints = { 'c-1': { id: 'c-1', kind: 'FIXED_POINT', entityIds: ['v-r0'], hard: true, target: [0, 0, 0] } };
    expect(status(m)).toBe('PROVISIONAL');
  });

  it('VOL-20: PROVISIONAL -> FINAL on unchanged geometry keeps every number', () => {
    expectSameMetrics({ ...metricsOf(withState(gableModel(), 'DRAFT_SOLID')), volumeStatus: 'FINAL' }, metricsOf(gableModel()), 0);
  });
});

describe('NOT_AVAILABLE (VOL-06..VOL-11, VOL-13, VOL-15)', () => {
  /** @type {Array<[string, () => any]>} */
  const cases = [
    ['VOL-06: open shell', () => {
      const m = golden('GT-03');
      m.halfEdges['he-f-roof-s-2'].twinId = null; m.halfEdges['he-f-roof-n-2'].twinId = null;
      return m;
    }],
    ['VOL-07: DRAFT_SURFACE', () => withState(gableModel(), 'DRAFT_SURFACE')],
    ['VOL-08: closed but non-manifold (a fin on the ridge)', () => {
      const m = golden('GT-03');
      addPolyhedron(m, 'sh-1', 'fin', { 'v-fin': [5, 4, 10] }, [['v-r1', 'v-r0', 'v-fin']]);
      return m;
    }],
    ['VOL-09: self-intersecting closed shell (a tetra piercing the south slope)', () => {
      const m = golden('GT-03');
      addTetra(m, 'sh-1', 'ts', { s0: [5, 2, 6], s1: [5, 2.5, 10], s2: [6, 1.5, 10], s3: [4, 1.5, 10] });
      return m;
    }],
    ['VOL-10: inconsistent orientation (every face reversed)', () => {
      const m = golden('GT-03');
      Object.keys(m.faces).forEach((f) => reverseFace(m, f));
      return m;
    }],
    ['VOL-11: mathematical degeneracy (a body with a zero-area face)', () => withBody({ z0: [20, 0, 0], z1: [21, 0, 0], z2: [22, 0, 0], z3: [20, 0, 1] })],
    ['VOL-13: numerical instability (coordinates that overflow the sums)', () => withBody({ w0: [1e200, 0, 0], w1: [3e200, 0, 0], w2: [1e200, 2e200, 0], w3: [1e200, 0, 2e200] })],
  ];
  for (const [name, build] of cases) {
    it(`${name} -> NOT_AVAILABLE, all three volumes null (VOL-15)`, () => {
      const r = metricsOf(build());
      expect(r.volumeStatus).toBe('NOT_AVAILABLE');
      allNull(r);
    });
  }
});

describe('contract and read-only (VOL-16..VOL-19)', () => {
  it('VOL-16: no overhang -> overhangVolumeM3 = 0 with a proven split', () => {
    expect(metricsOf(gableModel()).overhangVolumeM3).toBe(0);
  });

  it('VOL-17: every status satisfies metrics-result (checked in metricsOf)', () => {
    expect(new Set([gableModel(), gt14(), withState(gableModel(), 'DRAFT_SURFACE')].map(status))).toEqual(new Set(['FINAL', 'PROVISIONAL', 'NOT_AVAILABLE']));
  });

  it('VOL-18: computeMetrics changes neither state, version nor anything else of the model', () => {
    const m = deepFreeze(gt14()), before = canonicalJson(m);
    metricsOf(m);
    expect(canonicalJson(m)).toBe(before);
    expect([m.state, m.version]).toEqual(['DRAFT_SOLID', 2]);
  });

  it('VOL-19: a stale VALID_SOLID label never gives FINAL (GT-14 relabelled -> PROVISIONAL; open shell -> N/A)', () => {
    expect(status(withState(gt14(), 'VALID_SOLID'))).toBe('PROVISIONAL');
    const open = golden('GT-03');
    open.halfEdges['he-f-roof-s-2'].twinId = null; open.halfEdges['he-f-roof-n-2'].twinId = null;
    expect(status(withState(open, 'VALID_SOLID'))).toBe('NOT_AVAILABLE');
  });
});
