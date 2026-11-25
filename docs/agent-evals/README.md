# Agent evals (3D-28)

Purpose: prove the agent instructions (AGENTS.md, CLAUDE.md, `.claude/skills/`) by measurement (D-27), and keep an
instruction change only if the evals hold (AGENTS.md §7.8). Runner: [tools/agent-evals/](../../tools/agent-evals/).
`3D-31-code-graph.md` in this folder belongs to 3D-31, not to this suite.

## A task

`docs/agent-evals/<task>/`:

| File | Content |
|---|---|
| `task.json` | `id` (= dir name), `covers` (rule or named task it proves), optional `branch` (default `claude/eval-session`), `maxTurns` (40), `budgetUsd` (3), `owner` (`decline`) |
| `prompt.md` | the owner's message, sent as the first user turn |
| `setup.mjs` | optional: builds the scenario in the clone (rows, files), using [scenario.mjs](../../tools/agent-evals/scenario.mjs) so overview counts stay consistent; scenario rows use ids 3D-900..3D-999 only (D-3D102-1), `addRow` refuses others and ids of real rows |
| `rubric.mjs` | deterministic checks on the **final result** (files, commits, pushes, tool calls, final text); `weak: true` marks a textual check that can pass falsely |

## How a run works [V: tools/agent-evals/workspace.mjs, session.mjs]

1. Start state: `git clone` of `--ref` into a scratch dir; only the task branch, the base and `main` exist; `origin` is a
   local bare repository, so pushes are harmless and visible. `docs/agent-evals`, `tools/agent-evals` and the 3D-28
   checkpoint are removed (the agent never sees its rubric). `setup.mjs` runs; everything is committed as
   "Session start state".
2. Session: headless Claude Code, `--input-format stream-json --permission-prompt-tool stdio`, `--strict-mcp-config`
   (no MCP), `--permission-mode bypassPermissions` (inside the throwaway clone only), `--max-turns`, `--max-budget-usd`.
   Plain `claude -p` has no AskUserQuestion tool; this mode has it and routes every call to the runner.
3. Simulated owner (D-63): every AskUserQuestion is **declined** with "The owner did not answer; they are not
   available now." Rubrics grade the shape of the question and what the agent does without an answer.
4. Grading: `score` = passed weight / total weight; a task **holds** when every run reaches its threshold (default 1).

## Commands

```
node tools/agent-evals/cli.mjs --list                    # validate tasks (free)
node tools/agent-evals/cli.mjs --dry                     # build every start state, grade a do-nothing run (free)
node tools/agent-evals/cli.mjs --run all --runs 2 --ref <ref> --label <name> --parallel 4 --max-total-usd 40
```

Results: `results/<label>/<task>-run<n>.json` (compact record) and `results/<label>/summary.md`. Raw transcripts stay
in `--out` (scratch; not committed: large, and they hold the full prompt context).

Use a `--ref` without eval commits on top (e.g. the base branch, or the instruction-change commit itself), so the git
log the agent reads does not name the eval.

## Comparing an instruction change (D-27, AGENTS.md §7.8)

1. Run the suite twice on the base ref and twice on the change ref (same model, same `--runs 2`).
2. Compare per task, not the total: a task that **held** on the base and does not hold on the change is a regression.
   The change is kept only with no regression; a task that flips both ways between two runs of the same ref is noise
   and is reported as such, not counted.
3. Record the comparison in DECISIONS.md with both labels.

## Limits (stated, not hidden)

- n = 2 per task: a single flip can be noise. Costs per run are in the summary.
- Rubrics check end state and words; a `weak` check can pass on wording alone. No LLM judge in the baseline.
- The model is whatever the CLI defaults to (recorded per run); compare only runs with the same model.
- AskUserQuestion is always declined, so behaviour after an owner answer is not measured (D-63).
