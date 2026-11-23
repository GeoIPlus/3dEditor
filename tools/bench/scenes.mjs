// Bench scenes of 3D-ADR-0006 (ADR-012, 3D-08): models and MOVE_EDGE commands for the server PREVIEW latency bench.
// GT-03 is the golden fixture as generated (3D-07); the sawtooth hall is synthetic, built with the fixture generator's
// envelope and model writer so it has the same canonical form. Deterministic: request i always gets the same command.
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { toModel } from '../golden-fixtures/brep.mjs';
import { envelope } from '../golden-fixtures/geom.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');

/** @typedef {import('../golden-fixtures/geom.mjs').P3} P3 */
/** @typedef {{ id: string, faces: number, gate: boolean, model: any, command: (i: number) => any }} Scene */

/** @param {string} buildingId @param {number} version @param {any} payload @param {number} i */
const moveEdge = (buildingId, version, payload, i) => ({
  schemaVersion: '1', commandId: `cmd-bench-${i}`, projectId: 'prj-golden', buildingId, actorId: 'usr-operator',
  operation: 'MOVE_EDGE', phase: 'PREVIEW', expectedVersion: version, payload, coordinateFrame: 'LOCAL', targetState: 'VALID_SOLID',
});

/** Offset of request i: 0.10 .. 0.29 m in 0.01 m steps, so consecutive requests differ (a drag). @param {number} i */
const offset = (i) => 0.1 + (i % 20) / 100;

/** GT-03 gable (7 faces): raise the south eave, south roof face movable, south wall fixed. @returns {Scene} */
export function gt03() {
  const model = JSON.parse(readFileSync(join(ROOT, 'fixtures/GT-03/input.model.json'), 'utf8'));
  return {
    id: 'GT-03', faces: Object.keys(model.faces).length, gate: false, model,
    command: (i) => moveEdge(model.buildingId, model.version, {
      edgeId: 'he-f-roof-s-0', targetLine: [[0, 0, 5 + offset(i)], [10, 0, 5 + offset(i)]], movableFaceIds: ['f-roof-s'],
    }, i),
  };
}

/**
 * Sawtooth hall: k gable bays of width w along X, ridges along Y (footprint k*w x W, eave 5, ridge 8, base 0).
 * Faces: ground + 4 walls + 2k roof slopes = 2k + 5. The south and north walls carry 2k + 3 vertices each, so every
 * valley move touches two large faces: a pessimistic shape for the face-face checks [P].
 * @param {number} k @param {{ w?: number, W?: number, eave?: number, ridge?: number }} [o]
 */
export function sawtoothPoly(k, o = {}) {
  const { w = 4, W = 8, eave = 5, ridge = 8 } = o;
  /** @type {Record<string, P3>} */
  const top = {};
  for (let j = 0; j <= 2 * k; j++) {
    const x = (j * w) / 2; const z = j % 2 === 0 ? eave : ridge;
    top[`s${j}`] = [x, 0, z];
    top[`n${j}`] = [x, W, z];
  }
  const S = Array.from({ length: 2 * k + 1 }, (_, j) => `s${j}`);
  const N = Array.from({ length: 2 * k + 1 }, (_, j) => `n${2 * k - j}`);
  /** @type {import('../golden-fixtures/geom.mjs').PolyFace[]} */
  const roofs = [];
  for (let i = 0; i < k; i++) {
    const [a, r, b] = [2 * i, 2 * i + 1, 2 * i + 2];
    roofs.push({ id: `f-roof-${i}-w`, kind: 'RoofSurface', ring: [`s${a}`, `s${r}`, `n${r}`, `n${a}`] });
    roofs.push({ id: `f-roof-${i}-e`, kind: 'RoofSurface', ring: [`s${r}`, `s${b}`, `n${b}`, `n${r}`] });
  }
  /** @type {[number, number][]} */
  const ring = [[0, 0], [k * w, 0], [k * w, W], [0, W]];
  return envelope(ring, 0, top, [S, [`s${2 * k}`, `n${2 * k}`], N, [`n0`, `s0`]], roofs, ['f-wall-s', 'f-wall-e', 'f-wall-n', 'f-wall-w']);
}

/**
 * Sawtooth scene: lower the valley between bays j-1 and j (j = k/2) by the offset, both slopes movable.
 * @param {number} k @param {boolean} gate the scene that decides the 150 ms verdict
 * @returns {Scene}
 */
export function sawtooth(k, gate) {
  const w = 4; const W = 8;
  const model = toModel(sawtoothPoly(k, { w, W }), { buildingId: `bld-bench-saw-${k}` });
  const j = Math.floor(k / 2);
  return {
    id: `sawtooth-${2 * k + 5}`, faces: Object.keys(model.faces).length, gate, model,
    command: (i) => moveEdge(model.buildingId, model.version, {
      edgeId: `he-f-roof-${j - 1}-e-1`,
      targetLine: [[j * w, 0, 5 - offset(i)], [j * w, W, 5 - offset(i)]],
      movableFaceIds: [`f-roof-${j - 1}-e`, `f-roof-${j}-w`],
    }, i),
  };
}

/** The scenes of 3D-ADR-0006: GT-03, the gate scene (199 faces, <= 200 of v0.3 §11) and 499 faces (D-94). */
export const scenes = () => [gt03(), sawtooth(97, true), sawtooth(247, false)];
