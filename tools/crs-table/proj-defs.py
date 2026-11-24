"""Exports PROJ's own proj-string of every projected CRS, with oracle samples (3D-69, D-198).

Usage (pinned pyproj 3.8.0 = PROJ 9.8.1, the wheel that also supplies proj.db; see README.md):
    python3 -I tools/crs-table/proj-defs.py <out.json>

For each non-deprecated EPSG / OGC projected CRS: the proj-string PROJ writes for it, and nine sample points inside
its area of use (a 3 x 3 grid at 5 %, 50 % and 95 % of its bounds) as PROJ computes them (geodetic lon/lat on the
CRS's own datum -> easting/northing). generate.mjs keeps a projection only when proj4js reproduces these samples
(README.md). No datum shift is involved: source and target of
every sample share the datum of the CRS.
"""
import json
import sys
import warnings

import pyproj
from pyproj import CRS, Transformer
from pyproj.database import query_crs_info
from pyproj.enums import PJType

warnings.simplefilter("ignore")


def samples(crs):
    aou = crs.area_of_use
    if aou is None:
        return None
    w, s, e, n = aou.west, aou.south, aou.east, aou.north
    if e < w:  # crosses the antimeridian
        e += 360
    pts = []
    for fx in (0.05, 0.5, 0.95):
        for fy in (0.05, 0.5, 0.95):
            lon = w + (e - w) * fx
            lat = s + (n - s) * fy
            pts.append([lon - 360 if lon > 180 else lon, lat])
    tr = Transformer.from_crs(crs.geodetic_crs, crs, always_xy=True)
    out = []
    for lon, lat in pts:
        x, y = tr.transform(lon, lat, errcheck=True)
        out.append({"lonlat": [lon, lat], "en": [x, y]})
    return out


def main(path):
    defs = {}
    for auth in ("EPSG", "OGC"):
        for info in query_crs_info(auth_name=auth, pj_types=PJType.PROJECTED_CRS, allow_deprecated=False):
            key = f"{info.auth_name}:{info.code}"
            try:
                crs = CRS.from_authority(info.auth_name, info.code)
                proj = crs.to_proj4()
                smp = samples(crs)
            except Exception as exc:  # noqa: BLE001 - recorded, the CRS is simply not exported
                defs[key] = {"error": type(exc).__name__}
                continue
            if proj is None or smp is None:
                defs[key] = {"error": "NO_PROJ_STRING_OR_AREA"}
                continue
            defs[key] = {"proj": proj, "samples": smp}
    out = {"pyproj": pyproj.__version__, "proj": pyproj.proj_version_str, "defs": dict(sorted(defs.items()))}
    with open(path, "w", encoding="utf-8") as f:
        json.dump(out, f)
    ok = sum(1 for d in defs.values() if "proj" in d)
    print(f"{path}: {ok} of {len(defs)} projected CRSs with proj-string and samples; PROJ {pyproj.proj_version_str}")


if __name__ == "__main__":
    if len(sys.argv) != 2:
        sys.exit("usage: python3 -I tools/crs-table/proj-defs.py <out.json>")
    main(sys.argv[1])
