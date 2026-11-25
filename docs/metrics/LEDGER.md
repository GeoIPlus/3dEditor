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
| 2026-11-19 | 3D-02 | session_01RNYuqHV5A3Jiod4vnFQyFR | wp | 6.00 | 48.7 | 311.9 | 12641.9 | 8.0 | 31.68 | claude-opus-5-5 | final | - | newest result event 2026-11-20T23:26:24Z; backfill 3D-86 |
| 2026-11-19 | 3D-05 | session_01RNYuqJm8aJZEDrH3y1mQhy | wp | 6.70 | 77.1 | 280.4 | 14526.2 | 11.8 | 31.76 | claude-opus-5-5 | final | - | newest result event 2026-11-20T23:18:34Z; backfill 3D-86 |
| 2026-11-19 | 3D-30 | session_01RNYuqFCw1RgHsJJxdN4uzh | wp | 3.55 | 34.6 | 175.0 | 7299.5 | 5.3 | 0.23 | claude-opus-5-5 | final | - | newest result event 2026-11-19T15:27:11Z; backfill 3D-86 |
| 2026-11-19 | 3D-31 | session_01RNYuqFdLh7xEMUEWyEzWjm | wp | 5.70 | 37.8 | 233.5 | 15297.8 | 6.7 | 54.93 | claude-opus-5-5 | final | - | newest result event 2026-11-21T22:41:33Z; backfill 3D-86 |
| 2026-11-20 | 3D-28 | session_01RNYuqH61Lr6hFLYceV6M3E | wp | 9.12 | 113.6 | 206.8 | 25901.2 | 17.6 | 0.96 | claude-opus-5-5 | final | - | newest result event 2026-11-21T00:15:55Z; backfill 3D-86 |
| 2026-11-21 | 3D-04 | session_01RNYuqHRrh3hhFvNBfNzFhR | wp | 6.82 | 82.4 | 373.9 | 10892.8 | 12.0 | 22.29 | claude-opus-5-5 | final | - | newest result event 2026-11-21T22:33:25Z; backfill 3D-86 |
| 2026-11-21 | 3D-06 | session_01RNYuqE9f29CdpZvLJhNBvy | wp | 11.72 | 124.9 | 549.9 | 24047.4 | 17.5 | 35.12 | claude-opus-5-5 | final | - | newest result event 2026-11-23T09:39:52Z; backfill 3D-86 |
| 2026-11-23 | 3D-03 | session_01RNYuqHqEcHkA2qafSMCRLe | wp | 3.04 | 24.9 | 62.6 | 10200.5 | 4.0 | 31.76 | claude-opus-5-5 | final | - | newest result event 2026-11-23T09:40:49Z; backfill 3D-86 |
| 2026-11-23 | 3D-07 | session_01RNYuqGmV7Y1wn4vodqbCtu | wp | 7.88 | 104.3 | 406.0 | 12692.8 | 15.4 | 31.13 | claude-opus-5-5 | final | - | newest result event 2026-11-24T16:37:44Z; backfill 3D-86 |
| 2026-11-23 | 3D-08 | session_01RNYuqGRBj74fcnX1LVAumR | wp | 13.15 | 105.8 | 818.4 | 22433.8 | 16.8 | 27.85 | claude-opus-5-5 | final | - | newest result event 2026-11-24T16:37:44Z; backfill 3D-86 |
| 2026-11-23 | 3D-09 | session_01RNYuqEPp4g2FeipZ6zE9Bx | wp | 9.89 | 87.1 | 589.3 | 17136.6 | 12.9 | 20.89 | claude-opus-5-5 | final | - | newest result event 2026-11-24T13:05:20Z; backfill 3D-86 |
| 2026-11-23 | 3D-10 | session_01RNYuqGK6rsHb5qzH36mDdb | wp | 13.65 | 123.4 | 487.3 | 36359.5 | 18.5 | 13.92 | claude-opus-5-5 | final | - | newest result event 2026-11-24T12:39:36Z; backfill 3D-86 |
| 2026-11-23 | 3D-12 | session_01RNYuqJuHy5XkFtHjy8xZC3 | wp | 13.98 | 140.5 | 496.4 | 35965.2 | 20.9 | 13.82 | claude-opus-5-5 | final | - | newest result event 2026-11-24T12:37:57Z; backfill 3D-86 |
| 2026-11-23 | 3D-13 | session_01RNYuqEdHwBFszNWyLyjkku | wp | 12.33 | 135.7 | 466.2 | 29402.5 | 20.2 | 13.26 | claude-opus-5-5 | final | - | newest result event 2026-11-24T12:21:28Z; backfill 3D-86 |
| 2026-11-23 | 3D-22 | session_01RNYuqErSxNh35p64DEYmvz | wp | 11.98 | 109.8 | 426.0 | 31768.7 | 16.9 | 13.79 | claude-opus-5-5 | final | - | newest result event 2026-11-24T12:45:11Z; backfill 3D-86 |
| 2026-11-23 | 3D-32 | session_01RNYuqES9xzwAeo59ByjVZG | wp | 8.96 | 82.4 | 592.6 | 13181.2 | 13.3 | 23.42 | claude-haiku-5-5, claude-opus-5-5 | final | - | newest result event 2026-11-24T12:12:48Z; tokens summed over models; backfill 3D-86 |
| 2026-11-23 | 3D-46 | session_01RNYuqHxXAVHa3csDLoxLW9 | wp | 8.35 | 65.5 | 418.0 | 18415.7 | 11.1 | 19.92 | claude-opus-5-5 | final | - | newest result event 2026-11-24T12:16:35Z; backfill 3D-86 |
| 2026-11-23 | 3D-64 | session_01RNYuqJfC9LLnmYbzPfeQpQ | wp | 3.63 | 27.8 | 165.5 | 8736.9 | 4.7 | 4.58 | claude-opus-5-5 | final | - | newest result event 2026-11-23T14:14:28Z; backfill 3D-86 |
| 2026-11-23 | 3D-65 | session_01RNYuqJuqi8HqiPZPgzSp9q | wp | 1.74 | 14.8 | 96.1 | 3356.5 | 2.5 | 5.06 | claude-opus-5-5 | final | - | newest result event 2026-11-23T16:23:04Z; backfill 3D-86 |
| 2026-11-23 | 3D-66 | session_01RNYuqHfNXwh9xhHozrNzSQ | wp | 5.14 | 42.3 | 253.9 | 11268.3 | 7.3 | 13.78 | claude-opus-5-5 | final | - | newest result event 2026-11-24T12:44:44Z; backfill 3D-86 |
| 2026-11-23 | 3D-67 | session_01RNYuqEU5JMseqB4a8azQFa | wp | 4.87 | 41.0 | 274.0 | 9212.7 | 6.6 | 13.70 | claude-opus-5-5 | final | - | newest result event 2026-11-24T12:42:33Z; backfill 3D-86 |
| 2026-11-24 | 3D-11 | session_01RNYuqHNYzV7ucsHqE5Ur3U | wp | 6.56 | 79.4 | 183.4 | 17489.1 | 12.7 | 1.07 | claude-opus-5-5 | final | - | newest result event 2026-11-24T13:20:18Z; backfill 3D-86 |
| 2026-11-24 | 3D-14 | session_01RNYuqEcCxMKbMTCfZXsGFR | wp | 11.40 | 129.7 | 436.1 | 26564.6 | 19.4 | 4.35 | claude-opus-5-5 | final | - | newest result event 2026-11-24T17:46:02Z; backfill 3D-86 |
| 2026-11-24 | 3D-16 | session_01RNYuqJoPWe2Yx1Z1ba5RWm | wp | 6.25 | 51.8 | 298.1 | 14110.6 | 8.1 | 18.53 | claude-opus-5-5 | final | - | newest result event 2026-11-25T12:16:50Z; backfill 3D-86 |
| 2026-11-24 | 3D-21 | session_01RNYuqF8JgreRTgZk7EUTqF | wp | 3.92 | 29.9 | 253.9 | 6448.9 | 4.6 | 17.95 | claude-opus-5-5 | final | - | newest result event 2026-11-25T11:41:21Z; backfill 3D-86 |
| 2026-11-24 | 3D-69 | session_01RNYuqFyBYVek2HSxEj3uUd | wp | 8.87 | 104.5 | 227.1 | 24774.2 | 16.7 | 1.07 | claude-opus-5-5 | final | - | newest result event 2026-11-24T13:23:26Z; backfill 3D-86 |
| 2026-11-24 | 3D-70 | session_01RNYuqF8tR9Ctr4ugQmYJrp | wp | 7.29 | 80.6 | 225.1 | 19825.3 | 13.3 | 1.14 | claude-haiku-5-5, claude-opus-5-5 | final | - | newest result event 2026-11-24T13:20:03Z; tokens summed over models; backfill 3D-86 |
| 2026-11-24 | 3D-72 | session_01RNYuqGpzhDHqkBZhEpvMWr | wp | 1.23 | 11.9 | 61.7 | 2469.1 | 1.9 | 0.04 | claude-opus-5-5 | final | - | newest result event 2026-11-24T12:13:27Z; backfill 3D-86 |
| 2026-11-24 | 3D-73 | session_01RNYuqFNkMB6ia3hb1VQWL3 | wp | 1.76 | 17.2 | 63.1 | 4575.8 | 3.4 | 0.14 | claude-opus-5-5 | final | - | newest result event 2026-11-24T16:43:08Z; backfill 3D-86 |
| 2026-11-24 | 3D-75 | session_01RNYuqHhCRCkuZQHT3n9XiA | wp | 3.25 | 30.4 | 114.2 | 8626.5 | 5.2 | 0.85 | claude-opus-5-5 | final | - | newest result event 2026-11-24T13:14:33Z; backfill 3D-86 |
| 2026-11-24 | 3D-76 | session_01RNYuqHEpurHky2h8xU9d6i | wp | 1.73 | 15.0 | 63.2 | 4591.6 | 2.8 | 0.16 | claude-haiku-5-5, claude-opus-5-5 | final | - | newest result event 2026-11-24T16:44:51Z; tokens summed over models; backfill 3D-86 |
| 2026-11-24 | 3D-77 | session_01RNYuqFXXBtXa6SmQGm55ys | wp | 1.54 | 10.1 | 91.9 | 3008.1 | 1.9 | 3.12 | claude-opus-5-5 | final | - | newest result event 2026-11-24T16:34:37Z; backfill 3D-86 |
| 2026-11-24 | 3D-78 | session_01RNYuqJ8frnc5a7rLjUZoH9 | wp | 3.52 | 53.9 | 127.5 | 7074.0 | 8.1 | 0.84 | claude-opus-5-5 | final | - | newest result event 2026-11-24T13:26:22Z; backfill 3D-86 |
| 2026-11-24 | 3D-80 | session_01RNYuqJBEthWGqbZHWR5PxB | wp | 3.05 | 19.1 | 172.0 | 6393.9 | 3.4 | 3.15 | claude-haiku-5-5, claude-opus-5-5 | final | - | newest result event 2026-11-24T16:26:15Z; tokens summed over models; backfill 3D-86 |
| 2026-11-24 | 3D-81 | session_01RNYuqF4ErqsAPBJaEC8dzq | wp | 2.32 | 17.6 | 126.8 | 4781.9 | 3.2 | 3.05 | claude-opus-5-5 | final | - | newest result event 2026-11-24T16:31:10Z; backfill 3D-86 |
| 2026-11-25 | 3D-86 | session_01RNYuqHnuDRZzVutCfR9HFd | wp | ? | ? | ? | ? | ? | ? | claude-opus-5-5 | as of - | yes (Fable, 3 proposals; cost inside session) | no finished turn when written (first turn); coordinator reads it at merge |
| 2026-11-25 | 3D-89 | session_01RNYuqJtpgwUr65orM4dzJp | wp | ? | ? | ? | ? | ? | ? | claude-opus-5-5 | as of - | yes (Fable, 3 proposals, see checkpoint 3D-89; ~105k subagent tokens, cost inside session) | no finished turn when written (first turn); coordinator reads it at merge |
| 2026-11-25 | 3D-102 | session_01RNYuqFyAoJL2uxRMqHZkLp | wp | ? | ? | ? | ? | ? | ? | claude-opus-5-5 | as of - | pending | no finished turn when written (first turn); coordinator reads it at merge |

