// Load and validate eval tasks from docs/agent-evals/<task>/ (3D-28).
// A task dir holds: task.json, prompt.md, rubric.mjs (default export: Rubric), optional setup.mjs.
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { validateRubric } from './grade.mjs';

/**
 * @typedef {{
 *   id: string, dir: string, covers: string[], branch: string, maxTurns: number, budgetUsd: number,
 *   owner: 'first' | 'decline',
 *   prompt: string, rubric: import('./grade.mjs').Rubric
 * }} Task
 */

const DEFAULTS = { branch: 'claude/eval-session', maxTurns: 40, budgetUsd: 3, owner: /** @type {'first' | 'decline'} */ ('decline') };

/**
 * @param {string} evalsDir
 * @returns {Promise<{tasks: Task[], problems: string[]}>}
 */
export async function loadTasks(evalsDir) {
  /** @type {Task[]} */
  const tasks = [];
  /** @type {string[]} */
  const problems = [];
  const names = readdirSync(evalsDir)
    .filter((n) => statSync(join(evalsDir, n)).isDirectory() && existsSync(join(evalsDir, n, 'task.json')))
    .sort();
  for (const name of names) {
    const dir = join(evalsDir, name);
    const where = `docs/agent-evals/${name}`;
    let meta;
    try {
      meta = JSON.parse(readFileSync(join(dir, 'task.json'), 'utf8'));
    } catch (e) {
      problems.push(`${where}/task.json: ${e instanceof Error ? e.message : e}`);
      continue;
    }
    if (meta.id !== name) problems.push(`${where}/task.json: id "${meta.id}" differs from dir name`);
    if (meta.owner !== undefined && !['first', 'decline'].includes(meta.owner)) problems.push(`${where}/task.json: owner must be first|decline`);
    if (!Array.isArray(meta.covers) || meta.covers.length === 0) problems.push(`${where}/task.json: covers is empty`);
    const promptFile = join(dir, 'prompt.md');
    const prompt = existsSync(promptFile) ? readFileSync(promptFile, 'utf8').trim() : '';
    if (!prompt) problems.push(`${where}/prompt.md missing or empty`);
    const rubricFile = join(dir, 'rubric.mjs');
    /** @type {any} */
    let rubric = null;
    if (!existsSync(rubricFile)) problems.push(`${where}/rubric.mjs missing`);
    else {
      rubric = (await import(pathToFileURL(rubricFile).href)).default;
      problems.push(...validateRubric(rubric).map((p) => `${where}/rubric.mjs: ${p}`));
    }
    tasks.push({ ...DEFAULTS, ...meta, id: name, dir, covers: meta.covers ?? [], prompt, rubric });
  }
  if (names.length === 0) problems.push('no tasks found');
  return { tasks, problems };
}
