# spike/move-edge - 3D-08 latency spike (throwaway)

- Status: spike, not kernel code. Not in `package.json` `exports`; nothing in `src/` imports it.
- Protection: P4, server-only (D-06). Imports `src/canary.js`, so any bundle that reaches it carries the marker.
- WP: 3D-08. Used by `npm run bench` ([tools/bench](../../../../tools/bench/)) and `tools/bench/spike.test.mjs`.
- Fate: 3D-09 / 3D-13 / 3D-15 build the kernel from the spec and the accepted ADRs; they may copy ideas, they do not
  import this folder. Delete it when 3D-15 has its own MOVE_EDGE and the bench points at it.

## Files
- `index.js` - `previewMoveEdge(model, command, tol, ctx)` -> `command-result` object (pure; clock and ids injected).
- `move-edge.js` - spec §10.4 in plane terms. `planes.js` - per-plane solve (3D-ADR-0005 O1), vertex derivation.
- `checks.js`, `intersect.js` - FAST_PREVIEW of the affected faces. `topology.js` - rings and vertex-face index.
- `linalg.js` - Jacobi eigen-decomposition, 3x3 least-squares point.

Refusal codes not named by the spec are marked `[A]` in the code; they are not decisions.