Backfill 2026-11-25 (row 3D-86): every `3D-*` session of a `done` row listed by `list_sessions` (mine) that had no
row, read from its newest `result` event; 3D-01, 3D-27, 3D-29 keep their earlier rows (no duplicate).

## Improvement proposals

From efficiency reviews (README §5). Status: `open`, `adopted (D-NN)`, `rejected (reason)`.

| date | from (WP, session) | proposal | expected saving | status |
|---|---|---|---|---|
| 2026-11-25 | 3D-85, session_01RNYuqGReWdMPazLVoyejTW | Read session cost from `get_session` -> `external_metadata.usage` (`cost_usd`, token counts; one short answer) instead of `result` events (~15k characters each); verify it equals the newest `total_cost_usd` on one session first | a few k tokens per measurement | rejected (3D-86: get_session usage is not the session total - 3D-84 1.128 vs 3.92 from the newest result event; README §1 unchanged) |
| 2026-11-25 | 3D-88, session_01RNYuqGYcTF5pjsGKsqgM9e | P1: a small script that sums `usage` per distinct message id from assistant events and prints one line (calls, cache-read, cache-write, peak context), to fill the ledger in the first turn | fewer raw event pages read per review / merge | open |
| 2026-11-25 | 3D-88, session_01RNYuqGYcTF5pjsGKsqgM9e | P2: `npm ci` in the environment setup script, and `check-docs --fix` moves a row's mermaid node with its status | ~4 tool calls per WP (~12-15 % of cache-read on 3D-88) | open (setup script: owner/environment decision) |
| 2026-11-25 | 3D-88, session_01RNYuqGYcTF5pjsGKsqgM9e | P3: size-based review trigger - skip or digest-only review when a session has < ~40 calls and no budget stop | the ~66.6k cold cache write of a review per small WP | open (owner decision; D-237/D-238 fix the first 10 as calibration) |
| 2026-11-25 | 3D-86, session_01RNYuqHnuDRZzVutCfR9HFd | P1: an extraction subagent writes its result to a scratchpad file and returns only path + row count + one control row (AGENTS.md §7.2) | ~17k cache-write plus ~8-10k Opus output per backfill-type extraction | open |
| 2026-11-25 | 3D-86, session_01RNYuqHnuDRZzVutCfR9HFd | P2: `npm ci` in the same batch as branch creation, and the closing edits (row status, mermaid node, ledger row) batched into one command (skill wp-session) | ~5 calls per WP | open (instruction change, AGENTS.md §10) |
| 2026-11-25 | 3D-86, session_01RNYuqHnuDRZzVutCfR9HFd | P3: a WP session writes no `?` cost row in its first turn; the coordinator fills the row at merge (README §1) | removes a correction step per single-turn WP | open (instruction change, AGENTS.md §10) |
| 2026-11-25 | 3D-89, session_01RNYuqJtpgwUr65orM4dzJp | P1: a session-profile reducer for list_events (one line per turn: calls, tokens, cost), so a review reads the whole session, not its last third | fewer event pages read per review | open |
| 2026-11-25 | 3D-89, session_01RNYuqJtpgwUr65orM4dzJp | P2: a finish-step helper (ledger row template, review due, no first-turn `?` row); overlaps 3D-86 P2/P3 - batch into one skill change | a few calls and one correction step per WP | open (instruction change, AGENTS.md §10) |
| 2026-11-25 | 3D-89, session_01RNYuqJtpgwUr65orM4dzJp | P3: `check-docs --fix` moves the mermaid node with the status change; run tsc + check:docs before the full check (overlaps 3D-88 P2) | ~2-4 calls per WP | open |
