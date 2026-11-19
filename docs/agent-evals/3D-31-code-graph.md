# 3D-31 Spike: codebase graph tool, with vs. without (D-50)

Date: 2026-11-19. Plan, task text and rubric were fixed in [.agent/checkpoints/3D-31.md](../../.agent/checkpoints/3D-31.md)
before the first run. Run settings: D-3D31-1 (cloud, session-only).

## Result in one paragraph

On a cross-repository reading task in `GeoIPlus/geoviewer`, the child agent **never called the graph tool in any of the 6
runs that had it** (0 graph calls across arms B, C and D), even when a system-prompt hint told it to and when the tool
definitions were loaded up front. Quality was 10/10 in all 8 runs (ceiling). The tool therefore saved nothing. Having it
available cost about +0.5k context tokens per turn with deferred tool loading (the Claude Code default here), and +28.9k
per turn with the definitions loaded up front. **Recommendation: defer** (details at the end).

## Tool

| Item | Value |
|---|---|
| Name | `codebase-memory-mcp` ([DeusData/codebase-memory-mcp](https://github.com/DeusData/codebase-memory-mcp)), MIT |
| Version | 0.12.1 (release asset `codebase-memory-mcp-linux-amd64.tar.gz`, sha256 `8453015145f072c1b9b019cbdd02cea8cc6f18cc5e116036dd20992631c638c7`, matches the release `checksums.txt`) [V] |
| Runs locally | Native C binary; index in SQLite under `CBM_CACHE_DIR`; README says no hosted service or API key. A grep of `src/` found no telemetry endpoint [V] |
| Tool definitions added | 17 MCP tools. `init` event: 32 tools without the server, 49 with it under deferred loading, 48 with up-front loading (ToolSearch is removed) [V] |
| Other candidates seen, not evaluated | `win4r/codebase-memory-mcp-pro` (fork), `octacity-org/codebase-memory-mcp`, `enowdev/enowx-rag` (one tool per spike) |

**Vendor claims, cited as claims, not results:**
- 10x lower token use and 2.1x fewer tool calls than file-by-file exploration (arXiv 2603.27277, 31 repositories, March 2026).
- An earlier README: about 3,400 vs. about 412,000 tokens for five structural queries.

### Install steps actually run (session only)

Nothing was written to `.claude/settings.json`, the environment, hooks or client config. The vendor `install` command and
`install.sh` were **not** run: they install client config, skills, agent profiles and hooks (README "Agent setup").

```
curl -fsSL -o checksums.txt https://github.com/DeusData/codebase-memory-mcp/releases/latest/download/checksums.txt
curl -fsSL -o a.tgz https://github.com/DeusData/codebase-memory-mcp/releases/latest/download/codebase-memory-mcp-linux-amd64.tar.gz
sha256sum a.tgz                       # compared with checksums.txt
tar --no-same-owner -xzf a.tgz codebase-memory-mcp
CBM_CACHE_DIR=<scratchpad>/cbm-cache ./codebase-memory-mcp cli --quiet index_repository --repo-path /home/user/geoviewer
```

The index of geoviewer @ `95527b88` took **7.3 s** (wall clock): 1074 tracked files, 12,637 nodes, 48,816 edges, 46 MB.
Side effect: indexing rewrote geoviewer's committed `.codebase-memory/` artifact in the read-only clone. It was restored
with `git checkout`, and nothing was pushed to geoviewer.

`GeoIPlus/shared_compnents` could not be attached (the permission classifier denied `add_repo`), so only geoviewer was
used. The row allows this ("and/or").

## Method

- **Runner:** one child `claude -p` process per run, giving a fresh context each time. Same model as the parent, cwd
  `/home/user/geoviewer`, `--output-format stream-json --verbose`, `--strict-mcp-config`.
  - Allowed tools: `Read,Grep,Glob,mcp__codebase-memory-mcp`.
  - Disallowed tools: `Bash,Edit,Write,NotebookEdit,Agent,WebFetch,WebSearch,Skill`, identical in every arm.
  - geoviewer's `CLAUDE.md` / `AGENTS.md` loaded in every arm alike. AGENTS.md §3.4 says to use the graph only for call
    chains and impact.
- **Arms** (each arm changes one thing from the previous one):

| Arm | MCP config | Extra | Planned? |
|---|---|---|---|
| A | none | - | yes (2 runs) |
| B | codebase-memory-mcp | - | yes (2 runs) |
| C | codebase-memory-mcp | `--append-system-prompt`: graph indexed as project `home-user-geoviewer`, use `search_graph` / `trace_path` / `get_code_snippet` / `get_file_outline` instead of reading whole files, `max_output_tokens` about 800 | added after B showed 0 graph calls |
| D | codebase-memory-mcp | the C hint, plus `ENABLE_TOOL_SEARCH=false` (tool definitions loaded up front, no ToolSearch step) | added after C showed 0 graph calls |

- **Order:** A1, B1, A2, B2, then C1, C2, then D1, D2. The task text was identical in every run (see the checkpoint).
- **Metrics** come from the child's own stream:
  - `total_cost_usd` (list price, API equivalent);
  - `num_turns`;
  - `tool_use` blocks, counted by tool name;
  - context per turn = input + cache read + cache write tokens, reported as first turn and peak;
  - total input = the sum over all turns, which does not depend on the state of the prompt cache.
- **Rubric:** 10 binary points, fixed before the runs. Graded by the parent session against the repository, with a
  spot-check of at least 5 `path:line` references per answer (±5 lines).

## Per run

| Run | Graph calls | Tool calls (Grep/Read) | Turns | Cost USD | First-turn context | Peak context | Total input tokens | Cache write | Output tokens | Wall s | Score |
|---|---:|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|
| A1 | - | 15 (8/7) | 16 | 0.655* | 41,080 | 62,659 | 428,324 | 62,657 | 4,032 | 38.9 | 10 |
| A2 | - | 18 (13/5) | 19 | 0.343 | 41,078 | 61,759 | 425,154 | 21,761 | 4,412 | 41.2 | 10 |
| B1 | 0 | 19 (14/5) | 20 | 0.348 | 41,588 | 61,591 | 413,303 | 21,593 | 4,837 | 43.5 | 10 |
| B2 | 0 | 17 (10/7) | 18 | 0.349 | 41,583 | 61,335 | 472,794 | 21,337 | 4,404 | 41.4 | 10 |
| C1 | 0 | 24 (15/9) | 25 | 0.701* | 41,689 | 62,891 | 531,430 | 62,889 | 5,187 | 46.9 | 10 |
| C2 | 0 | 17 (11/6) | 18 | 0.373 | 41,693 | 62,500 | 475,836 | 22,399 | 5,152 | 46.6 | 10 |
| D1 | 0 | 19 (13/6) | 20 | 0.980* | 69,975 | 93,326 | 749,357 | 93,324 | 5,129 | 50.9 | 10 |
| D2 | 0 | 17 (12/5) | 18 | 0.366 | 69,977 | 87,957 | 631,729 | 18,987 | 4,590 | 45.2 | 10 |

\* The first run on a new prompt prefix pays the cache write (about 3x the cost of the warm runs). Compare costs between
warm runs, or use total input tokens.

**Arm means:**

| Arm | Total input tokens | Peak context | Tool calls |
|---|---:|---:|---:|
| A | 426.7k | 62.2k | 16.5 |
| B | 443.0k | 61.5k | 18 |
| C | 503.6k | 62.7k | 20.5 |
| D | 690.5k | 90.6k | 18 |

Warm-run cost: A 0.343, B 0.348 / 0.349, C 0.373, D 0.366 USD.

**Why the tool went unused.** The `init` events show the 17 tools present and connected, with no permission denials.
- With deferred loading (B, C) the model sees only the tool names. It must call ToolSearch before it can use them, and it
  never did.
- With the definitions loaded up front (D), it still chose Grep and Read.
- The task is answerable with about 17 Grep/Read calls in about 45 s, and the built-in tools were sufficient every time.

**Quality notes.** All 8 answers met all 10 rubric points: correct chain, a correct statement that no integration point
exists, no invented files. This is a **ceiling effect**: the task does not separate the arms on quality. Outside the
rubric, D2 asserts that `layers/types/cityjson.js` is "close to the 300-line limit" while also saying it did not check.
The file has 170 lines.

**Noise.** n = 2 per arm.
- Within-arm spread of total input is up to 59k tokens (B: 413k vs. 473k; D: 632k vs. 749k).
- So A vs. B (+16k) and A vs. C (+77k) are within noise.
- Only D's increase (+264k, every turn about 29k larger) is larger than the noise, and it is explained by the definitions.

## Recommendation: defer

It follows from the numbers:
1. **No benefit was observed.** Usage was 0 in 6 of 6 runs, so cost and quality cannot improve through the tool. The
   vendor's 10x claim could not be reproduced because the agent did not use the tool on this task.
2. **The cost of availability is small but not zero.** It is +0.5k tokens per turn when deferred, and +29k per turn
   (+62 % total input in arm D) when loaded up front. Never load it up front.
3. **There is no 3DQM code to index yet** (3D-05 has not started), and the geoviewer task was easy for Grep and Read.

**Revisit** when kernel code exists (after 3D-09 or so), on a harder task (an impact analysis across many modules, such
as `detect_changes` / `trace_path` over a call chain of depth 4 or more) where Grep needs many more calls.
- A re-test must state how usage is driven. The vendor's own mechanism is installer hooks that add graph hints to
  Grep/Read results, and it was not tested here, because a permanent install needs an owner decision.
- geoviewer already uses this tool, through user-level install and hooks. A same-method run there with hooks on vs.
  `--no-hooks` would measure that mechanism.

Not tested:
- the vendor hooks and skills;
- MCP use inside subagents;
- repeated sessions on the same index, which is the "memory" case;
- `shared_compnents`.
