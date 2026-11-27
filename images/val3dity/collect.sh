#!/bin/sh
# Pack a built val3dity binary with the shared libraries it links (3D-74, D-445) into OUT:
#   OUT/bin/val3dity, OUT/lib/*.so*, OUT/validator.json (contracts/val3dity validator), OUT/LICENSE (GPL-3.0 text).
# Used by the Dockerfile's build stage and, for a host build, by hand: sh collect.sh <src> <build> <commit> <out>.
# glibc (libc, libm, ld-linux, libpthread, libdl, librt) is left to the runtime base image (newer glibc is compatible).
set -eu
SRC="$1"; BUILD="$2"; COMMIT="$3"; OUT="$4"
BIN="$BUILD/val3dity"
mkdir -p "$OUT/bin" "$OUT/lib"
cp "$BIN" "$OUT/bin/val3dity"
ldd "$BIN" | awk '/=> \// { print $3 }' | while read -r lib; do
  case "$(basename "$lib")" in
    libc.so.*|libm.so.*|ld-linux*|libpthread.so.*|libdl.so.*|librt.so.*) ;;
    *) cp -L "$lib" "$OUT/lib/" ;;
  esac
done
VERSION="$("$BIN" --version 2>&1 | sed -n 's/.*version: \([0-9.]*\).*/\1/p' | head -n 1)"
BOOST="$(ls "$OUT/lib" | sed -n 's/^libboost_filesystem\.so\.\([0-9.]*\)$/\1/p' | head -n 1)"
pkg() { dpkg-query -W -f='${Version}' "$1" | sed 's/^[0-9]*://; s/[-+~].*$//'; }
printf '{"name":"val3dity","version":"%s","commit":"%s","libraries":{"cgal":"%s","geos":"%s","boost":"%s"}}\n' \
  "$VERSION" "$COMMIT" "$(pkg libcgal-dev)" "$(pkg libgeos-dev)" "$BOOST" > "$OUT/validator.json"
cp "$SRC/LICENSE" "$OUT/LICENSE"
cat "$OUT/validator.json"
