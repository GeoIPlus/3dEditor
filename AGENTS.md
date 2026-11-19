# AGENTS.md - building 3DQM

You are an AI agent working in `GeoIPlus/3dEditor`: the home of **3DQM**, the online editor of existing LoD2 building
models (CityJSON in, CityJSON out, edited against a point cloud). 3DQM is the third solution of the Tools Plane, beside
OrthoQM and LidarQM. This file is the operating manual. It is short on purpose: it routes you to the document that holds
each rule and loads detail only when the task needs it.

## 0. What lives where (decision D-17, hybrid model)

| Part | Repository | Tracked in |
|---|---|---|
| Server-only geometry kernel `geo-model3d` (protection P4), its service, specs, ADRs, backlog, golden fixtures | **this repository** | [docs/BACKLOG.md](docs/BACKLOG.md) |
| Client components: `geo-render/model3d`, 3DQM tools in `workspace/tools`, `plans/3dqm`, remote kernel port | `GeoIPlus/shared_compnents`, under **its** `AGENTS.md` | mirror rows here (`repo: shared`); the row there is authoritative |
| Host adapter (mount workplace, kernel route for tests, file storage port) | `geoviewer`, under **its** `AGENTS.md` | mirror rows here (`repo: geoviewer`) |

When you work in another repository, that repository's `AGENTS.md` wins over this file.

## 1. Read in this order, and only what the task needs

1. **This file**, all of it.
2. [docs/BACKLOG.md](docs/BACKLOG.md) - the work package (WP) you own; its row is your scope.
3. [docs/decisions/DECISIONS.md](docs/decisions/DECISIONS.md) - decisions already taken; **do not re-open them**.
4. [STRUCTURE.md](STRUCTURE.md) - where code and documents live, which imports are allowed.
5. `docs/specs/3dqm-spec.md` - **only the section of your module** (exists after 3D-04; until then the source specs).
6. The WP checkpoint `.agent/checkpoints/3D-<id>.md` if the WP was started before.
7. The module's `README.md` (module card), if the module exists.

Source documents in [docs/source/](docs/source/) are read-only inputs. Priority when they conflict (D-20):
**DECISIONS.md > HANDOVER-3DQM.md > fullSpecsV0.3.md > fullSpecsV0.2.md Appendix C > rest of v0.2.** v0.1 and the
audit PDF are background only. Read source specs with an offset by section, never whole
(v0.2 Appendix C starts at line 1274, Appendix D at 1411, Appendix F at 1569).

## 2. Hard rules

1. **Every new task enters through the `task-intake` skill** ([.claude/skills/task-intake/SKILL.md](.claude/skills/task-intake/SKILL.md)).
   No implementation starts on a request that has no BACKLOG row with status `ready`.
2. **Questions to the owner only as a dialog with proposed answers** (the ask-user tool: 2-4 options, the recommended one
   first and marked "(Recommended)", each with its consequence). Ask only what changes what is built. Never ask in a file,
   a PR or a code comment and wait there. Every answer is recorded in DECISIONS.md in the same session.
3. **One WP per branch, per pull request, per session.** Branch `wp/3d-<id>-<short-name>`, e.g. `wp/3d-09-brep-core`
   (a platform-assigned branch is used as is and named in the checkpoint). Do not mix WPs. Do not grow a WP silently:
   extra findings go through `task-intake` as new rows.
4. **Never invent** contract fields, tolerances, error codes, taxonomies or algorithms. Use what DECISIONS and the specs
   say. A missing value is `TBD` in code comments plus an open question; never a guess. The starting tolerance profile
   (v0.3 §10) is decided (D-13), not `TBD`.
5. **Planes are primary, vertices are derived** (D-08). An algorithm that moves vertices directly is a spec defect until
   it is restated in plane terms.
6. **The kernel is server-only (P4)** (D-06, D-07). No kernel code, solver, plane intersection or Boolean in any browser
   bundle, no WASM build for browsers. If a latency target fails, escalate to the owner; never move code to the client.
7. **Contract first.** A data shape that crosses a process or repository boundary (commands, patches, model, validation
   report, tolerance profile) is a JSON Schema 2020-12 before it is code. Types are derived from it.
8. **JavaScript ESM with JSDoc types**, checked by `tsc --checkJs`; no TypeScript sources. This is the working rule from
   HANDOVER §5, not yet an owner decision: the kernel language is open question Q-01, closed by the ADR of 3D-08.
9. **Files at most 300 lines**, one responsibility per file. The kernel is dozens of small modules.
10. **No DOM, no three.js** in `geo-model3d`. It runs in Node unchanged.
11. **Tests are deterministic, offline and not weakened to pass.** Golden tests of v0.3 §12 are the acceptance; their
    numbers are not edited to match code.
12. **ADRs and contract schemas need the owner's explicit approval** (D-18): status `accepted` is set only after the
    owner says so in a dialog. Code PRs merge on QA checklist sign-off (D-16). **You never merge.**
13. **Never push to `main`, never force-push, never delete branches you did not create.** No secrets in files, no large
    binaries without asking (sample data location is open question Q-07).
14. **Do not edit OrthoQM rows or files** in `shared_compnents` beyond what a mirrored 3DQM row allows (HANDOVER §10).

