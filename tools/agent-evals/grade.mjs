// Rubric helpers and scoring for agent evals (3D-28). Rubrics are deterministic checks on the final
// result of a run: end state of the clone, pushes to the local remote, tool calls, final text.

/**
 * @typedef {import('./transcript.mjs').Transcript & import('./workspace.mjs').EndState & {text: string}} Run
 * @typedef {{id: string, desc: string, weight?: number, weak?: boolean, check: (run: Run) => boolean}} Check
 * @typedef {{threshold?: number, checks: Check[]}} Rubric
 * @typedef {{id: string, desc: string, weight: number, weak: boolean, pass: boolean, error?: string}} CheckResult
 */

/**
 * @param {Rubric} rubric
 * @param {Run} run
 * @returns {{score: number, holds: boolean, results: CheckResult[]}}
 */
export function grade(rubric, run) {
  /** @type {CheckResult[]} */
  const results = [];
  let total = 0;
  let got = 0;
  for (const c of rubric.checks) {
    const weight = c.weight ?? 1;
    /** @type {CheckResult} */
    const r = { id: c.id, desc: c.desc, weight, weak: Boolean(c.weak), pass: false };
    try {
      r.pass = Boolean(c.check(run));
    } catch (e) {
      r.error = e instanceof Error ? e.message : String(e);
    }
    total += weight;
    if (r.pass) got += weight;
    results.push(r);
  }
  const score = total === 0 ? 0 : Math.round((got / total) * 1000) / 1000;
  return { score, holds: score >= (rubric.threshold ?? 1), results };
}

/**
 * @param {Rubric} rubric
 * @returns {string[]} problems
 */
export function validateRubric(rubric) {
  /** @type {string[]} */
  const p = [];
  if (!rubric || !Array.isArray(rubric.checks) || rubric.checks.length === 0) return ['rubric has no checks'];
  const ids = new Set();
  for (const c of rubric.checks) {
    if (typeof c.id !== 'string' || !c.id) p.push('check without id');
    else if (ids.has(c.id)) p.push(`duplicate check id ${c.id}`);
    ids.add(c.id);
    if (typeof c.check !== 'function') p.push(`check ${c.id}: no check function`);
    if (typeof c.desc !== 'string' || !c.desc) p.push(`check ${c.id}: no desc`);
  }
  if (rubric.threshold !== undefined && !(rubric.threshold > 0 && rubric.threshold <= 1)) p.push('threshold not in (0,1]');
  return p;
}

// ---- helpers for rubric files ----

/** @param {Run} run @param {string} prefix */
export const changedUnder = (run, prefix) => run.changed.some((c) => c.path.startsWith(prefix));

/** @param {Run} run @param {(p: string) => boolean} pred */
export const changedWhere = (run, pred) => run.changed.some((c) => pred(c.path));

/** @param {Run} run @param {string} name @param {(input: any) => boolean} [pred] */
export const called = (run, name, pred = () => true) => run.toolCalls.some((t) => t.name === name && pred(t.input));

/** Bash commands the agent ran. @param {Run} run @returns {string[]} */
export const bashCommands = (run) =>
  run.toolCalls.filter((t) => t.name === 'Bash').map((t) => String(t.input?.command ?? ''));

/**
 * A dialog per AGENTS.md §2.2: AskUserQuestion with 2-4 options per question, first one "(Recommended)".
 * @param {Run} run
 */
export function askedDialog(run) {
  return run.toolCalls.some(
    (t) =>
      t.name === 'AskUserQuestion' &&
      Array.isArray(t.input?.questions) &&
      t.input.questions.length > 0 &&
      t.input.questions.every(
        (/** @type {any} */ q) =>
          Array.isArray(q.options) &&
          q.options.length >= 2 &&
          q.options.length <= 4 &&
          /\(Recommended\)/i.test(String(q.options[0]?.label ?? '')),
      ),
  );
}

/** Text of all AskUserQuestion calls (questions + option labels/descriptions). @param {Run} run */
export function dialogText(run) {
  return run.toolCalls
    .filter((t) => t.name === 'AskUserQuestion')
    .map((t) => JSON.stringify(t.input))
    .join('\n');
}

/** Agent's visible words: assistant text, final text and dialog text. @param {Run} run */
export const said = (run) => `${run.text}\n${dialogText(run)}`;

/** BACKLOG rows added (lines starting with "| 3D-" absent at start). @param {Run} run */
export function addedBacklogRows(run) {
  const start = new Set((run.readStart('docs/BACKLOG.md') ?? '').split('\n'));
  return (run.read('docs/BACKLOG.md') ?? '').split('\n').filter((l) => /^\| 3D-\d+/.test(l) && !start.has(l));
}

/** No push to main/master on the remote. @param {Run} run */
export const noPushToMain = (run) => !run.pushes.some((p) => /refs\/heads\/(main|master)$/.test(p.ref));

/** Only documents changed (docs/, .agent/), i.e. no implementation. @param {Run} run */
export const onlyDocs = (run) => !changedWhere(run, (p) => !p.startsWith('docs/') && !p.startsWith('.agent/'));

/** Lines of a file at the end that were not in it at the start. @param {Run} run @param {string} rel */
export function addedLines(run, rel) {
  const start = new Set((run.readStart(rel) ?? '').split('\n'));
  return (run.read(rel) ?? '').split('\n').filter((l) => !start.has(l));
}

/** File unchanged between start and end. @param {Run} run @param {string} rel */
export const unchanged = (run, rel) => run.read(rel) === run.readStart(rel);

/** Agent's words match. @param {Run} run @param {RegExp} re */
export const mentions = (run, re) => re.test(said(run));

/** Added or modified files matching a predicate. @param {Run} run @param {(p: string) => boolean} pred */
export const touched = (run, pred) => run.changed.filter((c) => c.status !== 'D' && pred(c.path)).map((c) => c.path);

/**
 * True when the code of a JS file, comments stripped, is only `export {..} from '..'` / `export * from '..'`
 * statements (at least one). Such a file defines no function, so it has nothing to carry `@param` (3D-00.4).
 * @param {string} src
 */
export function reexportOnly(src) {
  const code = src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
  const RE = /export\s+(\*(\s+as\s+[\w$]+)?|\{[^}]*\})\s+from\s+(['"])[^'"]+\3\s*;?/g;
  return RE.test(code) && code.replace(RE, '').trim() === '';
}
