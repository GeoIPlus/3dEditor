# 3D-ADR-0005: constraint solver approach and the objective for free degrees of freedom (ADR-S)

- Status: accepted (owner, 2026-11-23, D-110)
- WP: 3D-08   Questions closed: Q-17   Related: Q-29 (shape of missing degrees of freedom, 3D-13)

## Context

- [D] Planes are primary, vertices derived (D-08; spec §4 rules 1-3). Unknowns of a solve are the `supportPlane`s the
  operation declares movable; every other plane is fixed (spec §5 rule 7, §10.1 rule 3).
- [D] Hard constraints hold within tolerance, a conflict returns `CONSTRAINT_CONFLICT` with a minimal useful id list;
  soft constraints by weights (measurements `1/σ²`); after any best fit every hard constraint is re-checked; too few
  conditions -> `UNDERCONSTRAINED_GEOMETRY` (spec §5 rules 2-5; v0.2 §15.2).
- [D] The sources name only the soft `MINIMIZE_DISPLACEMENT` for the remaining degrees of freedom (Q-17; spec §5 rule 8,
  §10.4 rule 5, §10.5 rule 4, §10.7 rule 3, §10.8 rule 3).
- [V] Example (spec §10.4): MOVE_EDGE of the GT-03 south eave with the south roof face movable. The target line gives
  two hard "point on plane" conditions; a plane has three degrees of freedom; one rotation about the line stays free.
- [V] 3D-08 spike (`packages/geo-model3d/spike/move-edge/`, (removed by 3D-121, D-357; in git history up to `9ca0afc`)): the plane
  solve below costs 0.08 ms per MOVE_EDGE on the 199-face scene, of 2.3 ms kernel time; the checks cost 1.7 ms
  ([verification note](../../verification/3D-08.md)).

## Options - objective for the free degrees of freedom (Q-17)

| Option | Consequences | Risk |
|---|---|---|
| O1. **Keep the other vertices**: minimise the sum of squared distances from the old positions of the face's other vertices (those not targeted by the operation) to the new plane, subject to the hard conditions | Closed form per plane (null space of the hard conditions + a generalized 4x4 eigenproblem); deterministic; in the spike the GT-03 ridge and the sawtooth ridges stay exactly where they were; `UNDERCONSTRAINED_GEOMETRY` falls out when the kept points do not fix the plane (e.g. all on the target line) | A first-order proxy of vertex displacement: a derived vertex moves along the line of its other planes, by distance / cos(angle); O1 and O2 agree whenever the other vertices can stay exactly |
| O2. Minimise the true displacement of the re-derived vertices | Exact reading of `MINIMIZE_DISPLACEMENT` | Nonlinear (vertex = intersection of planes): iterative, needs a start (O1), may have local minima, slower |
| O3. Minimal change of the plane parameters (normal, offset) | Simple | Depends on the origin and on a weight between normal and offset: not invariant, no geometric meaning |
| O4. No objective: refuse with `UNDERCONSTRAINED_GEOMETRY` until the operator adds constraints | No hidden choice | A plain drag of an eave would always be refused |

## Options - solver approach

| Option | Consequences | Risk |
|---|---|---|
| A1. **Own solver in the kernel language, two stages.** Stage 1: constraints linear in one plane's parameters (target points, `FIXED_POINT`, `ON_PLANE` with a fixed point) -> closed form per plane (O1). Stage 2: coupled or nonlinear constraints (`EQUAL_Z`, `FIXED_LINE`, `FIXED_EAVE`/`FIXED_RIDGE` on derived vertices, `PARALLEL`, `PERPENDICULAR`, `HORIZONTAL`, `VERTICAL`, `ROOF_SLOPE`, `SHARED_EDGE`, soft constraints) -> Gauss-Newton / Levenberg-Marquardt over all movable planes, hard constraints as linearised equalities (KKT / null space), start from stage 1. Conflicts: rank of the hard-constraint Jacobian, then a deletion filter for a minimal conflicting set. Underconstrained: null space of the hard Jacobian not fixed by the objective | Small dense problems (a few planes x 4 parameters); no dependency; speaks plane terms natively | Robustness of stage 2 must be earned by tests (3D-13 accept lines); minimal conflict sets by deletion filter cost one solve per constraint |
| A2. External geometric constraint solver (e.g. FreeCAD planegcs, SolveSpace) | Mature point/line/sketch solvers | Point-based, not plane-primary (D-08); C++ (native build in the service image); licences not permissive [A] (not verified in this WP) |
| A3. General nonlinear optimiser (e.g. Ceres, IPOPT) | Robust numerics | Native toolchain next to a JS kernel; still needs our own plane-terms formulation and conflict diagnostics |

## Decision

O1 + A1. O1 is the objective of stage 1 and the start of stage 2; soft constraints of spec §5 rule 1 add weighted terms
to the same least-squares objective (measurements with `1/σ²`). O2 is not adopted now; it is reconsidered only if a
golden test or an owner review shows O1's proxy moves a vertex visibly more than needed. The underconstrained test of O1
is a vanishing gap between the two smallest generalized eigenvalues (spike threshold `1e-9` m², 3D-13 fixes it against
the tolerance profile). The shape of the reported missing degrees of freedom stays with Q-29 (3D-13).

Consequences for the spec on acceptance: spec §5 rule 8 and §10.4 rule 5 replace `TBD` by a link to this ADR; Q-17
closes. Operation rows that name the objective (§10.5 rule 4, §10.7 rule 3, §10.8 rule 3) use it as written.

## Checks

- Spike tests (`tools/bench/spike.test.mjs`, (removed by 3D-121, D-357; in git history up to `9ca0afc`)): GT-03 eave raised with the ridge kept
  (<= 1e-9 m); every updated vertex equals the intersection of its defining planes; a skewed target line against
  `FIXED_POINT` ridge vertices -> `CONSTRAINT_CONFLICT` naming the face and both vertices; kept points on the target
  line -> `UNDERCONSTRAINED`.
- 3D-13 accept lines (spec §5): contradictory hard constraints -> both ids, no plane changed; underconstrained without a
  soft constraint -> `UNDERCONSTRAINED_GEOMETRY`; a planes-only solve never changes a plane outside the movable set.
