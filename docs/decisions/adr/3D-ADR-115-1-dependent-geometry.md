# 3D-ADR-115-1: Dependent geometry follows its parent through the pipeline

- Status: accepted (owner, 2026-11-26, D-3D115-5)
- WP: 3D-115   Decisions: D-3D115-1..D-3D115-4 (owner, dialog, 2026-11-26)   Questions closed: none

## Context
- Planes are primary, vertices derived (D-08 [D]). A vertex with fewer than three independent planes is stored
  EXPLICIT and only checked against its planes (spec §4 r3 [D]; `brep/derive.js:133-139` [V]: `rederive` keeps an
  EXPLICIT position, it does not move it).
- An overhang (D-336, D-337 [D]) at the structural eave A -> B of roof face R over wall W adds four faces tagged
  `OVERHANG`: strip (plane copy of R), soffit (horizontal at the outer-edge Z), caps A / B (plane copies of the end
  walls GA / GB). A and B lose W from their incident faces and become EXPLICIT at R ∩ W ∩ G
  (`ops/overhang.js:1-9, 188-192` [V]).
- The parent / dependent relation is not stored: `findOverhang` recognises it from topology, the `OVERHANG` tag and the
  D-336 profile, and recovers the width from geometry (signed distance of oA from W) (`ops/overhang.js:35-63` [V]).
- Dormers (3D-20) are separate `BuildingInstallation` bodies whose base lies in the roof face plane; no host link is
  stored (`ops/installation-shell.js:111` [V]: `attributes: {}`). The roof face is not recoverable from topology (the
  two bodies share no edges) [V].
- `SET_HEIGHT EAVE` already rebuilds its own overhang: remove -> solve on the plain eave -> re-add at the same width with
  the same ids; failure refuses the command (D-338 [D], `ops/set-height.js:66-91` [V]). Every other operation that moves
  R is refused by the generic pipeline post-check `overhangGuard` (D-367, D-372, D-373 [D];
  `ops/pipeline.js:119-120` [V]). D-341 [D] asks for explicit links, detection before an edit, rebuild after the parent
  change, atomic apply, pipeline integration.
- Out of this ADR: validator minimum-area exception for caps (3D-117, D-343), new component kinds (row scope out).

## Options

### A. Representation of the parent / dependent link
| Option | Consequences | Risk |
|---|---|---|
| A1 Derived: topology + `OVERHANG` tag + D-336 profile; parameters recovered from the input model's geometry | No contract change; works for overhangs today | Dormers cannot be linked (no shared topology); every new component kind needs its own recogniser; parameters are re-measured, not stored (D-341 "no hidden heuristics") |
| A2 Explicit: new optional top-level `components` map in `building-model` - `{ id, kind: OVERHANG \| DORMER, parentFaceIds, anchorIds (eave half-edge / host face), params ({ widthM } / { heightM, ridgeRiseM, outline }), entityIds }`; topology recognition kept as a consistency check | One source of the parameters; generic for dormers and future kinds; additive schema change (D-18); patch / lineage / undo carry the record | Contract + brep patch + import / export + `SET_OVERHANG`, `ADD_DORMER`, `REMOVE_INSTALLATION` writers; record and topology can disagree (refused, never repaired silently) |
| A3 Face-level field `parentFaceId` on dependent faces, parameters still derived | Small schema change | Parameters still recovered from geometry; no place for dormer parameters |

### B. Rebuild after the parent changes (the EXPLICIT eave vertices)
| Option | Consequences | Risk |
|---|---|---|
| B1 Generalise D-338 in the pipeline: before `op.run`, take off every overhang the command does not address (eave restored, A / B DERIVED from R, W, G); run the operation and the constraint step on the plain model; then re-add each overhang at its stored width with its own ids | Solver sees the plain eave (as `SET_HEIGHT EAVE` does today); no spec change for vertices; ids kept, patch shows only geometry updates | An operation that splits or deletes the eave half-edge, or changes the end-wall junction to an unsupported one, cannot rebuild -> refused (D-338 rule) |
| B2 Post-solve rebuild only (solve with the overhang in place, then rebuild) | Smallest pipeline change | Wrong: A / B are EXPLICIT, so the solver keeps them fixed while R moves; targets on A / B are not solvable [V derive.js:133] |
| B3 Spec §4 r2 change: `definingFaceIds` may name the non-incident structural wall, A / B become DERIVED with the overhang in place; then B2 works | Model always fully derived | Changes the topology invariant of every row (`checkTopology`, validator, import); larger than this WP |

