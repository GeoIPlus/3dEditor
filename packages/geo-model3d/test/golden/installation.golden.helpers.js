// Shared runner and independent checks of the installation golden tests GT-17, GT-18 (v0.3 §12; spec §13; row 3D-20):
// the fixture's step is sent as PREVIEW, then as COMMIT with the previewId (v0.3 §3). Every check here is computed
// from vertex coordinates and half-edge links in the test (v0.2 F.3), not by the kernel.
import { expect } from 'vitest';
import { readFixture, deepFreeze } from '../brep/helpers.js';
import { run, volume, maxPlaneDistance, PROFILE } from '../ops/helpers.js';

/** @param {string} gt */
export function goldenRun(gt) {
  const model = deepFreeze(readFixture(gt, 'input.model.json'));
  const steps = readFixture(gt, 'steps.json');
  const expected = readFixture(gt, 'expected.json');
  expect(expected.owner.row).toBe('3D-20');
  expect(steps.map((/** @type {any} */ s) => s.step)).toEqual(['COMMAND']);
  const cmd = steps[0].command;
  const preview = run(model, { ...cmd, phase: 'PREVIEW' });
  const commit = run(model, preview.result.status === 'PREVIEW' ? { ...cmd, previewId: preview.result.previewId } : cmd);
  return { model, expected, cmd, preview, commit, tol: PROFILE };
}

/** The new BuildingInstallation and the vertices and faces of its body. @param {any} m */
export function installation(m) {
  const nodes = Object.values(m.semantics).filter((/** @type {any} */ s) => s.kind === 'BuildingInstallation');
  expect(nodes).toHaveLength(1);
  const node = /** @type {any} */ (nodes[0]);
  const shell = m.shells[m.solids[node.solidIds[0]].outerShellId];
  const faces = new Set(shell.faceIds);
  const hes = Object.values(m.halfEdges).filter((/** @type {any} */ h) => faces.has(h.faceId));
  const pts = [...new Set(hes.map((/** @type {any} */ h) => h.startVertexId))].map((v) => m.vertices[v].p);
  return { node, shell, faces, hes, pts };
}

/** Closed: every half-edge of the shell has a twin in the same shell that runs the other way. @param {any} m @param {any[]} hes @param {Set<string>} faces */
export function closedBody(m, hes, faces) {
  return hes.every((h) => {
    const t = h.twinId && m.halfEdges[h.twinId];
    return !!t && faces.has(t.faceId) && t.startVertexId === m.halfEdges[h.nextId].startVertexId;
  });
}

/** Volume of the building's own shell (the Building node's solid). @param {any} m */
export function buildingVolume(m) {
  const b = /** @type {any} */ (Object.values(m.semantics).find((/** @type {any} */ s) => s.kind === 'Building'));
  return volume(m, m.shells[m.solids[b.solidIds[0]].outerShellId].faceIds);
}

export { volume, maxPlaneDistance };
