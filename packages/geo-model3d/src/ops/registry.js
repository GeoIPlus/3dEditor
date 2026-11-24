// ops (3D-14): operation modules by `OperationKind` (spec §10.1: one module per kind; §2.2: 37 kinds). Rows
// 3D-15..3D-21 and 3D-71 add their modules here; a kind without a module is refused INTERNAL by the pipeline.
import { replaceRoof } from './replace-roof.js';
import { rebuildEnvelope } from './rebuild-envelope.js';

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
};
