#!/usr/bin/env node
// Agent evals runner (3D-28). Costs money: it starts headless Claude Code sessions. Not part of `npm run check`.
// Usage:
//   node tools/agent-evals/cli.mjs --list                       validate and list tasks (free, offline)
//   node tools/agent-evals/cli.mjs --dry [--out dir]            build every start state, grade a do-nothing run (free)
//   node tools/agent-evals/cli.mjs --regrade <label> [--out dir] re-grade saved runs after a rubric fix (free)
//   node tools/agent-evals/cli.mjs --run <task|all> [--runs 2] [--ref HEAD] [--label name] [--out dir]
//        [--model id] [--parallel 1] [--max-total-usd 50]
// No new run starts once the batch has spent --max-total-usd (started runs finish; per-run cap: task.json
// budgetUsd, default 3). Use a --ref without eval commits on top, so the git log does not hint at the eval.
// Each run: fresh clone of --ref (default HEAD) + task setup, a headless session on prompt.md (session.mjs),
// rubric on the end state.
// Results (compact JSON per run + summary.md) go to docs/agent-evals/results/<label>/; raw transcripts to --out.
import { execFileSync } from 'node:child_process';
import { mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join, resolve, dirname } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
import { loadTasks } from './tasks.mjs';
import { prepare, reopen, snapshot } from './workspace.mjs';
import { parseTranscript } from './transcript.mjs';
import { runSession } from './session.mjs';
import { grade } from './grade.mjs';
import { readRecords, summarize } from './report.mjs';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const evalsDir = join(root, 'docs', 'agent-evals');

/** @param {string[]} argv */
function args(argv) {
  /** @type {Record<string, string | boolean>} */
  const a = {};
  for (let i = 0; i < argv.length; i += 1) {
    const k = argv[i].replace(/^--/, '');
    const v = argv[i + 1];
    if (v === undefined || v.startsWith('--')) a[k] = true;
    else {
      a[k] = v;
      i += 1;
    }
  }
  return a;
}

/**
 * @param {import('./tasks.mjs').Task} task
 * @param {number} n
 * @param {{ref: string, outDir: string, resultsDir: string, model?: string}} o
 */
async function runOnce(task, n, o) {
  const dir = join(o.outDir, `${task.id}-run${n}`);
  rmSync(dir, { recursive: true, force: true });
  const ws = await prepare({ repoRoot: root, ref: o.ref, dir, branch: task.branch, taskDir: task.dir });
  const raw = await runSession({ prompt: task.prompt, cwd: ws.work, maxTurns: task.maxTurns, budgetUsd: task.budgetUsd, owner: task.owner, model: o.model });
  writeFileSync(join(dir, 'transcript.jsonl'), raw);
  const record = evaluate(task, n, ws, raw, o.ref);
  writeFileSync(join(o.resultsDir, `${task.id}-run${n}.json`), `${JSON.stringify(record, null, 2)}\n`);
  console.log(`${task.id} run${n}: score ${record.score} ${record.holds ? 'holds' : 'FAILS'} $${record.costUsd?.toFixed(2)} turns ${record.turns}`);
  return record;
}

/**
 * Grade a finished run and build its compact record.
 * @param {import('./tasks.mjs').Task} task
 * @param {number} n
 * @param {import('./workspace.mjs').Workspace} ws
 * @param {string} raw
 * @param {string} ref
 */
function evaluate(task, n, ws, raw, ref) {
  const t = parseTranscript(raw);
  const end = snapshot(ws);
  const run = { ...t, ...end, text: `${t.assistantText}\n${t.finalText}` };
  const g = grade(task.rubric, run);
  return {
    task: task.id, run: n, ref, startSha: ws.startSha, model: t.model,
    score: g.score, holds: g.holds, checks: g.results.map(({ id, pass, weak, error }) => ({ id, pass, weak, error })),
    costUsd: t.costUsd, turns: t.turns, durationMs: t.durationMs, usage: t.usage,
    toolCalls: t.toolCalls.length, toolNames: [...new Set(t.toolCalls.map((c) => c.name))],
    stopReason: t.stopReason, isError: t.isError, hostAnswers: t.hostAnswers,
    changed: end.changed, commits: end.commits, pushes: end.pushes,
    finalText: t.finalText.slice(0, 1500),
  };
}

/**
 * Re-grade saved runs (after a rubric fix) from their clones and transcripts in --out; no model calls.
 * @param {import('./tasks.mjs').Task[]} tasks
 * @param {string} resultsDir
 * @param {string} outDir
 */