### C. Width when the wall W itself moves (ALIGN_WALL 3D-114, MOVE_FACE, ...) - follows from D-336, not asked
| Option | Consequences | Risk |
|---|---|---|
| C1 Width in plan kept, measured from the new W (D-336 "absolute width in plan") | Overhang is a parameter of the eave | Outer edge moves with the wall |
| C2 Outer edge kept in place | Overhang absorbs the wall move | Width changes silently; contradicts D-336 |

### D. Direct edits of dependent entities (strip, soffit, caps, oA / oB / sA / sB named in a payload)
| Option | Consequences | Risk |
|---|---|---|
| D1 Refused (`INVALID_PAYLOAD`) except by the operations that own them (`SET_OVERHANG`, `SET_HEIGHT EAVE`, `SET_SEMANTICS`? - list fixed in the registry) | Dependents change only through their parameters | Some current tests that edit a strip may change behaviour (to be listed) |
| D2 Allowed; the overhang becomes independent (link dropped) | Flexible | Silent loss of the parametric relation |

### E. Constraints and atomicity (common to all options)
- After the rebuild the hard constraints that name dependent entities are checked (no solve); violation ->
  `CONSTRAINT_CONFLICT`. Any rebuild failure refuses the whole command, model unchanged (transaction, D-338, D-341).
- The D-367 / D-372 guard stays as the final check: removed only for cases the rebuild covers; whatever the rebuild
  does not cover is still refused with `INVALID_TOPOLOGY` (D-373).

## Decision
Owner answers in a dialog, 2026-11-26; document accepted by the owner in a dialog (D-3D115-5, D-18):
- **A2 as the target, introduced later** (D-3D115-1): the explicit `components` record comes with dormers in row
  3D-115.2 as its own contract proposal. 3D-115 and 3D-115.1 change no canonical model schema, tolerance profile,
  `definingFaceIds` contract or general solver; overhangs are recognised from topology inside the transaction.
- **B1, detach - solve - rebuild** (D-3D115-2), with the owner's twelve-step transaction: internal reconstruction
  descriptors (no public schema), detach only overhangs whose parent can change (a conservative wider set allowed),
  structural envelope restored with DERIVED eave vertices only where `definingFaceIds` are valid (spec §4 r2
  unchanged, B3 rejected), rebuild with the same width in plan, ids, semantics and provenance through the existing
  `addOverhang`, no nearest-edge re-parenting, hard constraints verified independently after the rebuild, net patch
  from input and final models (no delete / create for kept ids), PREVIEW = COMMIT, no double rebuild in
  `SET_HEIGHT EAVE` / `SET_OVERHANG`. Failure -> `INVALID_TOPOLOGY` / `CONSTRAINT_CONFLICT` / `INVALID_GEOMETRY`, full
  rollback, never removal of the overhang as a fallback, never a downgrade to `DRAFT_SOLID`.
- **C1**: width in plan from the (new) wall W, as D-336 defines the width.
- **D1** (D-3D115-3): payloads naming dependent entities are refused with `INVALID_PAYLOAD` except by their owner
  operations.
- **E** as above; the D-367 / D-372 guard stays for what the rebuild does not cover.
- **Split** (D-3D115-4): 3D-115 = this ADR; 3D-115.1 = overhang rebuild (code after the 3D-114 and 3D-117 merges,
  D-378); 3D-115.2 = dormers + `components` contract.

## Checks
- A test per operation (ALIGN_RIDGE, ALIGN_EAVE, MATCH_ELEVATIONS, every 3D-15 / 3D-17 / 3D-105 / 3D-114 operation that
  changes a roof plane) on GT-03 with a 0.6 m overhang: strip coplanar with R (<= `planarTolM`), width in plan equal
  (<= `numericEpsilon`), caps / soffit rebuilt, ids kept, `VALID_SOLID`, or a refusal with the model unchanged.
- 3D-19 `SET_OVERHANG` / `SET_HEIGHT` tests and 3D-120 coplanar tests unchanged; `npm run check`, golden, bench.
