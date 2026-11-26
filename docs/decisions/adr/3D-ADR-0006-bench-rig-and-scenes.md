# 3D-ADR-0006: bench rig, scenes and protocol for the latency targets (ADR-012)

- Status: accepted (owner, 2026-11-23, D-111)
- WP: 3D-08   Questions closed: none (v0.3 §11 "Эталонный стенд ... фиксируется в G0 (ADR-012)")   Open: Q-42

## Context

- [D] Target: server PREVIEW p95 <= 150 ms for a building up to 200 faces, network excluded; a miss is an owner
  escalation, never a client fallback (v0.3 §11, `fullSpecsV0.3.md:351`; spec §11 rule 14; D-06). COMMIT of a simple
  operation p95 <= 1 s is "checked by the spike" in v0.3 (`fullSpecsV0.3.md:352`) but is not in the 3D-08 row.
- [D] v0.3 §11 (`fullSpecsV0.3.md:360`): the reference rig is fixed in G0 by ADR-012. Up to 500 faces per building are
  imported; above 200 there is no latency guarantee (D-94).
- [V] The kernel service and its image are 3D-23 (D-33); where the Tools Plane runs it in production is not known
  (HANDOVER §8 question 3). So the production instance class cannot be named today.
- [V] Before 3D-08, `npm run bench` was `vitest bench --run --passWithNoTests` with no bench files. Vitest bench
  (tinybench) reports p75/p99/p995, not p95.
- [V] GT-03 (3D-07) is a 7-face gable (`fixtures/GT-03/input.model.json`); no 200-face fixture exists.

## Options

| Option | Consequences | Risk |
|---|---|---|
| R1. Reference rig = the cloud agent container every WP session runs in (recorded fingerprint: 4 logical CPUs Intel Xeon @ 2.10 GHz, 15.7 GiB, Linux 6.18 x64, Node v22.23.5), until the production instance class is known | Every WP session can re-run the bench where it works; numbers comparable between WPs | Shared, noisy hardware; not the production machine |
| R2. Reference rig = the production instance class of the kernel service | The number that users will see | Unknown today (HANDOVER §8 q3); blocks G0 |
| R3. Reference rig = CI runner (GitHub Actions) | Repeatable machine type | Not set up; noisy; timing in CI flakes |

| Option | Consequences | Risk |
|---|---|---|
| S1. Scenes: GT-03 (7 faces, the v0.3 G0 scene), **sawtooth-199** (gate: 97 gable bays, 199 faces <= 200, 394 vertices, 1182 half-edges), sawtooth-499 (D-94, informative) | Deterministic, generated from the fixture generator's envelope and model writer; the gate scene has two 197-vertex walls that every valley move touches (pessimistic for the checks) | Synthetic shape; a real 200-face roof has more, smaller faces |
| S2. Scenes from real roofer / TerraSolid buildings | Realistic | Samples not in the repository (Q-07, 3D-26) |

## Decision

R1 + S1, with this protocol, implemented by `npm run bench` ([tools/bench/cli.mjs](../../../tools/bench/cli.mjs)):

1. Measured span: request body bytes in -> reply string out, one Node process, sequential requests, through the
   kernel service's command API that ships (`createCommandApi`, services/kernel/src/command-api.js; since 3D-121,
   D-357): body limit and `JSON.parse`, Ajv `command` + payload, PREVIEW rate limit (injected clock, 100 ms per
   request), head and version from the `history` port over the memory store (JSON text parsed per read; network and
   disk excluded), the kernel `executeCommand` once in phase COMMIT (D-355), the PREVIEW store, Ajv reply,
   `JSON.stringify` ([tools/bench/service.mjs](../../../tools/bench/service.mjs)). Stage times: `parse`,
   `validateCommand`, `loadModel`, `validateReply`, `serialize`; `kernelAndApi` is the rest (the kernel is not
   injectable). A scene whose replies are not all PREVIEW fails. Until 3D-121, MOVE_EDGE ran the 3D-08 spike, not
   `executeCommand` (3D-08 numbers below stay as history; `--warm` was dropped with it).
2. Per scene: 300 warm-up requests, then 5 runs x 1000 requests; consecutive requests move the edge by a different
   offset (a drag). Nearest-rank percentiles p50/p95/p99, max and mean per run and pooled; mean time per stage.
3. Verdict: the gate scene passes when both the pooled p95 and the worst run's p95 are <= 150 ms. `npm run bench`
   exits 1 on a miss. It is not part of `npm run check` (timing in CI flakes) [P].
4. Every result carries the rig fingerprint ([tools/bench/rig.mjs](../../../tools/bench/rig.mjs)): CPU model and count,
   cgroup CPU quota, memory, OS, Node and V8 versions, 1-minute load, commit. Results are stored as JSON next to the
   WP's verification note (3D-08: [docs/verification/3D-08/](../../verification/3D-08/), spike path; 3D-121:
   [docs/verification/3D-121.md](../../verification/3D-121.md), command API path).
   3D-121 result (2026-11-26, this rig): sawtooth-199 p95 56.106 ms, worst run 56.859 ms, gate PASS; the 3D-08
   spike figure p95 5.411 ms is history, not the shipped path.
5. [P] Re-measure when the PREVIEW path changes materially: 3D-13 (solver), 3D-12 (validation), 3D-15 (MOVE_EDGE for
   real), and once on the production instance class when 3D-23 builds the image (Q-42).

Not covered: concurrency (one request at a time; requests from several operators on one instance queue), COMMIT
latency, import latency. Proposed follow-ups through intake, not part of this ADR.

## Checks

- `npm run bench` prints the fingerprint and the verdict; exit code 1 when the gate misses.
- `tools/bench/bench.test.mjs` (in `npm test`, 3D-121): the gate scene has 199 faces, is valid against `building-model`,
  closed, and its MOVE_EDGE through the command API returns a valid, stored PREVIEW; every scene's first reply is a
  PREVIEW; a valley below the ground is not; replies are byte-identical for the same request on a fresh service.
  Until 3D-121 these were `tools/bench/spike.test.mjs` over the 3D-08 spike (removed, D-357).
