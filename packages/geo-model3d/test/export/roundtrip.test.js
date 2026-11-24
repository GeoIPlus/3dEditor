// export (3D-11; spec §7 rules 1, 3): unedited import -> export reproduces the input; merged faces (GT-I3) are one
// surface (D-3D11-2); re-import of an export equals the first import; the input is never written; output is
// deterministic.
import { describe, expect, it } from 'vitest';
import { importBuilding, exportBuilding, canonicalJson, localToWorld } from '@geoiplus/geo-model3d';
import { goldenImport, makeDoc, solid, boxGeometry } from '../import/helpers.js';
import { deepFreeze } from '../brep/helpers.js';
import { PROFILE, roundTrip, moved, vertexOfFile } from './helpers.js';

/** Model summary independent of entity ids and of the frame origin (world coordinates). @param {any} m */
const summary = (m) => ({
  state: m.state,
  faces: Object.values(m.faces).map((f) => [/** @type {any} */ (f).surfaceKind, /** @type {any} */ (f).sourceRef]).sort(),
  vertices: localToWorld(m.frame, Object.values(m.vertices).map((v) => /** @type {any} */ (v).p))
    .map((p) => p.map((c) => Math.round(c * 1e6) / 1e6)).sort(),
  semantics: Object.values(m.semantics).map((s) => [/** @type {any} */ (s).kind, /** @type {any} */ (s).sourceRef]),
});

describe('unedited round trip', () => {
  for (const gt of ['GT-I1', 'GT-I2']) {
    it(`${gt}: the export is the input document`, () => {
      const { cityjson, step } = goldenImport(gt);
      const out = roundTrip(deepFreeze(structuredClone(cityjson)), step.cityObjectId);
      expect(canonicalJson(out.cityjson)).toBe(canonicalJson(cityjson));
      expect(JSON.stringify(out.cityjson)).toBe(JSON.stringify(cityjson)); // key order too
      expect(out.findings).toEqual([]);
    });
  }
  it('GT-I3: the merged roof faces are one surface each, the other surfaces are the file ones (D-3D11-2)', () => {
    const { cityjson, step } = goldenImport('GT-I3');
    const out = roundTrip(cityjson, step.cityObjectId);
    const g = out.cityjson.CityObjects[step.cityObjectId].geometry[0];
    expect(g.boundaries[0].length).toBe(7);
    expect(g.boundaries[0].slice(0, 5)).toEqual(cityjson.CityObjects[step.cityObjectId].geometry[0].boundaries[0].slice(0, 5));
    const types = g.semantics.values[0].map((/** @type {number} */ v) => g.semantics.surfaces[v].type);
    expect(types.filter((/** @type {string} */ t) => t === 'RoofSurface').length).toBe(2);
    expect(out.cityjson.vertices).toEqual(cityjson.vertices);
  });
  it('re-import of the export equals the first import (GT-I1..GT-I3, and an edited GT-I1)', () => {
    for (const gt of ['GT-I1', 'GT-I2', 'GT-I3']) {
      const { cityjson, step } = goldenImport(gt);
      const out = roundTrip(cityjson, step.cityObjectId);
      const again = importBuilding({ cityjson: out.cityjson, cityObjectId: step.cityObjectId, toleranceProfile: PROFILE, projectId: 'p' });
      const first = importBuilding({ cityjson, cityObjectId: step.cityObjectId, toleranceProfile: PROFILE, projectId: 'p' });
      if (gt === 'GT-I3') expect(summary(again.model).vertices).toEqual(summary(first.model).vertices);
      else expect(summary(again.model)).toEqual(summary(first.model));
    }
    const { cityjson, step } = goldenImport('GT-I1');
    const { model } = roundTrip(cityjson, step.cityObjectId);
    const edited = moved(model, [vertexOfFile(model, 8), vertexOfFile(model, 9)], [0, 0, 0.5]);
    const out = exportBuilding({ model: edited, cityjson, toleranceProfile: PROFILE });
    const again = importBuilding({ cityjson: out.cityjson, cityObjectId: step.cityObjectId, toleranceProfile: PROFILE, projectId: 'p' });
    expect(summary(again.model).vertices).toEqual(summary(edited).vertices);
    expect(again.model.state).toBe('VALID_SOLID');
  });
  it('is deterministic and never writes its inputs', () => {
    const { cityjson, step } = goldenImport('GT-I1');
    const { model } = importBuilding({ cityjson, cityObjectId: step.cityObjectId, toleranceProfile: PROFILE, projectId: 'p' });
    const edited = deepFreeze(moved(model, [vertexOfFile(model, 8)], [0.1234, 0, 0]));
    const doc = deepFreeze(structuredClone(cityjson));
    const a = exportBuilding({ model: edited, cityjson: doc, toleranceProfile: PROFILE });
    const b = exportBuilding({ model: edited, cityjson: doc, toleranceProfile: PROFILE });
    expect(canonicalJson(a)).toBe(canonicalJson(b));
  });
});

describe('structure (spec §7 rule 3, D-91)', () => {
  const p1 = boxGeometry([0, 0, 0, 4, 4, 3]);
  const p2 = boxGeometry([4, 0, 0, 8, 4, 5], 8);
  const inst = boxGeometry([1, 1, 3, 2, 2, 4], 16);
  const lod1 = { type: 'MultiSurface', lod: '1', boundaries: p1.rings.map((r) => [r]) };
  const doc = makeDoc([...p1.points, ...p2.points, ...inst.points], {
    b: { type: 'Building', attributes: { name: 'x' }, children: ['p1', 'p2'], geometry: [] },
    p1: { type: 'BuildingPart', parents: ['b'], children: ['i1'], geometry: [lod1, solid(p1.rings, p1.types, '2.1')] },
    p2: { type: 'BuildingPart', parents: ['b'], geometry: [{ type: 'MultiSurface', lod: '2.2', boundaries: p2.rings.map((r) => [r]) }] },
    i1: { type: 'BuildingInstallation', parents: ['p1'], geometry: [solid(inst.rings, inst.types, '2.2')] },
  });
  it('parts and installation keep type, LoD label and geometry type; unedited output = input', () => {
    const out = roundTrip(doc, 'b');
    expect(JSON.stringify(out.cityjson)).toBe(JSON.stringify(doc));
  });
  it('edited installation: still a BuildingInstallation Solid of LoD 2.2; LoD 1 of p1 untouched', () => {
    const { model } = roundTrip(doc, 'b');
    const ids = [16 + 4, 16 + 5, 16 + 6, 16 + 7].map((i) => vertexOfFile(model, i));
    const out = exportBuilding({ model: moved(model, ids, [0, 0, 0.25]), cityjson: doc, toleranceProfile: PROFILE });
    const i1 = out.cityjson.CityObjects.i1;
    expect([i1.type, i1.geometry[0].type, i1.geometry[0].lod]).toEqual(['BuildingInstallation', 'Solid', '2.2']);
    expect(out.cityjson.CityObjects.p1.geometry[0]).toEqual(lod1);
    expect(out.cityjson.CityObjects.p2).toEqual(doc.CityObjects.p2);
    const zs = i1.geometry[0].boundaries[0][5][0].map((/** @type {number} */ i) => out.cityjson.vertices[i][2]);
    expect(zs).toEqual([4250, 4250, 4250, 4250]);
  });
});
