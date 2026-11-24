# 3D-ADR-0008: val3dity binding for FINAL_VALIDATION

- Status: proposed. The owner chose the option in a dialog on 2026-11-23 (D-141); the ADR text itself waits for the
  owner's acceptance (D-18). It may be renumbered at merge (D-38).
- WP: 3D-12   Questions closed: Q-10 (by D-141)   Opened: -

## Context

- [D] Spec §8 rule 1 and v0.3 §8.2: `FINAL_VALIDATION` = independent external validator (val3dity, version pinned in G0),
  plus semantic and schema validation and an export round trip. D-91: the val3dity version is pinned by 3D-12.
- [D] [3D-ADR-0002](3D-ADR-0002-kernel-package-and-remote-port.md) C1 rule 1: no I/O, process or clock in `geo-model3d`;
  C1 tree: "the external validator is a port, not code here" (`src/validate/`); C2: `services/kernel` owns I/O and ports.
- [D] D-109 / [3D-ADR-0004](3D-ADR-0004-kernel-language-boolean-licences.md) decision 3: the kernel **and the service
  image** use only permissive licences; no GPL, LGPL or AGPL code.
- [V] val3dity (`github.com/tudelft3d/val3dity`, branch `main`, read 2026-11-23 through raw.githubusercontent.com):
  `LICENSE` is GNU GPL version 3; `CMakeLists.txt` requires CGAL (with Eigen) and GEOS (`find_package`, `SEND_ERROR`
  when missing); `src/main.cpp:50` `VAL3DITY_VERSION = "2.7.0"`, `docs/conf.py:57` `version = "2.7.0"`. Error codes
  101..999 from `docs/errors.rst`. [A] not checked here: whether a release tag `2.7.0` exists (GitHub API blocked from
  the build container) and the licences of the CGAL packages val3dity uses (CGAL is GPL-3+ / LGPL-3+ per package,
  3D-ADR-0004 context).
- [V] The README offers a command-line tool and a web application (`geovalidation.bk.tudelft.nl/val3dity`); input
  formats include CityJSON. There is no Dockerfile on `main` (`Dockerfile` 404).
- [D] D-142: 3D-12 builds the kernel side only (`src/validate`, port, stub); the image and the binding are a new row
  after 3D-23 (the service does not exist yet).

## Options

| Option | Consequences | Risk |
|---|---|---|
| **A. Own container** (chosen, D-141): a separate image builds val3dity 2.7.0 from source (pinned commit), with a thin wrapper that takes a CityJSON document and returns val3dity's JSON report; `services/kernel` calls it over the network through the validator port | Kernel and service images stay permissive (D-109); GPL code is a separate program with its own image (aggregation, not linking); version pinned by image tag + commit | A second image to build and run; one network hop, only on FINAL_VALIDATION; CGAL build time |
| B. Sidecar binary in the service image, run as a child process | Simplest wiring | Breaks D-109 (GPL code in the service image); needs a D-109 amendment and a licence review |
| C. TU Delft web application | Nothing to build | Building data leaves our infrastructure; no version pin, no availability guarantee; not for production |

## Decision

Option A. The binding is split in two:

1. **Kernel side (3D-12, this WP).** `validateModel(model, { mode: 'FINAL_VALIDATION', externalValidator, ... })`
   awaits `externalValidator.validate({ model, tolerances })`, which returns `{ validatorVersion, findings: [{
   externalValidatorCode, entityIds?, location?, suggestedFix? }] }`. `validate` maps val3dity codes to contract codes
   (`src/validate/external.js`, `VAL3DITY_CODES`, [A] pending review Q-45) and assigns severity from the one table
   (D-144). `validatorVersion` of the report = `geo-model3d-validate/1+<port version>`. A port failure rejects the
   promise; the service answers `UNAVAILABLE` and the model is unchanged (spec §2.4).
2. **Service side (new row after 3D-23).** The adapter exports the model (3D-11, `exportBuilding`), sends the CityJSON
   document to the val3dity container, maps val3dity feature / primitive ids back to kernel entity ids through the
   export's `sourceRef`, and reports `validatorVersion` as `val3dity <version>`. The image pins val3dity by commit and
   tag, records CGAL / GEOS versions, and carries the GPL-3.0 licence text and source offer. The wire format between the
   service and the container is a contract under `contracts/` before code (AGENTS.md §2 rule 7).

## Checks

- `test/validate/final.test.js`: FINAL_VALIDATION with a stub port reports `externalValidatorCode` and
  `validatorVersion`; every mapped val3dity code yields a contract-valid issue; missing port / version / code and a port
  failure reject.
- `check:arch` `kernelNoIo`: `src/validate` holds no process, network or file access (the port is injected).
- Service row: GT-I4 "val3dity without errors" (3D-11) runs against the pinned image; the image's licence check is
  outside the D-109 allow-list check of the service image (3D-67).
