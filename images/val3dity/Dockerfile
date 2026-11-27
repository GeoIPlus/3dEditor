# val3dity image (3D-74; 3D-ADR-0008 option A, D-148): val3dity 2.7.0 (GPL-3.0) built from its pinned source commit,
# served by a thin HTTP wrapper (contracts/val3dity, D-446). A separate program in its own image: nothing here is
# linked into the kernel or the service image (D-109).
#
# Production build (needs network for apt and GitHub):   docker build -t geoiplus/val3dity:2.7.0 images/val3dity
# Host build (D-445): build val3dity on Ubuntu 24.04, pack it with collect.sh into DIR, so that DIR/val3dity holds it, then
#   docker build --build-context val3dity-build=DIR -t geoiplus/val3dity:2.7.0 images/val3dity
# (the named context replaces the build stage; the runtime stage is the same).
ARG VAL3DITY_COMMIT=fbe9e4d65376e1c3f63401f15967485783f78c0a

FROM ubuntu:24.04 AS val3dity-build
ARG VAL3DITY_COMMIT
RUN apt-get update \
 && DEBIAN_FRONTEND=noninteractive apt-get install -y --no-install-recommends \
      ca-certificates cmake g++ make libcgal-dev libeigen3-dev libgeos-dev libboost-filesystem-dev \
 && rm -rf /var/lib/apt/lists/*
ADD --keep-git-dir=false https://github.com/tudelft3d/val3dity.git#${VAL3DITY_COMMIT} /src
COPY collect.sh /collect.sh
RUN cmake -S /src -B /build -DCMAKE_BUILD_TYPE=Release && cmake --build /build -j"$(nproc)" \
 && sh /collect.sh /src /build "${VAL3DITY_COMMIT}" /val3dity

FROM python:3.12-slim-trixie
COPY --from=val3dity-build /val3dity /opt/val3dity
COPY server.py /opt/wrapper/server.py
COPY SOURCE.md /opt/val3dity/SOURCE.md
ENV LD_LIBRARY_PATH=/opt/val3dity/lib VAL3DITY_HOME=/opt/val3dity PORT=8080
RUN /opt/val3dity/bin/val3dity --version
USER nobody
EXPOSE 8080
CMD ["python3", "/opt/wrapper/server.py"]
