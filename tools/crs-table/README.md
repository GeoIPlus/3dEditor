# tools/crs-table

Generates `packages/geo-model3d/src/crs/epsg-table.json` (3D-32, [3D-ADR-0007](../../docs/decisions/adr/3D-ADR-0007-crs-transform.md)).

Input: PROJ `proj.db` from the pinned pyproj wheel (PROJ 9.8.1, EPSG v12.029). The file is not committed (10 MB); the
SHA-256 of the one used is in the table's `source.projDbSha256`.

```sh
pip download --no-deps --only-binary=:all: pyproj==3.8.0 -d <scratch>
python3 -I -c "import zipfile,sys; zipfile.ZipFile(sys.argv[1]).extract('pyproj/proj_dir/share/proj/proj.db', sys.argv[2])" <scratch>/pyproj-3.8.0-*.whl <scratch>
python3 -m venv <scratch>/venv && <scratch>/venv/bin/pip install pyproj==3.8.0
<scratch>/venv/bin/python -I tools/crs-table/proj-defs.py <scratch>/proj-defs.json
node --no-warnings tools/crs-table/generate.mjs <scratch>/pyproj/proj_dir/share/proj/proj.db <scratch>/proj-defs.json
```

Projections (3D-69, D-198): `proj-defs.py` writes PROJ's own proj-string of every projected CRS and nine sample
points of its area of use (3 x 3 grid at 5 / 50 / 95 % of the bounds) as PROJ computes them; `projections.mjs` drops
datum tokens (`+datum`, `+ellps`, `+towgs84`, `+nadgrids`; the ellipsoid is written as `+a` / `+rf` or `+b` from
`proj.db`), refuses `+pm`, `+axis`, `+to_meter`, non-metre `+units`, and keeps a definition only when proj4js forward
and inverse agree with every PROJ sample within 0.001 m (the spec §4a write-back rule). Result 2026-11-24: 4207 of
4262 projected CRSs; left out are counted in the table's `skippedProjections`. `proj-defs.json` (1.6 MB) is not
committed. The table grew from 110 kB to 605 kB (text JSON).

Needs Node >= 22.5 (`node:sqlite`). The wheel name differs per platform; any wheel of the same pyproj version carries the
same `proj.db` [A]. A new table is a reviewed change: diff the counts printed by the generator and run the `crs` tests.
