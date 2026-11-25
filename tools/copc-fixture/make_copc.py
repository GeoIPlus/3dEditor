"""Builds the committed COPC test files of 3D-70 (D-140) from the GT-20 / GT-21 golden points.

Dev-time tool, not part of any package: needs Python 3 with `copclib` (BSD) and, for the check, `laspy` + `lazrs`.
Run from the repository root:  python3 tools/copc-fixture/make_copc.py
World = LOCAL + ORIGIN (axis 0 deg); integers are computed here, so a LAS copy written from the same JSON with the
same scale / offset holds the same integers. Octree: levels 0..2, node of a point by its index (i % 10 == 0 root,
1..3 level 1, else level 2), key = the voxel that contains the point; the level-2 nodes under the most populated
level-1 node sit on a child hierarchy page, so the reader must follow a pointCount -1 entry.
"""
import json
import sys
from collections import defaultdict

import copclib as copc

ORIGIN = (512000.0, 6170000.0, 0.0)
SCALE = 0.0001
CENTER_LOCAL = (5.0, 5.0, 6.5)
HALFSIZE = 6.0
CASES = [('GT-20', 'services/kernel/test/data/gt-20.copc.laz'), ('GT-21', 'services/kernel/test/data/gt-21.copc.laz')]


def level_of(i):
    r = i % 10
    return 0 if r == 0 else 1 if r <= 3 else 2


def key_of(ints, level):
    side = 2 * HALFSIZE / (1 << level)
    return tuple(int((ints[k] * SCALE - (CENTER_LOCAL[k] - HALFSIZE)) // side) for k in range(3))


def build(case, out):
    local = json.load(open(f'fixtures/{case}/input.points.json'))['points']
    ints = [[round(v / SCALE) for v in p] for p in local]
    nodes = defaultdict(list)
    for i, p in enumerate(ints):
        lvl = level_of(i)
        nodes[(lvl, *key_of(p, lvl))].append(p)
    level1 = [k for k in nodes if k[0] == 1]
    page = max(level1, key=lambda k: len(nodes[k]))
    cfg = copc.CopcConfigWriter(6, copc.Vector3(SCALE, SCALE, SCALE), copc.Vector3(*ORIGIN))
    info = cfg.copc_info
    info.center_x, info.center_y, info.center_z = (ORIGIN[k] + CENTER_LOCAL[k] for k in range(3))
    info.halfsize = HALFSIZE
    info.spacing = HALFSIZE / 8
    w = copc.FileWriter(out, cfg)
    w.copc_config.copc_info.center_x = info.center_x
    w.copc_config.copc_info.center_y = info.center_y
    w.copc_config.copc_info.center_z = info.center_z
    w.copc_config.copc_info.halfsize = HALFSIZE
    w.copc_config.copc_info.spacing = HALFSIZE / 8
    hdr = w.copc_config.las_header
    for key in sorted(nodes):
        pts = copc.Points(hdr)
        for p in nodes[key]:
            q = pts.CreatePoint()
            q.x, q.y, q.z = (p[k] * SCALE + ORIGIN[k] for k in range(3))
            pts.AddPoint(q)
        vk = copc.VoxelKey(*key)
        on_child = key[0] == 2 and tuple(c // 2 for c in key[1:]) == page[1:]
        w.AddNode(vk, pts, copc.VoxelKey(*page) if on_child else copc.VoxelKey(0, 0, 0, 0))
    hdr.min = copc.Vector3(*(min(p[k] for p in ints) * SCALE + ORIGIN[k] for k in range(3)))
    hdr.max = copc.Vector3(*(max(p[k] for p in ints) * SCALE + ORIGIN[k] for k in range(3)))
    w.Close()
    return ints, nodes, page


def check(out, ints):
    import laspy
    with laspy.open(out) as f:
        las = f.read()
    got = sorted(zip(las.X.tolist(), las.Y.tolist(), las.Z.tolist()))
    want = sorted(tuple(p) for p in ints)
    if got != want:
        sys.exit(f'{out}: integers differ from the JSON')


if __name__ == '__main__':
    for case, out in CASES:
        ints, nodes, page = build(case, out)
        check(out, ints)
        r = copc.FileReader(out)
        print(out, 'points', len(ints), 'nodes', len(nodes), 'child page', page, 'pages', len(r.GetPageList()),
              'info', r.copc_config.copc_info.center_x, r.copc_config.copc_info.halfsize)
