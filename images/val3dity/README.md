# images/val3dity

- Status: implemented (3D-74). Production build from source written; proven in the 3D-74 session with the host-built
  binary through the same runtime stage (D-3D74-2); the full from-source build is an open check (CI or a machine whose
  `docker build` may use the network).
- Protection: none (an independent validator; no kernel code). Licence: val3dity is **GPL-3.0**; this directory is
  isolated from the kernel and the service (D-109, D-148; `check:arch` rule `isolatedImages`).
- WP: 3D-74   ADR: [3D-ADR-0008](../../docs/decisions/adr/3D-ADR-0008-val3dity-binding.md)   Contract:
  [contracts/val3dity](../../contracts/val3dity/README.md)
- Source: `tudelft3d/val3dity` tag `2.7.0` = commit `fbe9e4d65376e1c3f63401f15967485783f78c0a`, unmodified (D-3D74-1).

## Purpose
FINAL_VALIDATION's independent external validator (spec §8 rule 1) as a separate program in its own container. The
kernel service reaches it over HTTP through the `validate` port adapter (`services/kernel/src/adapters/val3dity.js`).

## Files
- `Dockerfile` - stage `val3dity-build` (Ubuntu 24.04, apt CGAL / Eigen / GEOS / Boost, `ADD` of the pinned git
  commit, CMake Release, `collect.sh`); runtime `python:3.12-slim-trixie` with `/opt/val3dity` (binary, libraries,
  `validator.json`, GPL `LICENSE`, `SOURCE.md`) and the wrapper; runs as `nobody` on port 8080.
- `collect.sh` - packs the binary with the shared libraries it links (glibc left to the base image) and writes
  `validator.json` (version from `val3dity --version`, commit, CGAL / GEOS / Boost versions).
- `server.py` - the wrapper (Python standard library): `GET /version`, `POST /validate`; errors per the contract.
  Settings: `PORT`, `VAL3DITY_MAX_BYTES` (64 MiB), `VAL3DITY_TIMEOUT_S` (60) [A].
- `SOURCE.md` - licence and corresponding-source notice shipped in the image. TBD (Q-3D74-1): who answers source
  requests on distribution outside GeoIPlus.

## Build and run
```
# production (network for apt and GitHub):
docker build -t geoiplus/val3dity:2.7.0 images/val3dity
# host build (D-3D74-2): build val3dity 2.7.0 with CMake on Ubuntu 24.04, then
sh images/val3dity/collect.sh <src> <build> fbe9e4d65376e1c3f63401f15967485783f78c0a <DIR>/val3dity
docker build --build-context val3dity-build=<DIR> -t geoiplus/val3dity:2.7.0 images/val3dity
docker run -d -p 127.0.0.1:8080:8080 geoiplus/val3dity:2.7.0
VAL3DITY_URL=http://127.0.0.1:8080 npx vitest run --project golden services/kernel/test/gt-i4-val3dity.golden.test.js
```

## Checks
- `services/kernel/test/gt-i4-val3dity.golden.test.js` (needs `VAL3DITY_URL`, skipped otherwise): version = pin,
  GT-I4 without errors, GT-I2 findings mapped by `validate`.
- `services/kernel/test/val3dity.test.js` replays the image's recorded replies
  (`services/kernel/test/data/val3dity-gt-i{2,4}.response.json`, recorded 2026-11-26 from this image, `time` and
  `input_file` removed).
- `check:arch` `isolatedImages`: no npm package here, nothing in `packages/` or `services/` imports from here.

## Status, open issues
- Base images are referenced by tag, not digest [A]; pinning digests is a deployment choice (ADR-OPS).
- Production stage builds against Ubuntu 24.04 packages (CGAL 5.6, GEOS 3.12.1, Boost 1.83.0), the same as the
  host build that proved the acceptance lines.
