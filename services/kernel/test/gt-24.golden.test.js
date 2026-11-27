// GT-24 (v0.3 §12; spec §11 r9, §13; row 3D-24): batch export of the assignment's buildings with one DRAFT_SOLID ->
// the delivered files hold no part of that building; it is named in the `export-report` with its state. Each building
// is one CityJSON file from its import source (D-3D24-4), saved to its `progress.save` dataset and delivered.
import { describe, expect, it } from 'vitest';
import { readFixture } from './commit-helpers.js';
import { get, headers, json, text } from './handler-helpers.js';
import { exportBatch, finalValidation, qcHandler } from './qc-helpers.js';

describe('GT-24 batch export skips the DRAFT_SOLID building and names it in the report', () => {
  const ids = ['bld-gt-24-a', 'bld-gt-24-b', 'bld-gt-24-c'];
  const models = ids.map((id) => readFixture('GT-24', `input.model.${id}.json`));
  const docs = ids.map((id) => readFixture('GT-24', `input.cityjson.${id}.json`));
  const steps = readFixture('GT-24', 'steps.json');
  const context = readFixture('GT-24', 'input.context.json');
  const a = readFixture('GT-24', 'expected.json').assert;
  const p = models[0].projectId;

  it('fixture: exactly one DRAFT_SOLID input; FINAL_VALIDATION of the others, then the batch', () => {
    expect(models.filter((m) => m.state === 'DRAFT_SOLID').map((m) => m.buildingId)).toEqual([a.skipped]);
    expect(steps.map((/** @type {any} */ s) => s.name)).toEqual(['FINAL_VALIDATION', 'EXPORT_BATCH']);
    expect(context.exportRequiresApproval).toBe(false);
  });

  it('files for a and c only; b skipped with its state', async () => {
    const { handle, datasets, sources } = await qcHandler(models, { over: { projectSettings: () => ({ exportRequiresApproval: context.exportRequiresApproval }) } });
    for (const [i, m] of models.entries()) {
      sources.set(p, m.buildingId, { cityjson: docs[i], saveRef: `save-${m.buildingId}`, basis: { kind: 'absent' } });
    }
    for (const b of steps[0].params.buildingIds) {
      const fv = await finalValidation(handle, models[ids.indexOf(b)], 'tok-qa');
      expect(fv.body.isValidForTargetState, b).toBe(true);
    }
    const assignment = context.assignments.find((/** @type {any} */ x) => x.id === steps[1].params.assignmentId);
    const r = await exportBatch(handle, p, assignment.buildingIds, 'tok-qa');
    expect(r.status).toBe(200);

    const report = r.body.report;
    expect(report.exported.map((/** @type {any} */ e) => e.buildingId)).toEqual(a.exported);
    expect(a.namedInExportReport).toBe(true);
    expect(report.skipped).toEqual([{ buildingId: a.skipped, state: a.skippedState, reasonKey: 'model3d.export.notValidSolid' }]);

    // independent of the export code: each delivered file is a CityJSON document holding only its own building
    const skippedObject = Object.keys(docs[ids.indexOf(a.skipped)].CityObjects)[0];
    expect(r.body.deliveries.map((/** @type {any} */ d) => d.buildingId)).toEqual(a.exported);
    for (const d of r.body.deliveries) {
      expect(d.save).toEqual({ status: 'SAVED' });
      expect(d.address).toBe(`https://kernel.test/api/projects/${p}/results/${d.digest}`);
      const served = await handle(get(`/api/projects/${p}/results/${d.digest}`, headers('tok-qa', null)));
      expect(served.status).toBe(200);
      const file = JSON.parse(text(served.body));
      expect(file.type).toBe('CityJSON');
      expect(Object.keys(file.CityObjects)).toEqual([d.buildingId]);
      expect(Object.keys(file.CityObjects)).not.toContain(skippedObject);
      expect((await datasets.read(`save-${d.buildingId}`))?.bytes).toEqual(served.body);
    }
    expect(await datasets.read(`save-${a.skipped}`)).toBeUndefined();
    console.log('GT-24', JSON.stringify({ exported: report.exported.map((/** @type {any} */ e) => e.buildingId), skipped: report.skipped }));
  });
});
