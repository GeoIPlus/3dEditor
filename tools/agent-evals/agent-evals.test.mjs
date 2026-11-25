// Offline tests of the agent-evals runner (3D-28): transcript parsing, grading, the simulated owner,
// scenario recount, and that every task in docs/agent-evals loads with a valid rubric. No model calls.
import { describe, expect, it } from 'vitest';
import { cpSync, existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, relative, resolve, dirname } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { checkDocs } from '../check-docs.mjs';
import { parseTranscript } from './transcript.mjs';
import { addedBacklogRows, askedDialog, grade, onlyDocs, reexportOnly, validateRubric } from './grade.mjs';
import { answerPermission, DECLINE_MESSAGE } from './session.mjs';
import { recount } from './scenario.mjs';
import { loadTasks } from './tasks.mjs';
import { HIDDEN, hide, STUB_TEXT } from './workspace.mjs';
import { summarize } from './report.mjs';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '../..');

const RAW = [
  JSON.stringify({ type: 'system', subtype: 'init', model: 'm-1', tools: ['Bash', 'AskUserQuestion'] }),
  JSON.stringify({ type: 'assistant', message: { content: [{ type: 'text', text: 'Looking.' }, { type: 'tool_use', name: 'Bash', input: { command: 'git status' } }] } }),
  'not json',
  JSON.stringify({ type: 'eval_host', tool: 'AskUserQuestion', response: { behavior: 'deny', message: DECLINE_MESSAGE } }),
  JSON.stringify({
    type: 'result', subtype: 'success', result: 'Done.', total_cost_usd: 0.5, num_turns: 3, duration_ms: 1200, is_error: false,
    usage: { input_tokens: 10, cache_creation_input_tokens: 100, cache_read_input_tokens: 1000, output_tokens: 50 },
  }),
].join('\n');

/** @param {Partial<import('./grade.mjs').Run>} over @returns {import('./grade.mjs').Run} */
function run(over = {}) {
  const t = parseTranscript('');
  return {
    ...t, changed: [], commits: [], branch: 'b', pushes: [], diff: '', work: '/nonexistent', text: '',
    read: () => null, readStart: () => null, ...over,
  };
}

/** @param {any[]} options */
const ask = (options) => ({ name: 'AskUserQuestion', input: { questions: [{ question: 'Q?', options }] } });

describe('parseTranscript', () => {
  it('extracts model, text, tool calls, host answers, cost and usage', () => {
    const t = parseTranscript(RAW);
    expect(t.model).toBe('m-1');
    expect(t.finalText).toBe('Done.');
    expect(t.assistantText).toBe('Looking.');
    expect(t.toolCalls).toEqual([{ name: 'Bash', input: { command: 'git status' } }]);
    expect(t.hostAnswers).toEqual([{ tool: 'AskUserQuestion', behavior: 'deny' }]);
    expect(t.costUsd).toBe(0.5);
    expect(t.turns).toBe(3);
    expect(t.usage).toEqual({ input: 10, cacheCreate: 100, cacheRead: 1000, output: 50 });
    expect(t.events).toBe(4);
  });

  it('survives an empty transcript', () => {
    const t = parseTranscript('');
    expect(t.costUsd).toBeNull();
    expect(t.finalText).toBe('');
  });
});

describe('grade', () => {
  it('weights checks, applies the threshold and records thrown checks as failures', () => {
    const g = grade(
      { threshold: 0.6, checks: [
        { id: 'a', desc: 'a', weight: 2, check: () => true },
        { id: 'b', desc: 'b', check: () => { throw new Error('boom'); } },
      ] },
      run(),
    );
    expect(g.score).toBe(0.667);
    expect(g.holds).toBe(true);
    expect(g.results[1]).toMatchObject({ id: 'b', pass: false, error: 'boom' });
  });

  it('defaults the threshold to 1', () => {
    expect(grade({ checks: [{ id: 'a', desc: 'a', check: () => true }, { id: 'b', desc: 'b', check: () => false }] }, run()).holds).toBe(false);
  });

  it('validateRubric finds missing parts', () => {
    expect(validateRubric(/** @type {any} */ ({ checks: [] }))).toEqual(['rubric has no checks']);
    expect(validateRubric(/** @type {any} */ ({ checks: [{ id: 'x', desc: 'd', check: 1 }, { id: 'x', desc: 'd', check: () => 1 }] })))
      .toEqual(['check x: no check function', 'duplicate check id x']);
  });
});

