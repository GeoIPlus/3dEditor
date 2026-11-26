// FIT_PLANE through the service glue (3D-71): `commandPoints` reads the payload selection through the points port of a
// dataset descriptor (D-196) and `executeCommand` fits on those LOCAL points. The GT-20 model is moved to a UTM origin
// so that world != local; the in-memory port holds the GT-20 points in world coordinates.
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { executeCommand, fitPlane } from '@geoiplus/geo-model3d';
import { commandPoints } from '../src/cloud-points.js';
import { inBox } from '../src/ports/points.js';

const root = new URL('../../../', import.meta.url);
const read = (/** @type {string} */ p) => JSON.parse(readFileSync(new URL(p, root), 'utf8'));
const tp = read('contracts/model3d/tolerance-profile.schema.json');
/** @type {any} */
const PROFILE = Object.fromEntries(Object.entries(tp.properties).filter(([, s]) => /** @type {any} */ (s).default !== undefined).map(([k, s]) => [k, /** @type {any} */ (s).default]));
const ORIGIN = [500000, 5600000, 0];
const local = Float64Array.from(read('fixtures/GT-20/input.points.json').points.flat());
const step = read('fixtures/GT-20/steps.json')[0].command;

const model = () => {
  const m = read('fixtures/GT-20/input.model.json');
  m.frame.originWorld = ORIGIN;
  return m;
};
/** @type {any[]} */
const boxes = [];
const world = local.map((c, i) => c + ORIGIN[i % 3]);
const dataset = {
  horizontalCrs: 'EPSG:25832',
  port: {
    queryBox: async (/** @type {any} */ box) => {
      boxes.push(box);
      const out = [];
      for (let i = 0; i < world.length; i += 3) if (inBox(box, world[i], world[i + 1], world[i + 2])) out.push(world[i], world[i + 1], world[i + 2]);
      return Float64Array.from(out);
    },
  },
};

describe('FIT_PLANE command with points from the port (3D-71)', () => {
  it('reads the selection box in world coordinates and commits the LOCAL fit', async () => {
    const m = model();
    const points = await commandPoints(dataset, m, step);
    expect(boxes.at(-1)).toEqual({ min: [500000, 5600000, 2], max: [500010, 5600004, 11] });
    expect(points?.length).toBe(local.length);
    const out = executeCommand(m, step, { toleranceProfile: PROFILE, clock: () => '2026-11-25T00:00:00Z', points });
    expect(out.result.status).toBe('COMMITTED');
    const me = out.result.patch.added[0].entity;
    const ref = /** @type {any} */ (fitPlane(local, step.payload.selection, PROFILE)).result;
    expect(me.fit.inliers).toBe(ref.inlierCount);
    me.geometry.coordinates[0].forEach((/** @type {number} */ c, /** @type {number} */ i) => expect(Math.abs(c - [...ref.plane.normal, ref.plane.d][i])).toBeLessThan(1e-6));
  });

  it('other operations read nothing; a selection without bounds reads nothing and is refused by the kernel', async () => {
    const n = boxes.length;
    expect(await commandPoints(dataset, model(), { ...step, operation: 'SET_SEMANTICS' })).toBeUndefined();
    const bad = { ...step, payload: { apply: 'MEASUREMENT', selection: { kind: 'BOX', min: [0, 0], max: [1, 1, 1] } } };
    const points = await commandPoints(dataset, model(), bad);
    expect(points).toEqual(new Float64Array(0));
    expect(boxes.length).toBe(n);
    const out = executeCommand(model(), bad, { toleranceProfile: PROFILE, clock: () => '2026-11-25T00:00:00Z', points });
    expect(out.result.error.code).toBe('INVALID_PAYLOAD');
  });
});