function regrade(tasks, resultsDir, outDir) {
  for (const old of readRecords(resultsDir)) {
    const task = tasks.find((t) => t.id === old.task);
    if (!task) continue;
    const dir = join(outDir, `${old.task}-run${old.run}`);
    const raw = readFileSync(join(dir, 'transcript.jsonl'), 'utf8');
    const rec = evaluate(task, old.run, reopen(dir, task.branch, old.startSha), raw, old.ref);
    writeFileSync(join(resultsDir, `${old.task}-run${old.run}.json`), `${JSON.stringify(rec, null, 2)}\n`);
    if (rec.score !== old.score) console.log(`${old.task} run${old.run}: ${old.score} -> ${rec.score}`);
  }
  writeFileSync(join(resultsDir, 'summary.md'), summarize(String(resultsDir.split('/').at(-1)), readRecords(resultsDir), tasks));
}

/**
 * Free check of every task: start state builds, docs are consistent there, and the score of a
 * do-nothing run (no agent). A rubric that a do-nothing run passes measures little.
 * @param {import('./tasks.mjs').Task[]} tasks
 * @param {string} outDir
 */
async function dryRun(tasks, outDir) {
  for (const task of tasks) {
    const dir = join(outDir, task.id);
    rmSync(dir, { recursive: true, force: true });
    const ws = await prepare({ repoRoot: root, ref: 'HEAD', dir, branch: task.branch, taskDir: task.dir });
    let docs = 'docs ok';
    try {
      execFileSync('node', ['tools/check-docs.mjs'], { cwd: ws.work, stdio: 'pipe' });
    } catch (e) {
      docs = `DOCS FAIL: ${String(/** @type {any} */ (e).stdout ?? e).trim().split('\n')[0]}`;
    }
    const t = parseTranscript('');
    const g = grade(task.rubric, { ...t, ...snapshot(ws), text: '' });
    const passed = g.results.filter((r) => r.pass).map((r) => r.id);
    console.log(`${task.id}: ${docs}; do-nothing score ${g.score} (passes: ${passed.join(', ') || '-'})`);
  }
}

async function main() {
  const a = args(process.argv.slice(2));
  const { tasks, problems } = await loadTasks(evalsDir);
  if (problems.length) {
    for (const p of problems) console.error(p);
    process.exit(1);
  }
  if (a.dry) {
    await dryRun(tasks, String(a.out ?? join(tmpdir(), 'agent-evals', 'dry')));
    return;
  }
  if (a.regrade) {
    const label = String(a.regrade);
    regrade(tasks, join(evalsDir, 'results', label), String(a.out ?? join(tmpdir(), 'agent-evals', label)));
    return;
  }
  if (a.list || !a.run) {
    for (const t of tasks) console.log(`${t.id}  covers: ${t.covers.join(', ')}  checks: ${t.rubric.checks.length}`);
    console.log(`${tasks.length} tasks valid`);
    return;
  }
  const pick = a.run === 'all' ? tasks : tasks.filter((t) => String(a.run).split(',').includes(t.id));
  if (pick.length === 0) throw new Error(`no task matches ${a.run}`);
  const runs = Number(a.runs ?? 2);
  const label = String(a.label ?? new Date().toISOString().slice(0, 10));
  const resultsDir = join(evalsDir, 'results', label);
  const outDir = String(a.out ?? join(tmpdir(), 'agent-evals', label));
  mkdirSync(resultsDir, { recursive: true });
  mkdirSync(outDir, { recursive: true });
  // Resolve once and show it: a stale local branch name silently measures old instructions.
  const ref = execFileSync('git', ['rev-parse', String(a.ref ?? 'HEAD')], { cwd: root, encoding: 'utf8' }).trim();
  const subject = execFileSync('git', ['log', '-1', '--format=%h %s', ref], { cwd: root, encoding: 'utf8' }).trim();
  console.log(`ref ${a.ref ?? 'HEAD'} = ${subject}`);
  const model = typeof a.model === 'string' ? a.model : undefined;
  const jobs = pick.flatMap((t) => Array.from({ length: runs }, (_, i) => /** @type {const} */ ([t, i + 1])));
  const parallel = Math.max(1, Number(a.parallel ?? 1));
  const maxTotal = Number(a['max-total-usd'] ?? 50);
  /** @type {any[]} */
  const records = [];
  let next = 0;
  const worker = async () => {
    while (next < jobs.length) {
      const spent = records.reduce((s, r) => s + (r.costUsd ?? 0), 0);
      if (spent >= maxTotal) {
        console.error(`stopped: spent $${spent.toFixed(2)} >= --max-total-usd ${maxTotal}; ${jobs.length - next} runs not started`);
        return;
      }
      const [t, n] = jobs[next++];
      try {
        records.push(await runOnce(t, n, { ref, outDir, resultsDir, model }));
      } catch (e) {
        console.error(`${t.id} run${n}: ERROR ${e instanceof Error ? e.message : e}`);
      }
    }
  };
  await Promise.all(Array.from({ length: parallel }, worker));
  writeFileSync(join(resultsDir, 'summary.md'), summarize(label, readRecords(resultsDir), tasks));
  console.log(`results: ${resultsDir}`);
}

main().catch((e) => {
  console.error(e instanceof Error ? e.message : e);
  process.exit(1);
});