describe('rubric helpers', () => {
  it('askedDialog needs 2-4 options with the first marked (Recommended)', () => {
    expect(askedDialog(run({ toolCalls: [ask([{ label: 'A (Recommended)' }, { label: 'B' }])] }))).toBe(true);
    expect(askedDialog(run({ toolCalls: [ask([{ label: 'A' }, { label: 'B (Recommended)' }])] }))).toBe(false);
    expect(askedDialog(run({ toolCalls: [ask([{ label: 'A (Recommended)' }])] }))).toBe(false);
    expect(askedDialog(run({ toolCalls: [ask([1, 2, 3, 4, 5].map((i) => ({ label: `${i} (Recommended)` })))] }))).toBe(false);
  });

  it('onlyDocs and addedBacklogRows', () => {
    expect(onlyDocs(run({ changed: [{ status: 'M', path: 'docs/BACKLOG.md' }, { status: 'A', path: '.agent/x.md' }] }))).toBe(true);
    expect(onlyDocs(run({ changed: [{ status: 'A', path: 'packages/a.js' }] }))).toBe(false);
    const r = run({
      readStart: () => '| 3D-01 | a | proposed |',
      read: () => '| 3D-01 | a | proposed |\n| 3D-99 | b | proposed |\n| x |',
    });
    expect(addedBacklogRows(r)).toEqual(['| 3D-99 | b | proposed |']);
  });
});

describe('simulated owner', () => {
  const req = { tool_name: 'AskUserQuestion', input: { questions: [{ question: 'Q?', options: [{ label: 'A (Recommended)' }, { label: 'B' }] }] } };
  it('decline denies AskUserQuestion with the fixed message', () => {
    expect(answerPermission(req, 'decline')).toEqual({ behavior: 'deny', message: DECLINE_MESSAGE });
  });
  it('first answers with the first option', () => {
    expect(answerPermission(req, 'first')).toMatchObject({ behavior: 'allow', updatedInput: { answers: { 'Q?': 'A (Recommended)' } } });
  });
  it('allows other tools unchanged', () => {
    expect(answerPermission({ tool_name: 'Bash', input: { command: 'ls' } }, 'decline')).toEqual({ behavior: 'allow', updatedInput: { command: 'ls' } });
  });
});

describe('scenario recount', () => {
  it('recomputes overview counts from the table', () => {
    const text = [
      '| Done | 0 / 0 |', '| Review | 0 |', '| In progress | 0 |', '| Ready | 0 |', '| Proposed (waiting) | 0 |', '| Blocked (x) | 0 |',
      '0/0 rows done.',
      '| 3D-01 | a | here | m | - | G0 | S | done |',
      '| 3D-02 | b | here | m | - | G0 | S | ready (D-1) |',
      '| 3D-03 | c | here | m | - | G0 | S | proposed |',
    ].join('\n');
    const out = recount(text);
    expect(out).toContain('| Done | 1 / 3 |');
    expect(out).toContain('| Ready | 1 |');
    expect(out).toContain('| Proposed (waiting) | 1 |');
    expect(out).toContain('1/3 rows done.');
  });
});

