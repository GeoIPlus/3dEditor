---
name: coordinator-handover
description: Rotate the 3DQM coordinating session to a fresh one. Use in the coordinating session when its context passes ~250k tokens or it has run for a day, whichever comes first, and in any long WP session past the AGENTS.md §3 budget (~60 % context). Covers the handover file docs/coordination/handover-YYYY-MM-DD-N.md in a fixed short shape, the append-only history docs/coordination/history/YYYY-MM.md, starting the successor with create_session, the own ledger row, and what the owner does (D-475).
owner: 3DQM maintainers (owner: Andy)
---

# coordinator-handover

A long session pays for its whole context on every turn and attends worse to old rules (AGENTS.md §7.4-§7.6). The
successor starts from two files, never from conversation history.

## When

- Coordinator: context over ~250k tokens, or the session is a day old (`created_at` of `get_session`), whichever first.
  Context size is what the harness reports (`/context`, context warning); if it reports nothing, the daily rule decides
  `[A]`.
- Rotate between merges, never in the middle of one (`merge-wp` steps 2-6 finish in the same session).
- WP session past the §3 budget: follow [wp-session](../wp-session/SKILL.md) "Pause or hand off" (the checkpoint is its
  handover file and its handoff text the prompt), then steps 5-6 below; it writes nothing to `docs/coordination/`.
  The coordinator appends the `rotation` line to the history when the WP session tells it the new id.

## 1. Handover file

`docs/coordination/handover-YYYY-MM-DD-N.md` (N = 1, 2, ... per day). Facts only, as of the last base commit; no
conversation history, no copy of a rule that lives in AGENTS.md or a skill. Exactly these `##` sections, in this order
(`node tools/check-docs.mjs` checks the shape):

```
# Coordinator handover YYYY-MM-DD-N
From: <old session id>  Base: <base branch>@<sha of the commit before this one>

## Running WPs
| WP | session | branch | state |
|---|---|---|---|
| 3D-<id> | session_... | wp/3d-<id>-... | working / blocked: <on what> / done, waiting for acceptance |

## Merges pending
- 3D-<id> <branch>@<sha>: <accepted D-NN | waiting for the owner>   (or: none)

## Owner actions and questions open
- <action or Q-NN, one line each, who acts>   (or: none)

## Ids
Last decision: D-NN. Next free: D-NN, Q-NN, row 3D-NN, ADR 3D-ADR-NNNN.

## Do not repeat
- <one line each: done steps a successor might redo (session already started, message already sent, branch already
  deleted), traps met, promises given to a WP session>   (or: none)
```

Read the running WPs from BACKLOG `Running:` and `list_sessions(children: true)`, not from memory.

## 2. History

Append (never edit, never reorder) one line per event to `docs/coordination/history/YYYY-MM.md`, in the same commit as
the event where possible:

```
- YYYY-MM-DD <kind> <ref>[ <WP ids, comma-separated>]: <one line, no links>
```

`kind`: `merge` (ref = acceptance D-NN), `start` (ref = row 3D-NN, session id in the text), `decision` (ref = D-NN),
`incident` (ref = what it touched), `rotation` (ref = new session id). Successors `grep` it (`grep 3D-121
docs/coordination/history/*.md`); never read it whole. A new month starts a new file with the same header.

## 3. Commit

Commit the handover file, the `rotation` history line and the coordinator's own ledger row (`WP = coord`, figures from
the newest `result` event, `as of`; [docs/metrics/README.md §1-§2](../../../docs/metrics/README.md)) on the base; run
`node tools/check-docs.mjs`; push. This is the old session's **last push to the base** (single writer, D-178).

## 4. Start the successor

`create_session` in the environment of the current session, same model, with this prompt and nothing else:

```
You are the 3DQM coordinating session. Read AGENTS.md, then docs/coordination/handover-<date>-<N>.md, then the
"Handoff" section of .agent/checkpoints/3D-00.md. Create the coordinator marker for this session as that section says.
Reply to the owner in Russian.
```

The 3D-00 checkpoint keeps the standing coordinator notes (marker, environment, merge checks); the handover file keeps
only the state that changes.

## 5. Tell the owner

One chat message: the new session id, the handover file path, the base sha. Running WP sessions keep sending to the old
id until told: send each of them one message "coordinator moved to <new session id>". Scheduled tasks bound to the
old session (`list_triggers`, `persistent_session_id`): none on 2026-11-27 `[V]`; if one appears, tell the owner.

## 6. Stop

After step 5 the old session writes nothing to the base and answers WP sessions only with the new id. The owner
archives it; it does not archive itself.
