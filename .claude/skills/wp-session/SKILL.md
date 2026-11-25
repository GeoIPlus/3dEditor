---
name: wp-session
description: Start, pause, hand off or finish a 3DQM work package session. Use at the first turn of any session that takes a WP from docs/BACKLOG.md, when a budget of AGENTS.md §3 is reached, and when a WP is finished. Covers ownership check, branch, checkpoint, compact handoff to a fresh session, and closing updates.
owner: 3DQM maintainers (owner: Andy)
---

# wp-session

**Hand over, never write the base (D-178).** Push only your WP branch; merges, `ready`, starts and final ids are the
coordinator's.

## Start (first turn)

1. Read AGENTS.md, the WP row and its Details entry in `docs/BACKLOG.md`, the decisions it cites.
2. **Ownership check**: the row is `ready` (or `in-progress` with your branch from a handoff); dependencies are `done`
   (for `repo: shared` / `repo: geoviewer` dependencies check the row in that repository). Check open sessions and
   remote branches `wp/3d-<id>-*` for another owner. If owned elsewhere: stop and tell the owner.
3. Branch `wp/3d-<id>-<short-name>` from the base named in the handoff (or `main`).
4. Copy `docs/templates/checkpoint.md` to `.agent/checkpoints/3D-<id>.md`; fill the plan: acceptance lines, files to
   touch, source sections with line offsets, the check that proves each line.
5. First commit: checkpoint + BACKLOG status `in-progress (wp/3d-<id>-...)`.

## Pause or hand off (budget reached, or session must end)

1. Commit and push work in progress on the WP branch (never `main`).
2. Update the checkpoint: `status: paused`, what is done (with check output), what fails (with output), next step.
3. Handoff text - only these fields, no conversation history:

```
WP: 3D-<id> <title> - <goal in one sentence>
Repo/branch/base: <repo> <branch> @<commit>
Checkpoint: .agent/checkpoints/3D-<id>.md
Decisions: <D-NN list>   Open: <Q-NN list>
Next: <the first concrete step>
Checks outstanding: <list>
```

4. Start the new session with the session-creation tool and this text. If no such tool exists, give the handoff to the
   owner and say that a new session is required.

## Finish

1. All acceptance lines proven; `npm run check` output read (once 3D-05 exists).
2. Ids this WP creates stay provisional: `D-3D<wp>-<n>`, `Q-3D<wp>-<n>`, rows `3D-<wp>.<n>`, ADRs `3D-ADR-<wp>-<n>`; the
   merging session assigns final ids (D-38, D-179). Update: module card, STRUCTURE.md, DECISIONS.md, BACKLOG row -> `review` (PR link, or "local, PR not requested"),
   overview via `node tools/check-docs.mjs --fix`, mermaid group; mirror rows if the WP touches another repository.
   Run `--fix` in the same commit as the row change, never as a commit of its own. When the base is merged into the WP
   branch: take the base side of generated BACKLOG parts (overview, `Running:`, `Updated:`, graph icons) and run
   `--fix` inside that merge commit.
3. Checkpoint: `status: done`, results with numbers, what the next WP needs to know.
4. Report to the owner in chat: what was done, check results, open questions (asked via dialog, not as text). When the
   owner accepts, send_message to the coordinator: "WP 3D-<id> done, owner accepted, <branch>@<sha>".
5. **Keep the repository clean (D-42).** After the coordinating session has merged the WP into the base and confirmed
   the branch head is an ancestor of the base, the WP branch is deleted and the session archived. A cloud session may push
   only its own branch: the WP session tries to delete its own branch after the merge is confirmed; if refused, the
   owner deletes it in GitHub (Branches page). Never delete a branch that is not fully merged.
6. The next WP is **not** started in this session. Offer the handoff for the next `ready` row.
