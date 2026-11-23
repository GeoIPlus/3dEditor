# tools/crs-table

Generates `packages/geo-model3d/src/crs/epsg-table.json` (3D-32, [3D-ADR-0007](../../docs/decisions/adr/3D-ADR-0007-crs-transform.md)).

Input: PROJ `proj.db` from the pinned pyproj wheel (PROJ 9.8.1, EPSG v12.029). The file is not committed (10 MB); the
SHA-256 of the one used is in the table's `source.projDbSha256`.

```sh
pip download --no-deps --only-binary=:all: pyproj==3.8.0 -d <scratch>
python3 -I -c "import zipfile,sys; zipfile.ZipFile(sys.argv[1]).extract('pyproj/proj_dir/share/proj/proj.db', sys.argv[2])" <scratch>/pyproj-3.8.0-*.whl <scratch>
node --no-warnings tools/crs-table/generate.mjs <scratch>/pyproj/proj_dir/share/proj/proj.db
```

Needs Node >= 22.5 (`node:sqlite`). The wheel name differs per platform; any wheel of the same pyproj version carries the
same `proj.db` [A]. A new table is a reviewed change: diff the counts printed by the generator and run the `crs` tests.
