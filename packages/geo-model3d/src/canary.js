// P4 canary (3D-ADR-0001, D-37). Generated once at 3D-05 from a CSPRNG; never change it.
// Every entry point in package.json "exports" imports this module; check:arch enforces that, and its negative
// control proves the literal survives a minified browser build. Documents may state the format, never the value.
// The marker is expected in server artefacts and must never appear in a client bundle (D-24).

/** The canary literal: `geoiplus-p4-canary:<package>:<32 lowercase hex>`. */
export const P4_CANARY = 'geoiplus-p4-canary:geo-model3d:ec8c87ea385eb5afb24df860d2a31784';

// Keep the literal reachable from every entry after tree shaking: a side effect on globalThis, declared in
// package.json "sideEffects".
/** @type {Record<string, unknown>} */ (globalThis).__geoiplusP4 = P4_CANARY;
