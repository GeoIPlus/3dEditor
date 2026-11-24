# 3D-ADR-0009: LAZ decoder for the COPC points adapter

- Status: proposed
- WP: 3D-70   Questions closed: -

## Context

- [D] D-35: 3DQM starts with its own data ports; points are read from COPC / LAS by box until `crowdsource` serves COPC
  `stream` datasets (3D-61). D-133: 3D-22 built the points port and an uncompressed LAS-whole reader; COPC by box needs a
  LAZ decoder, a new runtime dependency, which needs an ADR and the owner's approval (D-109, 3D-ADR-0004 decision 3).
- [D] [3D-ADR-0002](3D-ADR-0002-kernel-package-and-remote-port.md) C1 rule 1 / C2 (D-51): the kernel `geo-model3d` has
  no I/O; all ports and adapters live in `services/kernel`. D-06/D-07: server-only (P4), no WASM build for browsers.
- [D] [3D-ADR-0004](3D-ADR-0004-kernel-language-boolean-licences.md) decision 3: kernel and service image use only
  permissive licences (MIT, ISC, BSD-2/3, Apache-2.0, Unlicense, BSL-1.0).
- [V] COPC 1.0 specification (`github.com/copcio/copcio.github.io` README.md @a6336f7, 2026-08-18; copc.io itself is
  refused by the build container's proxy): a COPC file is a LAZ 1.4 file with PDRF 6, 7 or 8 only, an `info` VLR
  (`copc`/1, first VLR, offset 375, 160 bytes: octree centre, halfsize, root hierarchy page offset and size) and
  hierarchy pages of 32-byte entries (key, offset, byteSize, pointCount; -1 = child page, 0 = empty). Each node's points
  are one LAZ chunk at `offset` / `byteSize`. "A reader needs to know little about the structure of a LAZ file": the
  hierarchy is plain binary; only the point chunks need a LAZ decoder.
- [V] `laz-perf` 0.0.7 (`npm view`, 2026-11-24): licence `Apache-2.0`, published 2025-02-19, 1 215 348 bytes unpacked,
  no runtime dependencies. Node entry `lib/node/index.js` (CommonJS, Emscripten); `lib/node/laz-perf.wasm` 214 351 bytes;
  requires only `fs` and `path`. API used: `createLazPerf()`, `ChunkDecoder.open(format, recordLength, pointer)`,
  `getPoint(pointer)`, `_malloc`, `_free`, `HEAPU8` (`lib/node/laz-perf.d.ts`). The JS build decodes only.
  Source repository `hobuinc/laz-perf` @1548cda (2026-10-18): `COPYING` is the Apache License 2.0; C++ headers state
  "Apache Public License 2.0" (`cpp/lazperf/las.hpp`). The npm tarball holds no licence file.
- [V] npm `copc` 0.0.9 (MIT) is a full COPC reader, but depends on `cross-fetch` ^4.1.0 (HTTP, not needed for a local
  file) and on `laz-perf` ^0.0.7 itself.
- [V] Measured in this WP (`services/kernel/test/copc.test.js`): the decoder reproduces the integers of the committed
  test files exactly (equality with the LAS copy over six boxes); GT-20 / GT-21 hold through the adapter.

## Options
| Option | Consequences | Risk |
|---|---|---|
| **A. `laz-perf` 0.0.7 (WASM) for the chunks + own COPC reader (header, `info` VLR, hierarchy, node selection, ~140 lines)** | One small dependency, no transitive ones, Apache-2.0; the reader is testable on synthetic bytes; the same reader takes a range-read source, so 3D-61 can swap the local file for HTTP ranges | Pre-1.0 version, low release cadence (0.0.6 2023-06, 0.0.7 2025-02); Emscripten module is CommonJS; no licence file in the tarball (Apache-2.0 text must be shipped with the image) |
| B. npm `copc` 0.0.9 (MIT) | Ready reader | Pulls `cross-fetch` (network client in the service for no need) and `laz-perf` anyway; two dependencies instead of one |
| C. Own LAZ decoder in JavaScript | No dependency | LAZ 1.4 layered arithmetic coding is a large, error-prone codec; far beyond an M row |
| D. Native LASzip / PDAL in the image | Reference implementations | LASzip is LGPL (not on the allow-list, [A] not re-verified here); native build in the image; PDAL is heavy |

## Decision

Recommended: **A**.
1. `laz-perf` 0.0.7, pinned exactly, is a runtime dependency of `services/kernel` only (`services/kernel/package.json`);
   never of `packages/geo-model3d` and never in a browser bundle. `services/*` becomes an npm workspace so `npm ci`
   installs it and the licence allow-list check of 3D-67 sees the service as a root.
2. COPC structure (header checks, `info` VLR, hierarchy pages, node cubes, node selection by box) is own code in
   `services/kernel/src/adapters/copc-format.js`; `laz-perf` is called in one function (`decodeChunk` in
   `copc-points.js`), so a later decoder swap touches one function.
3. Accepted only after the owner's word in a dialog (D-18).

## Checks
- `services/kernel/test/copc.test.js`: COPC = LAS copy by box; decoded-node counts; GT-20 / GT-21 through the adapter;
  `packages/geo-model3d` declares no `laz-perf` and its source does not name it.
- `npm run check:arch`, licence allow-list of 3D-67 (once merged, D-139): `laz-perf` Apache-2.0 passes; a copyleft
  replacement would fail.
- `npm run check:arch` P4 canary: unchanged; `services/kernel` is not a client bundle.
