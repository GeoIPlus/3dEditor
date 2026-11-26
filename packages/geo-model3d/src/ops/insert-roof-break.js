// ops (3D-15): INSERT_ROOF_BREAK (spec §10.6 r3; v0.2 C.5, §13.5; owner decision 01, D-297): the face is cut along
// the break line as in SPLIT_FACE; the part that holds `movingSidePoint` gets `newPlane`, the other part keeps the old
// plane and the face id (plane constraints stay with it). The new plane must contain the break line (within
// `planarTolM`) and differ from the old one (beyond `coplanarTolDeg` / `planarTolM`). Neighbour planes stay fixed:
// every vertex of the moving part is re-derived from its planes after the solve (adjacency, envelope).
import { dot, scale, sub } from '../brep/index.js';
import { refuse } from './errors.js';
import { cutFace } from './face-cut.js';
import { inheritOnSplit, lineageWarnings } from './inherit.js';
import { pinPlane, unitPlane } from './plane-pin.js';
import { isV3 } from './split-face.js';
import { assignRoles } from './topology.js';

/** @type {import('./registry.js').Operation['run']} */
export function insertRoofBreak(draft, payload, ctx) {
  const tol = ctx.tol;
  const f = draft.faces[payload?.faceId];
  if (!f) return refuse('INVALID_PAYLOAD', payload?.faceId ? [payload.faceId] : [], 'unknown faceId');
  const line = payload.breakLine, plane = payload.newPlane, m = payload.movingSidePoint;
  if (!Array.isArray(line) || !isV3(line[0]) || !isV3(line[1])) return refuse('INVALID_PAYLOAD', [], 'breakLine');
  if (!isV3(m)) return refuse('INVALID_PAYLOAD', [], 'movingSidePoint');
  if (!unitPlane(plane, tol.numericEpsilon)) return refuse('INVALID_PAYLOAD', [], 'newPlane needs a unit normal');
  if (ctx.frame === 'WORLD') return refuse('INVALID_PAYLOAD', [], 'newPlane needs coordinateFrame LOCAL (as D-217)');
  const old = f.supportPlane;
  const cos = dot(old.normal, plane.normal);
  if (cos >= Math.cos((tol.coplanarTolDeg * Math.PI) / 180) && Math.abs(old.d - plane.d) <= tol.planarTolM) {
    return refuse('INVALID_GEOMETRY', [f.id], 'newPlane equals the face plane: use SPLIT_FACE');
  }
  const proj = (/** @type {any} */ p) => sub(p, scale(old.normal, dot(old.normal, p) + old.d));
  for (const p of line) {
    const q = proj(p);
    if (!(Math.abs(dot(plane.normal, q) + plane.d) <= tol.planarTolM)) return refuse('INVALID_GEOMETRY', [f.id], 'break line is not on newPlane');
  }
  if (!(Math.abs(dot(old.normal, m) + old.d) <= tol.planarTolM)) return refuse('INVALID_GEOMETRY', [f.id], 'movingSidePoint is not on the face');
  const cut = cutFace(draft, f.id, /** @type {any} */ (line), tol, ctx.ids, (_first, side) => {
    const t = side(m);
    if (!(Math.abs(t) > tol.topologySnapTolM)) return refuse('INVALID_GEOMETRY', [f.id], 'movingSidePoint is on the break line');
    return t > 0 ? -1 : 1; // the face id stays with the fixed part
  });
  if (!cut.ok) return cut;
  if (!insidePart(draft, cut.newFaceId, m, old.normal)) return refuse('INVALID_GEOMETRY', [f.id], 'movingSidePoint is outside the moving part');
  draft.faces[cut.newFaceId].supportPlane = { normal: [...plane.normal], d: plane.d };
  assignRoles(draft, cut.chord, tol.zAlignTolM);
  draft.faces[cut.newFaceId].supportPlane = { normal: [...old.normal], d: old.d };
  const inh = inheritOnSplit(draft, { faceId: f.id, newFaceId: cut.newFaceId, splitEdges: cut.splitEdges, planeMoves: true }, ctx.ids);
  if (!inh.ok) return inh;
  return {
    ok: true, mapped: cut.mapped, warnings: lineageWarnings(inh.lineage), movableFaceIds: [cut.newFaceId],
    conditions: pinPlane(draft, cut.newFaceId, plane, 'INSERT_ROOF_BREAK:newPlane', tol.planarTolM),
  };
}

/** Point in the outer ring of a face (projected along the dominant normal axis) and outside its holes. */
function insidePart(/** @type {any} */ m, /** @type {string} */ faceId, /** @type {number[]} */ p, /** @type {number[]} */ n) {
  const ax = [0, 1, 2].reduce((a, i) => (Math.abs(n[i]) > Math.abs(n[a]) ? i : a), 0);
  const [i, j] = [0, 1, 2].filter((k) => k !== ax);
  const ring = (/** @type {string} */ start) => {
    const out = []; let h = m.halfEdges[start];
    do { out.push(m.vertices[h.startVertexId].p); h = m.halfEdges[h.nextId]; } while (h.id !== start);
    return out;
  };
  const inside = (/** @type {number[][]} */ r) => {
    let c = false;
    for (let a = 0, b = r.length - 1; a < r.length; b = a++) {
      if ((r[a][j] > p[j]) !== (r[b][j] > p[j]) && p[i] < ((r[b][i] - r[a][i]) * (p[j] - r[a][j])) / (r[b][j] - r[a][j]) + r[a][i]) c = !c;
    }
    return c;
  };
  const f = m.faces[faceId];
  return inside(ring(f.outerLoopId)) && !f.innerLoopIds.some((/** @type {string} */ s) => inside(ring(s)));
}
