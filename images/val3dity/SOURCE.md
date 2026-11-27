# val3dity in this image: licence and source

- Program: val3dity 2.7.0, (c) its authors, TU Delft 3D geoinformation group. Licence: GNU General Public License
  version 3; the full text is `/opt/val3dity/LICENSE`, copied from the source tree at build time.
- Corresponding source: `https://github.com/tudelft3d/val3dity`, tag `2.7.0`, commit
  `fbe9e4d65376e1c3f63401f15967485783f78c0a`, unmodified. Build recipe: the `Dockerfile` and `collect.sh` of
  `GeoIPlus/3dEditor` `images/val3dity/` (CMake Release build against the distribution packages whose versions
  `/opt/val3dity/validator.json` records: CGAL, GEOS, Boost; Eigen is header-only).
- Shared libraries in `/opt/val3dity/lib` are the distribution builds (Ubuntu 24.04) of CGAL's dependencies GMP and
  MPFR, GEOS, Boost.Filesystem and the GCC runtime, under their own licences.
- The HTTP wrapper `/opt/wrapper/server.py` is a separate program that runs val3dity as a process; it is not linked
  with it. The 3DQM kernel and the kernel service are not in this image and do not link val3dity (D-109, D-148).
- TBD (Q-3D74-1): who answers requests for the corresponding source when this image is distributed outside GeoIPlus,
  and the contact to name here.
