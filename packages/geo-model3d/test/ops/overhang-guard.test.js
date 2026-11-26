// 3D-120 (D-372, D-373) after 3D-124 (D-384): the pipeline rebuilds overhangs, so the guard is the last check for what
// the rebuild does not cover (operations that rebuild by themselves). Unit test of the guard on a strip left on the old
// plane, and the 3D-15 split / merge pair that the guard used to pass, now through the rebuild.
import { describe, expect, it } from 'vitest';
import { overhangGuard } from '../../src/ops/overhang-guard.js';
import { exec } from './envelope.helpers.js';
import { PROFILE } from './helpers.js';
import { withOverhang, follows } from './overhang-rebuild.helpers.js';

describe('3D-120 guard after 3D-124', () => {
  it('a strip left off its parent plane -> INVALID_TOPOLOGY naming strip and parent; coplanar -> null', () => {
    const m = withOverhang();
    expect(overhangGuard(m, m, PROFILE)).toBeNull();
    const d = structuredClone(m);
    d.faces['f-roof-s'].supportPlane = { ...d.faces['f-roof-s'].supportPlane, d: d.faces['f-roof-s'].supportPlane.d + 0.1 };
    const r = /** @type {any} */ (overhangGuard(m, d, PROFILE));
    expect(r.refusal.code).toBe('INVALID_TOPOLOGY');
    expect(r.refusal.entityIds).toContain('f-roof-s');
  });

  it('SPLIT_FACE along the eave then MERGE_FACES MERGE_REFIT (3D-15): overhang follows both steps', () => {
    const m = withOverhang();
    const s = exec(m, 'SPLIT_FACE', { faceId: 'f-roof-s', splitLine: [[0, 2, 6.5], [10, 2, 6.5]] });
    follows(m, s);
    const lower = s.model.halfEdges['he-f-roof-s-0'].faceId;
    const other = lower === 'f-roof-s' ? Object.keys(s.model.faces).find((f) => !m.faces[f] && s.model.faces[f].surfaceKind === 'RoofSurface') : 'f-roof-s';
    const out = exec(s.model, 'MERGE_FACES', { faceIds: [lower, other].sort(), mode: 'MERGE_REFIT', movableFaceIds: ['f-roof-s'] });
    follows(s.model, out);
  });
});
