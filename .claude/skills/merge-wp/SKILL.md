---
name: merge-wp
description: Merge a finished 3DQM work-package branch into the base branch after the owner accepted it. Use only in the coordinating session, only when the owner has said in a dialog that WP 3D-<id> is accepted and may be merged without a PR. Covers ancestry check, merge, provisional ids D-3D<wp>-n / Q-3D<wp>-n / rows 3D-<wp>.n / ADRs 3D-ADR-<wp>-n -> final ids with every reference rewritten, backlog recount, the strict docs check, branch deletion attempt and session archive (D-38, D-42).
owner: 3DQM maintainers (owner: Andy)
---

# merge-wp

AGENTS.md §2.12 still holds: you never merge on your own initiative. This procedure runs only on the owner's explicit
"accepted, merge" for one WP, given in a dialog and recorded as a decision (as D-34, D-36, D-39 were). One WP per run.
The acceptance is given in the WP window; the WP session hands over by send_message "WP 3D-<id> done, owner accepted,
<branch>@<sha>" (D-178). Merge exactly that sha. The base-push hook needs the coordinator marker ([3D-00 checkpoint](../../../.agent/checkpoints/3D-00.md)).

## 0. Inputs

`<id>` (WP number), `<wp>` (its branch, from the BACKLOG row or checkpoint), `<base>` (the base branch named in the
checkpoint). Stop and ask the owner (dialog with proposed answers) if any of them is unclear.

## 1. Preconditions

1. `git fetch origin <base> <wp>`; working tree clean; `<base>` checked out and equal to `origin/<base>`.
2. `.agent/checkpoints/3D-<id>.md` on `origin/<wp>` says `status: done`; the BACKLOG row there is `review`.
3. Note whether the base moved since the WP started: `git merge-base --is-ancestor origin/<base> origin/<wp>`
   (exit 0 = WP is on top of the current base; exit 1 = base moved, expect conflicts in shared documents).

## 2. Merge

1. `git merge --no-ff origin/<wp> -m "3D-<id>: merge <wp> into <base> (D-NN)"` (D-NN = the owner's acceptance decision,
   written in step 4).
2. Conflicts in `docs/BACKLOG.md`, `docs/decisions/DECISIONS.md`, STRUCTURE.md: keep **both** sides' rows and lines;
   never drop a row, decision or question. A conflict in code or in another WP's files: `git merge --abort` and ask the
   owner.

## 3. Final ids (D-38)

1. List the WP's provisional ids: `git grep -noE '\b([DQ]-3D<id>-[0-9]+|3D-<id>\.[0-9]+|3D-ADR-<id>-[0-9]+)\b' -- . ':!docs/source'`
   and `ls docs/decisions/adr | grep '^3D-ADR-<id>-'` (D-179).
2. Next free ids: the highest `| D-NN |` in "## Decisions" + 1, the highest `| Q-NN |` in "## Open questions" + 1.
   Rows `3D-<id>.n` -> highest `| 3D-NN |` row + 1 (mermaid node `D<id>_n` -> `D<NN>`); ADRs `3D-ADR-<id>-n` -> highest
   `3D-ADR-NNNN` + 1, file renamed with `git mv`. Assign in order of `n` (D-3D<id>-1 first). Write the mapping into the
   merge commit message.
3. Rewrite every occurrence in all tracked files except `docs/source/` (read-only) with word boundaries, highest `n`
   first, e.g. `git grep -lE '\bD-3D30-2\b' -- . ':!docs/source' | xargs sed -i -E 's/\bD-3D30-2\b/D-48/g'`.
   AGENTS.md's example `D-3D27-1` is not a real id and stays.
4. DECISIONS.md is append-only: the renamed rows sit at the end of their table in id order; move them there if the
   base gained rows meanwhile. Add the owner's acceptance as the next `D-NN` ("3D-<id> accepted (done); merged into
   the base").
5. Re-run step 1: no provisional id of this WP may remain.

## 4. Backlog

1. Row 3D-<id>: status `done (D-NN; merged into base, no PR)`.
2. Overview: `node tools/check-docs.mjs --fix` regenerates counts, "N/M rows done", `Running:` and the date (D-180).
3. Mermaid: move node `D<id>` into the `done` subgraph.
4. Checkpoint stays as the WP left it; add one log line "merged into <base> @<commit>".

## 4a. Cost, estimate, forecast (AGENTS.md §7.7, [docs/metrics/README.md](../../../docs/metrics/README.md))

1. For every session that worked on the WP (checkpoint, `list_sessions` with `children: true`): read the newest
   `result` event (README §1) now that the session is idle; set its ledger row to the final figures, `state: final`.
2. Details entry of the row: add the `- Actual:` line (README §3) with the ratio to `est0`.
3. Copy the review's proposals (checkpoint "Cost and efficiency") into LEDGER.md "Improvement proposals" as `open`.
4. Recompute the forecast by script (README §4; never by hand) and replace the block in BACKLOG "## Budget and
   forecast". A class whose median ratio left 0.8..1.25: add re-estimate lines to its open rows.
5. Add the coordinating session's own row (`WP = coord`) once per day it worked.

## 5. Gate

Strict, never with `--allow-provisional`:

```
node tools/check-docs.mjs && node --test tools/check-docs.test.mjs
```

Both must exit 0 (once 3D-05 is done: `npm run check`). Fix and re-run; do not commit a failing state.

## 6. Commit, push, confirm

1. Commit (amend the merge commit if you made fixes after it), then `git push -u origin <base>`, retrying network
   errors up to 4 times with backoff. Never force-push.
2. Confirm: `git fetch origin && git merge-base --is-ancestor origin/<wp> origin/<base>` exits 0.

## 7. Clean up (D-42)

Only after step 6.2 passed:

1. Try `git push origin --delete <wp>`. A cloud session may push only its own branch: if refused, ask the WP session
   to delete its own branch (send_message), or tell the owner to delete it on the GitHub Branches page. Never delete a
   branch that is not fully merged.
2. Archive the WP's session (archive_session); the owner's acceptance is the acknowledgement it needs.

## 8. Report

Short chat report to the owner: WP, merge commit, id mapping (`D-3D<id>-n -> D-NN`), check output (pass counts),
branch deleted or handed over, session archived, actual vs. estimate and the new ETC line, next `ready` row.
