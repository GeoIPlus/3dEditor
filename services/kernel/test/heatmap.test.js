// Heatmap request and FIT_PLANE points through the handler (3D-110; spec §9 r6, r8; D-196, D-197, D-3D110-5): the
// building's opened point dataset `{ port, horizontalCrs }`; a dataset on another datum -> 422 INVALID_CRS with
// `details.crsReason` DATUM_MISMATCH, model unchanged. GT-20 (EPSG:25832, ETRS89) moved to a UTM origin, its points
// held by an in-memory port in world coordinates.
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { deviationStats } from '@geoiplus/geo-model3d';
import { inBox } from '../src/ports/points.js';
import { contractValid, PROFILE } from './commit-helpers.js';
import { handlerWith, headers, post, json } from './handler-helpers.js';

const root = new URL('../../../', import.meta.url);
const read = (/** @type {string} */ p) => JSON.parse(readFileSync(new URL(p, root), 'utf8'));
const ORIGIN = [500000, 5600000, 0];
const local = Float64Array.from(read('fixtures/GT-20/input.points.json').points.flat());
const world = local.map((c, i) => c + ORIGIN[i % 3]);
const step = read('fixtures/GT-20/steps.json')[0].command;
const model = () => {
  const m = read('fixtures/GT-20/input.model.json');
  m.frame.originWorld = ORIGIN;
  return m;
};
const port = {
  queryBox: async (/** @type {any} */ box) => {
    const out = [];
    for (let i = 0; i < world.length; i += 3) if (inBox(box, world[i], world[i + 1], world[i + 2])) out.push(world[i], world[i + 1], world[i + 2]);
    return Float64Array.from(out);
  },
};
/** @param {string} horizontalCrs */
const withCrs = (horizontalCrs) => ({ pointsDataset: () => ({ port, horizontalCrs }) });
const SEL = { kind: 'BOX', min: [-1, -1, -1], max: [11, 5, 12] };
const URL_OF = (/** @type {any} */ m) => `/api/projects/${m.projectId}/heatmap`;
const request = (/** @type {any} */ m) => ({ buildingId: m.buildingId, modelVersion: m.version, selection: SEL, thresholdM: 0.05 });

describe('heatmap request (spec §9 r6, D-196)', () => {
  it('dataset in the building CRS -> heatmap-result equal to the kernel on the LOCAL points', async () => {
    const m = model();
    const { handle } = await handlerWith(m, withCrs('EPSG:25832'));
    const r = json(await handle(post(URL_OF(m), request(m), headers('tok-qa', null))));
    expect(r.status).toBe(200);
    contractValid('heatmap-result', r.body);
    const want = /** @type {any} */ (deviationStats(m, local, /** @type {any} */ (request(m)), PROFILE)).result;
    // the port path maps world -> LOCAL (5.6e6 m origin): values agree to rounding, counts exactly
    expect(r.body.faces.map((/** @type {any} */ f) => [f.faceId, f.pointCount])).toEqual(want.faces.map((/** @type {any} */ f) => [f.faceId, f.pointCount]));
    expect(r.body.summary.pointCount).toBe(want.summary.pointCount);
    expect(r.body.summary.shareBeyondThreshold).toBe(want.summary.shareBeyondThreshold);
    for (const k of ['rmseM', 'maxAbsM']) expect(Math.abs(r.body.summary[k] - want.summary[k])).toBeLessThan(1e-9);
    expect(r.body.summary.pointCount).toBeGreaterThan(0);
  });

  it('Accept: a dataset whose horizontalCrs is on another datum -> 422 INVALID_CRS (DATUM_MISMATCH)', async () => {
    const m = model();
    const { handle } = await handlerWith(m, withCrs('EPSG:32632'));  // WGS 84 / UTM 32N over an ETRS89 building
    const r = json(await handle(post(URL_OF(m), request(m), headers('tok-op', null))));
    expect(r.status).toBe(422);
    contractValid('error', r.body);
    expect(r.body).toMatchObject({ code: 'INVALID_CRS', httpStatus: 422, messageKey: 'model3d.error.invalidCrs', details: { crsReason: 'DATUM_MISMATCH' } });
  });

  it('no dataset opened, unknown version -> 404; invalid request (no thresholdM) -> 400; no token -> 401', async () => {
    const m = model();
    const none = await handlerWith(m);
    expect(json(await none.handle(post(URL_OF(m), request(m), headers('tok-op', null)))).status).toBe(404);
    const { handle } = await handlerWith(m, withCrs('EPSG:25832'));
    expect(json(await handle(post(URL_OF(m), { ...request(m), modelVersion: 9 }, headers('tok-op', null)))).status).toBe(404);
    const { thresholdM, ...noThreshold } = request(m);
    expect(json(await handle(post(URL_OF(m), noThreshold, headers('tok-op', null)))).body.code).toBe('INVALID_PAYLOAD');
    expect(json(await handle(post(URL_OF(m), request(m), {}))).status).toBe(401);
  });
});

describe('FIT_PLANE points through the handler (D-196, D-3D110-5)', () => {
  it('same datum: COMMITTED; another datum: 422 INVALID_CRS, nothing committed', async () => {
    const good = await handlerWith(model(), withCrs('EPSG:25832'));
    const ok = json(await good.handle(post(URL_OF(model()).replace('heatmap', 'commands'), step, headers('tok-op'))));
    expect(ok.body).toMatchObject({ status: 'COMMITTED', modelVersion: 2 });
    const bad = await handlerWith(model(), withCrs('EPSG:32632'));
    const r = json(await bad.handle(post(URL_OF(model()).replace('heatmap', 'commands'), step, headers('tok-op'))));
    expect(r.status).toBe(422);
    expect(r.body).toMatchObject({ code: 'INVALID_CRS', details: { crsReason: 'DATUM_MISMATCH' } });
    expect(await bad.history.readJournal('prj-golden', 'bld-gt-20')).toEqual([]);
  });
});
