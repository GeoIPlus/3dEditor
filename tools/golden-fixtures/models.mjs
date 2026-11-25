// Shared canonical input models of the fixtures.

import { toModel } from './brep.mjs';
import { IMPORT_TRANSLATE } from './cityjson.mjs';
import { gable } from './geom.mjs';

export const GABLE = gable();
export const GABLE_COID = 'bld-gt-i1';

/** The GT-03 result: gable 10 x 8, eave 5, ridge 8 along X, derived vertices, version 1 [P]. @param {string} buildingId */
export const gt03Model = (buildingId, extra = {}) => toModel(GABLE, { buildingId, ...extra });

/** The GT-I1 gable as imported: explicit vertices (D-70), `sourceRef`, world origin of the CityJSON. @param {string} buildingId */
export const importedGable = (buildingId) => toModel(GABLE, {
  buildingId, imported: true, cityObjectId: GABLE_COID, originWorld: IMPORT_TRANSLATE,
  originalSourceRef: 'fixtures/GT-I1/input.cityjson.json',
});

/** Common marks. */
export const MARK = Object.freeze({
  ids: { what: 'Entity ids (`v-*`, `he-<face>-<i>`, `f-*`, `bld-*`, `cmd-*`)', mark: /** @type {const} */ ('[P]'), why: 'Readable fixed ids; the `EntityId` format is open (Q-26)' },
  version: { what: 'Model `version` 1 before the first step', mark: /** @type {const} */ ('[P]'), why: 'Any version works; commands carry it as `expectedVersion`' },
  crs: { what: '`horizontalCrs` EPSG:25832, `verticalCrs` null', mark: /** @type {const} */ ('[P]'), why: 'Any projected CRS (geographic is refused, spec §6 r14); vertical CRS not given' },
  gt03: { what: 'Input = the GT-03 result (gable 10 x 8, eave 5, ridge 8 along X at y = 4, derived vertices)', mark: /** @type {const} */ ('[A]'), why: 'v0.3 §12 "GT-03 ->"' },
  commit: { what: 'Commands as COMMIT without `previewId`', mark: /** @type {const} */ ('[A]'), why: 'A runner that needs PREVIEW first sends the same command as PREVIEW and copies `previewId` (v0.3 §3)' },
  actor: { what: '`actorId` `usr-operator`', mark: /** @type {const} */ ('[P]'), why: 'Informational only (v0.2 D.2)' },
});

/** Standard independent-check text for metrics of a closed model. */
export const CHECK_METRICS = 'The test computes area (Newell) and volume (divergence theorem over the face rings) from the fixture '
  + 'coordinates with its own code, not with the kernel.';
