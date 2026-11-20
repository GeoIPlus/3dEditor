// Drive one headless Claude Code session for an eval run (3D-28).
// Plain `claude -p` has no AskUserQuestion tool [V: probe 2026-11-20, CLI 2.1.330], so the session runs with
// stream-json input and `--permission-prompt-tool stdio`: the CLI then offers AskUserQuestion and sends each
// call to this host as a `can_use_tool` control request. The host plays the owner:
//   owner "first"   - answers every question with its first option (the one AGENTS.md §2.2 says is recommended);
//   owner "decline" - denies the question with a fixed message (owner unavailable).
// Every other permission request is allowed (the run is inside a throwaway clone).
import { spawn } from 'node:child_process';

export const DECLINE_MESSAGE = 'The owner did not answer; they are not available now.';

/**
 * Answer to a can_use_tool request.
 * @param {{tool_name?: string, input?: any}} req
 * @param {'first' | 'decline'} owner
 * @returns {{behavior: 'allow', updatedInput: any} | {behavior: 'deny', message: string}}
 */
export function answerPermission(req, owner) {
  if (req.tool_name !== 'AskUserQuestion') return { behavior: 'allow', updatedInput: req.input ?? {} };
  if (owner === 'decline') return { behavior: 'deny', message: DECLINE_MESSAGE };
  /** @type {Record<string, string>} */
  const answers = {};
  for (const q of req.input?.questions ?? []) answers[q.question] = q.options?.[0]?.label ?? '';
  return { behavior: 'allow', updatedInput: { ...req.input, answers } };
}

/**
 * @param {{prompt: string, cwd: string, maxTurns: number, budgetUsd: number, owner: 'first' | 'decline',
 *   model?: string, timeoutMs?: number}} o
 * @returns {Promise<string>} raw stdout (stream-json events), with host answers appended as `eval_host` events
 */
export function runSession(o) {
  const argv = [
    '-p',
    '--input-format', 'stream-json',
    '--output-format', 'stream-json', '--verbose',
    '--permission-prompt-tool', 'stdio',
    '--strict-mcp-config',
    '--permission-mode', 'bypassPermissions',
    '--max-turns', String(o.maxTurns),
    '--max-budget-usd', String(o.budgetUsd),
    '--no-session-persistence',
  ];
  if (o.model) argv.push('--model', o.model);
  return new Promise((resolve, reject) => {
    const p = spawn('claude', argv, { cwd: o.cwd, stdio: ['pipe', 'pipe', 'pipe'] });
    let raw = '';
    let buf = '';
    let err = '';
    const timer = setTimeout(() => p.kill('SIGTERM'), o.timeoutMs ?? 30 * 60_000);
    p.stdout.on('data', (d) => {
      raw += d;
      buf += d;
      let i;
      while ((i = buf.indexOf('\n')) >= 0) {
        const line = buf.slice(0, i);
        buf = buf.slice(i + 1);
        let ev;
        try {
          ev = JSON.parse(line);
        } catch {
          continue;
        }
        if (ev.type === 'control_request' && ev.request?.subtype === 'can_use_tool') {
          const response = answerPermission(ev.request, o.owner);
          raw += `${JSON.stringify({ type: 'eval_host', tool: ev.request.tool_name, response })}\n`;
          p.stdin.write(`${JSON.stringify({ type: 'control_response', response: { subtype: 'success', request_id: ev.request_id, response } })}\n`);
        }
        if (ev.type === 'result') p.stdin.end();
      }
    });
    p.stderr.on('data', (d) => (err += d));
    p.on('error', reject);
    p.on('close', (code) => {
      clearTimeout(timer);
      if (raw.trim()) resolve(raw);
      else reject(new Error(`claude exited ${code}: ${err.slice(0, 500)}`));
    });
    p.stdin.write(`${JSON.stringify({ type: 'user', message: { role: 'user', content: o.prompt } })}\n`);
  });
}
