// brep (3D-09): JSDoc types of the canonical BuildingModel. The authoritative shape is the contract
// `contracts/model3d/building-model.schema.json` (D-75); these typedefs mirror the members the kernel reads.
export {};

/** @typedef {import('./vec.js').P3} P3 */
/** @typedef {import('./plane.js').Plane} Plane */
/** @typedef {import('./frame.js').CoordinateFrame} CoordinateFrame */
/** @typedef {'DRAFT_SURFACE' | 'DRAFT_SOLID' | 'VALID_SOLID' | 'APPROVED'} ModelState */

/**
 * @typedef {object} Vtx
 * @property {string} id
 * @property {P3} p local frame, metres
 * @property {string[]} definingFaceIds
 * @property {'DERIVED' | 'EXPLICIT'} positionMode EXPLICIT: imported and kept at file position (D-70), or fewer than
 *   three independent planes (spec §4 rule 3)
 * @property {string} [provenanceId]
 * @property {string} [sourceRef]
 */

/**
 * @typedef {object} HalfEdge
 * @property {string} id
 * @property {string} startVertexId
 * @property {string} nextId
 * @property {string} prevId
 * @property {string} faceId
 * @property {string | null} twinId
 * @property {string} edgeRole
 * @property {string} [nonManifoldGroupId]
 */

/**
 * @typedef {object} Face
 * @property {string} id
 * @property {string} outerLoopId
 * @property {string[]} innerLoopIds
 * @property {Plane} supportPlane authoritative (spec §4 rule 1)
 * @property {string} surfaceKind
 * @property {string[]} tags
 * @property {string} [roofComponentId]
 * @property {string} [sourceRef]
 */

/** @typedef {{ id: string, faceIds: string[], intendedRole: 'OUTER' | 'VOID', isClosed: boolean }} Shell */
/** @typedef {{ id: string, outerShellId: string, voidShellIds: string[] }} Solid */
/** @typedef {{ id: string, ownerId: string, faceIds: string[] }} RoofComponent */

/**
 * Contract `BuildingModel`. Entity collections are objects keyed by id.
 * @typedef {object} BuildingModel
 * @property {'1'} schemaVersion
 * @property {string} projectId
 * @property {string} buildingId
 * @property {number} version
 * @property {ModelState} state
 * @property {CoordinateFrame} frame
 * @property {Record<string, any>} footprints
 * @property {Record<string, any>} constructionEntities
 * @property {Record<string, Vtx>} vertices
 * @property {Record<string, HalfEdge>} halfEdges
 * @property {Record<string, Face>} faces
 * @property {Record<string, Shell>} shells
 * @property {Record<string, Solid>} solids
 * @property {Record<string, RoofComponent>} roofComponents
 * @property {Record<string, any>} constraints
 * @property {Record<string, any>} measurements
 * @property {Record<string, any>} semantics
 * @property {string} toleranceProfileId
 */

/**
 * The tolerance values the core reads (contract `tolerance-profile`, defaults spec §2.3, D-13).
 * @typedef {object} CoreTolerances
 * @property {number} numericEpsilon
 * @property {number} topologySnapTolM
 * @property {number} planarTolM
 */