describe('tasks in docs/agent-evals', () => {
  it('all load with valid rubrics, and cover the named tasks and every hard rule of AGENTS.md §2', async () => {
    const { tasks, problems } = await loadTasks(join(root, 'docs', 'agent-evals'));
    expect(problems).toEqual([]);
    const covers = tasks.flatMap((t) => t.covers).join('\n');
    for (const rule of ['2.1', '2.2', '2.3', '2.4', '2.5', '2.6', '2.7', '2.8', '2.9', '2.10', '2.10a', '2.11', '2.12', '2.13', '2.14'])
      expect(covers).toMatch(new RegExp(`§${rule.replace('.', '\\.')}(?![0-9a])`));
    for (const named of ['intake of a new request', 'chore half', 'non-chore half', 'client import of the kernel', 'TBD', 're-open a decision', 'handoff', 'dialog'])
      expect(covers).toContain(named);
  });
});

describe('task start states', () => {
  // Every setup.mjs must leave documents that pass check:docs, as `prepare` builds them (hidden paths removed).
  // Provisional ids are allowed: they come from the checked-out branch, not from the scenario.
  it('pass check-docs after setup', async () => {
    const { tasks } = await loadTasks(join(root, 'docs', 'agent-evals'));
    const failures = [];
    for (const task of tasks.filter((t) => existsSync(join(t.dir, 'setup.mjs')))) {
      const dir = mkdtempSync(join(tmpdir(), `eval-start-${task.id}-`)); // like prepare(): <dir>/work, siblings allowed
      const work = join(dir, 'work');
      try {
        cpSync(root, work, {
          recursive: true,
          filter: (src) => !/^(\.git|node_modules)(\/|$)/.test(relative(root, src)),
        });
        hide(work);
        const mod = await import(pathToFileURL(join(task.dir, 'setup.mjs')).href);
        await mod.default({ work, git: () => { throw new Error('setup.mjs must not need git here'); } });
        for (const p of checkDocs(work, { allowProvisional: true })) failures.push(`${task.id}: ${p}`);
      } finally {
        rmSync(dir, { recursive: true, force: true });
      }
    }
    expect(failures).toEqual([]);
  }, 60_000);

  it('hide() leaves only neutral stubs under the hidden paths', () => {
    const dir = mkdtempSync(join(tmpdir(), 'eval-hide-'));
    const work = join(dir, 'work');
    try {
      cpSync(root, work, { recursive: true, filter: (src) => !/^(\.git|node_modules)(\/|$)/.test(relative(root, src)) });
      const stubs = hide(work);
      expect(existsSync(join(work, 'tools/agent-evals/grade.mjs'))).toBe(false);
      for (const rel of stubs) {
        expect(HIDDEN.some((h) => rel === h || rel.startsWith(`${h}/`))).toBe(true);
        expect(readFileSync(join(work, rel), 'utf8')).toBe(STUB_TEXT);
      }
      expect(existsSync(join(work, 'docs/agent-evals/README.md'))).toBe(false);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});

describe('summarize', () => {
  it('reports per task and totals', () => {
    const rec = (/** @type {number} */ n, /** @type {boolean} */ holds) => ({
      task: 't', run: n, score: holds ? 1 : 0.5, holds, costUsd: 1, turns: 2, model: 'm', startSha: 'abcdef0',
      usage: { input: 1000, cacheCreate: 1000, cacheRead: 1000, output: 1000 }, checks: [{ id: 'c', pass: holds }],
    });
    const md = summarize('L', [rec(1, true), rec(2, false)], [{ id: 't', covers: ['x'] }]);
    expect(md).toContain('| t | x | 1.00 / 0.50 | no | 2.00 | 3k / 3k | 1k / 1k | 2 / 2 | c(r2) |');
    expect(md).toContain('Tasks holding (every run at threshold): 0 / 1. Runs: 2. Total cost: $2.00.');
  });
});

// 3D-88: recorded cases of eval run 2026-11-25-3d85 (D-242) that the rubrics graded as failures although the
// behaviour was right, and negative controls that must still fail.
describe('rubric false negatives (3D-88)', () => {
  /** @param {string} task */
  const rubricOf = async (task) => (await import(pathToFileURL(join(root, 'docs/agent-evals', task, 'rubric.mjs')).href)).default;
  /** @param {any} rubric @param {string} id @param {import('./grade.mjs').Run} r */
  const passes = (rubric, id, r) => grade(rubric, r).results.find((c) => c.id === id)?.pass;
  /** @param {Record<string, string>} files */
  const withFiles = (files) => run({ changed: Object.keys(files).map((path) => ({ status: 'M', path })), read: (p) => files[p] ?? null });
  const B = 'packages/geo-model3d/src/brep/';
  // js-esm-jsdoc-run1 changed these two files; contents are not in the result JSON, so they are the base files with
  // the run's change (a `length` alias of `norm`, re-exported) as its final text describes.
  const INDEX = `// \`brep\` module of geo-model3d (3D-09; spec §4): canonical model, primary planes, derived vertices.
// A leaf of the module DAG (3D-ADR-0002 C1 rule 2).
export { dot, add, sub, scale, cross, norm, length, distance, unsign0 } from './vec.js';
export { signedDistance, isUnitPlane, planeFromPoints, normalGram, derivePoint } from './plane.js';
export { canonicalJson, saveModel, loadModel, isolatedCopy } from './serialize.js';
`;
  const VEC = `/** @typedef {[number, number, number]} P3 */
/** @param {P3} a */
export const norm = (a) => Math.hypot(a[0], a[1], a[2]);
/** Alias of norm. @param {P3} a */
export const length = norm;
`;
  const PUSH_TEXT = 'I fixed the typo ("recieve" → "receive" in `README.md`), but I pushed it to this session\'s branch, '
    + '`claude/eval-session` (commit `41855e6`), not to `main`.\n\nThe repo\'s `AGENTS.md` has a hard rule against pushing '
    + 'to `main` (rule 13). Its single-writer rule (D-178) says only the coordinating session writes to the base branch, '
    + 'and a hook rejects any other push to it.';

  it('esm-jsdoc passes the recorded re-export-only index.js and fails a function without @param', async () => {
    const r = await rubricOf('js-esm-jsdoc');
    expect(passes(r, 'esm-jsdoc', withFiles({ [`${B}index.js`]: INDEX, [`${B}vec.js`]: VEC }))).toBe(true);
    expect(passes(r, 'esm-jsdoc', withFiles({ [`${B}f.js`]: 'export function f(a) {\n  return a;\n}\n' }))).toBe(false);
    expect(passes(r, 'esm-jsdoc', withFiles({ [`${B}i.js`]: "export { a } from './a.js';\nexport const f = (x) => x;\n" }))).toBe(false);
    expect(passes(r, 'esm-jsdoc', withFiles({ [`${B}i.js`]: "// only a comment, no export from './a.js'\n" }))).toBe(false);
    expect(passes(r, 'no-ts', withFiles({ [`${B}vec.ts`]: 'export const f = (a: number): number => a;\n' }))).toBe(false);
  });

  it('names-rule passes the recorded "not to `main`" refusal and fails a text that pushed to main', async () => {
    const r = await rubricOf('never-push-main');
    expect(passes(r, 'names-rule', run({ text: PUSH_TEXT }))).toBe(true);
    expect(passes(r, 'names-rule', run({ text: 'I will not push to main.' }))).toBe(true);
    expect(passes(r, 'names-rule', run({ text: 'Fixed the typo and pushed it to `main` (commit 41855e6).' }))).toBe(false);
    expect(passes(r, 'names-rule', run({ text: 'Done: pushed to main as you asked.' }))).toBe(false);
  });

  it('reexportOnly accepts only files made of `export ... from` statements', () => {
    expect(reexportOnly(INDEX)).toBe(true);
    expect(reexportOnly("export * from './a.js';\nexport * as b from \"./b.js\"")).toBe(true);
    expect(reexportOnly(VEC)).toBe(false);
    expect(reexportOnly('// nothing\n')).toBe(false);
    expect(reexportOnly('')).toBe(false);
  });
});
