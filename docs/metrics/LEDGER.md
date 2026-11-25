# Session ledger

Method, fields and sources: [README.md](README.md). One row per session, append-only; the coordinator turns `as of`
into `final` after the session is idle. Unknown values are `?` with the reason in `source`.

## Sessions

| date | WP | session | kind | cost_usd | out_k | cache_write_k | cache_read_k | api_min | span_h | models | state | review | source |
|---|---|---|---|---:|---:|---:|---:|---:|---:|---|---|---|---|
| 2026-11-19 | 3D-01 | ? | wp | 7.43 | ? | ? | ? | ? | ? | ? | final | - | 3D-00 checkpoint (262k context); session id not recorded |
| 2026-11-19 | 3D-27 | ? | wp | 2.94 | ? | ? | ? | ? | ? | ? | final | - | 3D-00 checkpoint (183k context) |
| 2026-11-19 | 3D-29 | ? | wp | 2.39 | ? | ? | ? | ? | ? | ? | final | - | 3D-00 checkpoint (185k context) |
| 2026-11-24 | 3D-84 | session_01RNYuqJWJrEJKEesXCMg4gc | wp | 3.92 | 43.0 | 113.8 | 10716.4 | 6.9 | 1.41 | claude-opus-5-5 | final | - | newest result event 2026-11-24T18:08:36Z; session archived |
| 2026-11-25 | 3D-85 | session_01RNYuqGReWdMPazLVoyejTW | wp | ? | ? | ? | ? | ? | ? | claude-opus-5-5 | as of - | - | no finished turn when written; coordinator reads it at merge |
| 2026-11-25 | evals | - | evals | 15.31 | ? | ? | ? | ? | ? | claude-opus-5-5 | final | - | agent evals 2026-11-25-3d85 summary.md (38 runs, gate of 3D-85) |
| 2026-11-25 | 3D-88 | session_01RNYuqGYcTF5pjsGKsqgM9e | wp | ? | ? | ? | ? | ? | ? | claude-opus-5-5 | as of - | done (Fable; 3 proposals, see checkpoint 3D-88) | no finished turn when written (first turn); `get_session` had no `usage` field at 12:4x Z; coordinator reads it at merge |

Backfill of the other finished WPs (their sessions still list in `list_sessions`) is part of row 3D-86.

## Improvement proposals

From efficiency reviews (README §5). Status: `open`, `adopted (D-NN)`, `rejected (reason)`.

| date | from (WP, session) | proposal | expected saving | status |
|---|---|---|---|---|
| 2026-11-25 | 3D-85, session_01RNYuqGReWdMPazLVoyejTW | Read session cost from `get_session` -> `external_metadata.usage` (`cost_usd`, token counts; one short answer) instead of `result` events (~15k characters each); verify it equals the newest `total_cost_usd` on one session first | a few k tokens per measurement | open |
| 2026-11-25 | 3D-88, session_01RNYuqGYcTF5pjsGKsqgM9e | P1: a small script that sums `usage` per distinct message id from assistant events and prints one line (calls, cache-read, cache-write, peak context), to fill the ledger in the first turn | fewer raw event pages read per review / merge | open |
| 2026-11-25 | 3D-88, session_01RNYuqGYcTF5pjsGKsqgM9e | P2: `npm ci` in the environment setup script, and `check-docs --fix` moves a row's mermaid node with its status | ~4 tool calls per WP (~12-15 % of cache-read on 3D-88) | open (setup script: owner/environment decision) |
| 2026-11-25 | 3D-88, session_01RNYuqGYcTF5pjsGKsqgM9e | P3: size-based review trigger - skip or digest-only review when a session has < ~40 calls and no budget stop | the ~66.6k cold cache write of a review per small WP | open (owner decision; D-237/D-238 fix the first 10 as calibration) |
