// val3dity id -> entity ids (3D-74): positions follow the export's model nesting; geometry index from face sourceRef.
import { describe, expect, it } from 'vitest';
import { entityIdsOf, parseVal3dityId } from '../src/adapters/val3dity-ids.js';
import { golden } from './val3dity-helpers.js';

const { model } = golden('GT-I4');
const sem = /** @type {any} */ (Object.values(model.semantics).find((/** @type {any} */ s) => s.kind === 'Building'));
const solid = model.solids[sem.solidIds[0]];
const faces = model.shells[solid.outerShellId].faceIds;
const coid = sem.sourceRef;

describe('parseVal3dityId', () => {
  it('reads object, geometry, solid, shell and face; an empty face is none', () => {
    expect(parseVal3dityId('coid=b-1|geom=2|solid=1|shell=0|face=7')).toEqual({ coid: 'b-1', geom: 2, solids: [1], shells: [0], faces: [7] });
    expect(parseVal3dityId('coid=b-1|geom=0|shell=0|face=')).toEqual({ coid: 'b-1', geom: 0, solids: [], shells: [0], faces: [] });
  });
  it('reads pairs joined by && (Solid.cpp, CompositeSolid.cpp)', () => {
    expect(parseVal3dityId('coid=b|geom=0|shell=0&&shell=1')).toMatchObject({ shells: [0, 1] });
    expect(parseVal3dityId('solid=0&&solid=2')).toMatchObject({ solids: [0, 2] });
  });
});

describe('entityIdsOf', () => {
  it('the fixture faces carry sourceRef into geometry 0', () => {
    expect(model.faces[faces[0]].sourceRef.startsWith(`${coid}/geometry/0/boundaries/`)).toBe(true);
  });
  it('face -> that face (model order = export order)', () => {
    expect(entityIdsOf(model, `coid=${coid}|geom=0|shell=0|face=3`, coid)).toEqual([faces[3]]);
  });
  it('shell-level error -> the shell; geometry-level -> the solid; object only -> the semantic node', () => {
    expect(entityIdsOf(model, `coid=${coid}|geom=0|shell=0|face=`, coid)).toEqual([solid.outerShellId]);
    expect(entityIdsOf(model, `coid=${coid}|geom=0`, coid)).toEqual([sem.solidIds[0]]);
    expect(entityIdsOf(model, undefined, coid)).toEqual([sem.id]);
  });
  it('a geometry the kernel does not hold (another index), an unknown object or position -> []', () => {
    expect(entityIdsOf(model, `coid=${coid}|geom=1|shell=0|face=3`, coid)).toEqual([]);
    expect(entityIdsOf(model, 'coid=nope|geom=0|shell=0|face=0', 'nope')).toEqual([]);
    expect(entityIdsOf(model, `coid=${coid}|geom=0|shell=5|face=0`, coid)).toEqual([]);
    expect(entityIdsOf(model, `coid=${coid}|geom=0|shell=0|face=999`, coid)).toEqual([]);
  });
  it('surface geometry ids without a shell take shell 0', () => {
    expect(entityIdsOf(model, `coid=${coid}|geom=0|face=1`, coid)).toEqual([faces[1]]);
  });
});
