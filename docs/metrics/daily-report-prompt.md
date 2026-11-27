# Daily report: prompt of the scheduled task

The scheduled task "3DQM daily report" (D-44, `trig_01STtubMobM7cpZpFr2NnpBB`, 07:45 Europe/Copenhagen) sends the
prompt below. Since 3D-137 (D-475 part B) the lists and the ledger figures come from `tools/daily-report.mjs`; the
session only adds what git cannot know (sessions missing from the ledger) and the forecast. The coordinator copies this
text into the scheduled task (update_trigger) after the merge of 3D-137; a change here is copied the same way.

```
You produce the daily 3DQM work report for the owner, in Russian, in this chat only. READ-ONLY: do not commit, push,
create branches, start or archive sessions, or change any settings or scheduled tasks.

Period: the previous calendar day in Europe/Copenhagen time. Call it D (YYYY-MM-DD).

1. Facts from git. Attach GeoIPlus/3dEditor read-only with the add_repo tool (if the tool is missing, `git clone` the
   repository), clone it with full history (`git fetch --unshallow` if shallow) and check out the base branch
   claude/keen-pascal-u7z2gk (or the base docs/BACKLOG.md names). Run
   `node tools/daily-report.mjs --date D --tz Europe/Copenhagen` (node only, no npm install). It prints: WPs that
   changed status, decisions added, open owner actions, ledger rows finalized on D (cost, tokens, context, flags
   ctx>250k and cache-write>2x ctx), totals by kind, rows without a final figure. Report these in Russian; keep the ids;
   group the decisions by topic if there are more than 15. Do not recompute anything the script printed. If it fails,
   give its error line.

2. Sessions missing from the ledger. If list_sessions is available: call it (mine: true, enough pages to cover D) and
   list sessions updated in D whose id is not in docs/metrics/LEDGER.md (title and id only). Do not read their events
   and do not compute their cost: cost is written once per session at merge or rotation (D-475). If list_sessions is not
   available, say so in one line.
   Say plainly that cost is the API-equivalent estimate the platform reports, not a bill, and that subscription limit
   usage is not available to you.

3. Budget forecast. Run `node tools/budget.mjs --today D` (no --fix) and paste its block verbatim. Then explain in 2-3
   lines: known remaining cost (p50 / p80), ETC with scope growth (an extrapolation of the last 14 days; how many
   finished WPs it rests on), the waiting share. If the script fails, say so with its error line; never compute it by
   hand.

4. Up to three optimisation proposals, each grounded in the numbers above (name the session or WP and the number), each
   with the expected effect and the AGENTS.md rule (section 7) it relates to or would change; also count the open rows
   of LEDGER.md "Improvement proposals" the owner has to decide. Fewer if the data does not support three. Do not
   invent numbers.

Keep the report under ~50 lines. End with one line: what the owner should decide today, if anything.
```
