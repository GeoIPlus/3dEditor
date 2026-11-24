// import (3D-10): refusal of an import. Codes are taken from the error registry (spec §2.4); the choice per case is a
// 3D-10 reading [A] listed in the module card: malformed document -> INVALID_PAYLOAD, CityObject missing or not a
// Building -> NOT_FOUND, no usable LoD 2.x geometry -> INVALID_GEOMETRY. An unknown CRS is `crs`'s CrsError
// (INVALID_CRS, spec §6 rule 14), passed through unchanged.

export class ImportError extends Error {
  /** @param {'INVALID_PAYLOAD' | 'NOT_FOUND' | 'INVALID_GEOMETRY'} code @param {string} message */
  constructor(code, message) {
    super(`${code}: ${message}`);
    this.name = 'ImportError';
    this.code = code;
  }
}
