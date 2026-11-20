// Parse a Claude Code `--output-format stream-json --verbose` transcript (3D-28).
// Input: the raw stdout (one JSON event per line). Output: what the rubric and the report need.

/**
 * @typedef {{name: string, input: any}} ToolCall
 * @typedef {{
 *   finalText: string,
 *   assistantText: string,
 *   toolCalls: ToolCall[],
 *   costUsd: number | null,
 *   turns: number | null,
 *   durationMs: number | null,
 *   model: string | null,
 *   usage: {input: number, cacheCreate: number, cacheRead: number, output: number},
 *   isError: boolean,
 *   stopReason: string | null,
 *   events: number,
 *   hostAnswers: {tool: string, behavior: string}[],
 * }} Transcript
 */

/**
 * @param {string} raw
 * @returns {Transcript}
 */
export function parseTranscript(raw) {
  /** @type {Transcript} */
  const t = {
    finalText: '',
    assistantText: '',
    toolCalls: [],
    costUsd: null,
    turns: null,
    durationMs: null,
    model: null,
    usage: { input: 0, cacheCreate: 0, cacheRead: 0, output: 0 },
    isError: false,
    stopReason: null,
    events: 0,
    hostAnswers: [],
  };
  /** @type {string[]} */
  const texts = [];
  for (const line of raw.split('\n')) {
    const s = line.trim();
    if (!s.startsWith('{')) continue;
    let ev;
    try {
      ev = JSON.parse(s);
    } catch {
      continue;
    }
    t.events += 1;
    if (ev.type === 'eval_host') t.hostAnswers.push({ tool: String(ev.tool), behavior: String(ev.response?.behavior) });
    if (ev.type === 'system' && ev.subtype === 'init' && typeof ev.model === 'string') t.model = ev.model;
    if (ev.type === 'assistant' && ev.message && Array.isArray(ev.message.content)) {
      for (const block of ev.message.content) {
        if (block.type === 'text' && typeof block.text === 'string') texts.push(block.text);
        if (block.type === 'tool_use') t.toolCalls.push({ name: String(block.name), input: block.input ?? {} });
      }
    }
    if (ev.type === 'result') {
      if (typeof ev.result === 'string') t.finalText = ev.result;
      if (typeof ev.total_cost_usd === 'number') t.costUsd = ev.total_cost_usd;
      if (typeof ev.num_turns === 'number') t.turns = ev.num_turns;
      if (typeof ev.duration_ms === 'number') t.durationMs = ev.duration_ms;
      t.isError = Boolean(ev.is_error);
      t.stopReason = typeof ev.subtype === 'string' ? ev.subtype : null;
      const u = ev.usage ?? {};
      t.usage = {
        input: u.input_tokens ?? 0,
        cacheCreate: u.cache_creation_input_tokens ?? 0,
        cacheRead: u.cache_read_input_tokens ?? 0,
        output: u.output_tokens ?? 0,
      };
    }
  }
  t.assistantText = texts.join('\n\n');
  if (!t.finalText) t.finalText = texts.at(-1) ?? '';
  return t;
}
