// GT-17 (v0.3 §12; spec §13; row 3D-20): ADD_CHIMNEY 1 x 1 m, 1 m above the slope (at the downhill corner, D-3D20-1),
// mid-slope on GT-03; then REMOVE_INSTALLATION (spec §10.11 Accept 2). Independent checks: the south plane is
// z = 5 + 0.75 y (GT-03 geometry), volumes by the divergence theorem, closure from the half-edge links.
import { describe, expect, it } from 'vitest';
import { goldenRun, installation, closedBody, buildingVolume, volume, maxPlaneDistance } from './installation.golden.helpers.js';
import { run, faceArea } from '../ops/helpers.js';

const slopeZ = (/** @type {number[]} */ p) => 5 + 0.75 * p[1];

describe('GT-17 ADD_CHIMNEY', () => {
  const r = goldenRun('GT-17');
  const a = r.expected.assert, tol = r.expected.tolerance;
  const m = r.commit.model;

  it('commits a VALID_SOLID with the PREVIEW patch', () => {
    expect(r.preview.result.status).toBe('PREVIEW');
    expect(r.commit.result.status).toBe('COMMITTED');
    expect(r.commit.result.patch).toEqual(r.preview.result.patch);
    expect(m.state).toBe(a.state);
    expect(r.commit.result.validation.isValidForTargetState).toBe(true);
    expect(maxPlaneDistance(m)).toBeLessThanOrEqual(r.tol.planarTolM);
  });

  it('BuildingInstallation, a separate closed body, base in the slope plane', () => {
    const ins = installation(m);
    expect(ins.node.kind).toBe(a.installation);
    expect(ins.node.parentId).toBe('sem-bld');
    expect(closedBody(m, ins.hes, ins.faces)).toBe(a.separateClosedBody);
    // separate: no vertex, half-edge or face shared with the building body
    const bld = new Set(m.shells['sh-1'].faceIds);
    expect([...ins.faces].some((f) => bld.has(f))).toBe(false);
    expect(ins.hes.some((/** @type {any} */ h) => bld.has(m.halfEdges[h.twinId].faceId))).toBe(false);
    const base = ins.pts.filter((p) => Math.abs(p[2] - slopeZ(p)) <= r.tol.planarTolM);
    expect(base).toHaveLength(4);
    expect(base.length === 4).toBe(a.baseInSlopePlane);
    for (const p of ins.pts) expect(p[2]).toBeGreaterThanOrEqual(slopeZ(p) - r.tol.planarTolM);
  });

  it('size 1 x 1 m, top 1 m above the slope at the downhill side, building volume 520 m3', () => {
    const ins = installation(m);
    const xs = ins.pts.map((p) => p[0]), ys = ins.pts.map((p) => p[1]), zs = ins.pts.map((p) => p[2]);
    expect(Math.max(...xs) - Math.min(...xs)).toBeCloseTo(a.sizeM[0], 9);
    expect(Math.max(...ys) - Math.min(...ys)).toBeCloseTo(a.sizeM[1], 9);
    const downhill = slopeZ([0, Math.min(...ys)]);
    expect(Math.max(...zs) - downhill).toBeCloseTo(a.heightAboveSlopeM, 9);
    console.log('GT-17', JSON.stringify({ buildingVolumeM3: buildingVolume(m), chimneyVolumeM3: volume(m, ins.shell.faceIds), topZ: Math.max(...zs) }));
    expect(Math.abs(buildingVolume(m) - a.volumeM3)).toBeLessThanOrEqual(tol.volumeM3);
    // chimney body: 1 x 1 m prism between z = 7.125 and the slope (mean slope height 6.5) -> 0.625 m3
    expect(Math.abs(volume(m, ins.shell.faceIds) - 0.625)).toBeLessThanOrEqual(tol.volumeM3);
  });

  it('REMOVE_INSTALLATION restores roof area 100 m2 and volume 520 m3 (spec §10.11 Accept 2)', () => {
    const id = installation(m).node.id;
    const out = run(m, { ...r.cmd, commandId: 'cmd-gt-17-2', operation: 'REMOVE_INSTALLATION', expectedVersion: m.version, payload: { installationId: id } });
    expect(out.result.status).toBe('COMMITTED');
    const after = out.model;
    expect(after.state).toBe('VALID_SOLID');
    expect(Object.values(after.semantics).some((/** @type {any} */ s) => s.kind === 'BuildingInstallation')).toBe(false);
    const roofArea = Object.values(after.faces).filter((/** @type {any} */ f) => f.surfaceKind === 'RoofSurface').reduce((s, f) => s + faceArea(after, /** @type {any} */ (f).id), 0);
    expect(Math.abs(roofArea - 100)).toBeLessThanOrEqual(tol.areaM2);
    expect(Math.abs(buildingVolume(after) - 520)).toBeLessThanOrEqual(tol.volumeM3);
    // the entity sets are those of the input version again
    for (const k of ['vertices', 'halfEdges', 'faces', 'shells', 'solids', 'semantics']) {
      expect(Object.keys(/** @type {any} */ (after)[k]).sort()).toEqual(Object.keys(/** @type {any} */ (r.model)[k]).sort());
    }
    expect(out.result.topologyLineage.deleted).toEqual(expect.arrayContaining([...installation(m).faces]));
  });
});
