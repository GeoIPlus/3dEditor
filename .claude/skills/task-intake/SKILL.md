---
name: task-intake
description: Take any new request, idea, bug, finding or change of scope for 3DQM into the backlog before any work starts. Use whenever the owner asks for something new ("сделай", "добавь", "исправь", "new task", "also need"), when a WP session finds work outside its scope, or when a spec defect or contradiction is found. Classifies the request, checks it against BACKLOG and DECISIONS, asks the owner only decision-changing questions as a dialog with proposed answers, and writes a `proposed` BACKLOG row. Never starts implementation.
owner: 3DQM maintainers (owner: Andy)
---

# task-intake

Every request becomes a backlog row, a decision or an answer - never untracked work (AGENTS.md §2.1, decision D-22).
Intake writes documents only. It never writes code, schemas or fixtures and never sets a row `ready`.

## Steps

1. **Restate** the request in one sentence in English, with its source (owner message, WP id that found it, review).
2. **Classify** - exactly one:

   | Class | Meaning | Output |
   |---|---|---|
   | `new-wp` | New deliverable not covered by any row | new row `proposed` |
   | `change-wp` | Changes scope/acceptance of an existing row | edit of that row + note; if the row is `in-progress`, ask the owner first |
   | `bug` | Behaviour of finished work contradicts its acceptance or a decision | new row `proposed`, linked to the WP that introduced it |
   | `decision` | A choice the owner must make; no work by itself | dialog question -> `D-NN` or `Q-NN` |
   | `question` | Needs an answer, not work (e.g. "how does X work") | answer in chat; no row |
   | `external` | Work in shared_compnents or geoviewer | mirror row with `repo: shared` / `repo: geoviewer` + text of the row to add there; status later filled by `backlog:sync` (D-25) |
   | `chore` | Typo/wording in documents, <= ~20 lines, changes no behaviour, contract, decision, acceptance or rule (D-26) | do it, one line in `docs/CHORES.md`; no row. In doubt -> not a chore |

3. **Check before writing** (batch these reads):
   - BACKLOG: duplicate or overlapping row? If yes -> `change-wp` instead of `new-wp`.
   - DECISIONS: does the request re-open a decision (`D-NN`)? If yes, say so plainly to the owner and ask whether to
     re-open it; never silently override. Does it answer an open question (`Q-NN`)?
   - Specs/source: is the requested behaviour already specified? Cite the section. Does it contradict v0.3 or the
     handover? Name the contradiction.
   - Scope: is it in the excluded list of v0.3 §1 (tax, stereo, textures, building from scratch, ...)? If yes, say so
     and ask whether scope changes (that is a `decision`).
4. **Ask the owner only what changes what is built** - in the dialog tool, never as text in a file:
   - 1-4 questions per call, each standing on its own (name the items; the owner may not see earlier text);
   - 2-4 options, the recommended one first with "(Recommended)", each option states its consequence;
   - do not ask what the code, specs or decisions already answer; do not ask "shall I proceed?".
   If the owner's request is wrong or weak (contradicts a decision, adds risk, duplicates work), say so directly with the
   reason before asking.
5. **Write** in one commit, using the formats below:
   - the BACKLOG row (status `proposed`), its Details entry, the dependency edge in the mermaid graph, the overview counts;
   - DECISIONS: every owner answer as `D-NN` (append-only, with date and "owner, dialog"), every unresolved point as `Q-NN`.
6. **Size**: S < 1 day of agent work, M up to ~3 days, L larger. An L row that has more than one acceptance group is
   split now into several rows.
7. **Report** in chat in three lines: class, row id(s) created/changed, what the owner must do (set `ready`, answer Q-NN).

## Row format

Table row in `docs/BACKLOG.md`:

```
| 3D-NN | <title> | <repo: here/shared/geoviewer> | <modules> | <depends on ids> | <S/M/L> | proposed |
```

Details entry under `## Details`:

```
### 3D-NN <title>
- Source: <owner message YYYY-MM-DD | WP that found it | spec section>
- Goal: <one sentence>
- Scope in: <list>   Scope out: <list>
- Accept: <testable lines; golden test ids where they exist>
- Decisions: <D-NN used>  Open: <Q-NN that block it>
```

## Judgement calls

- Prefer extending acceptance of an existing `proposed` row over a new row; never extend a `done` row - make a new one.
- A finding during a WP session that blocks the WP: record it as a row/question, then continue with the rest of the WP
  (AGENTS.md §3 budgets decide when to stop).
- Ids are never reused or renumbered. A dropped row becomes `superseded` with the replacing id or `dropped (reason)`.
- Status `ready` is set only by the owner (or on the owner's explicit word in a dialog, recorded as `D-NN`).

## Checks that prove intake was done

- The row exists, has an `Accept:` line that a test or a recorded check can prove, and dependencies that exist.
- No new row duplicates another; mermaid graph and overview counts match the table.
- Every owner answer of this intake is in DECISIONS.md with an id.
