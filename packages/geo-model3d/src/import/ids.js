// import (3D-10): entity id source. The caller injects one (spec §3: ids are injected; the service creates them); the
// `EntityId` format is open (Q-26), so the default is a deterministic readable counter per kind [A], e.g. `f-1`.

const PREFIX = /** @type {Record<string, string>} */ ({
  vertex: 'v', halfEdge: 'he', face: 'f', shell: 'sh', solid: 'so', semantic: 'sem', roofComponent: 'rc',
  footprint: 'fp', nonManifoldGroup: 'nm',
});

/** @returns {(kind: string) => string} a fresh deterministic id source */
export function counterIds() {
  /** @type {Map<string, number>} */
  const n = new Map();
  return (kind) => {
    const k = (n.get(kind) ?? 0) + 1;
    n.set(kind, k);
    return `${PREFIX[kind] ?? kind}-${k}`;
  };
}
