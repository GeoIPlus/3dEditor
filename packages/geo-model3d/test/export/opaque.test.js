// export (3D-11; spec §6 Accept 3, §7 rule 4): opaque `GeometryInstance`, `appearance` and extension members return
// unchanged after import -> export, unedited and edited; a descendant of an extension type comes along; per-surface
// material / texture follow reused surfaces (D-190): kept for a reused surface, none for a regenerated one [A].
import { describe, expect, it } from 'vitest';
import { exportBuilding, canonicalJson } from '@geoiplus/geo-model3d';
import { goldenImport } from '../import/helpers.js';
import { deepFreeze } from '../brep/helpers.js';
import { PROFILE, roundTrip, moved, vertexOfFile, world } from './helpers.js';

const { cityjson: GT, step } = goldenImport('GT-I1');
const ID = step.cityObjectId;

/** GT-I1 with every kind of opaque member. */
function rich() {
  const d = structuredClone(GT);
  d.extensions = { Noise: { url: 'https://example.org/noise.ext.json', version: '1.0' } };
  d['+rootMember'] = { any: [1, 2, 3] };
  d.appearance = {
    materials: [{ name: 'roof', diffuseColor: [0.9, 0.1, 0.1] }, { name: 'wall', diffuseColor: [0.8, 0.8, 0.8] }],
    textures: [{ type: 'PNG', image: 'roof.png' }],
    'vertices-texture': [[0, 0], [1, 0], [1, 1], [0, 1], [0.5, 1]],
  };
  d['geometry-templates'] = { templates: [{ type: 'MultiPoint', lod: '1', boundaries: [0] }], 'vertices-templates': [[0, 0, 0]] };
  const b = d.CityObjects[ID];
  b.attributes = { '+noiseLevel': 42, name: 'gt' };
  b.children = ['chimney'];
  b.geometry[0].material = { visual: { values: [[1, 1, 1, 1, 1, 0, 0]] }, single: { value: 0 } };
  b.geometry[0].texture = { visual: { values: [[[[null]], [[null]], [[null]], [[null]], [[null]], [[0, 0, 1, 2, 3]], [[0, 0, 1, 2, 3]]]] } };
  b.geometry.push({ type: 'GeometryInstance', template: 0, boundaries: [9], transformationMatrix: [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1] });
  d.CityObjects.chimney = { type: '+NoiseChimney', parents: [ID], attributes: { height: 1 } };
  return deepFreeze(d);
}

const OPAQUE = ['extensions', '+rootMember', 'appearance', 'geometry-templates', 'metadata', 'transform', 'version', 'type'];

describe('opaque data', () => {
  const doc = rich();
  it('unedited: the whole document comes back byte-equal', () => {
    const out = roundTrip(doc, ID);
    expect(JSON.stringify(out.cityjson)).toBe(JSON.stringify(doc));
  });
  it('edited roof: root members, attributes, extension object and GeometryInstance unchanged; unmoved faces keep their material (D-193)', () => {
    const { model } = roundTrip(doc, ID);
    const out = exportBuilding({ model: moved(model, [vertexOfFile(model, 9)], [0, 0, 0.5]), cityjson: doc, toleranceProfile: PROFILE }).cityjson;
    for (const k of OPAQUE) expect(canonicalJson(out[k]), k).toBe(canonicalJson(doc[k]));
    expect(out.CityObjects.chimney).toEqual(doc.CityObjects.chimney);
    const b = out.CityObjects[ID];
    expect(b.attributes).toEqual(doc.CityObjects[ID].attributes);
    const gi = b.geometry[1];
    expect({ ...gi, boundaries: null }).toEqual({ ...doc.CityObjects[ID].geometry[1], boundaries: null });
    expect(world(out, gi.boundaries[0])).toEqual(world(doc, 9)); // the instance's reference point did not move
    const g = b.geometry[0];
    expect(g.material.single).toEqual({ value: 0 });
    expect(g.lod).toBe('2.2');
    // faces 2, 5, 6 hold vertex 9 and are regenerated (no material [A]); 0, 1, 3, 4 have DERIVED but unmoved vertices
    // and keep their file surface and entries (D-193)
    expect(g.material.visual.values[0]).toEqual([1, 1, null, 1, 1, null, null]);
    expect(g.texture.visual.values[0]).toEqual([[[null]], [[null]], [[null]], [[null]], [[null]], [[null]], [[null]]]);
    expect(g.boundaries[0][1]).toEqual(doc.CityObjects[ID].geometry[0].boundaries[0][1]);
  });
  it('GT-I3 unedited: reused surfaces keep their material and texture entries, the merged roof faces have none', () => {
    const { cityjson: i3, step: s3 } = goldenImport('GT-I3');
    const d = structuredClone(i3);
    const g0 = d.CityObjects[s3.cityObjectId].geometry[0];
    g0.material = { visual: { values: [[1, 1, 1, 1, 1, 0, 0, 0, 0]] } };
    g0.texture = { visual: { values: [[[[null]], [[null]], [[null]], [[null]], [[0, 0, 1, 2, 3, 4]], [[0, 0, 1, 2]], [[0, 0, 1, 2]], [[0, 0, 1, 2]], [[0, 0, 1, 2]]]] } };
    d.appearance = { materials: [{ name: 'a' }, { name: 'b' }], textures: [{ type: 'PNG', image: 'w.png' }], 'vertices-texture': [[0, 0], [1, 0], [1, 1], [0, 1], [0.5, 1]] };
    const g = roundTrip(d, s3.cityObjectId).cityjson.CityObjects[s3.cityObjectId].geometry[0];
    expect(g.material.visual.values[0]).toEqual([1, 1, 1, 1, 1, null, null]);
    expect(g.texture.visual.values[0].slice(0, 5)).toEqual(g0.texture.visual.values[0].slice(0, 5));
    expect(g.texture.visual.values[0].slice(5)).toEqual([[[null]], [[null]]]);
  });
});
