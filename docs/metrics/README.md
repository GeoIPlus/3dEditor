# Session cost, efficiency review and backlog forecast

Purpose: make the cost of 3DQM predictable and tune the forecast with every finished WP (D-236). Rules that point
here: [AGENTS.md §7](../../AGENTS.md#7-tokens-limits-and-subagents-d-43) items 7 and 9. Data: [LEDGER.md](LEDGER.md).
Facts are marked `[V]` (verified, with source), `[A]` (assumption, verify before relying on it).

## 1. What a session measures and where it comes from

Every cloud session emits one `result` event per finished owner turn. Read the **newest** one only:
`list_events(session_id=<id>, kinds=["result"], limit=10)`; if the page holds none, page back with `before_id`.
Each event is about 15k characters, so never read more pages than needed and copy only the fields below.
The own session id is `$CLAUDE_CODE_REMOTE_SESSION_ID` (or `get_session` with no id).

| Ledger column | Field of the newest `result` event | Note |
|---|---|---|
| `cost_usd` | `total_cost_usd` | list price, API-equivalent; cumulative over the session `[V: session 3D-84, 3.585 -> 3.828 -> 3.919 over three turns, 2026-11-24]` |
| `out_k` | `modelUsage.<model>.outputTokens` / 1000 | cumulative, per model |
| `cache_write_k` | `modelUsage.<model>.cacheCreationInputTokens` / 1000 | cumulative |
| `cache_read_k` | `modelUsage.<model>.cacheReadInputTokens` / 1000 | cumulative; usually 90+ % of input volume, priced at 1/20 of input |
| `api_min` | `duration_api_ms` / 60000 | cumulative model time `[V: 3D-84, 392078 -> 412394 -> 415392]` |
| `span_h` | `get_session`: `updated_at - created_at` | wall clock incl. waits for the owner |
| `models` | keys of `modelUsage` | a subagent on another model shows as its own key `[A: verify on the first Fable review]` |

The current turn is not in any `result` event yet. A session's own figure is therefore "as of turn N"; the coordinator
re-reads it after the session is idle and that value is the one that counts.

## 2. Ledger rows

One row per session in [LEDGER.md](LEDGER.md): WP sessions, coordinator sessions (`WP = coord`), eval runs
(`WP = evals`) and other sessions (`WP = other`). A WP that needed several sessions (handoff) has several rows; its
actual cost is their sum. Reviews run as subagents are inside their session's cost; their own cost is noted in the
`review` column when the subagent reports it.

## 3. Estimate at intake, actual at merge

**Estimate** (Details entry of the row, written by `task-intake`, re-estimated when the scope changes):

```
- Estimate: $<p50> (p80 $<p80>), ~<api_min> min model time; basis: <class> n=<count> | prior (no data)
```

- **Class** = Size x Type of the row (e.g. `M kernel`). Use the class's median (p50) and 80th percentile (p80) of
  actual WP cost from the ledger once the class has **n >= 5** finished WPs. With fewer, use the Size-only class
  (`M`), then all WPs. With no data at all write `prior (no data)` and the all-WP median; never a number from nowhere.
- The estimate first written stays as `est0` (do not overwrite it); later re-estimates are added as
  `- Re-estimate YYYY-MM-DD: ...`. Forecast accuracy is measured against `est0`.

**Actual** (written by the coordinator at merge, `merge-wp`):

```
- Actual: $<sum> over <n> session(s), <api_min> min model time, <span_h> h wall; ratio <actual/est0>; review: <yes/no>
```

## 4. Forecast (ETC) and tuning

Computed by a script over LEDGER.md and BACKLOG.md, never by hand: `node tools/budget.mjs` prints the block,
`node tools/budget.mjs --fix` writes it into the fenced block of "## Budget and forecast" in
[BACKLOG.md](../BACKLOG.md) (3D-86; `--today YYYY-MM-DD` fixes the date).

Details the script fixes where the list below leaves them open (3D-86):
- Percentiles (p50, p80) interpolate linearly between the sorted values. A WP's actual is the sum of `cost_usd` of its
  `kind = wp` ledger rows; class samples are `done` rows with a known actual.
- Current estimate of an open row: the newest `Re-estimate` with a `$` figure, else the `Estimate` line unless it is a
  `prior` line; otherwise the class estimate of §3 from today's ledger. A missing p80 takes the class p80. Every open
  row counts `max(estimate - spent, 0)`.
- `k` counts `coord` and `evals` rows plus review costs (`$x` in the `review` column, moved out of the WP cost) dated in
  the window; `other` rows are not overhead.
- `g` compares the status table now with the BACKLOG of the newest commit before the window (if the backlog is younger,
  its first commit, and the window shrinks to its age): added = ids not there, finished = `done` now but not then.
- Throughput and waiting share use the ledger rows dated in the window; `span_h` runs from session creation to its last
  update, so a session kept open for days counts as waiting.

1. **Remaining known work**: sum of p50 (and of p80) of the current estimate of every row that is not `done`,
   `superseded` or `dropped`. In-progress rows count with `max(estimate - spent, 0)`.
2. **Overhead factor** `k = 1 + (coordinator + eval + review cost) / (WP session cost)` over the last 14 days.
3. **Scope growth** `g = rows added / rows finished` over the last 14 days (from `git log` of BACKLOG.md). If `g < 1`,
   expected total remaining = known remaining x `1 / (1 - g)` (each finished row brings `g` new ones, geometric series).
   If `g >= 1` the backlog is **not converging**: report that and the trend of `g`, not an ETC number.
4. **ETC cost** = known remaining x `k` x growth multiplier, as p50 and p80.
5. **ETC calendar**: rows finished per week and model minutes per week (last 14 days). Calendar time is dominated by
   owner answers and the number of parallel sessions, not by tokens; report `span_h - api_min/60` (waiting) separately.
6. **Accuracy**: median and spread of `ratio` (actual / est0) of the last 10 finished WPs. A class whose median ratio
   is outside 0.8..1.25 is re-estimated for every open row of that class (re-estimate line, `est0` stays).

Output, one block:

```
Forecast YYYY-MM-DD (ledger n=<WPs>, classes with n>=5: <list>)
Known remaining: $<p50> / $<p80> over <rows> rows   Overhead k=<k>   Growth g=<g> (14 d)
ETC: $<p50> / $<p80>  |  not converging (g >= 1)
Throughput: <rows>/week, <model min>/week; waiting share <x> %   Accuracy: median ratio <r> (last 10)
```

## 5. Independent efficiency review (D-237, D-238)

**When.** Calibration: each of the first 10 WP sessions after this rule (count = ledger rows with `review` filled).
After that only on a trigger: actual > 1.5 x `est0`; the session stopped on a §3 budget; or every 5th WP session.
Keep the review only while it pays: if fewer than 1 in 3 of its proposals were adopted over the last 10 reviews, the
coordinator asks the owner (dialog) whether to stop it.

**Who.** The WP session at its finish (or pause), as one subagent: Agent tool, `model: "fable"` (Claude Fable 5.2),
fresh context. Independence comes from the fresh context, a fixed rubric and raw data, not from the session's story.
Input cap: about 150k tokens; it reads files and at most two pages of the session's events (`kinds: ["assistant"]`,
`limit: 50`), never the whole transcript.