## 3. Sessions: one fresh session per WP

- **Every WP starts in a new session with fresh context.** Use the session-creation tool when it is available; otherwise
  write the handoff and tell the owner that a new session is required. Never claim the current context was reset.
- Before starting, check that no other session or branch owns the WP (BACKLOG status `in-progress` with a branch).
- The **handoff** is compact: WP id and goal, base branch/commit, working repository, checkpoint path, relevant decision
  ids, open checks and questions. Never paste conversation history. The skill [wp-session](.claude/skills/wp-session/SKILL.md)
  holds the start and end procedure.
- **Plan in the first turn**: write the plan into the checkpoint from [docs/templates/checkpoint.md](docs/templates/checkpoint.md)
  (acceptance criteria, files, source sections, checks that prove each criterion). Revise it when a result changes it.
- **Batch independent tool calls.** **Verify against real output** (tests, checks, benchmarks), not expectation.
- **Narrate briefly**: one line per step; results go into the checkpoint and the PR description.
- **Budgets** - stop, write the checkpoint, hand off when: the same failure survives three different fixes; the context
  is over ~60 % without the criteria converging; the WP outgrows its size (S < 1 day, M, L) - propose a split via intake.

## 4. Workflow for one WP

1. In the fresh session, confirm the WP is `ready` and its dependencies are `done` (mirror rows: check the other repo).
2. Set it `in-progress` with the branch name in the same commit as your first change; create the checkpoint.
3. Read the spec section and the source sections the row names. **Characterise first** when porting donor code.
4. Implement the smallest change that meets the acceptance lines.
5. Run the checks (§5). All pass, or the failure is reported with its output.
6. Update in the same change (§6): module card, STRUCTURE.md, DECISIONS.md, BACKLOG row (`review` + PR link), checkpoint
   (`status: done` + what the next WP needs).
7. Open a PR with the template in §8 only when the owner asked for PRs on this WP; never merge.

## 5. Commands

3D-05 (repository bootstrap) creates them; until it is `done` they do not exist and you must not claim they ran.

| Task | Command |
|---|---|
| Install | `npm ci` |
| All checks (what CI runs) | `npm run check` |
| Unit tests | `npm test` / `npx vitest run <path>` |
| Types | `npm run types` |
| Boundaries, file size, P4 isolation | `npm run check:arch` |
| Golden tests | `npm run golden` |
| Preview latency bench | `npm run bench` |

## 6. Documentation rules

| Document | Owner of change | When it changes |
|---|---|---|
| `docs/BACKLOG.md` | the session that changes a status; new rows only via `task-intake` | status change, intake, handoff |
| `docs/decisions/DECISIONS.md` | the session that got the owner's answer | same session as the answer; append-only ids `D-NN`, `Q-NN` |
| `docs/decisions/adr/3D-ADR-NNNN-*.md` | WP that needs the design choice | from [docs/templates/adr.md](docs/templates/adr.md); `proposed` until the owner accepts |
| `docs/specs/*` | spec WPs; others only through intake | spec defect found -> question, not silent edit |
| `.agent/checkpoints/3D-<id>.md` | the WP's session only | every stop, handoff and finish |
| module `README.md` | the WP that changes the module | public API, protection, status, source revision |
| `docs/source/*` | nobody | read-only; corrections are recorded in DECISIONS.md |

Writing rules: English; facts marked with their source (`[D]` decided, `[V]` verified with file reference, `[A]`
assumption); dates as `YYYY-MM-DD`; no copy of a rule that already lives elsewhere - link to it.

## 7. Subagents: the exception

Default: none. Allowed for (a) independent analyses that return a compact result (e.g. reading geoviewer and
shared_compnents in parallel for the verification note), (b) black-box review of a finished WP's diff, (c) a measured
problem in the single loop, recorded in the checkpoint first. Brief: one responsibility, explicit scope, output shape,
completion condition. Check its result against real files before using it. No permanent role agents, no chains.

## 8. Pull request description

```
3D-<id>: <title>

What: <one paragraph>
Repo/modules: <ids>  Protection: <levels touched>
Source: <spec sections, donor repo@commit:path, or "new">
Tests: <what ran, counts>   Bench: <p95 ms, if the WP has a latency criterion>
Decisions used/added: <D-NN, Q-NN, ADR ids>
Spec deviations / open questions: <none | list>
Follow-ups: <none | intake rows added>
```

## 9. Definition of done (every WP)

- [ ] Every acceptance line met, each with a test or a recorded check whose output you read.
- [ ] `npm run check` passes (once 3D-05 is done).
- [ ] BACKLOG, DECISIONS, module card, STRUCTURE.md updated where they apply; mirror rows refreshed.
- [ ] No file over 300 lines; no P4 code reachable from a client bundle.
- [ ] Checkpoint says `status: done` and what the next WP needs to know.

## 10. Changing these instructions

This file, `CLAUDE.md` and `.claude/skills/` are the agents' system prompt. The owner approves changes to them (D-18
applies). Change one thing at a time; a rule that belongs to one procedure goes into that procedure's skill, not here.
Remove rules that no longer earn their place.
