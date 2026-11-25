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
| 2026-11-25 | 3D-00.1 | session_01RNYuqGReWdMPazLVoyejTW | wp | ? | ? | ? | ? | ? | ? | claude-opus-5-5 | as of - | - | no finished turn when written; coordinator reads it at merge |
| 2026-11-25 | evals | - | evals | 15.31 | ? | ? | ? | ? | ? | claude-opus-5-5 | final | - | agent evals 2026-11-25-3d85 summary.md (38 runs, gate of 3D-00.1) |

Backfill of the other finished WPs (their sessions still list in `list_sessions`) is part of row 3D-00.2.

## Improvement proposals

From efficiency reviews (README §5). Status: `open`, `adopted (D-NN)`, `rejected (reason)`.

| date | from (WP, session) | proposal | expected saving | status |
|---|---|---|---|---|