**Prompt** (copy, fill the angle brackets):

```
You review the token efficiency of one finished Claude Code session of the 3DQM project. You did not take part in it.
Data: WP 3D-<id>; session <session_id>; metrics <ledger row>; estimate <est0 line or none>; branch <branch>
(`git log --stat <base>..<branch>`); checkpoint .agent/checkpoints/3D-<id>.md; AGENTS.md §3 and §7 are the rules.
You may read those files and at most two pages of list_events(session_id, kinds=["assistant"], limit=50).
Answer in this shape, at most 25 lines, facts with their source:
1. Cost profile: where the tokens went (reading, re-reading, tool output, retries, dialog waits, subagents).
2. Waste: up to 5 concrete items, each with evidence and an estimated share of cost. Say "none found" if none.
3. Proposals: up to 3, each one change (instruction, skill, tool, decomposition, estimate), with expected saving and
   how to measure it. No proposal without evidence.
4. Estimate: was est0 right for this class? What should the class estimate be?
```

**Where the result goes.** The WP session copies the answer into the checkpoint section "Cost and efficiency" without
editing it, adds its own reply per proposal (agree / disagree, why), and fills `review` in the ledger row. Proposals
never change instructions directly: the coordinator lists them in LEDGER.md "Improvement proposals"; instruction
changes are batched, approved by the owner and measured with the agent evals (§7.6, §7.8, §10).

## 6. Data quality

- The ledger is append-only except for the coordinator's final re-read of a row (`as of` -> `final`).
- A figure that could not be read is `?` with the reason; never estimated after the fact.
- Prices behind `total_cost_usd` change with model versions; the ledger keeps `models` so classes can be split by model
  if a price change makes old rows incomparable.
