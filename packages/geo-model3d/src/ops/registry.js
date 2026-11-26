// ops (3D-14): operation modules by `OperationKind` (spec §10.1: one module per kind; §2.2: 37 kinds). Rows
// 3D-15..3D-21 and 3D-71 add their modules here; a kind without a module is refused INTERNAL by the pipeline.
import { replaceRoof } from './replace-roof.js';
import { rebuildEnvelope } from './rebuild-envelope.js';
import { moveVertex, moveEdge } from './move.js';
import { offsetFace } from './offset-face.js';
import { splitFace } from './split-face.js';
import { insertRoofBreak } from './insert-roof-break.js';
import { mergeFaces } from './merge-faces.js';
import { setSemantics } from './set-semantics.js';
import { setConstraint, removeConstraint } from './constraint-commands.js';
import { alignRidge, alignEave } from './align-line.js';
import { matchElevations } from './match-elevations.js';
import { addChimney } from './add-chimney.js';
import { addDormer } from './add-dormer.js';
import { removeInstallation } from './remove-installation.js';
import { fitPlaneCommand } from './fit-plane.js';
import { fitToSharedEdge } from './fit-to-shared-edge.js';
import { removeFace } from './remove-face.js';
import { healHole } from './heal-hole.js';
import { alignJunction } from './align-junction.js';

/** @typedef {{ run: (draft: any, payload: any, ctx: import('./pipeline.js').OpContext) => import('./pipeline.js').OpResult }} Operation */

/** Contract `OperationKind` (common.schema.json; spec §2.2). */
export const OPERATION_KINDS = new Set([
  'IMPORT_BUILDING', 'RESTORE_BASELINE', 'MOVE_VERTEX', 'MOVE_EDGE', 'OFFSET_FACE', 'SPLIT_FACE', 'INSERT_ROOF_BREAK',
  'MERGE_FACES', 'REMOVE_DETAILS', 'ALIGN_RIDGE', 'ALIGN_EAVE', 'MATCH_ELEVATIONS', 'STRAIGHTEN_FACE', 'TRIM_FACE',
  'EXTEND_FACE', 'REMOVE_FACE', 'HEAL_HOLE', 'FIT_TO_SHARED_EDGE', 'ALIGN_JUNCTION', 'RESIZE_ROOF', 'SET_OVERHANG',
  'REGULARIZE_FOOTPRINT', 'ALIGN_WALL', 'SET_HEIGHT', 'TRANSLATE_BUILDING', 'ROTATE_BUILDING', 'ADD_DORMER',
  'ADD_CHIMNEY', 'REMOVE_INSTALLATION', 'REPLACE_ROOF', 'REBUILD_ENVELOPE', 'SET_SEMANTICS', 'SET_CONSTRAINT',
  'REMOVE_CONSTRAINT', 'FIT_PLANE', 'UNDO', 'REDO',
]);

/** @type {Record<string, Operation>} */
export const OPERATIONS = {
  REPLACE_ROOF: { run: replaceRoof },
  REBUILD_ENVELOPE: { run: rebuildEnvelope },
  MOVE_VERTEX: { run: moveVertex }, // 3D-15
  MOVE_EDGE: { run: moveEdge }, // 3D-15
  OFFSET_FACE: { run: offsetFace }, // 3D-15
  SPLIT_FACE: { run: splitFace }, // 3D-15
  INSERT_ROOF_BREAK: { run: insertRoofBreak }, // 3D-15
  MERGE_FACES: { run: mergeFaces }, // 3D-15
  SET_SEMANTICS: { run: setSemantics },
  SET_CONSTRAINT: { run: setConstraint },
  REMOVE_CONSTRAINT: { run: removeConstraint },
  ALIGN_RIDGE: { run: alignRidge },
  ALIGN_EAVE: { run: alignEave },
  MATCH_ELEVATIONS: { run: matchElevations },
  ADD_CHIMNEY: { run: addChimney },
  ADD_DORMER: { run: addDormer },
  REMOVE_INSTALLATION: { run: removeInstallation },
  FIT_PLANE: { run: fitPlaneCommand },
  FIT_TO_SHARED_EDGE: { run: fitToSharedEdge },
  REMOVE_FACE: { run: removeFace },
  HEAL_HOLE: { run: healHole },
  ALIGN_JUNCTION: { run: alignJunction },
};
