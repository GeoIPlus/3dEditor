// Export gate and batch export of the kernel service (3D-24; spec §11 r9; v0.3 §8.4; 3D-ADR-0003 §4; D-3D24-4,
// D-3D24-8). Per building, at its head version: gate (VALID_SOLID or APPROVED with a passed stored FINAL_VALIDATION;
// only APPROVED when the project sets `exportRequiresApproval`, D-90) -> kernel `exportBuilding` on the import's
// source document -> save to its `progress.save` dataset (D-430) -> deliver the bytes. A building without the right,
// or whose export fails, is skipped with a `reasonKey` and listed; the others go on. Nothing is deleted (D-84).
import { exportBuilding } from '@geoiplus/geo-model3d';
import { passed } from './qc.js';
import { deliverResult, saveResult } from './results.js';

/**
 * @typedef {object} ExportDeps
 * @property {import('./ports/history.js').HistoryPort} history
 * @property {import('./ports/datasets.js').DatasetsPort} datasets
 * @property {import('./ports/sources.js').SourcesPort} sources
 * @property {string} publicBase `https` origin of the service (delivered addresses, 3D-128)
 * @property {(projectId: string) => any} toleranceProfile
 * @property {(projectId: string) => { exportRequiresApproval?: boolean } | undefined} [projectSettings] default
 *   `exportRequiresApproval: false` (v0.3 Д-03, D-90)
 */

/** Localisation keys of a skip (contract `export-report` `reasonKey`) [P] (D-3D24-6, D-3D24-8). */
export const SKIP = Object.freeze({
  UNKNOWN: 'model3d.export.unknownBuilding',
  NOT_VALID: 'model3d.export.notValidSolid',
  NOT_APPROVED: 'model3d.export.notApproved',
  NO_FINAL_VALIDATION: 'model3d.export.noFinalValidation',
  NO_SOURCE: 'model3d.export.noSource',
  FAILED: 'model3d.export.failed',
  SAVE_KEPT: 'model3d.export.saveKept',
});

const encoder = new TextEncoder();

/** @param {ExportDeps} deps */
export function createExport(deps) {
  const { history } = deps;

  /**
   * Gate of one building at version `n` (spec §11 r9). @param {string} p @param {string} b @param {number} n
   * @param {boolean} requireApproval @returns {Promise<{ model: any, state: string } | { state?: string, reasonKey: string }>}
   */
  async function gate(p, b, n, requireApproval) {
    const model = await history.readVersion(p, b, n);
    const state = (await history.readApproval(p, b, n)) ? 'APPROVED' : model.state;
    if (requireApproval && state !== 'APPROVED') return { state, reasonKey: state === 'VALID_SOLID' ? SKIP.NOT_APPROVED : SKIP.NOT_VALID };
    if (state !== 'VALID_SOLID' && state !== 'APPROVED') return { state, reasonKey: SKIP.NOT_VALID };
    if (!passed(await history.readFinalValidation(p, b, n))) return { state, reasonKey: SKIP.NO_FINAL_VALIDATION };
    return { model, state };
  }

  /**
   * One building past the gate: export, save, deliver.
   * @param {string} p @param {string} b @param {number} n @param {any} model
   */
  async function one(p, b, n, model) {
    const source = await deps.sources.source(p, b);
    if (!source) return { skip: SKIP.NO_SOURCE };
    const { cityjson } = exportBuilding({ model, cityjson: source.cityjson, toleranceProfile: deps.toleranceProfile(p) });
    const bytes = encoder.encode(JSON.stringify(cityjson));
    const save = await saveResult({ datasets: deps.datasets, projectId: p, ref: source.saveRef, bytes, basis: source.basis });
    if (save.status === 'KEPT') return { skip: SKIP.SAVE_KEPT, delivery: { buildingId: b, modelVersion: n, save: { status: 'KEPT', reason: save.reason } } };
    if (save.status === 'SAVED') await deps.sources.saved(p, b, save.entityTag);
    const { digest, address } = await deliverResult({ datasets: deps.datasets, publicBase: deps.publicBase, projectId: p, bytes });
    const outcome = save.status === 'SAVED' ? { status: 'SAVED' } : { status: save.status, reason: save.reason };
    return { delivery: { buildingId: b, modelVersion: n, digest, address, save: outcome } };
  }

  /**
   * Batch export (contract `export-request` -> `export-result`). Buildings in request order.
   * @param {string} p @param {{ buildingIds: string[] }} request
   */
  async function exportBatch(p, request) {
    const requireApproval = deps.projectSettings?.(p)?.exportRequiresApproval === true;
    /** @type {{ buildingId: string, modelVersion: number }[]} */
    const exported = [];
    /** @type {{ buildingId: string, state?: string, reasonKey: string }[]} */
    const skipped = [];
    /** @type {any[]} */
    const deliveries = [];
    for (const b of request.buildingIds) {
      const n = await history.head(p, b);
      if (n === undefined) { skipped.push({ buildingId: b, reasonKey: SKIP.UNKNOWN }); continue; }
      let state;
      try {
        const g = await gate(p, b, n, requireApproval);
        if (!('model' in g)) { skipped.push({ buildingId: b, ...(g.state ? { state: g.state } : {}), reasonKey: g.reasonKey }); continue; }
        state = g.state;
        const r = await one(p, b, n, g.model);
        if (r.delivery) deliveries.push(r.delivery);
        if (r.skip) skipped.push({ buildingId: b, state, reasonKey: r.skip });
        else exported.push({ buildingId: b, modelVersion: n });
      } catch {
        // D-3D24-8: an export / store failure skips this building only; what was delivered or saved stays (D-84)
        skipped.push({ buildingId: b, ...(state ? { state } : {}), reasonKey: SKIP.FAILED });
      }
    }
    return { report: { exported, skipped }, deliveries };
  }

  return { exportBatch };
}
