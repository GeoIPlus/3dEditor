// val3dity id -> kernel entity ids (3D-74; 3D-ADR-0008 decision 2, D-3D74-3). val3dity 2.7.0 names a primitive
// `coid=<CityObject id>|geom=<geometry index>[|solid=<s>][|shell=<h>][|face=<f>]` (`src/input.cpp` 461-582,
// `src/Surface.cpp` 115); shell and solid pairs come as `shell=0&&shell=1` (`src/Solid.cpp` 353-417).
// The export (3D-11) writes the body's geometry in model nesting - solids (`solidIds` order) -> shells (outer, then
// voids) -> faces (`faceIds` order) - so a position maps back exactly. The geometry index is read from the bodies'
// face `sourceRef` (`<object>/geometry/<gi>/boundaries/...`, import 3D-10); another index is a geometry the export
// copied unchanged (other LoD), which has no kernel entities.

/** @typedef {any} BuildingModel contract `building-model` (the package exports no model type) */

const BODY_KINDS = new Set(['Building', 'BuildingPart', 'BuildingInstallation']);

/**
 * Parse one val3dity id into positions. `face=` without a number (a shell-level error) leaves `face` undefined.
 * @param {string} id
 * @returns {{ coid?: string, geom?: number, solids: number[], shells: number[], faces: number[] }}
 */
export function parseVal3dityId(id) {
  /** @type {{ coid?: string, geom?: number, solids: number[], shells: number[], faces: number[] }} */
  const out = { solids: [], shells: [], faces: [] };
  for (const part of String(id).split('|')) {
    for (const pair of part.split('&&')) {
      const at = pair.indexOf('=');
      if (at < 0) continue;
      const key = pair.slice(0, at).trim(), value = pair.slice(at + 1).trim();
      if (key === 'coid') { out.coid = value; continue; }
      if (!/^\d+$/.test(value)) continue;
      const n = Number(value);
      if (key === 'geom') out.geom = n;
      else if (key === 'solid') out.solids.push(n);
      else if (key === 'shell') out.shells.push(n);
      else if (key === 'face') out.faces.push(n);
    }
  }
  return out;
}

/**
 * Geometry index of a body in the exported document: the one its faces' `sourceRef` names; undefined when no face
 * keeps a `sourceRef` (then any index is taken as the body's).
 * @param {BuildingModel} model @param {any} sem body semantic entry
 */
function geometryIndex(model, sem) {
  const prefix = `${sem.sourceRef}/geometry/`;
  for (const sid of sem.solidIds ?? []) {
    const so = model.solids[sid];
    for (const hid of so ? [so.outerShellId, ...so.voidShellIds] : []) {
      for (const fid of model.shells[hid]?.faceIds ?? []) {
        const ref = model.faces[fid]?.sourceRef;
        if (typeof ref === 'string' && ref.startsWith(prefix)) {
          const gi = Number(ref.slice(prefix.length).split('/')[0]);
          if (Number.isInteger(gi)) return gi;
        }
      }
    }
  }
  return undefined;
}

/**
 * Kernel entity ids a val3dity error names: faces when it names faces, else shells, else solids, else the body's
 * semantic node; [] when the object is not a body of the model or the geometry is not the body's.
 * @param {BuildingModel} model
 * @param {string | undefined} errorId the error's `id` (absent for some feature-level errors)
 * @param {string} featureId the feature's `id` (= CityObject id)
 * @returns {string[]}
 */
export function entityIdsOf(model, errorId, featureId) {
  const p = parseVal3dityId(errorId ?? '');
  const coid = p.coid ?? featureId;
  const sem = Object.values(model.semantics ?? {}).find((s) => BODY_KINDS.has(s?.kind) && s.sourceRef === coid);
  if (!sem) return [];
  const gi = geometryIndex(model, sem);
  if (p.geom !== undefined && gi !== undefined && p.geom !== gi) return [];
  if (p.geom === undefined) return [sem.id];
  const solidIds = /** @type {string[]} */ (sem.solidIds ?? []);
  const solids = (p.solids.length > 0 ? p.solids : [0]).map((s) => solidIds[s]).filter((s) => model.solids[s]);
  // A surface geometry (MultiSurface, CompositeSurface) has no shell in its id: its faces are shell 0 (export `shape`).
  const shellAt = p.shells.length > 0 ? p.shells : p.faces.length > 0 ? [0] : [];
  if (shellAt.length === 0) return solids;
  const shells = solids.flatMap((sid) => {
    const so = model.solids[sid];
    const list = [so.outerShellId, ...so.voidShellIds];
    return shellAt.map((h) => list[h]).filter((h) => model.shells[h]);
  });
  if (p.faces.length === 0) return shells;
  return shells.flatMap((hid) => p.faces.map((f) => model.shells[hid].faceIds[f]).filter((f) => model.faces[f]));
}
