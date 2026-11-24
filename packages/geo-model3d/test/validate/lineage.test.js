// 3D-12 Accept 2 (spec §8): an issue present in the previous version, mapped through lineage, is not "new"; the same
// issue on an entity without a lineage predecessor is "new". Versions and lineage come from real brep transactions.
import { describe, it, expect } from 'vitest';
import { validate, golden } from './helpers.js';
import { transact } from '../../src/brep/index.js';
import { newErrors, newIssueFlags } from '../../src/validate/index.js';

/** Replace face id `from` by `to` everywhere in a draft. @param {any} m @param {string} from @param {string} to */
function renameFace(m, from, to) {
  m.faces[to] = { ...m.faces[from], id: to };
  delete m.faces[from];
  for (const h of Object.values(m.halfEdges)) if (/** @type {any} */ (h).faceId === from) /** @type {any} */ (h).faceId = to;
  for (const c of [...Object.values(m.shells), ...Object.values(m.roofComponents)]) {
    /** @type {any} */ (c).faceIds = /** @type {any} */ (c).faceIds.map((/** @type {string} */ f) => (f === from ? to : f));
  }
  for (const v of Object.values(m.vertices)) {
    /** @type {any} */ (v).definingFaceIds = /** @type {any} */ (v).definingFaceIds.map((/** @type {string} */ f) => (f === from ? to : f));
  }
}

/**
 * Rebuild a face with new ids for the face and its ring half-edges (as REPLACE_ROOF does); returns old -> new ids.
 * @param {any} m @param {string} from @param {string} to @returns {Record<string, string[]>}
 */
function rebuildFace(m, from, to) {
  renameFace(m, from, to);
  /** @type {Record<string, string>} */
  const ren = {};
  for (const h of Object.values(m.halfEdges)) if (/** @type {any} */ (h).faceId === to) ren[/** @type {any} */ (h).id] = /** @type {any} */ (h).id.replace(from, to);
  for (const [o, n] of Object.entries(ren)) { m.halfEdges[n] = { ...m.halfEdges[o], id: n }; delete m.halfEdges[o]; }
  const r = (/** @type {string | null} */ id) => (id && ren[id]) || id;
  for (const h of Object.values(m.halfEdges)) {
    const he = /** @type {any} */ (h);
    he.nextId = r(he.nextId); he.prevId = r(he.prevId); he.twinId = r(he.twinId);
  }
  m.faces[to].outerLoopId = r(m.faces[to].outerLoopId);
  return Object.fromEntries([[from, [to]], ...Object.entries(ren).map(([o, n]) => [o, [n]])]);
}

/** GT-03 with the ridge opened (OPEN_BOUNDARY on both ridge half-edges), as version 1. */
function openRidge() {
  const m = golden('GT-03');
  m.halfEdges['he-f-roof-s-2'].twinId = null;
  m.halfEdges['he-f-roof-n-2'].twinId = null;
  return m;
}

const opts = { mode: 'COMMIT_VALIDATION', targetState: 'VALID_SOLID' };

describe('"new" issues through lineage (spec §8 Accept 2)', () => {
  it('an issue carried to a rebuilt face is not new when lineage maps the old ids', async () => {
    const before = openRidge();
    const prev = await validate(before, opts);
    const t = /** @type {any} */ (transact(before, (d) => ({ ok: true, mapped: rebuildFace(d, 'f-roof-s', 'f-roof-s-2') })));
    expect(t.ok).toBe(true);
    const cur = await validate(t.model, { ...opts, affectedEntityIds: t.affectedEntityIds });
    const moved = cur.issues.find((/** @type {any} */ i) => i.code === 'OPEN_BOUNDARY' && i.entityIds.includes('f-roof-s-2'));
    expect(moved).toBeDefined();
    expect(prev.issues.some((/** @type {any} */ i) => i.code === 'OPEN_BOUNDARY' && i.entityIds.includes('f-roof-s'))).toBe(true);
    expect(newErrors(prev.issues, cur.issues, t.topologyLineage)).toEqual([]);
  });

  it('the same issue on an entity without a lineage predecessor is new', async () => {
    const before = openRidge();
    const prev = await validate(before, opts);
    // same edit, but the operation reports no lineage: the old face and ring are deleted, the new ones have no predecessor
    const t = /** @type {any} */ (transact(before, (d) => { rebuildFace(d, 'f-roof-s', 'f-roof-s-2'); return { ok: true }; }));
    expect(t.topologyLineage.deleted).toEqual(expect.arrayContaining(['f-roof-s', 'he-f-roof-s-2']));
    const cur = await validate(t.model, opts);
    const fresh = newErrors(prev.issues, cur.issues, t.topologyLineage);
    const onNew = fresh.filter((/** @type {any} */ i) => i.entityIds.includes('f-roof-s-2'));
    expect(onNew.map((/** @type {any} */ i) => i.code)).toContain('OPEN_BOUNDARY');
    // the issue on the untouched north slope keeps its ids: not new
    expect(fresh.some((/** @type {any} */ i) => i.entityIds.includes('f-roof-n') && !i.entityIds.includes('f-roof-s-2'))).toBe(false);
  });

  it('a commit that adds a new ERROR on preserved entities is detected (spec §8 rule 7)', async () => {
    const before = golden('GT-03');
    const prev = await validate(before, opts);
    expect(prev.issues).toEqual([]);
    const t = /** @type {any} */ (transact(before, (d) => { d.vertices['v-r1'].p = [10, 4, 8.1]; return { ok: true }; }));
    const cur = await validate(t.model, { ...opts, affectedEntityIds: t.affectedEntityIds });
    expect(newErrors(prev.issues, cur.issues, t.topologyLineage).map((/** @type {any} */ i) => i.code)).toEqual(['NON_PLANAR_FACE', 'NON_PLANAR_FACE']);
  });

  it('a split maps one old id to several: an issue on either part is old', () => {
    const lineage = { mapped: { f1: ['f1a', 'f1b'] }, deleted: [], preserved: [] };
    const flags = newIssueFlags([{ code: 'NON_PLANAR_FACE', entityIds: ['f1'] }], [
      { code: 'NON_PLANAR_FACE', entityIds: ['f1b', 'v9'] },
      { code: 'NON_PLANAR_FACE', entityIds: ['f2'] },
      { code: 'DEGENERATE_FACE', entityIds: ['f1a'] },
    ], lineage);
    expect(flags).toEqual([false, true, true]);
  });
});
