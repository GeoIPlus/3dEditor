# Risk register of provisional decisions

**Append-only** (D-475 part C, 3D-138). A WP session that meets a **non-blocking** question does not wait for the owner:
it lists the options with their implementation risk (what can break, how likely, the cost to undo) and their speed to
the goal, takes the lowest-risk option that still reaches the goal fastest, records it as a provisional decision
`D-3D<wp>-n` in [DECISIONS.md](DECISIONS.md) and appends one register row here. Procedure:
[wp-session](../../.claude/skills/wp-session/SKILL.md), AGENTS.md §2 item 2.

Rules [D: D-475]:
- Risk ids `R-<wp>-<n>` are final when written (the WP number makes them unique); the merge rewrites only the decision
  ids in a row (`D-3D<wp>-n` -> `D-NN`, D-38). No other edit of a written row.
- A register row is written with review `provisional`. The owner's answer is a new row in "Reviews" (`confirmed`, or
  `overridden` with the decision that replaces it); the session or coordinator that got the answer writes it with the
  DECISIONS.md entry. A risk without a review row is listed in [QUESTIONS.md](../QUESTIONS.md).
- No `|` inside a cell. Checked by `node tools/check-docs.mjs`.

## Register

| Risk | WP | Decision | Date | Options (risk: what breaks / likelihood / undo cost; speed) | Chosen and why | Review |
|---|---|---|---|---|---|---|
| R-138-1 | 3D-138 | D-3D138-1 | 2026-11-27 | (a) risk ids provisional `R-3D<wp>-n`, renamed at merge: merge-wp and check-docs id rules change, a missed rename leaves a dangling id; medium likelihood, cheap undo; slower. (b) `R-<wp>-<n>` final at birth: no merge step, unique by WP number; a WP split into rows `3D-<wp>.n` still unique; low risk; fastest | (b) risk ids `R-<wp>-<n>`, final when written: no change to merge-wp or the id checks, nothing to rename | provisional |
| R-138-2 | 3D-138 | D-3D138-2 | 2026-11-27 | (a) check-docs fails when QUESTIONS.md differs from the generated text: every checkpoint edit on every WP branch needs a regeneration, parallel branches conflict on the file, remote branches make the check depend on fetch state; high likelihood of friction, cheap undo. (b) no check: a malformed line is dropped silently; medium likelihood, low cost. (c) check-docs checks the format of RISKS.md and of checkpoint open-question lines, not the freshness of QUESTIONS.md; the coordinator regenerates it at merge (merge-wp step); QUESTIONS.md is exempt from the provisional-id check since it lists unmerged WPs; low risk; fast | (c) check-docs checks RISKS.md and checkpoint open-question lines, not the freshness of QUESTIONS.md; the coordinator regenerates it at merge: catches the silent drop of (b) without the merge friction of (a) | provisional |
| R-138-3 | 3D-138 | D-3D138-3 | 2026-11-27 | Source of "awaiting confirmation": (a) checkpoint lines only: the checkpoint belongs to the WP session (AGENTS.md §6), so after the WP ends nobody may close the line; high likelihood of stale entries. (b) RISKS.md rows without a review row; the checkpoint line names the risk and check-docs verifies the risk exists; low risk; fast | (b) awaiting = RISKS.md rows without a review row: the register outlives the WP session and is closed by an appended review | provisional |
| R-138-4 | 3D-138 | D-3D138-4 | 2026-11-27 | Blocking question above ~150k: (a) end the turn with the question as chat text: breaks AGENTS.md §2 item 2 (dialog only) and the agent eval `dialog-question`; medium likelihood. (b) checkpoint + handoff pushed first, then the dialog as the last action of the turn; the answer, whenever it comes, is recorded and passed to a fresh session; keeps §2 item 2; low risk; same speed | (b) checkpoint + handoff first, the dialog last, the answer to a fresh session: same cost effect without breaking §2 item 2 | provisional |
| R-138-5 | 3D-138 | D-3D138-5 | 2026-11-27 | Where the history `start` / `merge` lines of D-484 are written: (a) `wp-session` Start step, on the WP branch: the line reaches the base only at merge, out of date order, and a WP session must not write the base (D-178); medium likelihood of disorder, cheap undo. (b) the coordinator on the base: `start` with the row's `in-progress` commit, `merge` in the merge commit, missing `start` lines (successor sessions) caught up at merge; one writer, lines in order; low risk; fast | (b) both lines written by the coordinator in `merge-wp` §6 step 1, missing `start` lines caught up at merge | provisional |

## Reviews

| Risk | Date | Status | Decision | By |
|---|---|---|---|---|
