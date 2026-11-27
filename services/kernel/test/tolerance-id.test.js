// Tolerance profile identity by content (3D-135; D-473): the test vector of the canonical form (D-13 defaults; the
// hex was computed independently with `printf '%s' <canonical> | sha256sum`), label and key order do not change the
// id, one changed tolerance does; GT-I1 imported through the handler with a profile without `id` -> 201 and the model
// names the content id.
import { describe, expect, it } from 'vitest';
import { canonicalTolerances, TOLERANCE_MEMBERS, toleranceProfileId } from '../src/tolerance-id.js';
import { PROFILE, contractValid } from './commit-helpers.js';
import { get, headers, json } from './handler-helpers.js';
import { B, P, importHandler, importReq } from './import-helpers.js';

const VECTOR_CANONICAL = '{"coplanarTolDeg":1,"exportRoundDecimals":3,"flatRoofTolDeg":1,"footprintAngleTolDeg":5,'
  + '"heatmapBufferM":1,"minEdgeLengthM":0.05,"minFaceAreaM2":0.1,"numericEpsilon":1e-9,"planarTolM":0.02,'
  + '"planeFitMinInlierRatio":0.6,"planeFitMinPoints":30,"screenSnapPx":10,"topologySnapTolM":0.01,"zAlignTolM":0.01}';
const VECTOR_ID = 'sha256:fb3a0e5e5c5a018563facede2bd52f61c90e0ad3fc7bb6943da3f5fff78ed6b7';

/** @param {Record<string, unknown>} o @returns {Record<string, unknown>} the same members in reverse key order */
const reversed = (o) => Object.fromEntries(Object.entries(o).reverse());

describe('tolerance profile id by content', () => {
  it('the test vector: 14 members, canonical JSON and its sha256', () => {
    expect(TOLERANCE_MEMBERS).toHaveLength(14);
    expect(canonicalTolerances(PROFILE)).toBe(VECTOR_CANONICAL);
    expect(toleranceProfileId(PROFILE)).toBe(VECTOR_ID);
  });

  it('the same numbers with another or no label give the same id', () => {
    expect(toleranceProfileId({ id: 'default', ...PROFILE })).toBe(VECTOR_ID);
    expect(toleranceProfileId({ id: 'strict', ...PROFILE })).toBe(VECTOR_ID);
  });

  it('key order does not change the id', () => {
    expect(toleranceProfileId(reversed({ id: 'default', ...PROFILE }))).toBe(VECTOR_ID);
  });

  it('one changed tolerance gives another id, for every member', () => {
    const ids = new Set(TOLERANCE_MEMBERS.map((k) => toleranceProfileId({ ...PROFILE, [k]: /** @type {number} */ (PROFILE[/** @type {keyof typeof PROFILE} */ (k)]) + 1 })));
    expect(ids.size).toBe(14);
    expect(ids.has(VECTOR_ID)).toBe(false);
  });

  it('a profile with a missing or non-numeric member throws (host defect), no id from a partial profile', () => {
    const { planarTolM, ...partial } = PROFILE;
    expect(planarTolM).toBe(0.02);
    expect(() => toleranceProfileId(partial)).toThrow(/planarTolM/);
    expect(() => toleranceProfileId({ ...PROFILE, planarTolM: '0.02' })).toThrow(/planarTolM/);
  });
});

describe('GT-I1 import through the handler with the content id', () => {
  /** @param {any} profile */
  async function importedModel(profile) {
    const { handle, leaseHeader } = await importHandler({ over: { toleranceProfile: () => profile } });
    const r = await importReq(handle, leaseHeader);
    expect(r.status).toBe(201);
    const m = json(await handle(get(`/api/projects/${P}/buildings/${B}/model?version=0`, headers('tok-op', null))));
    expect(m.status).toBe(200);
    return contractValid('building-model', m.body);
  }

  it('a profile without id imports: 201, model toleranceProfileId = the test vector id', async () => {
    contractValid('tolerance-profile', PROFILE);
    expect((await importedModel(PROFILE)).toleranceProfileId).toBe(VECTOR_ID);
  });

  it('a labelled profile in another key order gets the same id; one changed tolerance another', async () => {
    expect((await importedModel(reversed({ id: 'default', ...PROFILE }))).toleranceProfileId).toBe(VECTOR_ID);
    const changed = (await importedModel({ id: 'default', ...PROFILE, exportRoundDecimals: 2 })).toleranceProfileId;
    expect(changed).toMatch(/^sha256:[0-9a-f]{64}$/);
    expect(changed).not.toBe(VECTOR_ID);
  });
});
